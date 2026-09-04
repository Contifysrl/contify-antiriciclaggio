/**
 * IL FASCICOLO PROPOSTO (AR-M18, visione §2)
 *
 * Dai dati camerali già in archivio (anagrafica, compagine, cariche, esito del
 * motore art. 20 e alert A1-A8) il programma PROPONE ciò che è deducibile del
 * fascicolo di adeguata verifica:
 *
 *   - Tabella A: A.1 natura giuridica, A.2 attività prevalente, A.4 area
 *     geografica — con punteggio, motivazione e fonte. A.3 (comportamento) è
 *     sempre «chiesto»: la visura non può saperlo;
 *   - l'esecutore (art. 1 co. 2 lett. p): la persona fisica che, dalle cariche,
 *     di regola conferisce l'incarico in nome del cliente;
 *   - la checklist dei documenti da raccogliere, dedotta dalla struttura
 *     (n. titolari effettivi, soci esteri, persone giuridiche in catena,
 *     fiduciarie), con lo stato di ciò che è già conservato;
 *   - le circostanze di legge da suggerire (PEP, Paesi terzi ad alto rischio,
 *     contante, assetto complesso);
 *   - gli alert A9 (liquidazione/procedura) e A10 (indicatori da Tabella A).
 *
 * Tre livelli, come nella visione: ESTRATTO (si copia), PROPOSTO (deduzione
 * con regola esplicita, si conferma), CHIESTO (il programma sa CHE manca e lo
 * chiede alla persona giusta). Nessuna riga è «deciso»: ogni punteggio resta
 * una proposta finché il professionista non consolida la valutazione, e lo
 * scostamento va motivato.
 *
 * Il modulo è puro: riceve fatti, restituisce proposte testabili su fixture.
 */

import type { Punteggio } from './types';
import type { Alert, SocioCompagine } from './alert-titolarita';
import type { CodiceCarica, RisultatoAnalisiTitolarita } from './titolare-effettivo';
import { CARICHE_CON_POTERI, etichettaCarica } from './titolare-effettivo';
import { voceSettorePerCodice, settoreEsposto, settoriRichiamati, type VoceSettore } from './settori-esposti';
import { provincia as infoProvincia, siglaProvinciaDaTesto, type TabellaProvinceContante } from './province';
import type { EsitoPaeseAltoRischio } from './norme';

// ---------------------------------------------------------------- ingresso

export interface DettagliCliente {
  sede?: string | null;
  provincia?: string | null;
  formaGiuridica?: string | null;
  capitaleSociale?: number | null;
  capitaleVersato?: number | null;
  dataCostituzione?: string | null;
  statoAttivita?: string | null;
  inLiquidazione?: boolean | null;
  proceduraConcorsuale?: string | null;
  oggettoSociale?: string | null;
  visuraDel?: string | null;
  /**
   * AR-M21 (AI-03): classificazione dell'oggetto sociale chiesta dal
   * professionista all'AI quando né ATECO né parole chiave riconoscono un
   * settore. È una PROPOSTA con provenienza AI: il codice si riscontra sul
   * catalogo; NESSUNO = l'AI non ha riconosciuto settori esposti.
   */
  settoreAi?: { codice: string; motivo: string; data: string; da?: string | null } | null;
}

export interface CaricaProposta {
  id: string;
  nome: string;
  codiceFiscale?: string | null;
  carica: CodiceCarica;
  caricaTesto?: string | null;
  rappresentanzaLegale?: boolean;
  dataNomina?: string | null;
  poteri?: string | null;
}

export interface DocumentoConservato {
  tipo: string;
  dataRiferimento?: string | null;
  /** Vero se il documento è agganciato al fascicolo in esame (o al cliente). */
  fascicoloId?: string | null;
}

export interface InputFascicoloProposto {
  /** Data della proposta (ISO). */
  data: string;
  cliente: {
    id: string;
    denominazione: string;
    tipo: string;
    ateco?: string | null;
    attivitaPrevalente?: string | null;
    paeseResidenza?: string | null;
    pep?: boolean;
    dettagli?: DettagliCliente | null;
  };
  soci: SocioCompagine[];
  cariche: CaricaProposta[];
  analisi: RisultatoAnalisiTitolarita | null;
  /** Alert A1-A8 della proposta di titolarità viva. */
  alertTitolarita: Alert[];
  /** Clienti dello studio innestati nel grafo (catena risolta da sola). */
  catena: Array<{ clienteId: string; denominazione: string; visuraDel: string | null }>;
  /** Titolari effettivi già REGISTRATI (vigenti). */
  titolariRegistrati: Array<{ nominativo: string; codiceFiscale?: string | null; pep?: boolean }>;
  documenti: DocumentoConservato[];
  provinceContante: TabellaProvinceContante | null;
  paeseAltoRischio: (paese: string | null | undefined) => EsitoPaeseAltoRischio;
  /** Esecutore già registrato sul fascicolo, se c'è. */
  esecutoreRegistrato?: { nominativo?: string; codiceFiscale?: string } | null;
}

// ------------------------------------------------------------------ uscita

export type StatoProposta = 'PROPOSTO' | 'CHIESTO';

export interface FattoreProposto {
  codice: string;
  etichetta: string;
  punteggio: Punteggio | null;
  stato: StatoProposta;
  motivazione: string;
  fonte: string;
  /** Vero quando la proposta dipende da un dato che lo studio deve ancora compilare o verificare. */
  daVerificare?: boolean;
  /** AR-M21 (AI-03): il punteggio viene da una classificazione dell'AI, da confermare. */
  provenienzaAi?: { settore: string; motivo: string; data: string } | null;
  /** AR-M21 (AI-03): il professionista può chiedere all'AI di classificare l'oggetto sociale. */
  richiedibileAi?: boolean;
}

export interface EsecutoreProposto {
  nominativo: string;
  codiceFiscale: string | null;
  carica: CodiceCarica;
  caricaTesto: string;
  rappresentanzaLegale: boolean;
  dataNomina: string | null;
  fonte: string;
  motivazione: string;
  /** Altre cariche con poteri, se il conferimento arrivasse da loro. */
  alternative: Array<{ nominativo: string; codiceFiscale: string | null; carica: CodiceCarica; caricaTesto: string }>;
}

export interface VoceChecklist {
  codice: string;
  etichetta: string;
  perche: string;
  norma: string;
  /** Tipo con cui il documento viene conservato in `documenti.tipo`. */
  tipoDocumento: string;
  /** Soggetto cui si riferisce (titolare effettivo, socio estero…), se pertinente. */
  soggetto?: string;
  obbligatoria: boolean;
  /** Vero se in archivio c'è già un documento del tipo atteso; null se non è determinabile per soggetto. */
  presente: boolean | null;
}

export type CodiceAlertFascicolo = 'A9' | 'A10';

export interface AlertFascicolo {
  codice: CodiceAlertFascicolo;
  gravita: 'alta' | 'media' | 'bassa';
  titolo: string;
  messaggio: string;
  norma: string;
  /** Fattore della Tabella A cui l'indicatore si riferisce. */
  fattore?: 'natura_giuridica' | 'prevalente_attivita' | 'comportamento' | 'area_geografica_cliente';
}

export interface CircostanzaSuggerita {
  chiave: 'pep' | 'paeseTerzoAltoRischio' | 'entitaPaeseAltoRischio' | 'elevatoUsoContante' | 'assettoProprietarioComplesso';
  motivo: string;
}

export interface FascicoloProposto {
  tabellaA: Record<string, FattoreProposto>;
  circostanze: CircostanzaSuggerita[];
  esecutore: EsecutoreProposto | null;
  checklist: VoceChecklist[];
  alert: AlertFascicolo[];
  /** Da dove vengono i fatti: finisce nella motivazione della valutazione e nel verbale. */
  provenienza: string;
  /** Riepilogo leggibile per la motivazione della valutazione. */
  motivazioneValutazione: string;
}

// ------------------------------------------------------------------ utilità

const dataIt = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : null);
const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (q: number) => `${(Math.round(q * 10000) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

function mesiTra(daIso: string, aIso: string): number {
  const a = new Date(`${daIso}T00:00:00Z`);
  const b = new Date(`${aIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.POSITIVE_INFINITY;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

const ETICHETTE_A: Record<string, string> = {
  natura_giuridica: 'A.1 Natura giuridica',
  prevalente_attivita: 'A.2 Prevalente attività svolta',
  comportamento: 'A.3 Comportamento al conferimento dell’incarico',
  area_geografica_cliente: 'A.4 Area geografica di residenza',
};

const FONTE_CNDCEC = 'Modello AV.1, Tabella II sez. A (Informativa CNDCEC n. 57/2026)';

// ------------------------------------------------------------- il motore

export function proponiFascicolo(input: InputFascicoloProposto): FascicoloProposto {
  const { cliente, soci, cariche, analisi, alertTitolarita } = input;
  const d = cliente.dettagli ?? {};
  const personaFisica = cliente.tipo === 'PERSONA_FISICA';
  const codici = new Set(alertTitolarita.map((a) => a.codice));
  const sociReali = soci.filter((s) => !s.quoteProprie);
  const provenienza = d.visuraDel
    ? `dati camerali della visura estratta il ${dataIt(d.visuraDel)}`
    : sociReali.length || cariche.length
      ? 'dati camerali in archivio'
      : 'anagrafica del cliente (nessuna visura in archivio)';
  const provenienzaCompleta = d.settoreAi && d.settoreAi.codice !== 'NESSUNO'
    ? `${provenienza}; settore A.2 proposto dall’AI sull’oggetto sociale il ${dataIt(d.settoreAi.data)}, da confermare`
    : provenienza;

  const circostanze: CircostanzaSuggerita[] = [];
  const alert: AlertFascicolo[] = [];
  const paeseSede = (cliente.paeseResidenza ?? 'IT').toUpperCase();
  const esitoPaeseSede = input.paeseAltoRischio(paeseSede);
  const inLiquidazione = Boolean(d.inLiquidazione) || /liquidazion/i.test(d.statoAttivita ?? '') || Boolean(d.proceduraConcorsuale);

  // ── A.1 natura giuridica ──────────────────────────────────────────────
  const a1 = ((): FattoreProposto => {
    const motivi: string[] = [];
    const stato = { punteggio: null as Punteggio | null };
    const alza = (p: Punteggio, perche: string) => {
      motivi.push(perche);
      if (stato.punteggio === null || p > stato.punteggio) stato.punteggio = p;
    };
    if (personaFisica) {
      alza(1, 'persona fisica: nessuna articolazione societaria da attraversare per individuare il titolare effettivo');
    } else if (cliente.tipo === 'TRUST') {
      alza(4, 'il cliente è un trust: istituto espressamente indicato fra quelli che rendono più difficoltosa l’identificazione del titolare effettivo (art. 22 co. 5)');
    } else if (!sociReali.length && !cariche.length) {
      return {
        codice: 'natura_giuridica', etichetta: ETICHETTE_A.natura_giuridica, punteggio: null, stato: 'CHIESTO' as const,
        motivazione: 'compagine e cariche non in archivio: carica la visura camerale («Aggiorna da visura») per una proposta fondata sui dati, oppure valuta a mano la congruità e la complessità della struttura',
        fonte: FONTE_CNDCEC, daVerificare: true,
      };
    } else {
      const soloPfDirette = sociReali.length > 0 && sociReali.every((s) => s.tipo === 'PERSONA_FISICA');
      if (cliente.tipo === 'ENTE_NON_PROFIT') alza(2, 'ente non profit: associazioni, fondazioni e organizzazioni non lucrative sono richiamate dal criterio (rischio di abuso del settore non profit, ANR 2024 §6)');
      else if (soloPfDirette) alza(1, `struttura piana: ${sociReali.length === 1 ? 'socio unico persona fisica' : `${sociReali.length} soci persone fisiche diretti`}, titolarità individuabile senza risalire catene`);
      else alza(2, 'nella compagine compaiono soci diversi da persone fisiche: la titolarità effettiva richiede di risalire almeno un livello');
      const livelli = 1 + input.catena.length;
      if (livelli >= 3) alza(3, `catena partecipativa su ${livelli} livelli ricostruita con i dati dello studio (${input.catena.map((c) => c.denominazione).join(', ')})`);
      if (codici.has('A4') && sociReali.some((s) => (s.tipo === 'PERSONA_GIURIDICA' || s.tipo === 'ALTRO') && !s.clienteStudio && (s.paese ?? 'IT').toUpperCase() === 'IT')) {
        alza(3, 'catena non ancora ricostruita: c’è almeno un socio persona giuridica di cui non si conosce la compagine (alert A4)');
      }
      if (codici.has('A5')) {
        const esteri = sociReali.filter((s) => (s.tipo === 'PERSONA_GIURIDICA' || s.tipo === 'ALTRO') && (s.paese ?? 'IT').toUpperCase() !== 'IT');
        const altoRischio = esteri.filter((s) => input.paeseAltoRischio(s.paese).altoRischio);
        if (altoRischio.length) alza(4, `soci persone giuridiche con sede in Paesi terzi ad alto rischio (${altoRischio.map((s) => `${s.nome}, ${s.paese}`).join('; ')})`);
        else alza(3, `soci persone giuridiche estere (${esteri.map((s) => `${s.nome}, ${s.paese}`).join('; ')}): documentazione equivalente da acquisire, struttura transnazionale`);
      }
      if (codici.has('A6')) alza(4, 'presenza di società fiduciarie o trust fra i soci: intestazione fiduciaria espressamente richiamata dal criterio');
      if (codici.has('A1') || codici.has('A3') || analisi?.criterioApplicato === 'RESIDUALE_POTERI') {
        alza(3, 'il criterio della proprietà non individua titolari effettivi: la struttura rende più difficoltosa l’identificazione (art. 20 co. 3-5)');
      }
      if (inLiquidazione) alza(2, `società ${d.proceduraConcorsuale ? `in procedura (${d.proceduraConcorsuale})` : 'in liquidazione'}: la congruità della natura giuridica rispetto all’attività va rivalutata`);
    }
    const pepTe = input.titolariRegistrati.some((t) => t.pep);
    if (cliente.pep || pepTe) alza(4, `${cliente.pep ? 'il cliente' : 'un titolare effettivo registrato'} è persona politicamente esposta: verifica rafforzata (art. 24 co. 5 lett. c)`);
    return {
      codice: 'natura_giuridica', etichetta: ETICHETTE_A.natura_giuridica, punteggio: stato.punteggio, stato: 'PROPOSTO' as const,
      motivazione: motivi.join('; ') + '. Restano da valutare dal professionista la congruità della natura giuridica rispetto ad attività e dimensioni e l’esistenza di procedimenti penali o indagini.',
      fonte: FONTE_CNDCEC,
    };
  })();

  // ── A.2 attività prevalente ───────────────────────────────────────────
  const settore = settoreEsposto({ ateco: cliente.ateco, attivita: cliente.attivitaPrevalente, oggettoSociale: d.oggettoSociale }, input.data);
  const a2 = ((): FattoreProposto => {
    const base = { codice: 'prevalente_attivita', etichetta: ETICHETTE_A.prevalente_attivita };
    if (settore.voce) {
      const v = settore.voce;
      if (v.contanteIntensivo) circostanze.push({ chiave: 'elevatoUsoContante', motivo: `attività «${v.etichetta}» a elevato utilizzo di contante (${v.fonti.join(', ')})` });
      return {
        ...base, punteggio: v.punteggio, stato: 'PROPOSTO',
        motivazione: `${cliente.ateco ? `ATECO ${cliente.ateco}` : 'attività dichiarata'}${settore.via === 'PAROLE' ? ' (riconosciuta dalla descrizione dell’attività o dall’oggetto sociale)' : ''} → settore «${v.etichetta}»: ${v.motivo}`,
        fonte: `${v.fonti.join(', ')} — tabella dei settori esposti vigente dal ${dataIt(settore.serie!.da)}`,
      };
    }
    // AR-M21 (AI-03): classificazione dell'AI chiesta dal professionista, riscontrata sul catalogo.
    const ai = d.settoreAi ? voceSettorePerCodice(d.settoreAi.codice, input.data) : null;
    if (ai && d.settoreAi) {
      const v = ai.voce;
      return {
        ...base, punteggio: v.punteggio, stato: 'PROPOSTO',
        motivazione: `settore «${v.etichetta}» riconosciuto dall’AI nell’oggetto sociale — da confermare: ${d.settoreAi.motivo.replace(/\.\s*$/, '')}. Voce del catalogo: ${v.motivo}`,
        fonte: `classificazione AI del ${dataIt(d.settoreAi.data)} riscontrata sul catalogo (${v.fonti.join(', ')}) — tabella dei settori esposti vigente dal ${dataIt(ai.serie.da)}`,
        provenienzaAi: { settore: v.codice, motivo: d.settoreAi.motivo, data: d.settoreAi.data },
      };
    }
    // Si può chiedere all'AI solo se c'è un testo da leggere (oggetto sociale o attività) e non l'ha già detto «NESSUNO».
    const richiedibileAi = Boolean((d.oggettoSociale || cliente.attivitaPrevalente) && !(d.settoreAi && d.settoreAi.codice === 'NESSUNO'));
    if (cliente.ateco || cliente.attivitaPrevalente) {
      return {
        ...base, punteggio: 1, stato: 'PROPOSTO',
        motivazione: `${[cliente.ateco ? `ATECO ${cliente.ateco}` : null, cliente.attivitaPrevalente].filter(Boolean).join(' — ')}: non rientra nei settori esposti individuati dalle fonti (Analisi nazionale dei rischi 2024, indicatori UIF)${d.settoreAi?.codice === 'NESSUNO' ? `; anche l’AI, letto l’oggetto sociale il ${dataIt(d.settoreAi.data)}, non vi ha riconosciuto settori esposti` : ''}. Resta da valutare la coerenza fra l’attività svolta in concreto, la struttura organizzativa e le dimensioni`,
        fonte: settore.serie ? `tabella dei settori esposti vigente dal ${dataIt(settore.serie.da)} (${settore.serie.fonte})` : FONTE_CNDCEC,
        richiedibileAi,
      };
    }
    return {
      ...base, punteggio: null, stato: 'CHIESTO',
      motivazione: 'attività prevalente e ATECO non noti: completa l’anagrafica (dalla visura o a mano) per una proposta fondata sulle fonti',
      fonte: FONTE_CNDCEC, daVerificare: true, richiedibileAi,
    };
  })();

  // ── A.3 comportamento: sempre chiesto ─────────────────────────────────
  const a3: FattoreProposto = {
    codice: 'comportamento', etichetta: ETICHETTE_A.comportamento, punteggio: null, stato: 'CHIESTO',
    motivazione: 'il comportamento tenuto al conferimento dell’incarico e la presenza ingerente di terzi con ruolo non definito sono osservazioni del professionista: nessuna fonte documentale può proporle',
    fonte: FONTE_CNDCEC,
  };

  // ── A.4 area geografica ───────────────────────────────────────────────
  const siglaProvincia = (d.provincia ?? siglaProvinciaDaTesto(d.sede) ?? '').toUpperCase() || null;
  const prov = infoProvincia(siglaProvincia);
  const a4 = ((): FattoreProposto => {
    const base = { codice: 'area_geografica_cliente', etichetta: ETICHETTE_A.area_geografica_cliente };
    if (paeseSede !== 'IT') {
      if (esitoPaeseSede.altoRischio) {
        circostanze.push({ chiave: 'paeseTerzoAltoRischio', motivo: `sede/residenza in ${esitoPaeseSede.nomePaese} (${paeseSede}), Paese terzo ad alto rischio` });
        return { ...base, punteggio: 4, stato: 'PROPOSTO', motivazione: `sede o residenza in ${esitoPaeseSede.nomePaese} (${paeseSede}): Paese terzo ad alto rischio, verifica rafforzata obbligatoria (art. 24 co. 5 lett. a)`, fonte: `${esitoPaeseSede.fonte} — elenco vigente dal ${dataIt(esitoPaeseSede.vigenteDal)}` };
      }
      return { ...base, punteggio: 3, stato: 'PROPOSTO', motivazione: `sede o residenza all’estero (${paeseSede}), Paese non compreso nell’elenco UE dei Paesi terzi ad alto rischio: valutare eventuali deficienze strategiche (grey list GAFI) e la ragionevolezza della localizzazione`, fonte: 'Reg. delegato (UE) 2025/1184; ' + FONTE_CNDCEC };
    }
    const tab = input.provinceContante;
    const tabellaCompilata = Boolean(tab && tab.province.length);
    if (!prov) {
      return { ...base, punteggio: null, stato: 'CHIESTO', motivazione: 'provincia della sede non nota: completa la sede nell’anagrafica (la visura la riporta) per applicare il criterio delle province con flussi anomali di contante', fonte: FONTE_CNDCEC, daVerificare: true };
    }
    if (!tabellaCompilata) {
      return {
        ...base, punteggio: null, stato: 'CHIESTO', daVerificare: true,
        motivazione: `sede in provincia di ${prov.nome} (${prov.sigla}). Lo studio non ha ancora compilato la tabella delle province con flussi anomali di contante (Impostazioni → Province e contante): verifica la provincia sulla mappa dell’Analisi nazionale dei rischi 2024 (Fig. 3) e compila la tabella, oppure valuta a mano`,
        fonte: FONTE_CNDCEC,
      };
    }
    const riga = tab!.province.find((p) => p.sigla === prov.sigla);
    if (riga) {
      const p: Punteggio = riga.livello === 'ALTO' ? 3 : 2;
      alert.push({
        codice: 'A10', gravita: 'bassa', fattore: 'area_geografica_cliente',
        titolo: 'Sede in provincia con flussi anomali di contante',
        messaggio: `${prov.nome} (${prov.sigla}) è fra le province che lo studio ha classificato «${riga.livello === 'ALTO' ? 'alto' : 'medio-alto'}» leggendo la mappa dell’Analisi nazionale dei rischi (${tab!.fonte}${tab!.dataFonte ? `, ${dataIt(tab!.dataFonte)}` : ''}).`,
        norma: 'art. 17 co. 3 lett. a) n. 4 DLgs. 231/2007; Analisi nazionale dei rischi 2024 §2.1',
      });
      return { ...base, punteggio: p, stato: 'PROPOSTO', motivazione: `sede in provincia di ${prov.nome} (${prov.sigla}), classificata dallo studio a rischio contante «${riga.livello === 'ALTO' ? 'alto' : 'medio-alto'}» sulla base della mappa dell’Analisi nazionale dei rischi`, fonte: `tabella dello studio (${tab!.fonte}${tab!.dataFonte ? `, ${dataIt(tab!.dataFonte)}` : ''}, aggiornata il ${dataIt(tab!.aggiornatoIl.slice(0, 10))})` };
    }
    return { ...base, punteggio: 1, stato: 'PROPOSTO', motivazione: `sede in provincia di ${prov.nome} (${prov.sigla}), non compresa fra le province con flussi anomali di contante indicate dallo studio`, fonte: `tabella dello studio (${tab!.fonte}${tab!.dataFonte ? `, ${dataIt(tab!.dataFonte)}` : ''})` };
  })();

  // Altre circostanze suggerite dalla struttura.
  const sociAltoRischio = sociReali.filter((s) => s.paese && s.paese.toUpperCase() !== 'IT' && input.paeseAltoRischio(s.paese).altoRischio);
  if (sociAltoRischio.length && !circostanze.some((c) => c.chiave === 'paeseTerzoAltoRischio')) {
    circostanze.push({ chiave: 'paeseTerzoAltoRischio', motivo: `soci con sede o residenza in Paesi terzi ad alto rischio: ${sociAltoRischio.map((s) => `${s.nome} (${s.paese})`).join(', ')}` });
  }
  const interposteAltoRischio = sociReali.filter((s) => (s.tipo === 'FIDUCIARIA' || s.tipo === 'TRUST') && s.paese && input.paeseAltoRischio(s.paese).altoRischio);
  if (interposteAltoRischio.length) circostanze.push({ chiave: 'entitaPaeseAltoRischio', motivo: `fiduciarie o trust con sede in Paesi terzi ad alto rischio: ${interposteAltoRischio.map((s) => s.nome).join(', ')} (art. 42 co. 2)` });
  if (codici.has('A6') || (a1.punteggio !== null && a1.punteggio >= 3 && !personaFisica && (codici.has('A3') || input.catena.length >= 2))) {
    circostanze.push({ chiave: 'assettoProprietarioComplesso', motivo: codici.has('A6') ? 'veicolo di interposizione (fiduciaria/trust) nella compagine' : 'assetto proprietario articolato: la titolarità effettiva non emerge dalla sola proprietà o richiede più livelli' });
  }
  if ((cliente.pep || input.titolariRegistrati.some((t) => t.pep)) && !circostanze.some((c) => c.chiave === 'pep')) {
    circostanze.push({ chiave: 'pep', motivo: 'persona politicamente esposta registrata (cliente o titolare effettivo)' });
  }

  // ── Esecutore ─────────────────────────────────────────────────────────
  const esecutore = proponiEsecutore(cliente, cariche, inLiquidazione, d.visuraDel ?? null);

  // ── Checklist documenti ───────────────────────────────────────────────
  const checklist = costruisciChecklist(input, esecutore, codici, personaFisica);

  // ── Alert A9 / A10 ────────────────────────────────────────────────────
  if (inLiquidazione) {
    alert.push({
      codice: 'A9', gravita: 'media', fattore: 'natura_giuridica',
      titolo: d.proceduraConcorsuale ? `Società in procedura: ${d.proceduraConcorsuale}` : 'Società in liquidazione',
      messaggio: d.proceduraConcorsuale
        ? `La visura riporta una procedura concorsuale (${d.proceduraConcorsuale}): i poteri di gestione spettano all’organo della procedura, che va considerato ai fini del criterio residuale e dell’esecutore; la prestazione richiesta va letta alla luce dello stato della società (Tabella B).`
        : `La società è in liquidazione${esecutore?.carica === 'LIQUIDATORE' ? ` (liquidatore: ${esecutore.nominativo})` : ''}: la rappresentanza spetta al liquidatore, la titolarità per proprietà resta ai soci; nella Tabella A.1 va rivalutata la congruità della forma rispetto all’attività residua e nella Tabella B la ragionevolezza della prestazione richiesta.`,
      norma: 'art. 20 co. 5 DLgs. 231/2007; artt. 2487-2489 c.c.; art. 17 co. 3',
    });
  }
  const mesiVita = d.dataCostituzione ? mesiTra(d.dataCostituzione, input.data) : null;
  if (mesiVita !== null && mesiVita >= 0 && mesiVita < 12) {
    alert.push({
      codice: 'A10', gravita: 'media', fattore: 'natura_giuridica',
      titolo: 'Società di recente costituzione',
      messaggio: `Atto di costituzione del ${dataIt(d.dataCostituzione)} (${mesiVita} mesi fa): la neocostituzione è un elemento ricorrente negli indicatori di anomalia UIF quando si accompagna a operatività non coerente con struttura e dimensioni. Valuta la coerenza fra attività dichiarata, capitale e prestazione richiesta.`,
      norma: 'art. 17 co. 3 DLgs. 231/2007; indicatori di anomalia UIF (Provv. 12.5.2023)',
    });
  }
  const richiamati = settoriRichiamati(d.oggettoSociale, input.data);
  const capitale = d.capitaleSociale ?? null;
  if (richiamati.length >= 3 && capitale !== null && capitale <= 10_000) {
    alert.push({
      codice: 'A10', gravita: 'media', fattore: 'prevalente_attivita',
      titolo: 'Oggetto sociale molto ampio rispetto al capitale',
      messaggio: `L’oggetto sociale richiama ${richiamati.length} settori esposti (${richiamati.map((v) => v.etichetta.toLowerCase()).join(', ')}) a fronte di un capitale sociale di € ${euro(capitale)}: verifica la coerenza fra l’attività svolta in concreto e la struttura organizzativa e dimensionale (criterio A.2).`,
      norma: 'art. 17 co. 3 lett. a) n. 2 DLgs. 231/2007; Modello AV.1 sez. A',
    });
  } else if (richiamati.length >= 2 && settore.voce && richiamati.some((v) => v.codice !== settore.voce!.codice)) {
    alert.push({
      codice: 'A10', gravita: 'bassa', fattore: 'prevalente_attivita',
      titolo: 'Oggetto sociale che richiama più settori esposti',
      messaggio: `Oltre al settore proposto per A.2 («${settore.voce.etichetta}»), l’oggetto sociale richiama anche: ${richiamati.filter((v) => v.codice !== settore.voce!.codice).map((v) => v.etichetta.toLowerCase()).join(', ')}. Chiedi al cliente quale attività svolge in concreto.`,
      norma: 'art. 17 co. 3 lett. a) n. 2 DLgs. 231/2007',
    });
  }

  const tabellaA = { natura_giuridica: a1, prevalente_attivita: a2, comportamento: a3, area_geografica_cliente: a4 };
  const motivazioneValutazione =
    `Tabella A proposta dal programma (${provenienzaCompleta}) e valutata dal professionista. ` +
    Object.values(tabellaA)
      .filter((f) => f.stato === 'PROPOSTO' && f.punteggio !== null)
      .map((f) => `${f.etichetta}: ${f.punteggio} — ${f.motivazione}`)
      .join(' · ');

  return { tabellaA, circostanze, esecutore, checklist, alert, provenienza: provenienzaCompleta, motivazioneValutazione };
}

// --------------------------------------------------------------- esecutore

const ORDINE_ESECUTORE: CodiceCarica[] = [
  'TITOLARE', 'AMMINISTRATORE_UNICO', 'PRESIDENTE_CDA', 'CONSIGLIERE_DELEGATO', 'SOCIO_AMMINISTRATORE',
  'VICE_PRESIDENTE_CDA', 'CONSIGLIERE', 'PROCURATORE', 'INSTITORE', 'CURATORE', 'LIQUIDATORE', 'ALTRO', 'SINDACO', 'REVISORE',
];

export function proponiEsecutore(
  cliente: { tipo: string; denominazione: string },
  cariche: CaricaProposta[],
  inLiquidazione: boolean,
  visuraDel: string | null,
): EsecutoreProposto | null {
  if (cliente.tipo === 'PERSONA_FISICA' || !cariche.length) return null;
  const peso = (c: CaricaProposta) => {
    let p = ORDINE_ESECUTORE.indexOf(c.carica);
    if (p < 0) p = ORDINE_ESECUTORE.length;
    if (inLiquidazione && c.carica === 'LIQUIDATORE') p = -2;
    if (inLiquidazione && c.carica === 'CURATORE') p = -3;
    if (c.rappresentanzaLegale) p -= 0.5;
    return p;
  };
  const candidati = cariche
    .filter((c) => c.rappresentanzaLegale || CARICHE_CON_POTERI.has(c.carica) || c.carica === 'PROCURATORE' || c.carica === 'INSTITORE')
    .sort((a, b) => peso(a) - peso(b));
  if (!candidati.length) return null;
  const primo = candidati[0];
  const testoCarica = (c: CaricaProposta) => c.caricaTesto?.trim() || etichettaCarica(c.carica);
  const fonte = visuraDel ? `visura camerale del ${dataIt(visuraDel)}` : 'cariche in archivio';
  return {
    nominativo: primo.nome,
    codiceFiscale: primo.codiceFiscale ?? null,
    carica: primo.carica,
    caricaTesto: testoCarica(primo),
    rappresentanzaLegale: Boolean(primo.rappresentanzaLegale),
    dataNomina: primo.dataNomina ?? null,
    fonte,
    motivazione:
      `${primo.nome} risulta dalla ${fonte} come ${testoCarica(primo).toLowerCase()}${primo.rappresentanzaLegale ? ' con rappresentanza dell’impresa' : ''}` +
      `${primo.dataNomina ? ` (nomina del ${dataIt(primo.dataNomina)})` : ''}: è la persona fisica che, di regola, conferisce l’incarico in nome di ${cliente.denominazione}. ` +
      'Conferma che sia lei a conferire l’incarico e identificala come l’esecutore (art. 1 co. 2 lett. p; artt. 18 co. 1 lett. a) e 19 co. 1 lett. a): la visura non dice chi si presenta in studio.',
    alternative: candidati.slice(1, 5).map((c) => ({ nominativo: c.nome, codiceFiscale: c.codiceFiscale ?? null, carica: c.carica, caricaTesto: testoCarica(c) })),
  };
}

// --------------------------------------------------------------- checklist

const TIPI_DICHIARAZIONE = new Set(['AUTOCERTIFICAZIONE_TE', 'DICHIARAZIONE_ART22']);

function costruisciChecklist(input: InputFascicoloProposto, esecutore: EsecutoreProposto | null, codici: Set<string>, personaFisica: boolean): VoceChecklist[] {
  const out: VoceChecklist[] = [];
  const docs = input.documenti;
  const conta = (pred: (t: string) => boolean) => docs.filter((x) => pred(x.tipo)).length;
  const c = (v: Omit<VoceChecklist, 'presente'> & { presente: boolean | null }) => out.push(v);

  const titolari = input.analisi?.titolari?.length
    ? input.analisi.titolari.map((t) => ({ nome: t.denominazione }))
    : input.titolariRegistrati.map((t) => ({ nome: t.nominativo }));
  const nIdentita = conta((t) => t === 'DOCUMENTO_IDENTITA');

  if (personaFisica) {
    c({
      codice: 'ID_CLIENTE', etichetta: 'Documento d’identità del cliente', tipoDocumento: 'DOCUMENTO_IDENTITA', obbligatoria: true,
      perche: 'identificazione e verifica dell’identità della persona fisica', norma: 'art. 18 co. 1 lett. a); art. 19 co. 1 lett. a) DLgs. 231/2007',
      presente: nIdentita >= 1,
    });
  } else {
    c({
      codice: 'VISURA', etichetta: 'Visura camerale aggiornata', tipoDocumento: 'VISURA', obbligatoria: true,
      perche: 'identificazione del cliente persona giuridica da fonte affidabile e indipendente (denominazione, sede, amministratori)',
      norma: 'art. 18 co. 1 lett. a); art. 19 co. 1 lett. a) DLgs. 231/2007',
      presente: conta((t) => t === 'VISURA') >= 1,
    });
    if (esecutore) {
      c({
        codice: 'ID_ESECUTORE', etichetta: `Documento d’identità dell’esecutore (${esecutore.nominativo})`, tipoDocumento: 'DOCUMENTO_IDENTITA', obbligatoria: true,
        soggetto: esecutore.nominativo,
        perche: 'l’esecutore va identificato come il cliente e va verificato che sia titolare dei poteri di rappresentanza',
        norma: 'art. 18 co. 1 lett. a); art. 19 co. 1 lett. a) DLgs. 231/2007',
        presente: nIdentita >= 1,
      });
      if (esecutore.carica === 'PROCURATORE' || esecutore.carica === 'INSTITORE') {
        c({
          codice: 'PROCURA', etichetta: 'Procura o atto che conferisce i poteri all’esecutore', tipoDocumento: 'PROCURA', obbligatoria: true,
          perche: 'l’esecutore agisce per procura: va acquisito il titolo dei poteri', norma: 'art. 19 co. 1 lett. a) DLgs. 231/2007',
          presente: conta((t) => t === 'PROCURA') >= 1,
        });
      }
    } else {
      c({
        codice: 'ID_ESECUTORE', etichetta: 'Documento d’identità di chi conferisce l’incarico (esecutore)', tipoDocumento: 'DOCUMENTO_IDENTITA', obbligatoria: true,
        perche: 'dalle cariche in archivio non emerge un rappresentante: individua chi conferisce l’incarico e identificalo',
        norma: 'art. 18 co. 1 lett. a); art. 19 co. 1 lett. a) DLgs. 231/2007',
        presente: nIdentita >= 1,
      });
    }
    titolari.forEach((t, i) => {
      c({
        codice: `ID_TE_${i + 1}`, etichetta: `Documento d’identità del titolare effettivo (${t.nome})`, tipoDocumento: 'DOCUMENTO_IDENTITA', obbligatoria: true, soggetto: t.nome,
        perche: 'verifica dell’identità del titolare effettivo con misure proporzionate al rischio',
        norma: 'art. 19 co. 1 lett. b) DLgs. 231/2007',
        presente: nIdentita >= (esecutore ? 1 : 0) + i + 1 ? true : nIdentita > 0 ? null : false,
      });
    });
    c({
      codice: 'DICHIARAZIONE_ART22', etichetta: 'Dichiarazione del cliente sul titolare effettivo (art. 22)', tipoDocumento: 'DICHIARAZIONE_ART22', obbligatoria: true,
      perche: codici.has('A2')
        ? 'il cliente deve fornire per iscritto le informazioni sul titolare effettivo; qui servono anche le domande di controllo (patti, vincoli, interposizioni) che la visura non può dare'
        : 'il cliente deve fornire per iscritto, sotto la propria responsabilità, le informazioni sul titolare effettivo e sullo status di PEP',
      norma: 'art. 22 co. 1-2 DLgs. 231/2007',
      presente: conta((t) => TIPI_DICHIARAZIONE.has(t)) >= 1,
    });
    for (const s of input.soci.filter((x) => !x.quoteProprie)) {
      const paese = (s.paese ?? 'IT').toUpperCase();
      if ((s.tipo === 'PERSONA_GIURIDICA' || s.tipo === 'ALTRO') && paese !== 'IT') {
        c({
          codice: `ESTERO_${s.id}`, etichetta: `Documentazione equivalente alla visura per ${s.nome} (${paese})`, tipoDocumento: 'DOCUMENTAZIONE_ESTERA', obbligatoria: true, soggetto: s.nome,
          perche: `socio estero con il ${pct(s.quota)}: certificato camerale estero, certificate of incumbency, elenco soci`,
          norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007' + (input.paeseAltoRischio(paese).altoRischio ? '; art. 24 co. 5 lett. a) (verifica rafforzata)' : ''),
          presente: conta((t) => t === 'DOCUMENTAZIONE_ESTERA') >= 1 ? null : false,
        });
      }
      if ((s.tipo === 'PERSONA_GIURIDICA' || s.tipo === 'ALTRO') && paese === 'IT' && !s.clienteStudio) {
        c({
          codice: `VISURA_${s.id}`, etichetta: `Visura camerale della controllante ${s.nome}`, tipoDocumento: 'VISURA', obbligatoria: true, soggetto: s.nome,
          perche: `socio persona giuridica con il ${pct(s.quota)}: per risalire al titolare effettivo serve la sua compagine`,
          norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007',
          presente: false,
        });
      }
      if (s.tipo === 'FIDUCIARIA') {
        c({
          codice: `FIDUCIANTE_${s.id}`, etichetta: `Mandato fiduciario / identità del fiduciante dietro ${s.nome}`, tipoDocumento: 'MANDATO_FIDUCIARIO', obbligatoria: true, soggetto: s.nome,
          perche: 'interposizione fiduciaria: il titolare effettivo è il fiduciante, da acquisire per iscritto',
          norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007; L. 1966/1939',
          presente: conta((t) => t === 'MANDATO_FIDUCIARIO') >= 1 ? null : false,
        });
      }
      if (s.tipo === 'TRUST') {
        c({
          codice: `TRUST_${s.id}`, etichetta: `Atto istitutivo e soggetti del trust ${s.nome}`, tipoDocumento: 'ATTO_TRUST', obbligatoria: true, soggetto: s.nome,
          perche: 'costituente, trustee, guardiano e beneficiari sono i titolari effettivi ex art. 22 co. 5',
          norma: 'art. 22 co. 5 DLgs. 231/2007',
          presente: conta((t) => t === 'ATTO_TRUST') >= 1 ? null : false,
        });
      }
    }
  }
  c({
    codice: 'INCARICO', etichetta: 'Lettera d’incarico o mandato professionale', tipoDocumento: 'INCARICO', obbligatoria: false,
    perche: 'documenta scopo e natura della prestazione e la data di conferimento, da cui decorrono i termini',
    norma: 'art. 19 co. 1 lett. c); art. 18 co. 3 DLgs. 231/2007',
    presente: conta((t) => t === 'INCARICO') >= 1,
  });
  return out;
}
