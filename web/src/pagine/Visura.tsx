import { useEffect, useMemo, useRef, useState } from 'react';
import { api, formattaData } from '../api';
import { Riquadro } from '../componenti';
import { Badge, ErrorBanner, Modal } from '../components/ui';
import { CampoProfessionista, useProfessionisti } from '../lib/professionisti';
import { CampiCliente, etichettaTipo } from './Cliente';
import { leggiVisura, type SocioVisura, type CaricaVisura, type VisuraLetta } from '../lib/visura';
import { estraiTestoPdf, PdfSenzaTesto } from '../lib/visura-testo';
import type { Alert } from '../../../worker/src/domain/alert-titolarita';
import type { RisultatoAnalisiTitolarita } from '../../../worker/src/domain/titolare-effettivo';

// ── AR-M17: «Nuovo da visura» / «Aggiorna da visura» ─────────────
// Il PDF viene letto QUI, nel browser (pdfjs caricato al primo uso): il
// testo grezzo vive nello stato del modal e muore con lui. Al worker
// arrivano i campi rivisti, soci e cariche; il PDF sale su R2 come
// documento del cliente. Il programma propone, il professionista conferma.

const ETICHETTA_DIRITTO: Record<string, string> = {
  PROPRIETA: 'proprietà', NUDA_PROPRIETA: 'nuda proprietà', USUFRUTTO: 'usufrutto', PEGNO: 'pegno',
  SEQUESTRO: 'sequestro', PIGNORAMENTO: 'pignoramento', COMPROPRIETA: 'comproprietà', ALTRO: 'altro diritto',
};
const ETICHETTA_TIPO_SOCIO: Record<string, string> = {
  PERSONA_FISICA: 'persona fisica', PERSONA_GIURIDICA: 'persona giuridica', FIDUCIARIA: 'fiduciaria', TRUST: 'trust', ALTRO: 'altro',
};
export const ETICHETTA_CARICA: Record<string, string> = {
  AMMINISTRATORE_UNICO: 'Amministratore unico', PRESIDENTE_CDA: 'Presidente CdA', VICE_PRESIDENTE_CDA: 'Vice presidente CdA',
  CONSIGLIERE_DELEGATO: 'Amministratore delegato', CONSIGLIERE: 'Consigliere', SOCIO_AMMINISTRATORE: 'Socio amministratore',
  TITOLARE: 'Titolare', LIQUIDATORE: 'Liquidatore', PROCURATORE: 'Procuratore', INSTITORE: 'Institore', SINDACO: 'Sindaco',
  REVISORE: 'Revisore', CURATORE: 'Curatore', ALTRO: 'Altra carica',
};
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`);
const euro = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export interface PropostaDto {
  id?: string | null;
  analisi: RisultatoAnalisiTitolarita;
  alert: Alert[];
  bozzaMotivazione: string | null;
  soci: any[];
  cariche: any[];
  catena: Array<{ clienteId: string; denominazione: string; visuraDel: string | null }>;
}

/** Dettagli destinati a `dati_identificativi` (cifrati) ricavati dalla visura. */
function dettagliDaVisura(v: VisuraLetta): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (v.sede.testo) d.sede = v.sede.testo;
  if (v.pec) d.pec = v.pec;
  if (v.rea) d.rea = v.rea;
  if (v.formaGiuridica) d.formaGiuridica = v.formaGiuridica;
  if (v.capitale.sottoscritto != null) d.capitaleSociale = v.capitale.sottoscritto;
  if (v.capitale.versato != null && v.capitale.versato !== v.capitale.sottoscritto) d.capitaleVersato = v.capitale.versato;
  if (v.dataCostituzione) d.dataCostituzione = v.dataCostituzione;
  if (v.statoAttivita) d.statoAttivita = v.statoAttivita;
  if (v.proceduraConcorsuale) d.proceduraConcorsuale = v.proceduraConcorsuale;
  if (v.numeroDocumento) d.visuraNumero = v.numeroDocumento;
  if (v.dataEstrazione) d.visuraDel = v.dataEstrazione;
  return d;
}

function telemetria(v: VisuraLetta, pagine: number) {
  return {
    tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine, campiNonTrovati: v.campiNonTrovati, avvisi: v.avvisi.length,
    soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: v.tipoIncerto, dataEstrazione: v.dataEstrazione,
  };
}

// ── Passo 1: caricamento e lettura ──────────────────────────────

function CaricaPdf({ onLetta, onErrore }: { onLetta: (v: VisuraLetta, file: File, pagine: number) => void; onErrore: (m: string) => void }) {
  const [inCorso, setInCorso] = useState(false);
  const [trascina, setTrascina] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const leggi = async (file: File) => {
    onErrore('');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { onErrore('Serve il PDF della visura scaricato dal Registro Imprese.'); return; }
    if (file.size > 20 * 1024 * 1024) { onErrore('File troppo grande (massimo 20 MB).'); return; }
    setInCorso(true);
    try {
      const { testo, pagine } = await estraiTestoPdf(await file.arrayBuffer());
      const v = leggiVisura(testo);
      onLetta(v, file, pagine);
    } catch (e) {
      onErrore(e instanceof PdfSenzaTesto ? e.message : `Non riesco a leggere il PDF: ${(e as Error).message}`);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${trascina ? 'border-teal-500 bg-teal-50' : 'border-ink-200'}`}
      onDragOver={(e) => { e.preventDefault(); setTrascina(true); }}
      onDragLeave={() => setTrascina(false)}
      onDrop={(e) => { e.preventDefault(); setTrascina(false); const f = e.dataTransfer.files?.[0]; if (f) leggi(f); }}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leggi(f); e.target.value = ''; }} />
      {inCorso ? (
        <div className="text-ink-500 text-sm">Leggo la visura nel tuo browser…</div>
      ) : (
        <>
          <div className="font-semibold text-ink-800">Trascina qui il PDF della visura camerale</div>
          <div className="text-sm text-ink-400 mt-1 mb-4">Visura ordinaria o storica scaricata dal Registro Imprese (InfoCamere / Telemaco). Il file non esce dal tuo computer finché non decidi di conservarlo.</div>
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>Scegli il file…</button>
        </>
      )}
    </div>
  );
}

// ── Tabelle di soci e cariche (rivedibili) ──────────────────────

export function TabellaSoci({ soci, onCambia, modificabile }: { soci: SocioVisura[]; onCambia?: (s: SocioVisura[]) => void; modificabile?: boolean }) {
  if (!soci.length) return <p className="caricamento">Nessun socio in questa visura (per le S.p.A. la compagine non è pubblicata).</p>;
  const set = (i: number, patch: Partial<SocioVisura>) => onCambia?.(soci.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="overflow-x-auto">
      <table>
        <thead><tr><th>Socio</th><th>Tipo</th><th>Nominale</th><th>Quota</th><th>Diritto</th><th>Paese</th>{modificabile && <th />}</tr></thead>
        <tbody>
          {soci.map((s, i) => (
            <tr key={s.id + i} className={s.quoteProprie ? 'opacity-70' : ''}>
              <td>
                <div className="font-semibold">{s.nome}</div>
                {s.codiceFiscale && <div className="mono text-xs text-ink-400">{s.codiceFiscale}</div>}
                {s.quoteProprie && <Badge tone="gray">quote proprie</Badge>}
                {s.comproprieta && <Badge tone="amber">comproprietà</Badge>}
              </td>
              <td>
                {modificabile ? (
                  <select className="input !py-1" value={s.tipo} onChange={(e) => set(i, { tipo: e.target.value as SocioVisura['tipo'] })}>
                    {Object.entries(ETICHETTA_TIPO_SOCIO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </select>
                ) : ETICHETTA_TIPO_SOCIO[s.tipo] ?? s.tipo}
              </td>
              <td className="mono">{euro(s.quotaNominale)}</td>
              <td className="mono">
                {modificabile ? (
                  <input className="input !py-1 w-24" value={s.quotaPercento ?? ''} onChange={(e) => set(i, { quotaPercento: Number(e.target.value.replace(',', '.')) || 0 })} />
                ) : pct(s.quotaPercento)}
              </td>
              <td>{ETICHETTA_DIRITTO[s.diritto] ?? s.diritto}</td>
              <td className="mono">
                {modificabile ? (
                  <input className="input !py-1 w-16" value={s.paese ?? ''} placeholder="IT" onChange={(e) => set(i, { paese: e.target.value.toUpperCase().slice(0, 2) || null })} title="Sigla ISO del Paese di residenza o sede (EE = estero non indicato in visura)" />
                ) : (s.paese ?? '—')}
              </td>
              {modificabile && (
                <td><button type="button" className="btn btn-ghost btn-sm" title="Togli questa riga" onClick={() => onCambia?.(soci.filter((_, j) => j !== i))}>✕</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabellaCariche({ cariche }: { cariche: CaricaVisura[] | any[] }) {
  if (!cariche.length) return <p className="caricamento">Nessuna carica letta dalla visura.</p>;
  return (
    <div className="overflow-x-auto">
      <table>
        <thead><tr><th>Nome</th><th>Carica</th><th>Rappresentanza</th><th>Nomina</th><th>Poteri</th></tr></thead>
        <tbody>
          {cariche.map((c: any, i: number) => (
            <tr key={(c.id ?? c.nome) + i}>
              <td>
                <div className="font-semibold">{c.nome}</div>
                {c.codiceFiscale && <div className="mono text-xs text-ink-400">{c.codiceFiscale}</div>}
              </td>
              <td>{ETICHETTA_CARICA[c.carica] ?? c.carica}{c.caricaTesto && c.caricaTesto.toLowerCase() !== (ETICHETTA_CARICA[c.carica] ?? '').toLowerCase() ? <div className="text-xs text-ink-400">{c.caricaTesto}</div> : null}</td>
              <td>{c.rappresentanzaLegale ? <Badge tone="teal">rappresentante</Badge> : '—'}</td>
              <td className="mono">{c.dataNomina ? formattaData(c.dataNomina) : '—'}</td>
              <td className="text-xs text-ink-500 max-w-[280px]">{c.poteri ? (c.poteri.length > 160 ? c.poteri.slice(0, 160) + '…' : c.poteri) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Proposta di titolarità con alert e sequenza guidata ─────────

const TONO: Record<string, 'red' | 'amber' | 'gray'> = { alta: 'red', media: 'amber', bassa: 'gray' };

export function PropostaTitolaritaBox({ clienteId, proposta, onRegistrata, vaiA }: {
  clienteId: string;
  proposta: PropostaDto;
  onRegistrata?: () => void;
  vaiA?: (p: string) => void;
}) {
  const [sequenza, setSequenza] = useState(false);
  const [motivazione, setMotivazione] = useState(proposta.bozzaMotivazione ?? '');
  const [scelti, setScelti] = useState<Record<string, boolean>>({});
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [invio, setInvio] = useState(false);
  const [scarta, setScarta] = useState(false);
  const [motivoScarto, setMotivoScarto] = useState('');

  useEffect(() => { setMotivazione(proposta.bozzaMotivazione ?? ''); setScelti({}); setEsito(''); }, [proposta]);

  const { analisi, alert } = proposta;
  const a3 = alert.find((a) => a.codice === 'A3');
  const candidati = a3?.azione.tipo === 'CONFERMA_RESIDUALE' ? a3.azione.candidati : [];
  const bloccanti = alert.filter((a) => a.bloccante);
  const perProprieta = ['PROPRIETA_DIRETTA', 'PROPRIETA_INDIRETTA'].includes(analisi.criterioApplicato);
  const a8 = alert.find((a) => a.codice === 'A8');

  const registra = async (titolari: any[], modificata: boolean) => {
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/clienti/${clienteId}/titolarita`, { titolari, propostaId: proposta.id ?? undefined, propostaModificata: modificata });
      setEsito('Titolarità registrata: la proposta risulta valutata e applicata. La fotografia precedente resta storicizzata.');
      setSequenza(false);
      onRegistrata?.();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  const confermaProprieta = () => registra(
    analisi.titolari.map((t) => ({
      nominativo: t.denominazione, codiceFiscale: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(t.id) ? t.id : null,
      criterio: t.criterio, norma: t.norma, quota: t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 10000) / 100 : null,
      pep: false, motivazione: t.motivazione, percorsi: t.percorsi ?? [],
    })),
    false,
  );

  const confermaResiduale = () => {
    const scelte = candidati.filter((c) => scelti[c.id] !== false);
    if (!scelte.length) { setErrore('Scegli almeno una persona con poteri di rappresentanza o amministrazione.'); return; }
    if (!motivazione.trim()) { setErrore('La motivazione ex art. 20 co. 6 è obbligatoria per il criterio residuale.'); return; }
    const modificata = scelte.length !== candidati.length || motivazione.trim() !== (proposta.bozzaMotivazione ?? '').trim();
    registra(scelte.map((c) => ({
      nominativo: c.nome, codiceFiscale: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(c.id) ? c.id : null,
      criterio: 'RESIDUALE_POTERI', norma: 'art. 20 co. 5 DLgs. 231/2007', quota: null, pep: false, motivazione: motivazione.trim(),
    })), modificata);
  };

  const scartaProposta = async () => {
    if (!proposta.id) return;
    setErrore('');
    try {
      await api.post(`/proposte/${proposta.id}/esito`, { stato: 'SCARTATA', motivazione: motivoScarto });
      setEsito('Proposta scartata con motivazione: resta traccia della valutazione.');
      setScarta(false);
      onRegistrata?.();
    } catch (e) { setErrore((e as Error).message); }
  };

  return (
    <div className="space-y-3 text-sm">
      {esito && <Riquadro tipo="info">{esito}</Riquadro>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      {proposta.catena.length > 0 && (
        <div className="aiuto">
          Catena ricostruita con i dati già in archivio: {proposta.catena.map((c) => `${c.denominazione}${c.visuraDel ? ` (visura del ${formattaData(c.visuraDel)})` : ''}`).join(', ')}.
        </div>
      )}

      {/* Esito del motore */}
      <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold mb-1">
          Proposta del programma · {analisi.parametri.rulesetId} · soglia {analisi.parametri.etichettaSoglia}
        </div>
        {analisi.titolari.length > 0 ? (
          <ul className="space-y-1">
            {analisi.titolari.map((t) => (
              <li key={t.id}>
                <strong>{t.denominazione}</strong>{t.quotaEffettiva != null && <> — {pct(Math.round(t.quotaEffettiva * 10000) / 100)}</>}
                <span className="text-ink-400"> · {t.criterio.replace(/_/g, ' ').toLowerCase()} ({t.norma})</span>
                {t.percorsi && t.percorsi.length > 1 && <div className="text-xs text-ink-400">{t.percorsi.length} percorsi sommati</div>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-ink-600">Nessun titolare effettivo individuato con i criteri della proprietà o del controllo.</div>
        )}
        {analisi.avvertenze.length > 0 && (
          <ul className="mt-2 text-xs text-ink-500 list-disc ml-4 space-y-0.5">{analisi.avvertenze.map((a, i) => <li key={i}>{a}</li>)}</ul>
        )}
      </div>

      {/* Alert */}
      {alert.length > 0 && (
        <div className="space-y-2">
          {alert.map((a) => (
            <div key={a.codice} className={`rounded-lg border px-4 py-3 ${a.gravita === 'alta' ? 'border-red-200 bg-red-50/60' : a.gravita === 'media' ? 'border-amber-200 bg-amber-50/60' : 'border-ink-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone={TONO[a.gravita]}>{a.codice}</Badge> <strong className="ml-1">{a.titolo}</strong>
                  {a.bloccante && <Badge tone="gray">richiede una decisione</Badge>}
                  <div className="mt-1 text-ink-700">{a.messaggio}</div>
                  <div className="norma font-mono text-xs text-ink-400 mt-1">{a.norma}</div>
                </div>
                <div className="shrink-0">
                  {a.azione.tipo === 'SEQUENZA_GUIDATA' && <button className="btn btn-primary btn-sm" onClick={() => setSequenza(true)}>{a.azione.etichetta}</button>}
                  {a.azione.tipo === 'CATENA_RISOLTA' && vaiA && <button className="btn btn-secondary btn-sm" onClick={() => vaiA(`cliente?id=${(a.azione as any).clienteId}`)}>{a.azione.etichetta}</button>}
                  {a.azione.tipo === 'DECIDI_SCREENING' && vaiA && <button className="btn btn-secondary btn-sm" onClick={() => vaiA('controlli')}>{a.azione.etichetta}</button>}
                  {a.azione.tipo === 'DOMANDE_ART22' && (
                    <details className="text-xs">
                      <summary className="btn btn-secondary btn-sm cursor-pointer">{a.azione.etichetta}</summary>
                      <ol className="list-decimal ml-4 mt-2 space-y-1 max-w-sm">{a.azione.domande.map((d, i) => <li key={i}>{d}</li>)}</ol>
                      <div className="text-ink-400 mt-1">La dichiarazione art. 22 precompilata arriva con AR-M18: intanto puoi porre queste domande nella verifica a distanza o in presenza.</div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Azioni */}
      {!sequenza && (
        <div className="flex flex-wrap gap-2 items-center pt-1">
          {perProprieta && analisi.titolari.length > 0 && (
            <button className="btn btn-primary" onClick={confermaProprieta} disabled={invio || Boolean(a8?.bloccante)} title={a8?.bloccante ? 'Prima decidi sulle corrispondenze nelle liste sanzioni' : ''}>
              {invio ? 'Registrazione…' : 'Conferma e registra i titolari effettivi'}
            </button>
          )}
          {a3 && <button className="btn btn-primary" onClick={() => setSequenza(true)}>Apri la sequenza guidata</button>}
          {proposta.id && !scarta && <button className="btn btn-ghost" onClick={() => setScarta(true)}>Scarta la proposta…</button>}
          {bloccanti.length > 0 && <span className="text-xs text-ink-400">{bloccanti.length} alert richiedono una decisione prima di chiudere.</span>}
        </div>
      )}
      {scarta && (
        <div className="rounded-lg border border-ink-200 p-3 space-y-2">
          <label className="label">Perché scarti la proposta (resta nel registro)</label>
          <textarea className="input min-h-[60px]" value={motivoScarto} onChange={(e) => setMotivoScarto(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary btn-sm" onClick={() => setScarta(false)}>Annulla</button>
            <button className="btn btn-primary btn-sm" onClick={scartaProposta} disabled={!motivoScarto.trim()}>Scarta con motivazione</button>
          </div>
        </div>
      )}

      {/* Sequenza guidata A1 → A2 → A3 */}
      {sequenza && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
          <h4 className="!m-0 font-bold">Sequenza guidata (art. 20 co. 2 → 3 → 5)</h4>
          <ol className="space-y-3 list-decimal ml-5">
            <li>
              <strong>Proprietà (co. 2)</strong> — {alert.find((a) => a.codice === 'A1')?.messaggio ?? 'nessuna persona fisica sopra soglia.'}
              {analisi.quotePersoneFisiche.length > 0 && (
                <div className="text-xs text-ink-500 mt-1">Quote effettive: {analisi.quotePersoneFisiche.map((q) => `${q.denominazione} ${pct(Math.round(q.quota * 10000) / 100)}`).join(' · ')}</div>
              )}
            </li>
            <li>
              <strong>Controllo (co. 3)</strong> — la visura non può dirlo: chiedi al cliente per iscritto (dichiarazione art. 22) se esistono patti parasociali, diritti particolari, accordi di voto, vincoli contrattuali o interposizioni.
              {alert.find((a) => a.codice === 'A2')?.azione.tipo === 'DOMANDE_ART22' && (
                <ol className="list-[lower-alpha] ml-5 mt-1 text-xs text-ink-600 space-y-0.5">
                  {(alert.find((a) => a.codice === 'A2')!.azione as any).domande.map((d: string, i: number) => <li key={i}>{d}</li>)}
                </ol>
              )}
              <div className="text-xs text-ink-500 mt-1">Se dal cliente emerge un controllo, registra quella persona con il criterio «Controllo» dal fascicolo, non con il residuale.</div>
            </li>
            <li>
              <strong>Residuale (co. 5)</strong> — se il controllo non emerge, i titolari effettivi sono le persone fisiche con poteri di rappresentanza legale, amministrazione o direzione. Dalle cariche in visura:
              {candidati.length ? (
                <div className="mt-1 space-y-1">
                  {candidati.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="!w-4" checked={scelti[c.id] !== false} onChange={(e) => setScelti({ ...scelti, [c.id]: e.target.checked })} />
                      <span><strong>{c.nome}</strong> <span className="text-ink-400">({c.carica})</span></span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-red-600 mt-1">Nessuna carica con poteri letta dalla visura: registra a mano dal fascicolo, con motivazione.</div>
              )}
              <label className="label mt-3">Motivazione ex art. 20 co. 6 (bozza scritta dai fatti: correggila e firmala)</label>
              <textarea className="input min-h-[140px] text-xs" value={motivazione} onChange={(e) => setMotivazione(e.target.value)} />
            </li>
          </ol>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setSequenza(false)}>Chiudi</button>
            <button className="btn btn-primary" onClick={confermaResiduale} disabled={invio || !candidati.length || Boolean(a8?.bloccante)}>
              {invio ? 'Registrazione…' : 'Registra col criterio residuale'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Il modal ────────────────────────────────────────────────────

type Passo = 'carica' | 'revisione' | 'compagine' | 'proposta' | 'fatto';

export function VisuraModal({ modo, cliente, onChiudi, onFatto, vaiA }: {
  modo: 'nuovo' | 'aggiorna';
  /** Record del cliente (GET /clienti/:id → cliente) per il confronto campo per campo. */
  cliente?: any;
  onChiudi: () => void;
  onFatto: (clienteId: string) => void;
  vaiA?: (p: string) => void;
}) {
  const [passo, setPasso] = useState<Passo>('carica');
  const [errore, setErrore] = useState('');
  const [visura, setVisura] = useState<VisuraLetta | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pagine, setPagine] = useState(0);
  const [f, setF] = useState<any>({});
  const [dettagli, setDettagli] = useState<Record<string, unknown>>({});
  const [conserva, setConserva] = useState(true);
  const [soci, setSoci] = useState<SocioVisura[]>([]);
  const [cariche, setCariche] = useState<CaricaVisura[]>([]);
  const [scelte, setScelte] = useState<Record<string, boolean>>({});
  const [invio, setInvio] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(cliente?.id ?? null);
  const [proposta, setProposta] = useState<PropostaDto | null>(null);
  const [esitoSalvataggio, setEsitoSalvataggio] = useState<any>(null);
  const [doppione, setDoppione] = useState<{ clienteId: string; denominazione: string; attivo: boolean } | null>(null);
  const professionisti = useProfessionisti();

  const onLetta = (v: VisuraLetta, fl: File, np: number) => {
    setVisura(v); setFile(fl); setPagine(np);
    setSoci(v.soci); setCariche(v.cariche);
    setDettagli(dettagliDaVisura(v));
    if (modo === 'nuovo') {
      setF({
        denominazione: v.denominazione ?? '', tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale ?? '', partitaIva: v.partitaIva ?? '',
        paeseResidenza: 'IT', attivitaPrevalente: v.attivitaPrevalente ?? '', ateco: v.ateco ?? '', pep: false, note: '',
      });
    } else {
      // Confronto: pre-spuntate le differenze con un valore in visura.
      const iniziali: Record<string, boolean> = {};
      for (const r of righeConfronto(cliente, v)) iniziali[r.chiave] = r.diverso && r.nuovo !== '' && r.nuovo != null;
      setScelte(iniziali);
    }
    setPasso('revisione');
  };

  const confronto = useMemo(() => (modo === 'aggiorna' && visura ? righeConfronto(cliente, visura) : []), [modo, cliente, visura]);

  const salva = async () => {
    if (!visura) return;
    setErrore('');
    setInvio(true);
    setDoppione(null);
    try {
      const corpoComune = {
        soci, cariche, capitale: visura.capitale, dataVisura: visura.dataEstrazione, dataElencoSoci: visura.dataElencoSoci, telemetria: telemetria(visura, pagine),
      };
      let id = clienteId;
      let r: any;
      if (modo === 'nuovo') {
        r = await api.post<any>('/clienti/da-visura', { anagrafica: { ...f, datiIdentificativi: dettagli }, ...corpoComune });
        id = r.id;
        setClienteId(id);
      } else {
        const campi: Record<string, unknown> = {};
        const datiIdentificativi: Record<string, unknown> = {};
        for (const riga of confronto) {
          if (!scelte[riga.chiave]) continue;
          if (riga.chiave.startsWith('di.')) datiIdentificativi[riga.chiave.slice(3)] = riga.nuovo;
          else campi[riga.chiave] = riga.nuovo;
        }
        r = await api.post<any>(`/clienti/${id}/da-visura`, { campi, datiIdentificativi, ...corpoComune, forzaProposta: true });
      }
      setEsitoSalvataggio(r);
      setProposta(r.proposta ?? null);
      // Conservazione del PDF fra i documenti del cliente.
      if (conserva && file && id) {
        const form = new FormData();
        form.append('file', file, file.name);
        form.append('tipo', 'VISURA');
        if (visura.dataEstrazione) form.append('dataRiferimento', visura.dataEstrazione);
        const up = await fetch(`/api/clienti/${id}/documenti`, { method: 'POST', body: form, credentials: 'same-origin' });
        if (!up.ok) setErrore('Cliente salvato, ma la visura non è stata conservata: riprova dalla scheda del cliente.');
      }
      setPasso(r.proposta && (soci.length || cariche.length) ? 'proposta' : 'fatto');
    } catch (e) {
      const msg = (e as Error).message;
      // 409 doppione: il messaggio del worker porta l'invito ad aprire la scheda.
      try {
        const rr = await fetch(`/api/clienti?archiviati=1`, { credentials: 'same-origin' });
        const lista = await rr.json();
        const cf = String(f.codiceFiscale ?? '').toUpperCase();
        const piva = String(f.partitaIva ?? '');
        const trovato = Array.isArray(lista) ? lista.find((c: any) => (cf && c.codice_fiscale === cf) || (piva && c.partita_iva === piva)) : null;
        if (/già in anagrafica/.test(msg) && trovato) setDoppione({ clienteId: trovato.id, denominazione: trovato.denominazione, attivo: Boolean(trovato.attivo) });
      } catch { /* ignora */ }
      setErrore(msg);
    } finally {
      setInvio(false);
    }
  };

  const titolo = modo === 'nuovo' ? 'Nuovo cliente da visura camerale' : `Aggiorna ${cliente?.denominazione ?? 'il cliente'} da visura`;
  const intestazioneVisura = visura && (
    <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-2 text-xs text-ink-600 flex flex-wrap gap-x-4 gap-y-1">
      <span><strong>{visura.tipoVisura ? `Visura ${visura.tipoVisura.toLowerCase()}` : 'Documento'}</strong>{visura.formaVisura ? ` · ${visura.formaVisura.toLowerCase()}` : ''}</span>
      <span>estratta il <strong>{visura.dataEstrazione ? formattaData(visura.dataEstrazione) : 'data non trovata (userò oggi)'}</strong></span>
      {visura.dataElencoSoci && <span>elenco soci al {formattaData(visura.dataElencoSoci)}</span>}
      <span>{pagine} pagine · letta nel browser, niente AI</span>
    </div>
  );

  return (
    <Modal title={titolo} onClose={onChiudi} wide>
      <div className="space-y-4 text-sm">
        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
        {doppione && (
          <Riquadro tipo="avviso">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span>{doppione.denominazione} è già in anagrafica{doppione.attivo ? '' : ' (archiviato)'}.</span>
              {vaiA && <button className="btn btn-secondary btn-sm" onClick={() => { onChiudi(); vaiA(`cliente?id=${doppione.clienteId}`); }}>Apri la scheda e usa «Aggiorna da visura»</button>}
            </div>
          </Riquadro>
        )}

        {passo === 'carica' && <CaricaPdf onLetta={onLetta} onErrore={setErrore} />}

        {passo === 'revisione' && visura && (
          <>
            {intestazioneVisura}
            {visura.avvisi.map((a, i) => <Riquadro key={i} tipo="avviso">{a}</Riquadro>)}
            {visura.campiNonTrovati.length > 0 && (
              <Riquadro tipo="info">
                Campi non trovati nella visura (da completare a mano, mai inventati): <strong>{visura.campiNonTrovati.join(', ')}</strong>.
              </Riquadro>
            )}
            {visura.tipoIncerto && <Riquadro tipo="avviso">Natura giuridica proposta dalla denominazione, non dalla forma giuridica in visura: controllala.</Riquadro>}
            {visura.inLiquidazione && <Riquadro tipo="critico">La società risulta in liquidazione{visura.proceduraConcorsuale ? ` (${visura.proceduraConcorsuale})` : ''}: tienine conto nella valutazione del rischio e nella titolarità (liquidatore).</Riquadro>}

            {modo === 'nuovo' ? (
              <>
                <h3 className="!mt-2 !mb-1">Anagrafica precompilata: rivedila</h3>
                <CampiCliente f={f} setF={setF} />
                {professionisti.filter((p) => p.attivo).length > 1 && (
                  <CampoProfessionista elenco={professionisti} valore={f.professionistaId} onCambia={(v) => setF({ ...f, professionistaId: v })} etichetta="Professionista di riferimento" aiuto="Chi segue il cliente e ne firma le valutazioni. Se non lo indichi e sei un professionista, sei tu." />
                )}
                <DettagliVisura dettagli={dettagli} />
              </>
            ) : (
              <>
                <h3 className="!mt-2 !mb-1">Confronto campo per campo</h3>
                <div className="aiuto">Spunta ciò che vuoi applicare. I campi non spuntati restano come sono; i dettagli cifrati si aggiornano solo per le voci scelte.</div>
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr><th /><th>Campo</th><th>Attuale</th><th>In visura</th></tr></thead>
                    <tbody>
                      {confronto.map((r) => (
                        <tr key={r.chiave} className={r.diverso ? '' : 'opacity-60'}>
                          <td><input type="checkbox" className="!w-4" checked={Boolean(scelte[r.chiave])} disabled={!r.diverso || r.nuovo == null || r.nuovo === ''} onChange={(e) => setScelte({ ...scelte, [r.chiave]: e.target.checked })} /></td>
                          <td className="font-semibold">{r.etichetta}</td>
                          <td className="text-ink-500">{r.chiave === 'tipo' ? etichettaTipo(String(r.attuale ?? '')) : String(r.attuale ?? '—')}</td>
                          <td className={r.diverso ? 'font-semibold' : ''}>{r.chiave === 'tipo' ? etichettaTipo(String(r.nuovo ?? '')) : String(r.nuovo ?? '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="!w-4" checked={conserva} onChange={(e) => setConserva(e.target.checked)} />
              Conserva la visura fra i documenti del cliente (impronta SHA-256, conservazione decennale)
            </label>
            <div className="flex justify-between gap-2 pt-1">
              <button className="btn btn-secondary" onClick={() => { setPasso('carica'); setVisura(null); }}>← Altro file</button>
              <button className="btn btn-primary" onClick={() => setPasso('compagine')} disabled={modo === 'nuovo' && !String(f.denominazione ?? '').trim()}>Avanti: compagine e cariche →</button>
            </div>
          </>
        )}

        {passo === 'compagine' && visura && (
          <>
            {intestazioneVisura}
            <h3 className="!mt-2 !mb-1">Soci e titolari di diritti sulle quote</h3>
            <div className="aiuto">
              Percentuali calcolate sul capitale sottoscritto{visura.capitale.sottoscritto != null ? ` (€ ${euro(visura.capitale.sottoscritto)})` : ''}, quote proprie escluse. Puoi correggere tipo, quota e Paese; una riga tolta non viene registrata.
            </div>
            <TabellaSoci soci={soci} onCambia={setSoci} modificabile />
            <h3 className="!mt-4 !mb-1">Cariche</h3>
            <TabellaCariche cariche={cariche} />
            <Riquadro tipo="info">
              Soci e cariche vengono conservati cifrati con la chiave dello studio, con la data della visura, e restano leggibili anche quando cambieranno (serie temporale). Al prossimo rinnovo vedrai le differenze.
              {modo === 'nuovo' ? ' La proposta dei titolari effettivi arriva al passo successivo: niente viene registrato senza la tua conferma.' : ''}
            </Riquadro>
            <div className="flex justify-between gap-2 pt-1">
              <button className="btn btn-secondary" onClick={() => setPasso('revisione')}>← Indietro</button>
              <button className="btn btn-primary" onClick={salva} disabled={invio}>
                {invio ? 'Salvataggio…' : modo === 'nuovo' ? 'Crea il cliente e proponi i titolari effettivi' : 'Applica e proponi i titolari effettivi'}
              </button>
            </div>
          </>
        )}

        {passo === 'proposta' && proposta && clienteId && (
          <>
            <Riquadro tipo="info">
              {modo === 'nuovo' ? 'Cliente creato' : 'Cliente aggiornato'}{esitoSalvataggio?.diff ? ` · compagine: ${esitoSalvataggio.diff.partecipazioni.aperte} righe nuove, ${esitoSalvataggio.diff.partecipazioni.chiuse} chiuse, ${esitoSalvataggio.diff.partecipazioni.invariate} invariate` : ''}
              {esitoSalvataggio?.screening?.nuove ? ` · screening: ${esitoSalvataggio.screening.nuove} corrispondenze da esaminare` : esitoSalvataggio?.screening?.eseguito === false ? ' · screening rinviato alla corsa notturna (liste non disponibili)' : ' · screening dei nomi eseguito'}.
            </Riquadro>
            <h3 className="!mt-2 !mb-1">Titolari effettivi proposti (art. 20)</h3>
            <div className="aiuto">
              La visura non è il registro dei titolari effettivi (art. 21-ter): la proposta applica l'art. 20 co. 2 ai dati camerali. La consultazione del registro resta un atto distinto, da tracciare dal fascicolo.
            </div>
            <PropostaTitolaritaBox clienteId={clienteId} proposta={proposta} vaiA={vaiA} onRegistrata={() => setPasso('fatto')} />
            <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
              <button className="btn btn-secondary" onClick={() => setPasso('fatto')}>Deciderò più tardi dalla scheda</button>
            </div>
          </>
        )}

        {passo === 'fatto' && clienteId && (
          <div className="space-y-3">
            <Riquadro tipo="info">Fatto. Tutto ciò che hai confermato è registrato; le proposte non confermate restano in attesa nella scheda del cliente.</Riquadro>
            <div className="flex justify-end gap-2">
              <button className="btn btn-primary" onClick={() => onFatto(clienteId)}>Apri la scheda del cliente</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DettagliVisura({ dettagli }: { dettagli: Record<string, unknown> }) {
  const voci = Object.entries(dettagli);
  if (!voci.length) return null;
  const etichette: Record<string, string> = {
    sede: 'Sede legale', pec: 'PEC', rea: 'Numero REA', formaGiuridica: 'Forma giuridica', capitaleSociale: 'Capitale sottoscritto (€)',
    capitaleVersato: 'Capitale versato (€)', dataCostituzione: 'Data atto di costituzione', statoAttivita: 'Stato attività',
    proceduraConcorsuale: 'Procedura', visuraNumero: 'N. documento visura', visuraDel: 'Visura estratta il',
  };
  return (
    <div className="rounded-lg border border-ink-100 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold mb-2">Dettagli conservati cifrati fra i dati identificativi</div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {voci.map(([k, v]) => <div key={k}><span className="text-ink-400">{etichette[k] ?? k}:</span> <strong>{typeof v === 'number' ? euro(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? formattaData(String(v)) : String(v)}</strong></div>)}
      </div>
    </div>
  );
}

/** Righe del confronto «Aggiorna da visura»: anagrafica + dettagli cifrati. */
function righeConfronto(cliente: any, v: VisuraLetta): Array<{ chiave: string; etichetta: string; attuale: unknown; nuovo: unknown; diverso: boolean }> {
  const di = cliente?.dati_identificativi && typeof cliente.dati_identificativi === 'object' ? cliente.dati_identificativi : {};
  const d = dettagliDaVisura(v);
  const norm = (x: unknown) => String(x ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const riga = (chiave: string, etichetta: string, attuale: unknown, nuovo: unknown) => ({ chiave, etichetta, attuale, nuovo, diverso: norm(attuale) !== norm(nuovo) });
  return [
    riga('denominazione', 'Denominazione', cliente?.denominazione, v.denominazione),
    riga('tipo', 'Natura giuridica', cliente?.tipo, v.tipoProposto),
    riga('codiceFiscale', 'Codice fiscale', cliente?.codice_fiscale, v.codiceFiscale),
    riga('partitaIva', 'Partita IVA', cliente?.partita_iva, v.partitaIva),
    riga('attivitaPrevalente', 'Attività prevalente', cliente?.attivita_prevalente, v.attivitaPrevalente),
    riga('ateco', 'Codice ATECO', cliente?.ateco, v.ateco),
    ...Object.entries(d).map(([k, val]) => riga(`di.${k}`, ({
      sede: 'Sede legale', pec: 'PEC', rea: 'REA', formaGiuridica: 'Forma giuridica', capitaleSociale: 'Capitale sottoscritto', capitaleVersato: 'Capitale versato',
      dataCostituzione: 'Data costituzione', statoAttivita: 'Stato attività', proceduraConcorsuale: 'Procedura', visuraNumero: 'N. visura', visuraDel: 'Visura del',
    } as Record<string, string>)[k] ?? k, di[k], val)),
  ];
}
