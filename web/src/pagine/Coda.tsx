import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, formattaData } from '../api';
import { PiedeLegale, Riquadro } from '../componenti';
import { Badge, ErrorBanner, HelpLink } from '../components/ui';
import { CampoProfessionista, useProfessionisti } from '../lib/professionisti';
import { CampiCliente, etichettaTipo } from './Cliente';
import { PropostaTitolaritaBox, TabellaCariche, TabellaSoci, type PropostaDto } from './Visura';
import { leggiVisura, type VisuraLetta } from '../lib/visura';
import { estraiTestoPdf, PdfSenzaTesto } from '../lib/visura-testo';

// ── AR-M19: la coda di revisione ────────────────────────────────
// Ingestione separata dalla conferma: si caricano cinquanta visure in un
// colpo (lette nel browser, mai con l'AI), ognuna diventa una proposta
// cifrata; nessuna produce effetti finché il professionista non la rivede.
// Schermo fisso: proposta a sinistra, alert a destra; tastiera: Invio
// applica, M modifica, ← → scorre. «Applica tutto» solo se nessuna delle
// proposte pulite ha alert di gravità alta.

interface VoceCoda {
  id: string;
  ambito: 'ANAGRAFICA' | 'TITOLARITA';
  creatoIl: string;
  alert: Array<{ codice: string; gravita: 'alta' | 'media' | 'bassa' }>;
  clienteId: string | null;
  cliente: { id: string; denominazione: string; tipo: string; attivo: boolean } | null;
  visura: any | null;
  titolarita: { titolari: any[]; criterio: string; bozzaMotivazione: string | null; dataVisura: string | null } | null;
  applicabileInBlocco: boolean;
}

const TONO: Record<string, 'red' | 'amber' | 'gray'> = { alta: 'red', media: 'amber', bassa: 'gray' };

function dettagliDaVisura(v: VisuraLetta): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (v.sede.testo) d.sede = v.sede.testo;
  if (v.sede.provincia) d.provincia = v.sede.provincia;
  if (v.oggettoSociale) d.oggettoSociale = v.oggettoSociale.slice(0, 4000);
  if (v.inLiquidazione) d.inLiquidazione = true;
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

// ── Caricamento in blocco ───────────────────────────────────────

function CaricaInBlocco({ onFatto }: { onFatto: (esiti: any[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [stato, setStato] = useState<string>('');
  const [inCorso, setInCorso] = useState(false);
  const [errori, setErrori] = useState<string[]>([]);

  const carica = async (files: FileList) => {
    const elenco = Array.from(files).filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf').slice(0, 60);
    if (!elenco.length) { setErrori(['Servono i PDF delle visure scaricati dal Registro Imprese.']); return; }
    setInCorso(true); setErrori([]);
    const voci: any[] = [];
    const filePerIndice: Array<File | null> = [];
    const errs: string[] = [];
    for (const [i, file] of elenco.entries()) {
      setStato(`Leggo ${i + 1} di ${elenco.length}: ${file.name}`);
      try {
        const { testo, pagine } = await estraiTestoPdf(await file.arrayBuffer());
        const v = leggiVisura(testo);
        voci.push({
          nomeFile: file.name,
          anagrafica: {
            denominazione: v.denominazione ?? '', tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale ?? '', partitaIva: v.partitaIva ?? '',
            paeseResidenza: 'IT', attivitaPrevalente: v.attivitaPrevalente ?? '', ateco: v.ateco ?? '', pep: false, datiIdentificativi: dettagliDaVisura(v),
          },
          soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
          telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine, campiNonTrovati: v.campiNonTrovati, avvisi: v.avvisi.length, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: v.tipoIncerto, dataEstrazione: v.dataEstrazione },
        });
        filePerIndice.push(file);
      } catch (e) {
        errs.push(`${file.name}: ${e instanceof PdfSenzaTesto ? e.message : (e as Error).message}`);
      }
    }
    try {
      if (!voci.length) { setErrori(errs); return; }
      setStato('Accodo le proposte…');
      const r = await api.post<{ esiti: any[] }>('/coda/visure', { voci });
      // I PDF salgono in area di transito, uno per proposta: diventano documenti all'applicazione.
      for (const e of r.esiti) {
        const file = filePerIndice[e.indice];
        if (!e.id || !file) continue;
        setStato(`Conservo il PDF di ${e.denominazione}…`);
        const form = new FormData();
        form.append('file', file, file.name);
        await fetch(`/api/coda/${e.id}/pdf`, { method: 'POST', body: form, credentials: 'same-origin' }).catch(() => undefined);
      }
      for (const e of r.esiti) if (e.errore) errs.push(`${e.denominazione}: ${e.errore}`);
      setErrori(errs);
      onFatto(r.esiti);
    } catch (e) {
      setErrori([...errs, (e as Error).message]);
    } finally {
      setInCorso(false); setStato('');
    }
  };

  return (
    <div className="scheda" data-test="carica-in-blocco">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="font-semibold text-ink-800">Carica le visure in blocco</div>
          <div className="text-xs text-ink-400">Fino a 60 PDF per volta, letti nel tuo browser. Ogni visura diventa una proposta da rivedere: nessun cliente viene creato o modificato finché non la confermi.</div>
        </div>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) carica(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-primary" disabled={inCorso} onClick={() => input.current?.click()} data-test="scegli-visure">{inCorso ? stato || 'Lettura…' : 'Scegli i PDF…'}</button>
      </div>
      {errori.length > 0 && (
        <Riquadro tipo="avviso">
          <ul className="list-disc ml-4">{errori.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Riquadro>
      )}
    </div>
  );
}

// ── Voce ANAGRAFICA (visura in coda) ────────────────────────────

function VoceVisura({ voce, modifica, onApplicata, onScartata, vaiA, registraApplica }: {
  voce: VoceCoda;
  modifica: boolean;
  onApplicata: (r: any) => void;
  onScartata: () => void;
  vaiA: (p: string) => void;
  registraApplica: (fn: () => void) => void;
}) {
  const v = voce.visura;
  const [f, setF] = useState<any>({ ...v.anagrafica, datiIdentificativi: undefined });
  const [scelte, setScelte] = useState<Record<string, boolean>>({});
  const [motivo, setMotivo] = useState('');
  const [scarta, setScarta] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const professionisti = useProfessionisti();

  useEffect(() => {
    setF({ ...v.anagrafica, datiIdentificativi: undefined });
    const iniziali: Record<string, boolean> = {};
    for (const d of v.differenze ?? []) iniziali[d.chiave] = true;
    setScelte(iniziali);
    setScarta(false); setMotivo(''); setErrore('');
  }, [voce.id]);

  const applica = useCallback(async () => {
    setErrore(''); setInvio(true);
    try {
      const corpo: any = v.abbinamento === 'NUOVO'
        ? { anagrafica: modifica ? { denominazione: f.denominazione, tipo: f.tipo, codiceFiscale: f.codiceFiscale, partitaIva: f.partitaIva, paeseResidenza: f.paeseResidenza, attivitaPrevalente: f.attivitaPrevalente, ateco: f.ateco, pep: f.pep, note: f.note } : undefined, professionistaId: f.professionistaId ?? null }
        : { chiavi: (v.differenze ?? []).filter((d: any) => scelte[d.chiave]).map((d: any) => d.chiave) };
      const r = await api.post<any>(`/coda/${voce.id}/applica`, corpo);
      onApplicata(r);
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  }, [voce.id, v, f, scelte, modifica, onApplicata]);
  useEffect(() => { registraApplica(applica); }, [applica, registraApplica]);

  const scartaProposta = async () => {
    setErrore('');
    try { await api.post(`/coda/${voce.id}/scarta`, { motivazione: motivo }); onScartata(); } catch (e) { setErrore((e as Error).message); }
  };

  const t = v.titolarita;
  return (
    <div className="space-y-4 text-sm">
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-2 text-xs text-ink-600 flex flex-wrap gap-x-4 gap-y-1">
        <span><strong>{v.nomeFile ?? 'visura'}</strong></span>
        <span>estratta il <strong>{v.dataVisura ? formattaData(v.dataVisura) : 'data non trovata'}</strong></span>
        {v.pdf ? <span>PDF conservato all’applicazione</span> : <span className="text-amber-700">PDF non allegato: la visura non verrà conservata</span>}
        {v.telemetria?.campiNonTrovati?.length > 0 && <span>campi non letti: {v.telemetria.campiNonTrovati.join(', ')}</span>}
      </div>

      {v.abbinamento === 'NUOVO' ? (
        <>
          <h3 className="!m-0">Nuovo cliente: {v.anagrafica.denominazione}</h3>
          {modifica ? (
            <>
              <CampiCliente f={f} setF={setF} />
              {professionisti.filter((p) => p.attivo).length > 1 && (
                <CampoProfessionista elenco={professionisti} valore={f.professionistaId} onCambia={(x) => setF({ ...f, professionistaId: x })} etichetta="Professionista di riferimento" />
              )}
            </>
          ) : (
            <dl className="grid grid-cols-[160px_1fr] gap-y-1 gap-x-3" data-test="anagrafica-proposta">
              <dt className="text-ink-400">Natura giuridica</dt><dd>{etichettaTipo(v.anagrafica.tipo)}</dd>
              <dt className="text-ink-400">Codice fiscale / P.IVA</dt><dd className="mono">{v.anagrafica.codiceFiscale ?? '—'} / {v.anagrafica.partitaIva ?? '—'}</dd>
              <dt className="text-ink-400">Attività</dt><dd>{v.anagrafica.attivitaPrevalente ?? '—'}{v.anagrafica.ateco ? ` (ATECO ${v.anagrafica.ateco})` : ''}</dd>
              <dt className="text-ink-400">Sede</dt><dd>{v.anagrafica.datiIdentificativi?.sede ?? '—'}</dd>
              <dt className="text-ink-400">Costituita il</dt><dd>{v.anagrafica.datiIdentificativi?.dataCostituzione ? formattaData(v.anagrafica.datiIdentificativi.dataCostituzione) : '—'}</dd>
              {v.anagrafica.datiIdentificativi?.inLiquidazione && <><dt className="text-ink-400">Stato</dt><dd className="text-red-700 font-semibold">in liquidazione</dd></>}
            </dl>
          )}
        </>
      ) : (
        <>
          <h3 className="!m-0">Aggiorna {v.denominazioneAttuale}{v.clienteAttivo === false ? ' (archiviato)' : ''}</h3>
          {(v.differenze ?? []).length === 0 ? (
            <p className="text-ink-500">L’anagrafica è già allineata alla visura: applicando si aggiornano compagine e cariche (serie temporale) e si ricalcola la proposta di titolarità.</p>
          ) : (
            <div className="overflow-x-auto" data-test="differenze">
              <table>
                <thead><tr><th /><th>Campo</th><th>Attuale</th><th>In visura</th></tr></thead>
                <tbody>
                  {v.differenze.map((d: any) => (
                    <tr key={d.chiave}>
                      <td><input type="checkbox" className="!w-4" checked={Boolean(scelte[d.chiave])} onChange={(e) => setScelte({ ...scelte, [d.chiave]: e.target.checked })} /></td>
                      <td className="font-semibold">{d.etichetta}</td>
                      <td className="text-ink-500">{d.chiave === 'tipo' ? etichettaTipo(String(d.attuale ?? '')) : String(d.attuale ?? '—')}</td>
                      <td className="font-semibold">{d.chiave === 'tipo' ? etichettaTipo(String(d.nuovo ?? '')) : String(d.nuovo ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h4 className="!mb-1">Soci</h4>
      <TabellaSoci soci={v.soci} />
      <h4 className="!mb-1">Cariche</h4>
      <TabellaCariche cariche={v.cariche} />

      {t && (
        <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-3" data-test="titolari-anteprima">
          <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold mb-1">Titolari effettivi che verranno proposti (art. 20) · {t.criterio.replace(/_/g, ' ').toLowerCase()}</div>
          {t.titolari.length ? (
            <ul>{t.titolari.map((x: any) => <li key={x.id}><strong>{x.denominazione}</strong>{x.quotaEffettiva != null ? ` — ${Math.round(x.quotaEffettiva * 10000) / 100}%` : ''}</li>)}</ul>
          ) : <div className="text-ink-600">Nessun titolare individuato con i criteri della proprietà: la proposta di titolarità entrerà in coda con la sequenza guidata.</div>}
          {t.avvertenze?.length > 0 && <ul className="mt-1 text-xs text-ink-500 list-disc ml-4">{t.avvertenze.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-ink-100">
        <button className="btn btn-primary" onClick={applica} disabled={invio} data-test="applica">{invio ? 'Applico…' : v.abbinamento === 'NUOVO' ? 'Crea il cliente e proponi i titolari (Invio)' : 'Applica e proponi i titolari (Invio)'}</button>
        {voce.cliente && <button className="btn btn-secondary" onClick={() => vaiA(`cliente?id=${voce.cliente!.id}`)}>Apri la scheda</button>}
        {!scarta && <button className="btn btn-ghost" onClick={() => setScarta(true)} data-test="scarta">Scarta…</button>}
      </div>
      {scarta && (
        <div className="rounded-lg border border-ink-200 p-3 space-y-2">
          <label className="label">Perché scarti la proposta (resta nel registro)</label>
          <textarea className="input min-h-[60px]" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-test="scarta-motivo" />
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary btn-sm" onClick={() => setScarta(false)}>Annulla</button>
            <button className="btn btn-primary btn-sm" onClick={scartaProposta} disabled={!motivo.trim()} data-test="scarta-conferma">Scarta con motivazione</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Voce TITOLARITA (proposta registrata, riletta viva) ─────────

function VoceTitolarita({ voce, onFatto, vaiA, onAlert }: { voce: VoceCoda; onFatto: () => void; vaiA: (p: string) => void; onAlert: (a: any[]) => void }) {
  const [p, setP] = useState<PropostaDto | null>(null);
  const [errore, setErrore] = useState('');
  useEffect(() => {
    setP(null);
    if (!voce.clienteId) return;
    api.get<any>(`/clienti/${voce.clienteId}/compagine`).then((r) => { setP({ ...r, id: voce.id }); onAlert(r.alert ?? []); }).catch((e) => setErrore(e.message));
  }, [voce.id]);
  if (!voce.clienteId) return <Riquadro tipo="avviso">Proposta senza cliente.</Riquadro>;
  return (
    <div className="space-y-3 text-sm">
      {errore && <ErrorBanner message={errore} />}
      <h3 className="!m-0">Titolari effettivi di {voce.cliente?.denominazione}</h3>
      <div className="aiuto">Proposta del {formattaData(voce.creatoIl)}{voce.titolarita?.dataVisura ? ` dalla visura del ${formattaData(voce.titolarita.dataVisura)}` : ''}. La visura non è il registro dei titolari effettivi (art. 21-ter): la proposta applica l’art. 20 ai dati camerali.</div>
      {p ? <PropostaTitolaritaBox clienteId={voce.clienteId} proposta={p} vaiA={vaiA} onRegistrata={onFatto} /> : <div className="caricamento">Ricalcolo la proposta…</div>}
      {p && <TabellaSoci soci={p.soci as any} />}
    </div>
  );
}

// ── La pagina ───────────────────────────────────────────────────

export function Coda({ vaiA }: { vaiA: (p: string) => void }) {
  const [voci, setVoci] = useState<VoceCoda[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [modifica, setModifica] = useState(false);
  const [esito, setEsito] = useState('');
  const [errore, setErrore] = useState('');
  const [inBlocco, setInBlocco] = useState(false);
  const applicaRef = useRef<() => void>(() => undefined);
  const [alertVivi, setAlertVivi] = useState<any[] | null>(null);
  const registraApplica = useCallback((fn: () => void) => { applicaRef.current = fn; }, []);

  const carica = useCallback(() => api.get<VoceCoda[]>('/coda').then((v) => { setVoci(v); setIndice((i) => Math.min(i, Math.max(0, v.length - 1))); }).catch((e) => setErrore(e.message)), []);
  useEffect(() => { carica(); }, [carica]);

  const corrente = voci?.[indice] ?? null;
  useEffect(() => { setAlertVivi(null); }, [corrente?.id]);
  const pulite = useMemo(() => (voci ?? []).filter((v) => v.applicabileInBlocco).length, [voci]);
  const conAlertAlti = useMemo(() => (voci ?? []).filter((v) => v.alert.some((a) => a.gravita === 'alta')).length, [voci]);

  // Tastiera: Invio applica, M modifica, frecce scorrono. Mai dentro un campo di testo.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (!corrente) return;
      if (e.key === 'Enter' && corrente.ambito === 'ANAGRAFICA') { e.preventDefault(); applicaRef.current(); }
      else if (e.key.toLowerCase() === 'm' && corrente.ambito === 'ANAGRAFICA' && corrente.visura?.abbinamento === 'NUOVO') { e.preventDefault(); setModifica((m) => !m); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIndice((i) => Math.min(i + 1, (voci?.length ?? 1) - 1)); setModifica(false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); setModifica(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [corrente, voci]);

  const dopoApplicazione = (r: any) => {
    setModifica(false);
    setEsito(r.propostaTitolaritaId
      ? `Applicata (${r.stato === 'MODIFICATA' ? 'con correzioni' : 'tale e quale'}). La proposta dei titolari effettivi è entrata in coda${r.documentoId ? '; la visura è conservata fra i documenti' : ''}.`
      : `Applicata (${r.stato === 'MODIFICATA' ? 'con correzioni' : 'tale e quale'}).`);
    window.dispatchEvent(new Event('coda-cambiata'));
    carica();
  };

  const applicaTutto = async () => {
    setErrore(''); setInBlocco(true);
    try {
      const r = await api.post<any>('/coda/applica-tutto');
      setEsito(`Applicate ${r.visure} visure e registrati i titolari effettivi di ${r.titolarita} clienti; ${r.saltate} proposte restano da rivedere una alla volta${r.errori?.length ? ` (${r.errori.length} errori)` : ''}.`);
      window.dispatchEvent(new Event('coda-cambiata'));
      await carica();
    } catch (e) { setErrore((e as Error).message); } finally { setInBlocco(false); }
  };

  return (
    <>
      <h1>Coda di revisione <HelpLink sezione="coda" /></h1>
      <p className="occhiello">
        Le proposte del programma in attesa della tua decisione: visure caricate in blocco e titolari effettivi proposti. Una alla volta,
        ma veloce: <kbd>Invio</kbd> applica, <kbd>M</kbd> modifica, <kbd>←</kbd> <kbd>→</kbd> scorrono. Nulla produce effetti finché non decidi.
      </p>

      <CaricaInBlocco onFatto={(esiti) => { setEsito(`${esiti.filter((e) => e.id).length} visure accodate (${esiti.filter((e) => e.abbinamento === 'ESISTENTE').length} di clienti esistenti, ${esiti.filter((e) => e.abbinamento === 'NUOVO').length} nuovi).`); window.dispatchEvent(new Event('coda-cambiata')); carica(); }} />

      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {esito && <Riquadro tipo="info">{esito}</Riquadro>}

      {voci === null ? <div className="caricamento">Caricamento…</div> : voci.length === 0 ? (
        <Riquadro tipo="info">La coda è vuota: nessuna proposta attende la tua revisione.</Riquadro>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3" data-test="coda-barra">
            <button className="btn btn-secondary btn-sm" onClick={() => { setIndice(Math.max(0, indice - 1)); setModifica(false); }} disabled={indice === 0}>← Precedente</button>
            <span className="text-sm font-semibold" data-test="coda-posizione">Proposta {indice + 1} di {voci.length}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setIndice(Math.min(voci.length - 1, indice + 1)); setModifica(false); }} disabled={indice >= voci.length - 1}>Successiva →</button>
            <span className="ml-auto text-xs text-ink-400">{pulite} senza alert alti · {conAlertAlti} con alert alti</span>
            <button className="btn btn-primary btn-sm" onClick={applicaTutto} disabled={pulite === 0 || inBlocco} data-test="applica-tutto"
              title={pulite === 0 ? 'Nessuna proposta senza alert di gravità alta' : 'Applica le proposte senza alert alti; le altre restano da rivedere'}>
              {inBlocco ? 'Applico…' : `Applica le ${pulite} senza alert alti`}
            </button>
          </div>

          {corrente && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4" data-test="coda-voce">
              <div className="card p-5">
                {corrente.ambito === 'ANAGRAFICA' && corrente.visura ? (
                  <VoceVisura key={corrente.id} voce={corrente} modifica={modifica} vaiA={vaiA} registraApplica={registraApplica}
                    onApplicata={dopoApplicazione} onScartata={() => { setEsito('Proposta scartata con motivazione.'); window.dispatchEvent(new Event('coda-cambiata')); carica(); }} />
                ) : (
                  <VoceTitolarita key={corrente.id} voce={corrente} vaiA={vaiA} onAlert={setAlertVivi} onFatto={() => { setEsito('Titolari effettivi registrati.'); window.dispatchEvent(new Event('coda-cambiata')); carica(); }} />
                )}
              </div>
              <aside className="space-y-3" data-test="coda-alert">
                <div className="card p-4">
                  <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold mb-2">Alert</div>
                  {(() => {
                    const elenco: any[] = corrente.ambito === 'TITOLARITA' ? (alertVivi ?? corrente.alert) : (corrente.visura?.alertDettaglio ?? corrente.alert);
                    return elenco.length === 0 ? (
                    <div className="text-sm text-teal-700">Nessun alert: si conferma in pochi secondi.</div>
                  ) : (
                    <div className="space-y-2">
                      {elenco.map((a: any, i: number) => (
                        <div key={`${a.codice}-${i}`} className={`rounded-lg border px-3 py-2 text-sm ${a.gravita === 'alta' ? 'border-red-200 bg-red-50/60' : a.gravita === 'media' ? 'border-amber-200 bg-amber-50/60' : 'border-ink-200'}`}>
                          <Badge tone={TONO[a.gravita]}>{a.codice}</Badge> {a.titolo && <strong className="ml-1">{a.titolo}</strong>}
                          {a.messaggio && <div className="mt-1 text-ink-700 text-xs">{a.messaggio}</div>}
                          {a.norma && <div className="font-mono text-[11px] text-ink-400 mt-1">{a.norma}</div>}
                        </div>
                      ))}
                    </div>
                  );
                  })()}
                </div>
                <div className="card p-4 text-xs text-ink-500 space-y-1">
                  <div><Badge tone={corrente.ambito === 'ANAGRAFICA' ? 'teal' : 'gray'}>{corrente.ambito === 'ANAGRAFICA' ? (corrente.visura?.abbinamento === 'NUOVO' ? 'nuovo cliente' : 'cliente esistente') : 'titolarità effettiva'}</Badge></div>
                  <div>In coda dal {formattaData(corrente.creatoIl)}</div>
                  {corrente.applicabileInBlocco ? <div className="text-teal-700">Applicabile in blocco</div> : <div>Da rivedere una alla volta</div>}
                  {corrente.ambito === 'ANAGRAFICA' && corrente.visura?.abbinamento === 'NUOVO' && <div>Premi <kbd>M</kbd> per correggere l’anagrafica prima di applicare.</div>}
                </div>
              </aside>
            </div>
          )}
        </>
      )}
      <PiedeLegale />
    </>
  );
}
