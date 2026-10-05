/**
 * Contify Timesheet — sotto-programma montato su /api/ts (TS-M0).
 *
 * Passa dalla stessa catena di AR: autenticazione, poi controllo dei moduli
 * (lib/moduli.ts): qui arrivano solo utenti di uno studio con Timesheet e
 * con un ruolo Timesheet (o che amministrano lo studio). In TS-M0 c'è una
 * sola rotta di servizio; registrazioni, clienti e servizi arrivano in TS-M1.
 */

import { Hono } from 'hono';
import type { Env, Variabili } from '../lib/tipi';
import { statoEffettivo } from '../lib/moduli';
import { statoValido } from '../lib/licenza';

export const tsApp = new Hono<{ Bindings: Env; Variables: Variabili }>();

/** Stato del modulo per l'utente corrente: serve al client e alle prove. */
tsApp.get('/stato', (c) => {
  const u = c.get('utente');
  const moduli = c.get('moduli');
  const stato = moduli.TS ? statoEffettivo(statoValido(c.get('tenantStato')), moduli.TS) : null;
  return c.json({
    modulo: 'TS',
    stato,
    tsRuolo: u.ts_ruolo ?? null,
    amministratore: u.amministratore === 1,
  });
});
