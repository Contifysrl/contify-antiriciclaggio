// ── Fonte VIES (Commissione europea) — portata da Assist (M28) ──
//
// Servizio pubblico, gratuito, senza chiave né registrazione. La
// copertura non è totale: in Italia l'iscrizione al VIES è un'opzione,
// e il buco va spiegato all'utente, non nascosto.

import type { EsitoFonte } from './tipi';
import { DATI_VUOTI } from './tipi';
import { ripuliscRagioneSociale, probabilmenteTroncata, sembraGruppoIva } from './testo';
import { leggiIndirizzoVies } from './indirizzo';

const VIES_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/';
const TIMEOUT_MS = 6_000;

type RispostaVies = {
  isValid?: boolean;
  userError?: string;
  name?: string;
  address?: string;
};

/**
 * Risposte di servizio: il VIES risponde 200 anche quando il problema è
 * suo. Solo `INVALID` con `isValid:false` significa «non in archivio».
 */
const ERRORI_DI_SERVIZIO = new Set([
  'SERVICE_UNAVAILABLE', 'MS_UNAVAILABLE', 'TIMEOUT', 'SERVER_BUSY',
  'MS_MAX_CONCURRENT_REQ', 'GLOBAL_MAX_CONCURRENT_REQ', 'VAT_BLOCKED',
  'IP_BLOCKED', 'MS_INVALID_INPUT',
]);

/** Traduce la risposta grezza del VIES nel nostro formato. Funzione pura. */
export function interpretaRispostaVies(dati: RispostaVies): EsitoFonte {
  if (dati.userError && ERRORI_DI_SERVIZIO.has(dati.userError)) {
    return { stato: 'non_disponibile' };
  }
  if (!dati.isValid) return { stato: 'assente' };

  const nomeGrezzo = dati.name && dati.name !== '---' ? dati.name : null;
  const indirizzo = leggiIndirizzoVies(dati.address);

  const avvisi: string[] = [];
  if (probabilmenteTroncata(nomeGrezzo)) {
    avvisi.push("Il nome potrebbe essere incompleto: l'archivio europeo lo tronca a 60 caratteri.");
  }
  if (sembraGruppoIva(nomeGrezzo)) {
    avvisi.push(
      'Questa partita IVA sembra appartenere a un gruppo IVA: il nome proposto potrebbe essere quello del gruppo e non del singolo cliente. Verifica prima di applicare.',
    );
  }
  if (!indirizzo.completo && indirizzo.indirizzo) {
    avvisi.push('Non siamo riusciti a separare CAP e comune: controllali.');
  }
  avvisi.push("L'indirizzo è la sede legale registrata ai fini IVA: verifica che sia quella attuale.");

  return {
    stato: 'trovato',
    risultato: {
      fonte: 'VIES',
      affidabilita: 'media',
      dati: {
        ...DATI_VUOTI,
        ragioneSociale: ripuliscRagioneSociale(nomeGrezzo),
        indirizzo: indirizzo.civico
          ? `${indirizzo.indirizzo} ${indirizzo.civico}`
          : indirizzo.indirizzo,
        cap: indirizzo.cap,
        citta: indirizzo.comune,
        provincia: indirizzo.provincia,
      },
      avvisi,
    },
  };
}

export async function cercaSuVies(piva: string): Promise<EsitoFonte> {
  let risposta: Response;
  try {
    risposta = await fetch(VIES_BASE + piva, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { stato: 'non_disponibile' };   // rete o timeout
  }
  if (!risposta.ok) return { stato: 'non_disponibile' };

  try {
    return interpretaRispostaVies(await risposta.json<RispostaVies>());
  } catch {
    return { stato: 'non_disponibile' };
  }
}

// ── Risposte finte per lo sviluppo e gli smoke test ────────────
// In locale non si interroga il servizio della Commissione: i test
// devono essere ripetibili e non dipendere da un servizio esterno.
// Si attiva con VIES_FIXTURES=1 in .dev.vars (mai in produzione).
// I dati sono risposte VERE raccolte il 25/07/2026 (campione Assist).

const FIXTURES: Record<string, RispostaVies> = {
  // Caso normale, con il rumore "!!SPA" nel dato.
  '04219070234': {
    isValid: true, userError: 'VALID',
    name: 'OSPEDALE P. PEDERZOLI CASA DI CURA PRIVATA SPA !!SPA',
    address: 'VIA MONTE BALDO 24 \n37019 PESCHIERA DEL GARDA VR\n',
  },
  // Civico con barra e comune di tre parole.
  '04639770280': {
    isValid: true, userError: 'VALID',
    name: 'POLIAMBULATORIO SAN MARTINO S.R.L.',
    address: 'VIA CARRARESE 66/6 \n35028 PIOVE DI SACCO PD\n',
  },
  // Denominazione troncata a 60 caratteri.
  '01397900190': {
    isValid: true, userError: 'VALID',
    name: "CLINICA VETERINARIA VEZZONI SOCIETA' A RESPONSABILITA' LIMIT",
    address: 'VIA DELLE VIGNE 190 \n26100 CREMONA CR\n',
  },
  // Partita IVA valida ma non iscritta al VIES.
  '00347320277': { isValid: false, userError: 'INVALID', name: '---', address: '---' },
  // Servizio dello Stato membro non disponibile.
  '00420560237': { isValid: false, userError: 'MS_UNAVAILABLE' },
};

export function cercaSuViesFinto(piva: string): EsitoFonte {
  const finta = FIXTURES[piva];
  if (!finta) return { stato: 'assente' };
  return interpretaRispostaVies(finta);
}
