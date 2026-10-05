import { describe, expect, it } from 'vitest';
import {
  ROTTE_AR,
  ROTTE_COMUNI,
  ROTTE_TS,
  classeDellaRotta,
  moduliDaRighe,
  rottaInElenco,
  statoEffettivo,
  verdettoModulo,
  type ModuliStudio,
} from '../worker/src/lib/moduli';
import { rotteRegistrate } from '../worker/src/index';

// ── TS-M0: moduli della piattaforma e accessi per utente ────────

describe('statoEffettivo: il peggiore fra stato dello studio e stato del modulo', () => {
  it('attivo + attivo = attivo', () => {
    expect(statoEffettivo('attivo', 'attivo')).toBe('attivo');
  });
  it('lo studio sospeso sospende anche un modulo attivo', () => {
    expect(statoEffettivo('sospeso', 'attivo')).toBe('sospeso');
  });
  it('un modulo cessato è cessato anche con lo studio attivo', () => {
    expect(statoEffettivo('attivo', 'cessato')).toBe('cessato');
  });
  it('cessato vince su sospeso in entrambi i versi', () => {
    expect(statoEffettivo('cessato', 'sospeso')).toBe('cessato');
    expect(statoEffettivo('sospeso', 'cessato')).toBe('cessato');
  });
});

describe('moduliDaRighe: righe di moduli_tenant → moduli dello studio', () => {
  it('nessuna riga = rete di sicurezza: AR attivo, TS assente', () => {
    expect(moduliDaRighe([])).toEqual({ AR: 'attivo', TS: null });
  });
  it('solo la riga TS: AR non acquistato', () => {
    expect(moduliDaRighe([{ modulo: 'TS', stato: 'attivo' }])).toEqual({ AR: null, TS: 'attivo' });
  });
  it('entrambe le righe, con i loro stati', () => {
    expect(moduliDaRighe([{ modulo: 'AR', stato: 'cessato' }, { modulo: 'TS', stato: 'sospeso' }]))
      .toEqual({ AR: 'cessato', TS: 'sospeso' });
  });
  it('uno stato imprevisto sulla riga degrada ad attivo, come per lo studio', () => {
    expect(moduliDaRighe([{ modulo: 'AR', stato: 'boh' }])).toEqual({ AR: 'attivo', TS: null });
  });
});

describe('classeDellaRotta: ogni rotta autenticata appartiene a un modulo o è comune', () => {
  it('le rotte /api/ts/* sono di Timesheet', () => {
    expect(classeDellaRotta('/api/ts/registrazioni')).toBe('TS');
    expect(classeDellaRotta('/api/ts')).toBe('TS');
  });
  it('autenticazione, utenti, backup, audit, assistenza, novità e logo sono comuni', () => {
    expect(classeDellaRotta('/api/auth/io')).toBe('COMUNE');
    expect(classeDellaRotta('/api/auth/sessioni/abc/chiudi')).toBe('COMUNE');
    expect(classeDellaRotta('/api/utenti')).toBe('COMUNE');
    expect(classeDellaRotta('/api/utenti/usr_1/reset-password')).toBe('COMUNE');
    expect(classeDellaRotta('/api/backup/scarica')).toBe('COMUNE');
    expect(classeDellaRotta('/api/audit/export')).toBe('COMUNE');
    expect(classeDellaRotta('/api/assistenza/t_1/messaggi')).toBe('COMUNE');
    expect(classeDellaRotta('/api/novita')).toBe('COMUNE');
    expect(classeDellaRotta('/api/studio/logo')).toBe('COMUNE');
  });
  it('le altre rotte di /api/studio/* sono di AR', () => {
    expect(classeDellaRotta('/api/studio/persone')).toBe('AR');
    expect(classeDellaRotta('/api/studio/autovalutazioni/av_1/firma')).toBe('AR');
    expect(classeDellaRotta('/api/studio/professionisti')).toBe('AR');
  });
  it('clienti, fascicoli, ai, lookup e simili sono di AR', () => {
    expect(classeDellaRotta('/api/clienti/cli_1')).toBe('AR');
    expect(classeDellaRotta('/api/fascicoli')).toBe('AR');
    expect(classeDellaRotta('/api/ai/chat')).toBe('AR');
    expect(classeDellaRotta('/api/lookup/piva/01234567890')).toBe('AR');
  });
  it('una rotta non elencata vale AR: il caso più restrittivo per chi ha solo Timesheet', () => {
    expect(classeDellaRotta('/api/qualcosa-di-nuovo')).toBe('AR');
  });
});

describe('copertura: ogni rotta autenticata registrata sta in ESATTAMENTE uno dei tre elenchi', () => {
  const pubbliche = ['/api/auth/login', '/api/auth/logout', '/api/auth/password-dimenticata', '/api/auth/reset-password'];
  const autenticate = rotteRegistrate().filter((r) =>
    r.method !== 'ALL'
    && r.path.startsWith('/api/')
    && !r.path.startsWith('/api/pubblico/')
    && !r.path.startsWith('/api/console/')
    && !pubbliche.includes(r.path));

  it('ci sono rotte autenticate da classificare', () => {
    expect(autenticate.length).toBeGreaterThan(100);
  });

  it('nessuna rotta scoperta e nessuna in due elenchi', () => {
    const problemi: string[] = [];
    for (const r of autenticate) {
      const n = [ROTTE_TS, ROTTE_COMUNI, ROTTE_AR].filter((elenco) => rottaInElenco(elenco, r.path)).length;
      if (n !== 1) problemi.push(`${r.method} ${r.path} → in ${n} elenchi`);
    }
    expect(problemi).toEqual([]);
  });
});

describe('verdettoModulo: chi può chiamare cosa', () => {
  const entrambi: ModuliStudio = { AR: 'attivo', TS: 'attivo' };
  const soloAr: ModuliStudio = { AR: 'attivo', TS: null };
  const soloTs: ModuliStudio = { AR: null, TS: 'attivo' };
  const collabAr = { amministratore: 0, accesso_ar: 1, ts_ruolo: null };
  const collabTs = { amministratore: 0, accesso_ar: 0, ts_ruolo: 'COLLABORATORE' as const };
  const admin = { amministratore: 1, accesso_ar: 0, ts_ruolo: null };
  const v = (path: string, moduli: ModuliStudio, utente: Parameters<typeof verdettoModulo>[0]['utente'], statoStudio: 'attivo' | 'sospeso' | 'cessato' = 'attivo', metodo = 'GET') =>
    verdettoModulo({ path, metodo, statoStudio, moduli, utente });

  it('studio con solo AR: le rotte di AR passano, quelle di Timesheet no (modulo_non_attivo)', () => {
    expect(v('/api/clienti', soloAr, collabAr)).toBeNull();
    expect(v('/api/ts/registrazioni', soloAr, collabAr)?.codice).toBe('modulo_non_attivo');
  });

  it('studio con solo Timesheet: le rotte di AR sono rifiutate anche a chi amministra', () => {
    expect(v('/api/clienti', soloTs, admin)?.codice).toBe('modulo_non_attivo');
    expect(v('/api/ts/registrazioni', soloTs, admin)).toBeNull();
  });

  it('utente senza accesso ad AR in uno studio con entrambi: modulo_non_consentito su AR, ok su TS', () => {
    expect(v('/api/fascicoli', entrambi, collabTs)?.codice).toBe('modulo_non_consentito');
    expect(v('/api/ts/registrazioni', entrambi, collabTs)).toBeNull();
  });

  it('utente senza ruolo Timesheet: modulo_non_consentito su TS, ok su AR', () => {
    expect(v('/api/ts/registrazioni', entrambi, collabAr)?.codice).toBe('modulo_non_consentito');
    expect(v('/api/clienti', entrambi, collabAr)).toBeNull();
  });

  it('chi amministra accede a tutti i moduli dello studio, qualunque siano i suoi flag', () => {
    expect(v('/api/clienti', entrambi, admin)).toBeNull();
    expect(v('/api/ts/registrazioni', entrambi, admin)).toBeNull();
  });

  it('le voci comuni seguono solo lo stato dello studio', () => {
    expect(v('/api/utenti', soloTs, collabTs)).toBeNull();
    expect(v('/api/auth/io', soloTs, collabTs)).toBeNull();
    expect(v('/api/utenti', soloTs, collabTs, 'sospeso', 'POST')?.codice).toBe('tenant_sospeso');
    expect(v('/api/utenti', soloTs, collabTs, 'cessato')?.codice).toBe('tenant_cessato');
    expect(v('/api/auth/io', soloTs, collabTs, 'cessato')).toBeNull();
  });

  it('modulo sospeso: sola lettura su quel modulo, l’altro modulo lavora', () => {
    const arSospeso: ModuliStudio = { AR: 'sospeso', TS: 'attivo' };
    expect(v('/api/clienti', arSospeso, admin)).toBeNull();
    expect(v('/api/clienti', arSospeso, admin, 'attivo', 'POST')?.codice).toBe('tenant_sospeso');
    expect(v('/api/ts/registrazioni', arSospeso, admin, 'attivo', 'POST')).toBeNull();
  });

  it('modulo cessato: chiuso quel modulo, anche in lettura; le voci comuni restano', () => {
    const arCessato: ModuliStudio = { AR: 'cessato', TS: 'attivo' };
    expect(v('/api/clienti', arCessato, admin)?.codice).toBe('tenant_cessato');
    expect(v('/api/ts/registrazioni', arCessato, admin)).toBeNull();
    expect(v('/api/utenti', arCessato, admin)).toBeNull();
  });

  it('studio sospeso: tutti i moduli in sola lettura, anche se le righe dicono attivo', () => {
    expect(v('/api/ts/registrazioni', entrambi, admin, 'sospeso', 'POST')?.codice).toBe('tenant_sospeso');
    expect(v('/api/ts/registrazioni', entrambi, admin, 'sospeso', 'GET')).toBeNull();
  });

  it('studio senza righe (rete di sicurezza): si comporta come solo AR', () => {
    const rete = moduliDaRighe([]);
    expect(v('/api/clienti', rete, collabAr)).toBeNull();
    expect(v('/api/ts/registrazioni', rete, collabAr)?.codice).toBe('modulo_non_attivo');
  });

  it('un utente senza flag espliciti (riga creata dal codice precedente) accede ad AR', () => {
    expect(v('/api/clienti', soloAr, { amministratore: 0 })).toBeNull();
  });
});
