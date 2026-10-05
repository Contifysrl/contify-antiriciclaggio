import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Badge, Field, HelpLink, Modal, SearchInput } from '../components/ui';
import { PiedeLegale, Riquadro } from '../componenti';
import { leggiCsvBrowser } from '../pagine/ImportClienti';
import { leggiVisura } from '../lib/visura';
import { estraiTestoPdf, PdfSenzaTesto } from '../lib/visura-testo';
import type { ClienteTs } from './api';

// ── Contify Timesheet — Clienti (TS-M1, titolare; decisione A16) ──
// L'elenco è l'unione dei clienti propri di Timesheet e di quelli di
// Antiriciclaggio (scelta B2): quelli di AR compaiono da soli con lo stesso
// nome e si modificano in AR. «Nuovo cliente» offre i quattro modi: a mano,
// da partita IVA (VIES), da importazione (file con colonne, o elenco di
// denominazioni), da visura camerale (il PDF si legge nel browser e non lascia
// il computer; Timesheet tiene solo i dati della società). In ogni caso prima
// di salvare si vede l'anagrafica e la si può correggere; importazione e
// doppioni mostrano anteprima e scarti motivati.

type Anagrafica = { denominazione: string; personaFisica: boolean; codiceFiscale: string; partitaIva: string; sede: string; pec: string; codiceDestinatario: string; email: string; telefono: string; origine: string };
const VUOTA: Anagrafica = { denominazione: '', personaFisica: false, codiceFiscale: '', partitaIva: '', sede: '', pec: '', codiceDestinatario: '', email: '', telefono: '', origine: 'MANUALE' };

export function TsClienti() {
  const [clienti, setClienti] = useState<ClienteTs[]>([]);
  const [ricerca, setRicerca] = useState('');
  const [errore, setErrore] = useState('');
  const [nuovo, setNuovo] = useState<null | 'mano' | 'piva' | 'import' | 'visura'>(null);
  const [aperto, setAperto] = useState<ClienteTs | null>(null);
  const [conInattivi, setConInattivi] = useState(false);

  const carica = () => api.get<{ clienti: ClienteTs[] }>('/ts/clienti').then((r) => setClienti(r.clienti)).catch((e) => setErrore((e as Error).message));
  useEffect(() => { carica(); }, []);

  const visibili = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return clienti.filter((c) => (conInattivi || c.attivo) && (!q || c.nome.toLowerCase().includes(q) || (c.partitaIva ?? '').includes(q) || (c.codiceFiscale ?? '').toLowerCase().includes(q) || c.alias.some((a) => a.includes(q))));
  }, [clienti, ricerca, conInattivi]);
  const daVerificare = clienti.filter((c) => c.daVerificare && c.attivo).length;

  return (
    <>
      <h1>Clienti <HelpLink sezione="ts-clienti" /></h1>
      <p className="occhiello">I clienti per cui lo studio registra il lavoro. Quelli di Antiriciclaggio compaiono da soli e si modificano lì; qui si aggiungono gli altri, a mano, da partita IVA, da importazione o da visura.</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" className="btn btn-primary" onClick={() => setNuovo('mano')} data-test="nuovo-a-mano">Nuovo cliente</button>
        <button type="button" className="btn btn-secondary" onClick={() => setNuovo('piva')}>Da partita IVA</button>
        <button type="button" className="btn btn-secondary" onClick={() => setNuovo('import')}>Da importazione</button>
        <button type="button" className="btn btn-secondary" onClick={() => setNuovo('visura')}>Da visura</button>
        {daVerificare > 0 && <span className="pillola r3 self-center" data-test="da-verificare-conteggio">{daVerificare} da verificare</span>}
      </div>
      {errore && <div className="errore">{errore}</div>}

      <div className="scheda">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex-1 min-w-60"><SearchInput value={ricerca} onChange={setRicerca} placeholder="Cerca per nome, partita IVA, codice fiscale o modo di dire…" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={conInattivi} onChange={(e) => setConInattivi(e.target.checked)} />Mostra anche i non attivi</label>
        </div>
        <table>
          <thead><tr><th>Denominazione</th><th>CF / P.IVA</th><th>Origine</th><th>Modi di dire</th><th>Stato</th></tr></thead>
          <tbody>
            {visibili.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer', opacity: c.attivo ? 1 : 0.55 }} onClick={() => setAperto(c)} title="Apri la scheda" data-test="riga-cliente">
                <td><strong>{c.nome}</strong>{c.personaFisica && <span className="text-xs text-ink-400 ml-2">persona</span>}</td>
                <td className="mono">{c.codiceFiscale ?? c.partitaIva ?? '—'}</td>
                <td className="text-sm text-ink-500">{etichettaOrigine(c.origine)}</td>
                <td className="text-sm text-ink-500">{c.alias.join(', ') || '—'}</td>
                <td className="space-x-1">
                  {c.collegatoAr && <Badge tone="teal">Antiriciclaggio</Badge>}
                  {c.arMancante && <Badge tone="amber">cliente AR rimosso</Badge>}
                  {c.daVerificare && <Badge tone="amber">da verificare</Badge>}
                  {!c.attivo && <Badge tone="gray">non attivo</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibili.length === 0 && <p className="caricamento">Nessun cliente{ricerca ? ' con questa ricerca' : ''}.</p>}
      </div>

      {nuovo && <NuovoCliente modo={nuovo} onClose={() => setNuovo(null)} onFatto={() => { setNuovo(null); carica(); }} />}
      {aperto && <SchedaCliente cliente={aperto} clientiAr={clienti.filter((c) => c.id.startsWith('ar:'))} onClose={() => setAperto(null)} onCambiato={() => { setAperto(null); carica(); }} />}
      <PiedeLegale />
    </>
  );
}

function etichettaOrigine(o: string): string {
  return ({ MANUALE: 'a mano', VIES: 'partita IVA', IMPORT: 'importazione', VISURA: 'visura', CHAT: 'dalla chat', AR: 'Antiriciclaggio' } as Record<string, string>)[o] ?? o;
}

function CampiAnagrafica({ a, setA, soloFatturazione }: { a: Anagrafica; setA: (a: Anagrafica) => void; soloFatturazione?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {!soloFatturazione && (
        <>
          <Field label="Denominazione" className="md:col-span-2"><input className="input" value={a.denominazione} onChange={(e) => setA({ ...a, denominazione: e.target.value })} data-test="denominazione" /></Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" className="!w-4" checked={a.personaFisica} onChange={(e) => setA({ ...a, personaFisica: e.target.checked })} />Persona fisica (ditta individuale, professionista, privato)</label>
          <Field label="Codice fiscale"><input className="input mono" value={a.codiceFiscale} onChange={(e) => setA({ ...a, codiceFiscale: e.target.value.toUpperCase() })} /></Field>
          <Field label="Partita IVA"><input className="input mono" value={a.partitaIva} onChange={(e) => setA({ ...a, partitaIva: e.target.value })} /></Field>
        </>
      )}
      <Field label="Sede" className="md:col-span-2"><input className="input" value={a.sede} onChange={(e) => setA({ ...a, sede: e.target.value })} /></Field>
      <Field label="PEC"><input className="input" value={a.pec} onChange={(e) => setA({ ...a, pec: e.target.value })} /></Field>
      <Field label="Codice destinatario (SDI)"><input className="input mono" value={a.codiceDestinatario} maxLength={7} onChange={(e) => setA({ ...a, codiceDestinatario: e.target.value.toUpperCase() })} /></Field>
      <Field label="Email"><input className="input" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} /></Field>
      <Field label="Telefono"><input className="input" value={a.telefono} onChange={(e) => setA({ ...a, telefono: e.target.value })} /></Field>
    </div>
  );
}

function corpoDa(a: Anagrafica) {
  return {
    denominazione: a.denominazione.trim(), personaFisica: a.personaFisica, codiceFiscale: a.codiceFiscale.trim() || null, partitaIva: a.partitaIva.trim() || null,
    sede: a.sede.trim() || null, pec: a.pec.trim() || null, codiceDestinatario: a.codiceDestinatario.trim() || null, email: a.email.trim() || null, telefono: a.telefono.trim() || null, origine: a.origine,
  };
}

function NuovoCliente({ modo, onClose, onFatto }: { modo: 'mano' | 'piva' | 'import' | 'visura'; onClose: () => void; onFatto: () => void }) {
  const [a, setA] = useState<Anagrafica>({ ...VUOTA, origine: modo === 'piva' ? 'VIES' : modo === 'visura' ? 'VISURA' : 'MANUALE' });
  const [fase, setFase] = useState<'fonte' | 'anagrafica'>(modo === 'mano' ? 'anagrafica' : 'fonte');
  const [errore, setErrore] = useState('');
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [piva, setPiva] = useState('');
  // Importazione.
  const [testoImport, setTestoImport] = useState('');
  const [righe, setRighe] = useState<string[][]>([]);
  const [mappa, setMappa] = useState<string[]>([]);
  const [conIntestazione, setConIntestazione] = useState(true);
  const [report, setReport] = useState<{ creati: number; scartate: Array<{ riga: number; motivo: string }> } | null>(null);

  const titolo = { mano: 'Nuovo cliente', piva: 'Nuovo cliente da partita IVA', import: 'Importa clienti', visura: 'Nuovo cliente da visura camerale' }[modo];

  const cercaPiva = async () => {
    setErrore(''); setAvvisi([]); setInCorso(true);
    try {
      const r = await api.get<any>(`/ts/lookup/piva/${encodeURIComponent(piva)}`);
      if (r.esito === 'trovato') {
        const d = r.dati;
        setA({ ...a, denominazione: d.ragioneSociale ?? '', partitaIva: piva.replace(/\D/g, ''), codiceFiscale: d.codiceFiscale ?? '', sede: [d.indirizzo, [d.cap, d.citta].filter(Boolean).join(' '), d.provincia ? `(${d.provincia})` : ''].filter(Boolean).join(', '), origine: 'VIES' });
        setAvvisi(r.avvisi ?? []);
        setFase('anagrafica');
      } else if (r.esito === 'partita_iva_non_valida') setErrore('La partita IVA non è formalmente valida: controlla le 11 cifre.');
      else if (r.esito === 'non_trovato') setErrore('Partita IVA non presente nell’archivio europeo (in Italia l’iscrizione al VIES è facoltativa): compila a mano.');
      else if (r.esito === 'limite_raggiunto') setErrore('Troppe ricerche in quest’ora: riprova più tardi.');
      else setErrore('Il servizio europeo non risponde in questo momento: riprova tra poco o compila a mano.');
    } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); }
  };

  const leggiPdf = async (file: File) => {
    setErrore(''); setInCorso(true);
    try {
      const { testo } = await estraiTestoPdf(await file.arrayBuffer());
      const v = leggiVisura(testo);
      // Solo i dati della società: soci, cariche e titolari effettivi non si salvano, il PDF non si conserva.
      setA({
        ...a, denominazione: v.denominazione ?? '', codiceFiscale: v.codiceFiscale ?? '', partitaIva: v.partitaIva ?? '',
        sede: v.sede.testo ?? [v.sede.indirizzo, [v.sede.cap, v.sede.comune].filter(Boolean).join(' '), v.sede.provincia ? `(${v.sede.provincia})` : ''].filter(Boolean).join(', '),
        pec: v.pec ?? '', personaFisica: v.tipoProposto === 'PERSONA_FISICA', origine: 'VISURA',
      });
      setAvvisi([...(v.avvisi ?? []), ...(v.campiNonTrovati?.length ? [`Campi non trovati nella visura: ${v.campiNonTrovati.join(', ')}.`] : [])]);
      setFase('anagrafica');
    } catch (e) {
      setErrore(e instanceof PdfSenzaTesto ? e.message : `Non riesco a leggere il PDF: ${(e as Error).message}`);
    } finally { setInCorso(false); }
  };

  const analizzaCsv = (contenuto: string) => {
    setErrore('');
    const parsed = leggiCsvBrowser(contenuto);
    if (!parsed.length) { setErrore('Nessuna riga riconosciuta nel file'); return; }
    setRighe(parsed);
    const intest = parsed[0] ?? [];
    const prop = intest.map((h) => proponiCampo(h));
    setMappa(prop);
    setConIntestazione(prop.some((p) => p !== ''));
  };
  const dati = conIntestazione ? righe.slice(1) : righe;

  const salvaUno = async () => {
    setErrore(''); setInCorso(true);
    try {
      await api.post('/ts/clienti', corpoDa(a));
      onFatto();
    } catch (e) {
      const msg = (e as Error).message;
      setErrore(msg);
    } finally { setInCorso(false); }
  };

  const importa = async () => {
    setErrore(''); setInCorso(true);
    try {
      const corpo = righe.length
        ? { righe: dati.map((r) => { const o: Record<string, string> = {}; mappa.forEach((campo, i) => { if (campo) o[campo] = (r[i] ?? '').trim(); }); return o; }) }
        : { denominazioni: testoImport };
      const r = await api.post<{ creati: number; scartate: Array<{ riga: number; motivo: string }> }>('/ts/clienti/import', corpo);
      setReport(r);
    } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); }
  };

  return (
    <Modal title={titolo} onClose={onClose} wide={modo === 'import'}>
      {modo === 'import' ? (
        <div className="space-y-3" data-test="import-clienti">
          {!report && (
            <>
              <p className="text-sm text-ink-600">Un file CSV con le colonne da abbinare (denominazione, codice fiscale, partita IVA, PEC…), oppure un elenco di sole denominazioni incollato qui sotto, una per riga. Massimo 500 righe. I doppioni vengono scartati con il motivo.</p>
              <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const l = new FileReader(); l.onload = () => analizzaCsv(String(l.result ?? '')); l.readAsText(f); }} />
              {righe.length > 0 ? (
                <>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={conIntestazione} onChange={(e) => setConIntestazione(e.target.checked)} />La prima riga è l’intestazione</label>
                  <div className="overflow-x-auto"><table>
                    <thead><tr>{(righe[0] ?? []).map((_, i) => (
                      <th key={i}>
                        <select className="input !py-1 text-xs" value={mappa[i] ?? ''} onChange={(e) => setMappa(mappa.map((m, j) => (j === i ? e.target.value : m)))}>
                          <option value="">— ignora —</option>
                          {CAMPI_IMPORT.map((c) => <option key={c.id} value={c.id}>{c.etichetta}</option>)}
                        </select>
                      </th>
                    ))}</tr></thead>
                    <tbody>{dati.slice(0, 5).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="text-xs">{v}</td>)}</tr>)}</tbody>
                  </table></div>
                  <div className="text-xs text-ink-400">{dati.length} righe{dati.length > 5 ? ', le prime 5 in anteprima' : ''}.</div>
                </>
              ) : (
                <textarea className="input" rows={8} value={testoImport} onChange={(e) => setTestoImport(e.target.value)} placeholder={'Omega Spa\nBeta Industrie Srl\nRossi Mario'} data-test="denominazioni" />
              )}
              {errore && <div className="errore">{errore}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button>
                <button type="button" className="btn btn-primary" onClick={importa} disabled={inCorso || (righe.length ? !mappa.includes('denominazione') : !testoImport.trim())} data-test="importa">{inCorso ? 'Importo…' : 'Importa'}</button>
              </div>
            </>
          )}
          {report && (
            <>
              <Riquadro tipo={report.scartate.length ? 'avviso' : 'info'}>
                <strong>{report.creati}</strong> clienti creati{report.scartate.length ? `, ${report.scartate.length} righe scartate:` : '.'}
                {report.scartate.length > 0 && <ul className="mt-1 text-xs">{report.scartate.slice(0, 50).map((s) => <li key={s.riga}>riga {s.riga}: {s.motivo}</li>)}</ul>}
              </Riquadro>
              <div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={onFatto}>Chiudi</button></div>
            </>
          )}
        </div>
      ) : fase === 'fonte' ? (
        <div className="space-y-3">
          {modo === 'piva' && (
            <>
              <Field label="Partita IVA"><input className="input mono" autoFocus value={piva} onChange={(e) => setPiva(e.target.value)} placeholder="11 cifre" data-test="piva" /></Field>
              <p className="text-xs text-ink-400">L’archivio europeo (VIES) dà denominazione e indirizzo, non il codice fiscale né la PEC: li completi dopo.</p>
              {errore && <div className="errore">{errore}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setFase('anagrafica')}>Compila a mano</button>
                <button type="button" className="btn btn-primary" onClick={cercaPiva} disabled={inCorso || piva.replace(/\D/g, '').length < 10} data-test="cerca-piva">{inCorso ? 'Cerco…' : 'Cerca'}</button>
              </div>
            </>
          )}
          {modo === 'visura' && (
            <>
              <p className="text-sm text-ink-600">Carica il PDF della visura camerale: viene letto nel browser e non lascia il computer dello studio. Timesheet tiene solo i dati della società (denominazione, codice fiscale, partita IVA, sede, PEC): soci, cariche e titolari effettivi non si salvano e il PDF non si conserva.</p>
              <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) leggiPdf(f); }} data-test="file-visura" />
              {inCorso && <div className="caricamento">Leggo la visura…</div>}
              {errore && <div className="errore">{errore}</div>}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3" data-test="anagrafica-nuovo">
          {avvisi.length > 0 && <Riquadro tipo="avviso">{avvisi.map((x, i) => <div key={i}>{x}</div>)}</Riquadro>}
          <CampiAnagrafica a={a} setA={setA} />
          {errore && <div className="errore">{errore}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button>
            <button type="button" className="btn btn-primary" onClick={salvaUno} disabled={inCorso || !a.denominazione.trim()} data-test="salva-cliente">{inCorso ? 'Salvo…' : 'Salva il cliente'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const CAMPI_IMPORT = [
  { id: 'denominazione', etichetta: 'Denominazione' }, { id: 'codiceFiscale', etichetta: 'Codice fiscale' }, { id: 'partitaIva', etichetta: 'Partita IVA' },
  { id: 'sede', etichetta: 'Sede' }, { id: 'pec', etichetta: 'PEC' }, { id: 'codiceDestinatario', etichetta: 'Codice destinatario' }, { id: 'email', etichetta: 'Email' }, { id: 'telefono', etichetta: 'Telefono' },
];
function proponiCampo(h: string): string {
  const t = h.toLowerCase().trim();
  if (/denominaz|ragione|nominativ|cliente|^nome/.test(t)) return 'denominazione';
  if (/codice.*fisc|^cf$|cod\.?\s*fisc/.test(t)) return 'codiceFiscale';
  if (/partita|p\.?\s*iva|piva|vat/.test(t)) return 'partitaIva';
  if (/sede|indirizzo|via/.test(t)) return 'sede';
  if (/pec/.test(t)) return 'pec';
  if (/sdi|destinatario/.test(t)) return 'codiceDestinatario';
  if (/mail/.test(t)) return 'email';
  if (/tel|cell/.test(t)) return 'telefono';
  return '';
}

function SchedaCliente({ cliente, clientiAr, onClose, onCambiato }: { cliente: ClienteTs; clientiAr: ClienteTs[]; onClose: () => void; onCambiato: () => void }) {
  const virtuale = cliente.id.startsWith('ar:');
  const collegato = cliente.collegatoAr && !cliente.arMancante;
  const [a, setA] = useState<Anagrafica>({
    denominazione: cliente.nome, personaFisica: cliente.personaFisica, codiceFiscale: cliente.codiceFiscale ?? '', partitaIva: cliente.partitaIva ?? '',
    sede: cliente.dati?.sede ?? '', pec: cliente.dati?.pec ?? '', codiceDestinatario: cliente.dati?.codiceDestinatario ?? '', email: cliente.dati?.email ?? '', telefono: cliente.dati?.telefono ?? '', origine: cliente.origine,
  });
  const [alias, setAlias] = useState<string[]>(cliente.alias);
  const [nuovoAlias, setNuovoAlias] = useState('');
  const [clienteArId, setClienteArId] = useState<string | null>(cliente.clienteArId);
  const [attivo, setAttivo] = useState(cliente.attivo);
  const [daVerificare, setDaVerificare] = useState(cliente.daVerificare);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const salva = async () => {
    setErrore(''); setInCorso(true);
    try {
      const corpo: Record<string, unknown> = { alias, attivo, daVerificare };
      if (clienteArId !== cliente.clienteArId) corpo.clienteArId = clienteArId;
      if (!collegato || clienteArId === null) Object.assign(corpo, corpoDa(a), { origine: undefined });
      else Object.assign(corpo, { sede: a.sede.trim() || null, pec: a.pec.trim() || null, codiceDestinatario: a.codiceDestinatario.trim() || null, email: a.email.trim() || null, telefono: a.telefono.trim() || null });
      await api.post(`/ts/clienti/${encodeURIComponent(cliente.id)}`, corpo);
      onCambiato();
    } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); }
  };

  return (
    <Modal title={cliente.nome} onClose={onClose} wide>
      <div className="space-y-4" data-test="scheda-cliente">
        <div className="flex flex-wrap gap-2 text-sm">
          {collegato && <Badge tone="teal">collegato ad Antiriciclaggio</Badge>}
          {cliente.arMancante && <Badge tone="amber">il cliente Antiriciclaggio collegato non esiste più: vale la copia del nome</Badge>}
          <span className="text-ink-500">Origine: {etichettaOrigine(cliente.origine)}</span>
        </div>
        {collegato && clienteArId && (
          <Riquadro tipo="info">L’anagrafica di questo cliente è quella di Antiriciclaggio e si modifica lì. Qui restano i dati per la fatturazione (sede, PEC, codice destinatario, email, telefono), i modi di dire e lo stato.</Riquadro>
        )}
        {virtuale ? (
          <p className="text-sm text-ink-600">Cliente di Antiriciclaggio non ancora usato in Timesheet: la sua riga nasce alla prima registrazione. Puoi già aggiungergli un modo di dire.</p>
        ) : (
          <CampiAnagrafica a={a} setA={setA} soloFatturazione={collegato && clienteArId !== null} />
        )}

        <div>
          <div className="label mb-1">Modi di dire</div>
          <div className="aiuto">Come lo chiamano in studio nelle frasi («il ponte», «la fonderia»): il programma li riconosce come il nome. Ogni modo di dire indica un solo cliente.</div>
          <div className="flex flex-wrap gap-2 items-center">
            {alias.map((x) => (
              <span key={x} className="pillola r1 !max-w-none inline-flex items-center gap-1">{x}<button type="button" className="text-ink-400 hover:text-red-600" aria-label={`Togli ${x}`} onClick={() => setAlias(alias.filter((y) => y !== x))}>×</button></span>
            ))}
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = nuovoAlias.trim().toLowerCase(); if (v && !alias.includes(v)) setAlias([...alias, v]); setNuovoAlias(''); }}>
              <input className="input !w-44 !py-1 text-sm" value={nuovoAlias} onChange={(e) => setNuovoAlias(e.target.value)} placeholder="nuovo modo di dire" aria-label="Nuovo modo di dire" />
              <button className="btn btn-secondary btn-sm" disabled={!nuovoAlias.trim()}>Aggiungi</button>
            </form>
          </div>
        </div>

        {!virtuale && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Collegamento ad Antiriciclaggio">
              <select className="input" value={clienteArId ?? ''} onChange={(e) => setClienteArId(e.target.value || null)} data-test="collega-ar">
                <option value="">Nessuno (cliente solo Timesheet)</option>
                {cliente.clienteArId && <option value={cliente.clienteArId}>{cliente.nome} (attuale)</option>}
                {clientiAr.map((c) => <option key={c.id} value={c.id.slice(3)}>{c.nome}</option>)}
              </select>
              <div className="aiuto mt-1">Il programma non unisce mai da solo due clienti con nome simile: li colleghi tu.</div>
            </Field>
            <div className="space-y-2 pt-5">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />Attivo (si può registrare lavoro per questo cliente)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={daVerificare} onChange={(e) => setDaVerificare(e.target.checked)} data-test="da-verificare" />Da verificare</label>
            </div>
          </div>
        )}
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button>
          {virtuale ? (
            <button type="button" className="btn btn-primary" disabled={inCorso || !alias.length} onClick={async () => { setInCorso(true); try { for (const x of alias) await api.post(`/ts/clienti/${encodeURIComponent(cliente.id)}/alias`, { alias: x }); onCambiato(); } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); } }}>Salva i modi di dire</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={salva} disabled={inCorso || !a.denominazione.trim()} data-test="salva-scheda">{inCorso ? 'Salvo…' : 'Salva'}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
