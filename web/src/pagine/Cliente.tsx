import { useEffect, useState } from 'react';
import { api, formattaData } from '../api';
import { PiedeLegale, Riquadro } from '../componenti';
import { ConfermaEliminazione, HelpLink } from '../components/ui';
import { CampoProfessionista, useProfessionisti } from '../lib/professionisti';
import { ETICHETTA_CARICA, PropostaTitolaritaBox, TabellaCariche, VisuraModal, type PropostaDto } from './Visura';
import { RivalutazioneBox } from './ControlloCostante';
import { RegistroTeBox } from './RegistroTe';
import { Badge } from '../components/ui';

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
  // AR-M17: compagine, proposta di titolarità, documenti, «Aggiorna da visura».
  const [compagine, setCompagine] = useState<(PropostaDto & { proposte: any[] }) | null>(null);
  const [aggiornaVisura, setAggiornaVisura] = useState(false);
  const [caricaDoc, setCaricaDoc] = useState(false);
  const [tipoDoc, setTipoDoc] = useState('VISURA');

  const carica = () =>
    api.get<any>(`/clienti/${id}`)
      .then((r) => { setD(r); setModifica(false); })
      .catch((e) => setErrore((e as Error).message));
  const caricaCompagine = () => api.get<any>(`/clienti/${id}/compagine`).then(setCompagine).catch(() => setCompagine(null));

  useEffect(() => { setD(null); setErrore(''); setCompagine(null); carica(); caricaCompagine(); /* eslint-disable-next-line */ }, [id]);

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
            {!archiviato && (
              <button className="azione secondaria" style={{ marginTop: 12, marginLeft: 8 }} onClick={() => setAggiornaVisura(true)} title="Carica una visura camerale più recente e applica solo le differenze che scegli">
                Aggiorna da visura
              </button>
            )}
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
        {d.titolariEffettivi.length > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <h4 className="!mt-0">Registro dei titolari effettivi</h4>
            <RegistroTeBox clienteId={id} titolari={d.titolariEffettivi.length} documenti={d.documenti ?? []} onCambiato={() => { carica(); caricaCompagine(); }} compatto />
          </div>
        )}
      </div>

      {/* ── Compagine e proposta (AR-M17) ────────────────────── */}
      <div className="scheda">
        <h3>Compagine e cariche dalla visura</h3>
        {compagine && compagine.soci.length + compagine.cariche.length > 0 ? (
          <>
            <div className="aiuto">
              Dati camerali al {d.compagine?.fonteData ? formattaData(d.compagine.fonteData) : '—'}, conservati cifrati come serie temporale. Al rinnovo della visura vedrai le differenze.
            </div>
            {compagine.soci.length > 0 && (
              <table>
                <thead><tr><th>Socio</th><th>Tipo</th><th>Quota</th><th>Diritto</th><th>Paese</th><th>Cliente dello studio</th></tr></thead>
                <tbody>
                  {compagine.soci.map((s: any) => (
                    <tr key={s.id} style={{ opacity: s.quoteProprie ? 0.6 : 1 }}>
                      <td><strong>{s.nome}</strong>{s.codiceFiscale && <div className="mono text-xs text-ink-400">{s.codiceFiscale}</div>}{s.quoteProprie && <Badge tone="gray">quote proprie</Badge>}</td>
                      <td>{String(s.tipo).replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="mono">{s.quotaPercento != null ? `${s.quotaPercento}%` : '—'}</td>
                      <td>{String(s.diritto ?? 'PROPRIETA').replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="mono">{s.paese ?? '—'}</td>
                      <td>{s.socioClienteId ? <a href={`#cliente?id=${s.socioClienteId}`} onClick={(e) => { e.preventDefault(); vaiA(`cliente?id=${s.socioClienteId}`); }}>apri la scheda</a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {compagine.cariche.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <TabellaCariche cariche={compagine.cariche.map((c: any) => ({ ...c, carica: c.carica, caricaTesto: c.caricaTesto ?? ETICHETTA_CARICA[c.carica] }))} />
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" data-test="cliente-art22" onClick={() => api.scarica(`/clienti/${id}/dichiarazione-art22`).catch((e) => setErrore(e.message))}>
                Dichiarazione art. 22 precompilata (.docx)
              </button>
              <span className="text-xs text-ink-400" style={{ marginLeft: 8 }}>Da far firmare al cliente in presenza; a distanza si invia dal fascicolo (AR-M18).</span>
            </div>
            <RivalutazioneBox proposte={compagine.proposte ?? []} vaiA={vaiA} onCambiato={() => { carica(); caricaCompagine(); }} />
            <h4 style={{ marginTop: 18 }}>Titolari effettivi proposti dai dati camerali</h4>
            <div className="aiuto">La visura non è il registro dei titolari effettivi (art. 21-ter): questa è l'applicazione dell'art. 20 co. 2 ai soci. Confermi, correggi o scarti; il registro si consulta dal fascicolo.</div>
            <PropostaTitolaritaBox
              clienteId={id}
              proposta={{ ...compagine, id: compagine.proposte?.find((p: any) => p.ambito === 'TITOLARITA' && p.stato === 'PROPOSTA')?.id ?? null }}
              vaiA={vaiA}
              onRegistrata={() => { carica(); caricaCompagine(); }}
              onRinnovaVisura={archiviato ? undefined : () => setAggiornaVisura(true)}
            />
            {compagine.proposte?.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary className="text-sm text-ink-500 cursor-pointer">Storico delle proposte del programma ({compagine.proposte.length})</summary>
                <table style={{ marginTop: 8 }}>
                  <thead><tr><th>Data</th><th>Ambito</th><th>Alert</th><th>Stato</th><th>Rivista da</th></tr></thead>
                  <tbody>
                    {compagine.proposte.map((p: any) => (
                      <tr key={p.id}>
                        <td className="mono">{formattaData(p.creatoIl)}</td>
                        <td>{p.ambito.toLowerCase()} · {p.origine.toLowerCase()}</td>
                        <td>{p.alert.length ? p.alert.map((a: any) => a.codice).join(', ') : '—'}</td>
                        <td>{p.stato.toLowerCase()}{p.esito?.motivazione ? <div className="text-xs text-ink-400">{p.esito.motivazione}</div> : null}</td>
                        <td>{p.rivistaDa ?? '—'}{p.rivistaIl ? <div className="mono text-xs text-ink-400">{formattaData(p.rivistaIl)}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </>
        ) : (
          <p className="caricamento">
            Nessuna compagine registrata. Con «Aggiorna da visura» carichi il PDF della visura camerale: soci, cariche e titolari effettivi proposti arrivano da lì.
          </p>
        )}
      </div>

      {/* ── Documenti del cliente (AR-M17) ───────────────────── */}
      <div className="scheda">
        <h3>Documenti del cliente</h3>
        <div className="aiuto">Visure e documenti legati al cliente, non a un singolo fascicolo. Impronta SHA-256 e conservazione decennale (art. 31).</div>
        {d.documenti?.length ? (
          <table>
            <thead><tr><th>Tipo</th><th>File</th><th>Data documento</th><th>Acquisito il</th><th>Impronta</th></tr></thead>
            <tbody>
              {d.documenti.map((x: any) => (
                <tr key={x.id}>
                  <td>{String(x.tipo).replace(/_/g, ' ').toLowerCase()}</td>
                  <td><a href={`/api/documenti/${x.id}`} target="_blank" rel="noreferrer">{x.nome_file}</a> <span className="text-xs text-ink-400">({Math.round(x.dimensione / 1024)} KB)</span></td>
                  <td className="mono">{formattaData(x.data_riferimento)}</td>
                  <td className="mono">{formattaData(x.data_acquisizione)}</td>
                  <td className="mono text-xs text-ink-400">{String(x.sha256).slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="caricamento">Nessun documento agganciato al cliente.</p>
        )}
        {!archiviato && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="btn btn-secondary btn-sm cursor-pointer" style={{ margin: 0 }}>
              {caricaDoc ? 'Caricamento…' : 'Allega un documento…'}
              <input type="file" className="hidden" disabled={caricaDoc} onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setCaricaDoc(true); setErrore('');
                try {
                  const form = new FormData();
                  form.append('file', file, file.name);
                  form.append('tipo', tipoDoc);
                  const r = await fetch(`/api/clienti/${id}/documenti`, { method: 'POST', body: form, credentials: 'same-origin' });
                  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.errore ?? `Errore ${r.status}`);
                  await carica();
                } catch (err) { setErrore((err as Error).message); } finally { setCaricaDoc(false); }
              }} />
            </label>
            <select className="input" style={{ width: 'auto' }} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} title="Tipo di documento: alimenta la checklist del fascicolo">
              <option value="VISURA">Visura camerale</option>
              <option value="DICHIARAZIONE_ART22">Dichiarazione art. 22 firmata</option>
              <option value="ESTRATTO_REGISTRO_TE">Estratto del registro TE (prova dell’iscrizione)</option>
              <option value="DOCUMENTO_IDENTITA">Documento d’identità</option>
              <option value="DOCUMENTAZIONE_ESTERA">Documentazione estera equivalente</option>
              <option value="MANDATO_FIDUCIARIO">Mandato fiduciario</option>
              <option value="ATTO_TRUST">Atto istitutivo del trust</option>
              <option value="PROCURA">Procura</option>
              <option value="INCARICO">Lettera d’incarico</option>
              <option value="ALTRO">Altro</option>
            </select>
            <span className="text-xs text-ink-400">Per leggere una visura e proporre i titolari effettivi usa «Aggiorna da visura» qui sopra.</span>
          </div>
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

      {aggiornaVisura && (
        <VisuraModal
          modo="aggiorna"
          cliente={c}
          onChiudi={() => setAggiornaVisura(false)}
          onFatto={() => { setAggiornaVisura(false); carica(); caricaCompagine(); }}
          vaiA={vaiA}
        />
      )}

      <PiedeLegale />
    </>
  );
}
