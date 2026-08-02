// ── Compilazione anagrafica da partita IVA (AR-M7, da Assist M28) ──
//
// Ordine: controllo formale → cache → VIES. Si esce al primo risultato
// utile. Il controllo formale si fa PRIMA di uscire in rete: una partita
// IVA scritta male non deve consumare una chiamata al servizio della
// Commissione.

import type { Env } from '../tipi';
import type { EsitoFonte, RispostaLookup, RisultatoFonte } from './tipi';
import { DATI_VUOTI } from './tipi';
import { normalizzaPiva } from './piva';
import { cercaSuVies, cercaSuViesFinto } from './vies';

/** Quanto teniamo buona una risposta prima di richiederla. */
const CACHE_GIORNI = 90;
/** Tetto per tenant: protegge il VIES da un uso che potrebbe farci limitare. */
export const LIMITE_ORARIO = 60;

const VUOTA: Omit<RispostaLookup, 'esito'> = {
  fonte: null, affidabilita: null, dati: DATI_VUOTI, avvisi: [],
};

// ── Cache ──────────────────────────────────────────────────────

async function leggiCache(db: D1Database, piva: string): Promise<RisultatoFonte | null> {
  try {
    const riga = await db
      .prepare(
        `SELECT payload FROM lookup_piva_cache
          WHERE piva = ?1 AND creato_il > datetime('now', ?2)`,
      )
      .bind(piva, `-${CACHE_GIORNI} days`)
      .first<{ payload: string }>();
    return riga ? (JSON.parse(riga.payload) as RisultatoFonte) : null;
  } catch {
    return null;   // cache assente o illeggibile: si interroga la fonte
  }
}

async function scriviCache(db: D1Database, piva: string, risultato: RisultatoFonte): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO lookup_piva_cache (piva, fonte, payload, creato_il)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(piva) DO UPDATE SET
           fonte = excluded.fonte, payload = excluded.payload, creato_il = excluded.creato_il`,
      )
      .bind(piva, risultato.fonte, JSON.stringify(risultato))
      .run();
  } catch {
    // La cache è un'ottimizzazione: se non si scrive, pazienza.
  }
}

// ── Limite orario per tenant ───────────────────────────────────
// Il contatore è il registro stesso: ogni ricerca è tracciata con
// azione LOOKUP_ANAGRAFICA, quindi contare il registro È contare l'uso.

export async function limiteSuperato(db: D1Database, tenantId: string): Promise<boolean> {
  try {
    const riga = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log
          WHERE tenant_id = ?1 AND azione = 'LOOKUP_ANAGRAFICA'
            AND creato_il > datetime('now', '-1 hour')`,
      )
      .bind(tenantId)
      .first<{ n: number }>();
    return (riga?.n ?? 0) >= LIMITE_ORARIO;
  } catch {
    return false;
  }
}

// ── Cascata ────────────────────────────────────────────────────

export async function cercaAnagrafica(env: Env, pivaGrezza: string): Promise<RispostaLookup> {
  const formale = normalizzaPiva(pivaGrezza);
  if (!formale.valida) return { esito: 'partita_iva_non_valida', ...VUOTA };
  const piva = formale.piva;

  const daCache = await leggiCache(env.DB, piva);
  if (daCache) {
    return {
      esito: 'trovato',
      fonte: daCache.fonte,
      affidabilita: daCache.affidabilita,
      dati: daCache.dati,
      avvisi: daCache.avvisi,
    };
  }

  const esito: EsitoFonte = env.VIES_FIXTURES === '1' ? cercaSuViesFinto(piva) : await cercaSuVies(piva);

  if (esito.stato === 'trovato') {
    await scriviCache(env.DB, piva, esito.risultato);
    return {
      esito: 'trovato',
      fonte: esito.risultato.fonte,
      affidabilita: esito.risultato.affidabilita,
      dati: esito.risultato.dati,
      avvisi: esito.risultato.avvisi,
    };
  }

  // Se la fonte non ha risposto non possiamo dire «non esiste».
  return { esito: esito.stato === 'non_disponibile' ? 'fonte_non_disponibile' : 'non_trovato', ...VUOTA };
}
