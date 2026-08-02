// ── Ciclo di vita commerciale del tenant (AR-M6) ───────────────
//
// Come in Assist: NON esiste una chiave di licenza da digitare. Contify AR
// gira sull'infrastruttura Contify e la "chiave" è la riga in `tenants`
// più le credenziali. Qui vive il CICLO DI VITA COMMERCIALE dello studio
// (attivo / sospeso / cessato) in un solo punto di controllo; lo stato si
// amministra a database, mai dall'applicazione.
//
// Il piano è UNO SOLO, tutto compreso (deciso con Simone il 2.8.2026): la
// colonna tenants.piano resta nello schema ma non c'è alcun gating di
// funzioni. Se un giorno serviranno piani distinti, il punto di innesto
// è questo file.
//
// La sospensione ferma le SCRITTURE, non l'accesso ai dati: i dati
// restano dello studio e Contify li tratta da responsabile (DPA).
// Consultazione, export del registro e download dei backup continuano
// a funzionare. A servizio cessato l'accesso è chiuso (restano le rotte
// di autenticazione: nessuno deve rimanere chiuso fuori dal proprio
// account, e il logout deve sempre funzionare).

export const STATI_TENANT = ['attivo', 'sospeso', 'cessato'] as const;
export type StatoTenant = (typeof STATI_TENANT)[number];

export function statoValido(s: string | null | undefined): StatoTenant {
  return (STATI_TENANT as readonly string[]).includes(s ?? '') ? (s as StatoTenant) : 'attivo';
}

/** Rotte permesse in QUALSIASI stato, anche a tenant cessato. */
function esenteSempre(path: string): boolean {
  // Login, logout, cambio password, reset: l'account resta dell'utente.
  return path.startsWith('/api/auth/');
}

/** Rotte non-GET ancora permesse quando il tenant è sospeso. */
function esenteInSospensione(path: string): boolean {
  return (
    // Deve restare possibile chiedere assistenza ("ho pagato, riattivami").
    path.startsWith('/api/assistenza') ||
    // Lo studio può portarsi via una fotografia dei propri dati
    // (il backup manuale; il download è già un GET). NON il ripristino
    // né l'eliminazione: sono scritture sull'archivio.
    path === '/api/backup'
  );
}

export type BloccoLicenza = { status: 403; errore: string; codice: string };

/**
 * Verdetto del blocco di stato, come funzione pura (testabile senza far
 * girare il Worker). null = la richiesta prosegue.
 */
export function bloccoPerStato(stato: StatoTenant, metodo: string, path: string): BloccoLicenza | null {
  if (esenteSempre(path)) return null;

  if (stato === 'cessato') {
    return {
      status: 403,
      codice: 'tenant_cessato',
      errore: 'Il servizio non è più attivo per questo studio. Contatta Contify per riattivarlo.',
    };
  }

  if (stato === 'sospeso' && metodo !== 'GET' && !esenteInSospensione(path)) {
    return {
      status: 403,
      codice: 'tenant_sospeso',
      errore:
        'Il servizio è temporaneamente in sola lettura: puoi consultare ed esportare i dati, '
        + 'ma non modificarli. Contatta Contify per riattivare le modifiche.',
    };
  }

  return null;
}

/**
 * Giorni che mancano alla scadenza del canone: positivo prima, 0 il
 * giorno stesso, negativo dopo. null se non c'è scadenza. Confronto fra
 * mezzanotti UTC: le date del contratto sono giorni di calendario, non
 * istanti, e col fuso italiano un confronto ingenuo sbaglierebbe di un
 * giorno per tutta la sera.
 */
export function giorniAllaScadenza(scadenza: string | null | undefined, adesso = new Date()): number | null {
  if (!scadenza) return null;
  const fine = Date.parse(`${scadenza.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(fine)) return null;
  const oggi = Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate());
  return Math.round((fine - oggi) / 86_400_000);
}

/**
 * Soglie di avviso a Contify. Il cron gira una volta al giorno e
 * confronta i giorni residui con questi valori esatti: soglie discrete
 * = nessuno stato da memorizzare e nessun doppio invio. Dopo la
 * scadenza si continua a ricordarlo, ma diradando.
 */
export const SOGLIE_AVVISO_CANONE = [30, 15, 7, 1, 0, -7, -14, -30] as const;
