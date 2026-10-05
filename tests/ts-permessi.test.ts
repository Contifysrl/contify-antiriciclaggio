import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { soloTitolareTs } from '../worker/src/ts/permessi';

// ── TS-M0: i permessi di Timesheet seguono utenti.ts_ruolo, non il ruolo AR ──

function appCon(utente: Record<string, unknown>) {
  const app = new Hono<{ Variables: { utente: any } }>();
  app.use('*', async (c, next) => { c.set('utente', utente); await next(); });
  app.get('/riservata', soloTitolareTs, (c) => c.json({ ok: true }));
  return app;
}

describe('soloTitolareTs', () => {
  it('passa chi ha ts_ruolo TITOLARE, anche se in AR è solo collaboratore', async () => {
    const r = await appCon({ ruolo: 'COLLABORATORE', amministratore: 0, ts_ruolo: 'TITOLARE' }).request('/riservata');
    expect(r.status).toBe(200);
  });

  it('rifiuta il collaboratore Timesheet con 403', async () => {
    const r = await appCon({ ruolo: 'TITOLARE', amministratore: 0, ts_ruolo: 'COLLABORATORE' }).request('/riservata');
    expect(r.status).toBe(403);
  });

  it('il ruolo AR TITOLARE non basta: senza ts_ruolo è 403', async () => {
    const r = await appCon({ ruolo: 'TITOLARE', amministratore: 0, ts_ruolo: null }).request('/riservata');
    expect(r.status).toBe(403);
  });

  it('chi amministra lo studio passa comunque', async () => {
    const r = await appCon({ ruolo: 'TITOLARE', amministratore: 1, ts_ruolo: null }).request('/riservata');
    expect(r.status).toBe(200);
  });
});
