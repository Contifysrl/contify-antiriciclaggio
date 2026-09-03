/**
 * PROVINCE ITALIANE (AR-M18)
 *
 * Elenco delle 107 sigle automobilistiche/camerali con denominazione e
 * regione. Serve al fattore A.4 della Tabella A («residenza/localizzazione in
 * Provincia italiana con flussi anomali di contante») e alla lettura della
 * provincia della sede dalla visura.
 *
 * NOTA DI DOMINIO (decisione del 3.9.2026). L'Analisi nazionale dei rischi
 * 2024 (CSF/MEF) pubblica l'indicatore UIF «uso del contante» SOLO come
 * mappa a colori (Fig. 3: alto / medio-alto / medio / basso), senza un elenco
 * testuale di province, e la UIF non pubblica i dati provinciali. Il
 * programma NON trascrive quella mappa: sarebbe una lettura inaffidabile
 * spacciata per fonte ufficiale. È lo studio a compilare, in Impostazioni,
 * le province che legge come alto / medio-alto sulla mappa (con data e
 * fonte); qui c'è solo l'anagrafica delle sigle.
 */

export interface Provincia {
  sigla: string;
  nome: string;
  regione: string;
}

export const PROVINCE: Provincia[] = [
  { sigla: 'AG', nome: 'Agrigento', regione: 'Sicilia' },
  { sigla: 'AL', nome: 'Alessandria', regione: 'Piemonte' },
  { sigla: 'AN', nome: 'Ancona', regione: 'Marche' },
  { sigla: 'AO', nome: 'Aosta', regione: "Valle d'Aosta" },
  { sigla: 'AP', nome: 'Ascoli Piceno', regione: 'Marche' },
  { sigla: 'AQ', nome: "L'Aquila", regione: 'Abruzzo' },
  { sigla: 'AR', nome: 'Arezzo', regione: 'Toscana' },
  { sigla: 'AT', nome: 'Asti', regione: 'Piemonte' },
  { sigla: 'AV', nome: 'Avellino', regione: 'Campania' },
  { sigla: 'BA', nome: 'Bari', regione: 'Puglia' },
  { sigla: 'BG', nome: 'Bergamo', regione: 'Lombardia' },
  { sigla: 'BI', nome: 'Biella', regione: 'Piemonte' },
  { sigla: 'BL', nome: 'Belluno', regione: 'Veneto' },
  { sigla: 'BN', nome: 'Benevento', regione: 'Campania' },
  { sigla: 'BO', nome: 'Bologna', regione: 'Emilia-Romagna' },
  { sigla: 'BR', nome: 'Brindisi', regione: 'Puglia' },
  { sigla: 'BS', nome: 'Brescia', regione: 'Lombardia' },
  { sigla: 'BT', nome: 'Barletta-Andria-Trani', regione: 'Puglia' },
  { sigla: 'BZ', nome: 'Bolzano', regione: 'Trentino-Alto Adige' },
  { sigla: 'CA', nome: 'Cagliari', regione: 'Sardegna' },
  { sigla: 'CB', nome: 'Campobasso', regione: 'Molise' },
  { sigla: 'CE', nome: 'Caserta', regione: 'Campania' },
  { sigla: 'CH', nome: 'Chieti', regione: 'Abruzzo' },
  { sigla: 'CL', nome: 'Caltanissetta', regione: 'Sicilia' },
  { sigla: 'CN', nome: 'Cuneo', regione: 'Piemonte' },
  { sigla: 'CO', nome: 'Como', regione: 'Lombardia' },
  { sigla: 'CR', nome: 'Cremona', regione: 'Lombardia' },
  { sigla: 'CS', nome: 'Cosenza', regione: 'Calabria' },
  { sigla: 'CT', nome: 'Catania', regione: 'Sicilia' },
  { sigla: 'CZ', nome: 'Catanzaro', regione: 'Calabria' },
  { sigla: 'EN', nome: 'Enna', regione: 'Sicilia' },
  { sigla: 'FC', nome: 'Forlì-Cesena', regione: 'Emilia-Romagna' },
  { sigla: 'FE', nome: 'Ferrara', regione: 'Emilia-Romagna' },
  { sigla: 'FG', nome: 'Foggia', regione: 'Puglia' },
  { sigla: 'FI', nome: 'Firenze', regione: 'Toscana' },
  { sigla: 'FM', nome: 'Fermo', regione: 'Marche' },
  { sigla: 'FR', nome: 'Frosinone', regione: 'Lazio' },
  { sigla: 'GE', nome: 'Genova', regione: 'Liguria' },
  { sigla: 'GO', nome: 'Gorizia', regione: 'Friuli-Venezia Giulia' },
  { sigla: 'GR', nome: 'Grosseto', regione: 'Toscana' },
  { sigla: 'IM', nome: 'Imperia', regione: 'Liguria' },
  { sigla: 'IS', nome: 'Isernia', regione: 'Molise' },
  { sigla: 'KR', nome: 'Crotone', regione: 'Calabria' },
  { sigla: 'LC', nome: 'Lecco', regione: 'Lombardia' },
  { sigla: 'LE', nome: 'Lecce', regione: 'Puglia' },
  { sigla: 'LI', nome: 'Livorno', regione: 'Toscana' },
  { sigla: 'LO', nome: 'Lodi', regione: 'Lombardia' },
  { sigla: 'LT', nome: 'Latina', regione: 'Lazio' },
  { sigla: 'LU', nome: 'Lucca', regione: 'Toscana' },
  { sigla: 'MB', nome: 'Monza e Brianza', regione: 'Lombardia' },
  { sigla: 'MC', nome: 'Macerata', regione: 'Marche' },
  { sigla: 'ME', nome: 'Messina', regione: 'Sicilia' },
  { sigla: 'MI', nome: 'Milano', regione: 'Lombardia' },
  { sigla: 'MN', nome: 'Mantova', regione: 'Lombardia' },
  { sigla: 'MO', nome: 'Modena', regione: 'Emilia-Romagna' },
  { sigla: 'MS', nome: 'Massa-Carrara', regione: 'Toscana' },
  { sigla: 'MT', nome: 'Matera', regione: 'Basilicata' },
  { sigla: 'NA', nome: 'Napoli', regione: 'Campania' },
  { sigla: 'NO', nome: 'Novara', regione: 'Piemonte' },
  { sigla: 'NU', nome: 'Nuoro', regione: 'Sardegna' },
  { sigla: 'OR', nome: 'Oristano', regione: 'Sardegna' },
  { sigla: 'PA', nome: 'Palermo', regione: 'Sicilia' },
  { sigla: 'PC', nome: 'Piacenza', regione: 'Emilia-Romagna' },
  { sigla: 'PD', nome: 'Padova', regione: 'Veneto' },
  { sigla: 'PE', nome: 'Pescara', regione: 'Abruzzo' },
  { sigla: 'PG', nome: 'Perugia', regione: 'Umbria' },
  { sigla: 'PI', nome: 'Pisa', regione: 'Toscana' },
  { sigla: 'PN', nome: 'Pordenone', regione: 'Friuli-Venezia Giulia' },
  { sigla: 'PO', nome: 'Prato', regione: 'Toscana' },
  { sigla: 'PR', nome: 'Parma', regione: 'Emilia-Romagna' },
  { sigla: 'PT', nome: 'Pistoia', regione: 'Toscana' },
  { sigla: 'PU', nome: 'Pesaro e Urbino', regione: 'Marche' },
  { sigla: 'PV', nome: 'Pavia', regione: 'Lombardia' },
  { sigla: 'PZ', nome: 'Potenza', regione: 'Basilicata' },
  { sigla: 'RA', nome: 'Ravenna', regione: 'Emilia-Romagna' },
  { sigla: 'RC', nome: 'Reggio Calabria', regione: 'Calabria' },
  { sigla: 'RE', nome: 'Reggio Emilia', regione: 'Emilia-Romagna' },
  { sigla: 'RG', nome: 'Ragusa', regione: 'Sicilia' },
  { sigla: 'RI', nome: 'Rieti', regione: 'Lazio' },
  { sigla: 'RM', nome: 'Roma', regione: 'Lazio' },
  { sigla: 'RN', nome: 'Rimini', regione: 'Emilia-Romagna' },
  { sigla: 'RO', nome: 'Rovigo', regione: 'Veneto' },
  { sigla: 'SA', nome: 'Salerno', regione: 'Campania' },
  { sigla: 'SI', nome: 'Siena', regione: 'Toscana' },
  { sigla: 'SO', nome: 'Sondrio', regione: 'Lombardia' },
  { sigla: 'SP', nome: 'La Spezia', regione: 'Liguria' },
  { sigla: 'SR', nome: 'Siracusa', regione: 'Sicilia' },
  { sigla: 'SS', nome: 'Sassari', regione: 'Sardegna' },
  { sigla: 'SU', nome: 'Sud Sardegna', regione: 'Sardegna' },
  { sigla: 'SV', nome: 'Savona', regione: 'Liguria' },
  { sigla: 'TA', nome: 'Taranto', regione: 'Puglia' },
  { sigla: 'TE', nome: 'Teramo', regione: 'Abruzzo' },
  { sigla: 'TN', nome: 'Trento', regione: 'Trentino-Alto Adige' },
  { sigla: 'TO', nome: 'Torino', regione: 'Piemonte' },
  { sigla: 'TP', nome: 'Trapani', regione: 'Sicilia' },
  { sigla: 'TR', nome: 'Terni', regione: 'Umbria' },
  { sigla: 'TS', nome: 'Trieste', regione: 'Friuli-Venezia Giulia' },
  { sigla: 'TV', nome: 'Treviso', regione: 'Veneto' },
  { sigla: 'UD', nome: 'Udine', regione: 'Friuli-Venezia Giulia' },
  { sigla: 'VA', nome: 'Varese', regione: 'Lombardia' },
  { sigla: 'VB', nome: 'Verbano-Cusio-Ossola', regione: 'Piemonte' },
  { sigla: 'VC', nome: 'Vercelli', regione: 'Piemonte' },
  { sigla: 'VE', nome: 'Venezia', regione: 'Veneto' },
  { sigla: 'VI', nome: 'Vicenza', regione: 'Veneto' },
  { sigla: 'VR', nome: 'Verona', regione: 'Veneto' },
  { sigla: 'VT', nome: 'Viterbo', regione: 'Lazio' },
  { sigla: 'VV', nome: 'Vibo Valentia', regione: 'Calabria' },
];

const PER_SIGLA = new Map(PROVINCE.map((p) => [p.sigla, p]));

export function provincia(sigla: string | null | undefined): Provincia | null {
  const s = (sigla ?? '').trim().toUpperCase();
  return PER_SIGLA.get(s) ?? null;
}

/** Estrae la sigla di provincia da un testo di sede («… TORINO (TO)» o «… 10121 TORINO TO»). */
export function siglaProvinciaDaTesto(testo: string | null | undefined): string | null {
  if (!testo) return null;
  const t = testo.toUpperCase();
  const tonde = [...t.matchAll(/\(([A-Z]{2})\)/g)].map((m) => m[1]).filter((s) => PER_SIGLA.has(s));
  if (tonde.length) return tonde[tonde.length - 1];
  const m = /\b(\d{5})\s+[A-ZÀ-Ù' .-]+?\s+([A-Z]{2})\b/.exec(t);
  if (m && PER_SIGLA.has(m[2])) return m[2];
  return null;
}

// ---------------------------------------------------------------------------
// Tabella di studio: province con flussi anomali di contante
// ---------------------------------------------------------------------------

export type LivelloContante = 'ALTO' | 'MEDIO_ALTO';

export interface TabellaProvinceContante {
  /** Fonte dichiarata dallo studio (es. «ANR 2024, Fig. 3 — indicatore UIF n. 1»). */
  fonte: string;
  /** Data della fonte (ISO), es. la data dell'Analisi nazionale letta. */
  dataFonte: string | null;
  aggiornatoIl: string;
  aggiornatoDa: string | null;
  province: Array<{ sigla: string; livello: LivelloContante }>;
}

/** Riferimento ufficiale da mostrare accanto alla tabella: è la mappa che lo studio legge. */
export const RIFERIMENTO_MAPPA_ANR = {
  titolo: 'Analisi nazionale dei rischi di riciclaggio e di finanziamento del terrorismo 2024 (CSF/MEF), §2.1, Figura 3 «Indicatore di rischio per il settore privato» (elaborazioni UIF su dati S.AR.A., anno 2023)',
  url: 'https://www.dt.mef.gov.it/export/sites/sitodt/modules/documenti_it/prevenzione_reati_finanziari/prevenzione_reati_finanziari/Analisi_riciclaggio-denaro_finanziamento-terrorismo_2024.pdf',
  nota:
    'La mappa distingue quattro livelli (alto, medio-alto, medio, basso) senza un elenco testuale di province. ' +
    'Il criterio della Tabella A.4 (Modello AV.1, Informativa CNDCEC n. 57/2026) rinvia a questa Analisi: la lettura della mappa è una scelta documentata dello studio.',
};

export function normalizzaTabellaProvince(input: unknown): { errore?: string; tabella?: TabellaProvinceContante['province'] } {
  if (!Array.isArray(input)) return { errore: 'Elenco province non valido' };
  const viste = new Set<string>();
  const out: TabellaProvinceContante['province'] = [];
  for (const r of input) {
    const sigla = String((r as any)?.sigla ?? '').trim().toUpperCase();
    const livello = String((r as any)?.livello ?? '').trim().toUpperCase();
    if (!PER_SIGLA.has(sigla)) return { errore: `Sigla di provincia non riconosciuta: ${sigla || '(vuota)'}` };
    if (livello !== 'ALTO' && livello !== 'MEDIO_ALTO') return { errore: `Livello non ammesso per ${sigla}: usa ALTO o MEDIO_ALTO` };
    if (viste.has(sigla)) continue;
    viste.add(sigla);
    out.push({ sigla, livello: livello as LivelloContante });
  }
  out.sort((a, b) => a.sigla.localeCompare(b.sigla));
  return { tabella: out };
}
