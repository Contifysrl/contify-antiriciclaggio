/**
 * Permessi di Contify Timesheet (TS-M0).
 *
 * Chi può fare cosa in Timesheet si decide con `utenti.ts_ruolo`, separato
 * dal ruolo AR: in AR «TITOLARE» significa professionista obbligato e conta
 * come posto pagato, mentre chi guarda i cruscotti delle ore può essere
 * un'altra persona. I controlli di AR (`soloTitolare`, `puoScrivere`,
 * `soloAmministratore`) non cambiano significato. Chi amministra lo studio
 * accede sempre a tutti i moduli, qui compreso.
 */

import type { Context, Next } from 'hono';
import type { Env, Variabili } from '../lib/tipi';

type Ctx = Context<{ Bindings: Env; Variables: Variabili }>;

export function titolareTs(u: { amministratore?: number | null; ts_ruolo?: string | null } | undefined): boolean {
  return !!u && (u.amministratore === 1 || u.ts_ruolo === 'TITOLARE');
}

/** Cruscotti, configurazioni, proforma: solo chi dirige lo studio in Timesheet. */
export async function soloTitolareTs(c: Ctx, next: Next): Promise<Response | void> {
  const u = c.get('utente');
  if (!u) return c.json({ errore: 'Non autenticato' }, 401);
  if (!titolareTs(u)) {
    return c.json({ errore: 'Operazione riservata a chi dirige lo studio in Contify Timesheet.' }, 403);
  }
  await next();
}
