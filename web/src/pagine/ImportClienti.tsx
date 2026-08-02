import { useMemo, useState } from 'react';
import { api } from '../api';
import { Modal } from '../components/ui';
import { Riquadro } from '../componenti';

// ── Import clienti da CSV / Excel esportato (AR-M7) ────────────
// Tutto il parsing sta nel browser: si incolla o si carica il file, si
// controlla la mappatura delle colonne (proposta da sola sui nomi di
// intestazione più comuni), si guarda l'anteprima e si importa.

const CAMPI = [
  { chiave: '', etichetta: '— ignora colonna —' },
  { chiave: 'denominazione', etichetta: 'Denominazione / nominativo' },
  { chiave: 'tipo', etichetta: 'Natura giuridica' },
  { chiave: 'codiceFiscale', etichetta: 'Codice fiscale' },
  { chiave: 'partitaIva', etichetta: 'Partita IVA' },
  { chiave: 'paeseResidenza', etichetta: 'Paese' },
  { chiave: 'attivitaPrevalente', etichetta: 'Attività prevalente' },
  { chiave: 'ateco', etichetta: 'Codice ATECO' },
  { chiave: 'pep', etichetta: 'PEP (sì/no)' },
  { chiave: 'note', etichetta: 'Note' },
] as const;

/** Intestazioni ricorrenti → campo. */
function proponiCampo(intestazione: string): string {
  const h = intestazione.toLowerCase().trim();
  if (/denominaz|ragione|nominativ|cliente|^nome/.test(h)) return 'denominazione';
  if (/natura|tipo|forma/.test(h)) return 'tipo';
  if (/codice.*fisc|^cf$|cod\.?\s*fisc/.test(h)) return 'codiceFiscale';
  if (/partita|p\.?\s*iva|piva|vat/.test(h)) return 'partitaIva';
  if (/paese|nazione|stato|country/.test(h)) return 'paeseResidenza';
  if (/attivit/.test(h)) return 'attivitaPrevalente';
  if (/ateco/.test(h)) return 'ateco';
  if (/pep|politicamente/.test(h)) return 'pep';
  if (/not[ae]/.test(h)) return 'note';
  return '';
}

/** "S.r.l." nel testo → natura giuridica; per l'import da gestionali che non la esportano. */
function proponiTipo(valore: string, denominazione: string): string {
  const v = (valore || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (v) {
    if (/PERSONAFISICA|PF|PERSONA/.test(v)) return 'PERSONA_FISICA';
    if (/CAPITALI|SRL|SRLS|SPA|SAPA|COOPERATIVA|SCARL/.test(v)) return 'SOCIETA_CAPITALI';
    if (/PERSONE|SNC|SAS|SEMPLICE/.test(v)) return 'SOCIETA_PERSONE';
    if (/NONPROFIT|APS|ODV|ONLUS|ASSOCIAZIONE|FONDAZIONE|ENTE/.test(v)) return 'ENTE_NON_PROFIT';
    if (/TRUST/.test(v)) return 'TRUST';
  }
  const d = denominazione.toUpperCase();
  if (/\bS\.?R\.?L\.?S?\b|\bS\.?P\.?A\.?\b|SOC.*CAPITAL/.test(d)) return 'SOCIETA_CAPITALI';
  if (/\bS\.?A\.?S\.?\b|\bS\.?N\.?C\.?\b/.test(d)) return 'SOCIETA_PERSONE';
  if (/ASSOCIAZIONE|FONDAZIONE|ONLUS|\bAPS\b|\bODV\b/.test(d)) return 'ENTE_NON_PROFIT';
  if (/TRUST/.test(d)) return 'TRUST';
  return v ? 'ALTRO' : 'PERSONA_FISICA';
}

/** CSV con virgolette e separatore , o ; (rilevato dalla prima riga). */
export function leggiCsvBrowser(testo: string): string[][] {
  const primaRiga = testo.slice(0, testo.indexOf('\n') + 1 || testo.length);
  const sep = (primaRiga.match(/;/g)?.length ?? 0) >= (primaRiga.match(/,/g)?.length ?? 0) ? ';' : ',';
  const righe: string[][] = [];
  let campo = '';
  let riga: string[] = [];
  let inQuote = false;
  const chiudiRiga = () => {
    riga.push(campo); campo = '';
    if (riga.length > 1 || riga[0].trim() !== '') righe.push(riga);
    riga = [];
  };
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (inQuote) {
      if (ch === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else inQuote = false; }
      else campo += ch;
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === sep) { riga.push(campo); campo = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && testo[i + 1] === '\n') i++; chiudiRiga(); continue; }
    campo += ch;
  }
  if (campo !== '' || riga.length) chiudiRiga();
  return righe;
}

export function ImportClientiModal({ onChiudi, onImportati }: { onChiudi: () => void; onImportati: () => void }) {
  const [testo, setTesto] = useState('');
  const [righe, setRighe] = useState<string[][]>([]);
  const [mappa, setMappa] = useState<string[]>([]);
  const [conIntestazione, setConIntestazione] = useState(true);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [report, setReport] = useState<{ creati: number; scartate: Array<{ riga: number; motivo: string }> } | null>(null);

  const analizza = (contenuto: string) => {
    setErrore('');
    const parsed = leggiCsvBrowser(contenuto);
    if (parsed.length === 0) { setErrore('Nessuna riga riconosciuta nel file'); return; }
    setTesto(contenuto);
    setRighe(parsed);
    const intestazioni = parsed[0] ?? [];
    setMappa(intestazioni.map((h) => proponiCampo(h)));
    setConIntestazione(intestazioni.some((h) => proponiCampo(h) !== ''));
  };

  const daFile = (file: File) => {
    const lettore = new FileReader();
    lettore.onload = () => analizza(String(lettore.result ?? ''));
    lettore.onerror = () => setErrore('File non leggibile');
    lettore.readAsText(file);
  };

  const dati = useMemo(() => (conIntestazione ? righe.slice(1) : righe), [righe, conIntestazione]);
  const colonne = righe[0]?.length ?? 0;
  const mappaCompleta = mappa.includes('denominazione');

  const record = useMemo(() => dati.map((r) => {
    const oggetto: Record<string, string> = {};
    mappa.forEach((campo, i) => { if (campo) oggetto[campo] = (r[i] ?? '').trim(); });
    oggetto.tipo = proponiTipo(oggetto.tipo ?? '', oggetto.denominazione ?? '');
    return oggetto;
  }), [dati, mappa]);

  const importa = async () => {
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ creati: number; scartate: Array<{ riga: number; motivo: string }> }>('/clienti/import', { righe: record });
      setReport(r);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInvio(false);
    }
  };

  if (report) {
    return (
      <Modal title="Import completato" onClose={() => { onImportati(); }}>
        <div className="space-y-3 text-sm">
          <Riquadro tipo="info"><strong>{report.creati} clienti importati.</strong></Riquadro>
          {report.scartate.length > 0 && (
            <>
              <p><strong>{report.scartate.length} righe non importate:</strong></p>
              <ul className="list-disc ml-5 space-y-1 max-h-48 overflow-y-auto">
                {report.scartate.map((s, i) => <li key={i}>riga {s.riga}: {s.motivo}</li>)}
              </ul>
            </>
          )}
          <div className="text-right">
            <button className="btn btn-primary" onClick={() => { onImportati(); }}>Chiudi</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Importa clienti da CSV" onClose={onChiudi} wide>
      <div className="space-y-3 text-sm">
        {righe.length === 0 && (
          <>
            <p>
              Esporta l’elenco clienti dal gestionale in CSV (o salva il foglio Excel «come CSV») e
              caricalo qui, oppure incolla direttamente le righe. Massimo 500 clienti per volta.
            </p>
            <div className="flex gap-2 items-center">
              <label className="btn btn-secondary btn-sm cursor-pointer">
                Scegli il file…
                <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) daFile(f); e.target.value = ''; }} />
              </label>
              <span className="text-ink-400">oppure incolla e premi Analizza</span>
            </div>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              placeholder={'Denominazione;Codice fiscale;Partita IVA\nMario Rossi;RSSMRA80A01H501U;\nAlfa S.r.l.;;01234567890'}
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
              <button className="btn btn-primary" disabled={!testo.trim()} onClick={() => analizza(testo)}>Analizza</button>
            </div>
          </>
        )}

        {righe.length > 0 && (
          <>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="!w-4" checked={conIntestazione} onChange={(e) => setConIntestazione(e.target.checked)} />
              <span>La prima riga contiene le intestazioni</span>
            </label>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    {Array.from({ length: colonne }, (_, i) => (
                      <th key={i}>
                        <select
                          className="input !py-1 !text-xs"
                          value={mappa[i] ?? ''}
                          onChange={(e) => setMappa(mappa.map((m, j) => (j === i ? e.target.value : m)))}
                        >
                          {CAMPI.map((c) => <option key={c.chiave} value={c.chiave}>{c.etichetta}</option>)}
                        </select>
                        {conIntestazione && <div className="text-[10px] text-ink-400 font-normal mt-1 normal-case">{righe[0][i]}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dati.slice(0, 5).map((r, i) => (
                    <tr key={i}>{Array.from({ length: colonne }, (_, j) => <td key={j} className="text-xs">{r[j] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-ink-400">
              Anteprima delle prime 5 righe su {dati.length}. La natura giuridica, se non esportata,
              viene dedotta dalla denominazione (S.r.l., S.p.A., …) ed è sempre modificabile dopo.
            </div>
            {!mappaCompleta && <Riquadro tipo="avviso">Assegna almeno la colonna <strong>Denominazione</strong> per procedere.</Riquadro>}
            {dati.length > 500 && <Riquadro tipo="avviso">Il file ha {dati.length} righe: il tetto è 500 per volta. Spezzalo in più import.</Riquadro>}
            {errore && <div className="errore">{errore}</div>}
            <div className="flex justify-between gap-2 pt-1">
              <button className="btn btn-ghost btn-sm" onClick={() => { setRighe([]); setReport(null); }}>Cambia file</button>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
                <button className="btn btn-primary" disabled={!mappaCompleta || invio || dati.length === 0 || dati.length > 500} onClick={importa}>
                  {invio ? 'Import in corso…' : `Importa ${dati.length} clienti`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
