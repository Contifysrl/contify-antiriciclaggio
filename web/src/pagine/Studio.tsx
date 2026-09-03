import { useEffect, useState } from 'react';
import { api, formattaData, type ClasseRischio, type EsitoAutovalutazione, type Ruleset } from '../api';
import { ElencoVincoli, GruppoFattori, PiedeLegale, PillolaRischio, Riquadro, Tessera } from '../componenti';
import { HelpLink } from '../components/ui';
import { BarraAvanzamento, percorsoMancanza } from './Completezza';
import { RegistroFormazione } from './Formazione';

// ===========================================================================
export function Cruscotto({ vaiA }: { vaiA: (p: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [scad, setScad] = useState<any>(null);
  const [portafoglio, setPortafoglio] = useState<any>(null);

  useEffect(() => {
    api.get('/cruscotto').then(setD).catch(() => setD({ errore: true }));
    api.get('/scadenzario').then(setScad).catch(() => {});
    api.get('/studio/indicatori').then(setPortafoglio).catch(() => {});
  }, []);

  if (!d) return <div className="caricamento">Caricamento…</div>;

  const perClasse: Record<string, number> = {};
  for (const r of d.perClasse ?? []) perClasse[r.classe] = r.n;

  return (
    <>
      <h1>Cruscotto <HelpLink sezione="cruscotto" /></h1>
      <p className="occhiello">
        Stato dei presidi antiriciclaggio dello studio. I contatori si riferiscono all’ultima valutazione firmata di
        ciascun fascicolo.
      </p>

      <PerIniziare vaiA={vaiA} />

      {/* AR-M19: «oggi ti mancano N cose, queste sono urgenti, inizia da qui». */}
      {d.completezza && d.completezza.clientiAttivi > 0 && (
        <div className="scheda" data-test="cruscotto-completezza">
          {d.completezza.totaleMancanze === 0 ? (
            <p className="!m-0 font-semibold text-teal-700">Tutti i {d.completezza.clientiAttivi} clienti attivi sono a posto: nessuna cosa da completare.</p>
          ) : (
            <>
              <p className="!m-0 font-semibold text-ink-900">
                Oggi ti mancano <span className="font-mono">{d.completezza.totaleMancanze}</span> cose
                {d.completezza.perGravita.alta > 0 && <>, <span className="text-red-700">{d.completezza.perGravita.alta} urgent{d.completezza.perGravita.alta === 1 ? 'e' : 'i'}</span></>}:
                {' '}{d.completezza.clientiCompleti} clienti su {d.completezza.clientiAttivi} sono già a posto.
              </p>
              <div className="mt-2"><BarraAvanzamento percentuale={d.completezza.avanzamento} /></div>
              {d.completezza.iniziaDa?.length > 0 && (
                <p className="text-sm text-ink-600 mt-2 !mb-0">
                  Inizia da: {d.completezza.iniziaDa.map((x: any, i: number) => (
                    <span key={i}>{i > 0 ? ' · ' : ''}<button className="hover:underline" onClick={() => vaiA(percorsoMancanza(x.clienteId, x.mancanza))}><strong>{x.denominazione}</strong> ({x.mancanza.etichetta.toLowerCase()})</button></span>
                  ))}
                </p>
              )}
              <button className="azione secondaria" style={{ marginTop: 10 }} onClick={() => vaiA('completezza')}>Apri la lista completa</button>
            </>
          )}
        </div>
      )}

      <div className="griglia c4">
        <Tessera etichetta="Clienti" valore={d.clienti} />
        <Tessera etichetta="Fascicoli attivi" valore={d.fascicoli} />
        <Tessera
          etichetta="Valutazioni da firmare"
          valore={d.valutazioniDaFirmare}
          nota={d.valutazioniDaFirmare > 0 ? 'La valutazione non firmata non fa prova' : undefined}
        />
        <Tessera
          etichetta="Violazioni art. 49"
          valore={d.violazioniArt49}
          nota={d.violazioniArt49 > 0 ? 'Comunicazione al MEF ex art. 51' : undefined}
        />
      </div>

      {d.screening && (d.screening.daEsaminare > 0 || d.screening.paesiDaRivalutare > 0) && (
        <Riquadro tipo="avviso">
          <strong>Controlli automatici:</strong>{' '}
          {d.screening.daEsaminare > 0 && <>{d.screening.daEsaminare} corrispondenze con le liste sanzioni da esaminare. </>}
          {d.screening.paesiDaRivalutare > 0 && <>{d.screening.paesiDaRivalutare} clienti in paesi terzi ad alto rischio da rivalutare. </>}
          <button className="azione" style={{ marginTop: 10 }} onClick={() => vaiA('controlli')}>Apri i controlli</button>
        </Riquadro>
      )}
      {d.screening && d.screening.daEsaminare === 0 && d.screening.paesiDaRivalutare === 0 && d.screening.ultimaCorsa && (
        <p className="occhiello" style={{ marginTop: 8 }}>
          Screening sanzioni: nessuna corrispondenza da esaminare (ultimo controllo su {d.screening.ultimaCorsa.soggetti} anagrafiche).
        </p>
      )}

      <h2>Autovalutazione dello studio</h2>
      {d.autovalutazione ? (
        <div className="scheda">
          <p>
            Versione {d.autovalutazione.versione} del {formattaData(d.autovalutazione.data)} — rischio residuo{' '}
            <PillolaRischio classe={d.autovalutazione.classe as ClasseRischio} />{' '}
            {d.autovalutazione.firmata ? '· firmata' : '· non firmata'}
          </p>
          {!d.autovalutazione.firmata && (
            <Riquadro tipo="avviso">
              L’autovalutazione non è firmata. L’art. 15 co. 4 richiede che la valutazione sia documentata e messa a
              disposizione delle autorità e dell’organismo di autoregolamentazione.
            </Riquadro>
          )}
          {/* AR-M15: l'autovalutazione si nutre dei clienti caricati. Quando i
              dati si muovono abbastanza da cambiare un punteggio, lo si dice
              qui — senza toccare la versione firmata, che è immutabile. */}
          {portafoglio?.scostamenti?.length > 0 && (
            <Riquadro tipo="avviso">
              I dati dello studio si sono mossi rispetto alla valutazione firmata:{' '}
              {portafoglio.scostamenti.map((s: any) => s.etichetta.toLowerCase()).join(', ')}. Conviene emettere una
              nuova versione.
              <button className="azione" style={{ marginTop: 10 }} onClick={() => vaiA('autovalutazione')}>
                Vedi i dati e proponi la nuova versione
              </button>
            </Riquadro>
          )}
          {portafoglio?.scadutaPerTempo && (
            <Riquadro tipo="avviso">
              L’ultima autovalutazione firmata ha più di tre anni: l’art. 15 ne vuole l’aggiornamento periodico.
            </Riquadro>
          )}
        </div>
      ) : (
        <Riquadro tipo="critico">
          Nessuna autovalutazione del rischio presente. Gli artt. 15 e 16 impongono ai soggetti obbligati di adottare
          procedure per l’analisi e la valutazione del rischio e di documentarne l’esito.{' '}
          <button className="azione" style={{ marginTop: 10 }} onClick={() => vaiA('autovalutazione')}>
            Compila l’autovalutazione
          </button>
        </Riquadro>
      )}

      <h2>Distribuzione dei fascicoli per classe di rischio</h2>
      <div className="griglia c4">
        {(['NON_SIGNIFICATIVO', 'POCO_SIGNIFICATIVO', 'ABBASTANZA_SIGNIFICATIVO', 'MOLTO_SIGNIFICATIVO'] as ClasseRischio[]).map(
          (c) => (
            <Tessera key={c} etichetta={c.replace(/_/g, ' ').toLowerCase()} valore={perClasse[c] ?? 0} />
          ),
        )}
      </div>

      {scad && (scad.scadute.length > 0 || scad.inScadenza.length > 0) && (
        <>
          <h2>Adempimenti in arretrato o imminenti</h2>
          <Riquadro tipo={scad.scadute.length > 0 ? 'critico' : 'avviso'}>
            {scad.scadute.length} scadute, {scad.inScadenza.length} entro 30 giorni.{' '}
            <button className="azione secondaria" style={{ marginLeft: 8 }} onClick={() => vaiA('scadenzario')}>
              Apri lo scadenzario
            </button>
          </Riquadro>
        </>
      )}

      <PiedeLegale />
    </>
  );
}

// ===========================================================================
// AUTOVALUTAZIONE DELLO STUDIO (AR-M15)
//
// Il collaudo chiedeva che si compilasse da sola man mano che i clienti
// vengono caricati. Il programma calcola quello che il Modello AV.0 rende
// calcolabile — tre fattori su quattro del rischio inerente sono percentuali
// del portafoglio — e propone il resto con la sua evidenza. Conferma e firma
// restano del professionista: il rischio residuo pesa la vulnerabilità al
// 60%, e la vulnerabilità non si deduce dai clienti.
// ===========================================================================

interface Indicatore {
  codice: string;
  etichetta: string;
  percentuale: number | null;
  numeratore: number;
  denominatore: number;
  punteggio: number | null;
  spiegazione: string;
  indicativo?: boolean;
}

interface DatiPortafoglio {
  indicatori: {
    calcolatoIl: string;
    significativo: boolean;
    minimoSignificativo: number;
    clientiAttivi: number;
    fascicoliAttivi: number;
    inerente: Indicatore[];
    vulnerabilita: Indicatore[];
    proposta: { inerente: Record<string, number>; vulnerabilita: Record<string, number> };
  };
  versioneFirmata: { id: string; versione: number; data: string; classe: string } | null;
  scostamenti: Array<{ fattore: string; etichetta: string; punteggioFirmato: number; punteggioAttuale: number; spiegazione: string }>;
  scadutaPerTempo: boolean;
  daAggiornare: boolean;
}

function TabellaIndicatori({ titolo, righe, scelti }: {
  titolo: string;
  righe: Indicatore[];
  scelti: Record<string, number>;
}) {
  return (
    <>
      <h3>{titolo}</h3>
      <table>
        <thead>
          <tr><th>Fattore</th><th>Dato rilevato</th><th style={{ width: 90 }}>Proposto</th><th style={{ width: 90 }}>Scelto</th></tr>
        </thead>
        <tbody>
          {righe.map((i) => {
            const scelto = scelti[i.codice];
            const scostato = i.punteggio !== null && !i.indicativo && scelto !== undefined && scelto !== i.punteggio;
            return (
              <tr key={i.codice}>
                <td><strong>{i.etichetta}</strong></td>
                <td>
                  {i.spiegazione}
                  {i.percentuale !== null && (
                    <div className="mono" style={{ color: 'var(--c-grey)' }}>
                      {i.numeratore} / {i.denominatore} = {i.percentuale}%
                    </div>
                  )}
                </td>
                <td className="mono">{i.punteggio ?? '—'}</td>
                <td className="mono">
                  {scelto ?? '—'}
                  {scostato && <span className="pillola r3" style={{ marginLeft: 6 }}>scostamento</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function Autovalutazione({ amministratore = false }: { amministratore?: boolean }) {
  const [rs, setRs] = useState<Ruleset | null>(null);
  const [storico, setStorico] = useState<any[]>([]);
  const [inerente, setInerente] = useState<Record<string, number>>({});
  const [vuln, setVuln] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [esito, setEsito] = useState<EsitoAutovalutazione | null>(null);
  const [errore, setErrore] = useState('');
  const [dati, setDati] = useState<DatiPortafoglio | null>(null);
  const [motivazioni, setMotivazioni] = useState<Record<string, string>>({});

  const caricaDati = () => api.get<DatiPortafoglio>('/studio/indicatori').then(setDati).catch(() => setDati(null));

  useEffect(() => {
    api.get<Ruleset>('/catalogo/ruleset').then(setRs);
    api.get<any[]>('/studio/autovalutazioni').then(setStorico);
    caricaDati();
  }, []);

  if (!rs) return <div className="caricamento">Caricamento…</div>;

  const completo =
    rs.autovalutazione.fattoriInerente.every((f) => inerente[f.codice]) &&
    rs.autovalutazione.fattoriVulnerabilita.every((f) => vuln[f.codice]);

  const tutti = [...(dati?.indicatori.inerente ?? []), ...(dati?.indicatori.vulnerabilita ?? [])];
  const scelti = { ...inerente, ...vuln };
  // Lo scostamento si motiva solo quando il dato ha un fondamento: archivio
  // significativo e denominatore reale. Le stesse condizioni del server.
  const daMotivare = (dati?.indicatori.significativo ? tutti : []).filter(
    (i) => i.punteggio !== null && !i.indicativo && i.denominatore > 0 &&
      scelti[i.codice] !== undefined && scelti[i.codice] !== i.punteggio,
  );

  function applicaProposta() {
    if (!dati) return;
    setInerente((s) => ({ ...s, ...dati.indicatori.proposta.inerente }));
    setVuln((s) => ({ ...s, ...dati.indicatori.proposta.vulnerabilita }));
  }

  async function salva() {
    setErrore('');
    try {
      const r = await api.post<{ esito: EsitoAutovalutazione; versione: number }>('/studio/autovalutazioni', {
        inerente,
        vulnerabilita: vuln,
        note,
        motivazioniScostamento: motivazioni,
      });
      setEsito(r.esito);
      setStorico(await api.get<any[]>('/studio/autovalutazioni'));
      await caricaDati();
    } catch (e) {
      setErrore((e as Error).message);
    }
  }

  return (
    <>
      <h1>Autovalutazione del rischio dello studio <HelpLink sezione="autovalutazione" /></h1>
      <p className="occhiello">
        Artt. 15 e 16 del DLgs. 231/2007, attuati dalla Regola tecnica n. 1 del CNDCEC. Il rischio residuo è la media
        dei quattro fattori di rischio inerente ponderata al {rs.autovalutazione.pesi.inerente * 100}%, sommata alla
        media dei quattro fattori di vulnerabilità ponderata al {rs.autovalutazione.pesi.vulnerabilita * 100}%. La
        vulnerabilità pesa di più perché è la sola variabile su cui lo studio può intervenire.
      </p>

      {dati && (
        <div className="scheda">
          <h2 style={{ marginTop: 0 }}>Dati dello studio</h2>
          <p className="occhiello">
            Rilevazione del {formattaData(dati.indicatori.calcolatoIl)} su {dati.indicatori.fascicoliAttivi} prestazioni
            in corso e {dati.indicatori.clientiAttivi} clienti attivi. Il Modello AV.0 (Informativa CNDCEC 57/2026)
            àncora tre dei quattro fattori del rischio inerente a percentuali del portafoglio: sono queste. La
            vulnerabilità non si deduce dai clienti — quella che segue è la fotografia dei presidi che il programma
            conosce di sé, non un giudizio.
          </p>

          {!dati.indicatori.significativo && (
            <Riquadro tipo="info">
              L’archivio contiene meno di {dati.indicatori.minimoSignificativo} prestazioni: le percentuali sono
              riportate come dato di fatto, ma non fondano una proposta di punteggio. Una manciata di clienti non
              basta a qualificare il rischio dello studio.
            </Riquadro>
          )}

          {dati.versioneFirmata && dati.scostamenti.length > 0 && (
            <Riquadro tipo="avviso">
              <strong>I dati si sono mossi rispetto alla versione firmata n. {dati.versioneFirmata.versione}</strong> del{' '}
              {formattaData(dati.versioneFirmata.data)}:
              <ul style={{ margin: '8px 0 0 18px' }}>
                {dati.scostamenti.map((s) => (
                  <li key={s.fattore}>
                    {s.etichetta}: da {s.punteggioFirmato} a {s.punteggioAttuale} — {s.spiegazione}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 8 }}>
                La versione firmata non si modifica (art. 32 co. 2 lett. c): se ne emette una nuova.
              </div>
              <button className="azione" style={{ marginTop: 10 }} onClick={applicaProposta}>
                Prepara una nuova versione con i punteggi calcolati
              </button>
            </Riquadro>
          )}
          {dati.scadutaPerTempo && (
            <Riquadro tipo="avviso">
              L’ultima autovalutazione firmata ha più di tre anni: l’art. 15 ne vuole l’aggiornamento periodico.
            </Riquadro>
          )}

          <TabellaIndicatori titolo="Rischio inerente" righe={dati.indicatori.inerente} scelti={inerente} />
          <TabellaIndicatori titolo="Vulnerabilità dei presidi" righe={dati.indicatori.vulnerabilita} scelti={vuln} />

          {/* Anche in uno studio ai primi clienti la vulnerabilità ha proposte
              utili (formazione, conservazione): il pulsante si spegne solo se
              non c'è proprio nulla da proporre. */}
          <button
            className="azione"
            onClick={applicaProposta}
            disabled={
              Object.keys(dati.indicatori.proposta.inerente).length +
                Object.keys(dati.indicatori.proposta.vulnerabilita).length === 0
            }
          >
            Compila con i punteggi calcolati
          </button>
          <div className="aiuto" style={{ marginTop: 8 }}>
            I punteggi restano modificabili uno per uno qui sotto. Dove ti discosti dal calcolo, il programma ti
            chiede il perché: è la stessa cosa che chiede la Regola tecnica, che ammette «un’altra valutazione
            motivata».
          </div>
        </div>
      )}

      <GruppoFattori
        titolo="Rischio inerente"
        fattori={rs.autovalutazione.fattoriInerente}
        valori={inerente}
        ruleset={rs}
        onChange={(c, v) => setInerente((s) => ({ ...s, [c]: v }))}
      />
      <GruppoFattori
        titolo="Vulnerabilità — 1 significa presidi completi, 4 presidi insufficienti"
        fattori={rs.autovalutazione.fattoriVulnerabilita}
        valori={vuln}
        ruleset={rs}
        onChange={(c, v) => setVuln((s) => ({ ...s, [c]: v }))}
      />

      {daMotivare.length > 0 && (
        <div className="scheda">
          <h3>Motivazione degli scostamenti</h3>
          <div className="aiuto">
            Il punteggio scelto si discosta da quello calcolato sui dati dello studio. La motivazione finisce nel
            verbale accanto al numero: è ciò che rende difendibile la scelta in sede di controllo.
          </div>
          {daMotivare.map((i) => (
            <div className="campo" key={i.codice}>
              <label>
                {i.etichetta} — calcolato {i.punteggio}, scelto {scelti[i.codice]}
              </label>
              <div className="aiuto">{i.spiegazione}</div>
              <input
                value={motivazioni[i.codice] ?? ''}
                onChange={(e) => setMotivazioni((s) => ({ ...s, [i.codice]: e.target.value }))}
                placeholder="Perché il punteggio adottato è diverso da quello calcolato"
              />
            </div>
          ))}
        </div>
      )}

      <div className="scheda">
        <div className="campo">
          <label>Presidi adottati e note (art. 16)</label>
          <div className="aiuto">
            Misure di mitigazione, procedure interne, programmi di formazione, eventuale funzione antiriciclaggio.
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button
          className="azione"
          disabled={!completo || daMotivare.some((i) => (motivazioni[i.codice] ?? '').trim().length < 3)}
          onClick={salva}
        >
          Calcola e registra la valutazione
        </button>
        {!completo && <div className="aiuto" style={{ marginTop: 8 }}>Valorizza tutti e otto i fattori.</div>}
        {errore && <div className="errore">{errore}</div>}
      </div>

      {esito && (
        <div className="scheda">
          <h3>Esito</h3>
          <div className="griglia c3">
            <Tessera etichetta="Rischio inerente" valore={esito.rischioInerente.toFixed(2)} />
            <Tessera etichetta="Vulnerabilità" valore={esito.vulnerabilita.toFixed(2)} />
            <Tessera etichetta="Rischio residuo" valore={esito.rischioResiduo.toFixed(2)} />
          </div>
          <p style={{ marginTop: 14 }}>
            Classe: <PillolaRischio classe={esito.classe} testo={esito.etichettaClasse} />
          </p>
          <p className="mono" style={{ color: 'var(--c-grey)' }}>{esito.formula}</p>
          <Riquadro tipo="info">
            La valutazione va firmata da un professionista per essere opponibile. Una volta firmata non è più
            modificabile: eventuali correzioni si fanno emettendo una nuova versione, come richiede l’art. 32 co. 2
            lett. c) e d).
          </Riquadro>
        </div>
      )}

      <RegistroFormazione amministratore={amministratore} onCambiato={caricaDati} />

      {storico.length > 0 && (
        <>
          <h2>Storico</h2>
          <div className="scheda">
            <table>
              <thead>
                <tr><th>Versione</th><th>Data</th><th>Residuo</th><th>Classe</th><th>Firmata</th><th /></tr>
              </thead>
              <tbody>
                {storico.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.versione}</td>
                    <td>{formattaData(a.data_valutazione)}</td>
                    <td className="mono">{a.rischio_residuo.toFixed(2)}</td>
                    <td><PillolaRischio classe={a.classe} /></td>
                    <td>{a.firmata_il ? formattaData(a.firmata_il) : '—'}</td>
                    <td>
                      {!a.firmata_il && (
                        <button
                          className="azione secondaria"
                          onClick={async () => {
                            await api.post(`/studio/autovalutazioni/${a.id}/firma`);
                            setStorico(await api.get<any[]>('/studio/autovalutazioni'));
                            await caricaDati();
                          }}
                        >
                          Firma
                        </button>
                      )}
                      <button
                        className="azione secondaria"
                        style={{ marginLeft: 6 }}
                        title="Scarica il verbale di autovalutazione in formato Word"
                        onClick={() => api.scarica(`/studio/autovalutazioni/${a.id}/verbale`)}
                      >
                        Verbale .docx
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <PiedeLegale />
    </>
  );
}

// ===========================================================================
export function Registro() {
  const [voci, setVoci] = useState<any[]>([]);
  const [verifica, setVerifica] = useState<any>(null);

  useEffect(() => {
    api.get<any[]>('/audit').then(setVoci);
    api.get('/audit/verifica').then(setVerifica);
  }, []);

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1>Attività <HelpLink sezione="registro" /></h1>
        <button
          className="btn btn-secondary btn-sm shrink-0 mt-1"
          title="Scarica l'intero registro in CSV (con le impronte della catena), pronto per Excel"
          onClick={() => api.scarica('/audit/export')}
        >
          Esporta CSV
        </button>
      </div>
      <p className="occhiello">
        Il registro degli accessi e delle operazioni. L’art. 32 co. 2 impone di indicare i soggetti legittimati
        ad alimentare il sistema di conservazione e ad accedervi, e di garantire integrità e non alterabilità dei
        dati. Ogni voce contiene l’impronta della precedente: alterare o rimuovere una riga rompe la catena, e la
        verifica lo rileva.
      </p>

      {verifica && (
        <Riquadro tipo={verifica.integra ? 'info' : 'critico'}>
          <strong>{verifica.integra ? 'Catena integra' : 'Catena compromessa'}</strong> — {verifica.messaggio}
        </Riquadro>
      )}

      <div className="scheda">
        <table>
          <thead><tr><th>Quando</th><th>Utente</th><th>Azione</th><th>Entità</th><th>Dettaglio</th></tr></thead>
          <tbody>
            {voci.map((v) => (
              <tr key={v.id}>
                <td className="mono">{new Date(v.creato_il).toLocaleString('it-IT')}</td>
                <td>{v.utente ?? '—'}</td>
                <td>{v.azione}</td>
                <td className="mono">{v.entita ?? '—'}</td>
                <td className="mono" style={{ color: 'var(--c-grey)' }}>{v.dettaglio ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {voci.length === 0 && <p className="caricamento">Nessuna voce registrata.</p>}
      </div>
      <PiedeLegale />
    </>
  );
}

// ── Percorso «Per iniziare» (AR-M10) ───────────────────────────
// La checklist si spunta da sola sui dati reali dello studio: è la
// guida passo passo operativa. Sparisce quando i passi obbligatori
// sono completi; si può nascondere e riprendere quando si vuole.

function PerIniziare({ vaiA }: { vaiA: (p: string) => void }) {
  const [dati, setDati] = useState<any>(null);
  const [nascosto, setNascosto] = useState(() => localStorage.getItem('ar-primi-passi-nascosto') === '1');

  useEffect(() => { api.get('/primi-passi').then(setDati).catch(() => setDati(null)); }, []);

  if (!dati || dati.completatoIlPercorso) return null;

  if (nascosto) {
    return (
      <p className="occhiello" style={{ marginTop: 4 }}>
        Percorso «Per iniziare»: {dati.completati} passi su {dati.passi.length} completati.{' '}
        <a
          href="#cruscotto"
          onClick={(e) => { e.preventDefault(); localStorage.removeItem('ar-primi-passi-nascosto'); setNascosto(false); }}
          className="text-teal-700 font-semibold"
        >
          Riprendi il percorso
        </a>
      </p>
    );
  }

  return (
    <div className="scheda" style={{ borderLeft: '3px solid var(--teal-600, #048587)' }}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="!m-0">Per iniziare — {dati.completati} di {dati.passi.length} passi</h3>
        <button
          className="btn btn-ghost btn-sm"
          title="Nascondi (potrai riprendere dal cruscotto)"
          onClick={() => { localStorage.setItem('ar-primi-passi-nascosto', '1'); setNascosto(true); }}
        >
          Nascondi
        </button>
      </div>
      <div className="aiuto">
        Il percorso si spunta da solo man mano che lo studio prende forma: nessuna casella da ricordare.
      </div>
      <div className="space-y-1 mt-2">
        {dati.passi.map((s: any) => (
          <button
            key={s.id}
            type="button"
            onClick={() => vaiA(s.pagina)}
            className={`w-full text-left flex items-start gap-3 px-3 py-2 rounded-lg transition-colors ${
              s.fatto ? 'opacity-60' : 'hover:bg-ink-50'
            }`}
          >
            <span
              className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${
                s.fatto ? 'bg-teal-600 text-accento-on' : 'border-2 border-ink-200 text-transparent'
              }`}
            >
              ✓
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${s.fatto ? 'line-through text-ink-500' : 'text-ink-800'}`}>
                {s.titolo}{s.facoltativo && <span className="font-normal text-ink-400"> · facoltativo</span>}
              </span>
              <span className="block text-xs text-ink-400">{s.spiega}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
