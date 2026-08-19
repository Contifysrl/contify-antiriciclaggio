import { useEffect, useState } from 'react';
import { api, formattaData } from '../api';
import { PiedeLegale, Riquadro } from '../componenti';
import { ConfermaEliminazione, HelpLink } from '../components/ui';
import { CampoProfessionista, useProfessionisti } from '../lib/professionisti';

// ── Scheda del cliente (AR-M14) ─────────────────────────────────
// Fino a M13 l'anagrafica si poteva creare e non si poteva più aprire:
// l'elenco portava ai fascicoli. Qui vive la scheda vera, con modifica,
// archiviazione e cancellazione.

const TIPI: Array<[string, string]> = [
  ['PERSONA_FISICA', 'Persona fisica'],
  ['SOCIETA_CAPITALI', 'Società di capitali'],
  ['SOCIETA_PERSONE', 'Società di persone'],
  ['ENTE_NON_PROFIT', 'Ente non profit'],
  ['TRUST', 'Trust o istituto affine'],
  ['ALTRO', 'Altro'],
];

export function etichettaTipo(tipo: string): string {
  return TIPI.find(([k]) => k === tipo)?.[1] ?? tipo.replace(/_/g, ' ').toLowerCase();
}

/** Campi dell'anagrafica, condivisi fra creazione e modifica. */
export function CampiCliente({ f, setF, onCompilaDaPiva, cercaInCorso }: {
  f: any;
  setF: (v: any) => void;
  onCompilaDaPiva?: () => void;
  cercaInCorso?: boolean;
}) {
  return (
    <>
      <div className="griglia c2">
        <div className="campo">
          <label>Denominazione o nominativo</label>
          <input value={f.denominazione ?? ''} onChange={(e) => setF({ ...f, denominazione: e.target.value })} />
        </div>
        <div className="campo">
          <label>Natura giuridica</label>
          <select value={f.tipo ?? 'SOCIETA_CAPITALI'} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Codice fiscale</label>
          <input value={f.codiceFiscale ?? ''} onChange={(e) => setF({ ...f, codiceFiscale: e.target.value })} />
        </div>
        <div className="campo">
          <label>Partita IVA</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={f.partitaIva ?? ''} onChange={(e) => setF({ ...f, partitaIva: e.target.value })} style={{ flex: 1 }} />
            {onCompilaDaPiva && (
              <button
                type="button"
                className="azione secondaria"
                onClick={onCompilaDaPiva}
                disabled={cercaInCorso || !(f.partitaIva ?? '').trim()}
                title="Compila denominazione e natura giuridica dall'archivio IVA europeo (VIES)"
              >
                {cercaInCorso ? 'Cerco…' : 'Compila dai registri'}
              </button>
            )}
          </div>
        </div>
        <div className="campo">
          <label>Paese di residenza o sede</label>
          <input value={f.paeseResidenza ?? 'IT'} onChange={(e) => setF({ ...f, paeseResidenza: e.target.value })} />
        </div>
        <div className="campo">
          <label>Attività prevalente</label>
          <input value={f.attivitaPrevalente ?? ''} onChange={(e) => setF({ ...f, attivitaPrevalente: e.target.value })} />
        </div>
        <div className="campo">
          <label>Codice ATECO</label>
          <input value={f.ateco ?? ''} onChange={(e) => setF({ ...f, ateco: e.target.value })} />
        </div>
      </div>
      <div className="campo">
        <label>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 8 }}
            checked={Boolean(f.pep)}
            onChange={(e) => setF({ ...f, pep: e.target.checked })}
          />
          Persona politicamente esposta
        </label>
        {f.pep && (
          <>
            <label style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', marginRight: 8 }}
                checked={Boolean(f.pepOrganoPubblico)}
                onChange={(e) => setF({ ...f, pepOrganoPubblico: e.target.checked })}
              />
              Agisce in veste di organo della pubblica amministrazione
            </label>
            <Riquadro tipo="avviso">
              L’art. 24 co. 5 lett. c) impone la verifica rafforzata per le persone politicamente esposte, salvo
              che agiscano come organi della pubblica amministrazione: in quel caso le misure sono commisurate al
              rischio rilevato in concreto e la scelta va motivata nel fascicolo.
            </Riquadro>
          </>
        )}
      </div>
      <div className="campo">
        <label>Note</label>
        <textarea value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
    </>
  );
}

/** Record del database (snake_case) → modulo di modifica (camelCase). */
function daRecord(c: any) {
  return {
    denominazione: c.denominazione ?? '',
    tipo: c.tipo,
    codiceFiscale: c.codice_fiscale ?? '',
    partitaIva: c.partita_iva ?? '',
    paeseResidenza: c.paese_residenza ?? 'IT',
    attivitaPrevalente: c.attivita_prevalente ?? '',
    ateco: c.ateco ?? '',
    note: c.note ?? '',
    pep: Boolean(c.pep),
    pepOrganoPubblico: Boolean(c.pep_organo_pubblico),
    professionistaId: c.professionista_id ?? '',
  };
}

export function DettaglioCliente({ id, ruolo, amministratore, vaiA }: {
  id: string; ruolo: string; amministratore?: boolean; vaiA: (p: string) => void;
}) {
  const [d, setD] = useState<any>(null);
  const [modifica, setModifica] = useState(false);
  const [f, setF] = useState<any>({});
  const [errore, setErrore] = useState('');
  const [confermaElimina, setConfermaElimina] = useState(false);
  const professionisti = useProfessionisti();
  const [inCorso, setInCorso] = useState(false);

  const carica = () =>
    api.get<any>(`/clienti/${id}`)
      .then((r) => { setD(r); setModifica(false); })
      .catch((e) => setErrore((e as Error).message));

  useEffect(() => { setD(null); setErrore(''); carica(); /* eslint-disable-next-line */ }, [id]);

  if (errore && !d) return <Riquadro tipo="critico">{errore}</Riquadro>;
  if (!d) return <div className="caricamento">Caricamento…</div>;

  const c = d.cliente;
  const coll = d.collegamenti ?? { fascicoli: 0, documenti: 0, segnalazioni: 0, verifiche: 0, eliminabile: false };
  const archiviato = !c.attivo;
  const titolare = ruolo === 'TITOLARE';
  // AR-M15: archiviare è del professionista, cancellare dell'amministratore.
  const puoCancellare = amministratore === true;

  async function salva() {
    setErrore('');
    setInCorso(true);
    try {
      await api.patch(`/clienti/${id}`, f);
      await carica();
    } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); }
  }

  async function cambiaArchiviazione(archivia: boolean) {
    setErrore('');
    setInCorso(true);
    try {
      await api.post(`/clienti/${id}/archiviazione`, { archivia });
      await carica();
    } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); }
  }

  return (
    <>
      <button className="azione secondaria" onClick={() => vaiA('clienti')}>← Torna ai clienti</button>

      <h1 style={{ marginTop: 14 }}>
        {c.denominazione} <HelpLink sezione="clienti" />
        {archiviato && <span className="pillola r3" style={{ marginLeft: 10, verticalAlign: 'middle' }}>archiviato</span>}
      </h1>
      <p className="occhiello">
        {etichettaTipo(c.tipo)} · {c.codice_fiscale || c.partita_iva || 'nessun identificativo fiscale'} ·
        {' '}paese {c.paese_residenza}
        {c.pep ? ' · persona politicamente esposta' : ''}
      </p>

      {archiviato && (
        <Riquadro tipo="avviso">
          Cliente archiviato: non compare negli elenchi e non è selezionabile per nuovi fascicoli. Tutto quanto
          registrato resta conservato e consultabile.
        </Riquadro>
      )}

      {/* ── Anagrafica ───────────────────────────────────────── */}
      <div className="scheda" style={{ marginTop: 16 }}>
        <h3>Anagrafica</h3>
        {modifica ? (
          <>
            <CampiCliente f={f} setF={setF} />
            {professionisti.filter((p) => p.attivo).length > 1 && (
              <CampoProfessionista
                elenco={professionisti}
                valore={f.professionistaId}
                onCambia={(v) => setF({ ...f, professionistaId: v })}
                etichetta="Professionista di riferimento"
                aiuto="Chi segue il cliente nello studio associato: compare negli elenchi e nei filtri."
              />
            )}
            <button className="azione" onClick={salva} disabled={inCorso || !f.denominazione?.trim()}>
              {inCorso ? 'Salvataggio…' : 'Salva le modifiche'}
            </button>
            <button className="azione secondaria" style={{ marginLeft: 8 }} onClick={() => { setModifica(false); setErrore(''); }}>
              Annulla
            </button>
          </>
        ) : (
          <>
            <table>
              <tbody>
                <tr><th style={{ width: 260 }}>Denominazione o nominativo</th><td>{c.denominazione}</td></tr>
                <tr><th>Natura giuridica</th><td>{etichettaTipo(c.tipo)}</td></tr>
                <tr><th>Codice fiscale</th><td className="mono">{c.codice_fiscale || '—'}</td></tr>
                <tr><th>Partita IVA</th><td className="mono">{c.partita_iva || '—'}</td></tr>
                <tr><th>Paese di residenza o sede</th><td className="mono">{c.paese_residenza}</td></tr>
                <tr><th>Attività prevalente</th><td>{c.attivita_prevalente || '—'}</td></tr>
                <tr><th>Codice ATECO</th><td className="mono">{c.ateco || '—'}</td></tr>
                <tr>
                  <th>Persona politicamente esposta</th>
                  <td>{c.pep ? (c.pep_organo_pubblico ? 'Sì, come organo della pubblica amministrazione' : 'Sì') : 'No'}</td>
                </tr>
                {professionisti.filter((p) => p.attivo).length > 1 && (
                  <tr><th>Professionista di riferimento</th><td>{c.professionista || '—'}</td></tr>
                )}
                <tr><th>Note</th><td style={{ whiteSpace: 'pre-wrap' }}>{c.note || '—'}</td></tr>
                <tr>
                  <th>Inserito il</th>
                  <td className="mono">
                    {formattaData(c.creato_il)}
                    {c.aggiornato_il && <> · aggiornato il {formattaData(c.aggiornato_il)}</>}
                  </td>
                </tr>
              </tbody>
            </table>
            <button
              className="azione"
              style={{ marginTop: 12 }}
              onClick={() => { setF(daRecord(c)); setModifica(true); }}
            >
              Modifica l’anagrafica
            </button>
          </>
        )}
        {errore && <div className="errore">{errore}</div>}
      </div>

      {/* ── Dati identificativi cifrati ──────────────────────── */}
      {c.dati_identificativi && (
        <div className="scheda">
          <h3>Dati identificativi di dettaglio</h3>
          <div className="aiuto" style={{ marginBottom: 10 }}>
            Conservati cifrati con la chiave dello studio (art. 31 co. 2). Si acquisiscono e si aggiornano dal
            fascicolo, in sede di adeguata verifica.
          </div>
          <table>
            <tbody>
              {Object.entries(c.dati_identificativi as Record<string, unknown>).map(([k, v]) => (
                <tr key={k}>
                  <th style={{ width: 260 }}>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</th>
                  <td>{String(v ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Titolari effettivi ───────────────────────────────── */}
      <div className="scheda">
        <h3>Titolari effettivi vigenti</h3>
        {d.titolariEffettivi.length > 0 ? (
          <table>
            <thead><tr><th>Nominativo</th><th>Criterio</th><th>Quota</th><th>PEP</th><th>Dal</th></tr></thead>
            <tbody>
              {d.titolariEffettivi.map((t: any) => (
                <tr key={t.id}>
                  <td><strong>{t.nominativo}</strong></td>
                  <td>{t.criterio.replace(/_/g, ' ').toLowerCase()} <span className="norma">{t.norma}</span></td>
                  <td className="mono">{t.quota != null ? `${t.quota}%` : '—'}</td>
                  <td>{t.pep ? <span className="pillola r3">PEP</span> : '—'}</td>
                  <td className="mono">{formattaData(t.valido_dal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="caricamento">
            Nessun titolare effettivo registrato. Si registra dal fascicolo, dove la ricostruzione della catena
            partecipativa è collegata alla prestazione (art. 20).
          </p>
        )}
      </div>

      {/* ── Fascicoli ────────────────────────────────────────── */}
      <div className="scheda">
        <h3>Fascicoli del cliente</h3>
        {d.fascicoli.length > 0 ? (
          <table>
            <thead><tr><th>Codice</th><th>Prestazione</th><th>Conferimento</th><th>Stato</th></tr></thead>
            <tbody>
              {d.fascicoli.map((x: any) => (
                <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => vaiA(`fascicolo?id=${x.id}`)}>
                  <td className="mono">{x.codice}</td>
                  <td>{x.prestazione_descrizione}</td>
                  <td className="mono">{formattaData(x.data_conferimento)}</td>
                  <td>{x.stato === 'ASTENSIONE' ? <span className="pillola r4">astensione</span> : x.stato.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="caricamento">Nessun fascicolo aperto per questo cliente.</p>
        )}
        {!archiviato && (
          <button className="azione secondaria" style={{ marginTop: 10 }} onClick={() => vaiA('fascicoli')}>
            Apri un fascicolo
          </button>
        )}
      </div>

      {/* ── Archiviazione e cancellazione ────────────────────── */}
      {titolare && (
        <div className="scheda">
          <h3>Archiviazione e cancellazione</h3>
          {archiviato ? (
            <>
              <p>Il cliente è archiviato. Puoi rimetterlo fra i clienti attivi in qualsiasi momento.</p>
              <button className="azione" onClick={() => cambiaArchiviazione(false)} disabled={inCorso}>
                Ripristina fra i clienti attivi
              </button>
            </>
          ) : (
            <>
              <p>
                L’<strong>archiviazione</strong> toglie il cliente dagli elenchi e dalle scelte per i nuovi fascicoli,
                senza toccare nulla di quanto è stato registrato: è la strada da usare per un cliente che non segui più.
              </p>
              <button className="azione secondaria" onClick={() => cambiaArchiviazione(true)} disabled={inCorso}>
                Archivia il cliente
              </button>
            </>
          )}

          {puoCancellare && <hr style={{ margin: '18px 0', border: 0, borderTop: '1px solid var(--c-bordo, #e5e7eb)' }} />}

          {!puoCancellare ? null : coll.eliminabile ? (
            <>
              <p>
                Al cliente non è collegato nulla: nessun fascicolo, documento, segnalazione o verifica a distanza.
                Può quindi essere <strong>cancellato definitivamente</strong>, per rimediare a un inserimento
                sbagliato o a un import di prova. La cancellazione resta tracciata nel registro delle attività.
              </p>
              <button
                className="azione"
                style={{ background: '#dc2626' }}
                onClick={() => setConfermaElimina(true)}
                disabled={inCorso}
              >
                Elimina definitivamente
              </button>
            </>
          ) : (
            <Riquadro tipo="info">
              Questo cliente <strong>non è cancellabile</strong>: ha {coll.fascicoli} fascicoli, {coll.documenti} documenti,
              {' '}{coll.segnalazioni} segnalazioni e {coll.verifiche} verifiche a distanza. L’art. 31 impone di
              conservare la documentazione dell’adeguata verifica per dieci anni dalla fine della prestazione, quindi
              resta solo l’archiviazione.
            </Riquadro>
          )}
        </div>
      )}

      {confermaElimina && (
        <ConfermaEliminazione
          titolo="il cliente"
          elemento={c.denominazione}
          conseguenze={
            <>
              <div>L’anagrafica sparisce dal programma, insieme agli eventuali titolari effettivi registrati.</div>
              <div>Nel registro delle attività resta traccia della cancellazione, con denominazione e codice fiscale.</div>
            </>
          }
          onConferma={async () => {
            try {
              await api.elimina(`/clienti/${id}`);
              vaiA('clienti');
            } catch (e) { setErrore((e as Error).message); }
          }}
          onClose={() => setConfermaElimina(false)}
        />
      )}

      <PiedeLegale />
    </>
  );
}
