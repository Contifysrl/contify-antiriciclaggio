import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { completaInSospeso, interpretaLocale, type Contesto } from '../worker/src/ts/interpretazione';
import { indiceClienti, riconosciClienti, riconosciServizi } from '../worker/src/ts/riconoscitore';
import { parole } from '../worker/src/ts/testo';
import { riepiloga, valutaFrase, type InsiemeFrasi } from './lib/valuta-frasi';

// ── TS-M1 passo 1: interpretazione locale di una frase ──

const insieme: InsiemeFrasi = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ts-frasi.json'), 'utf8'));
const cieco: InsiemeFrasi = { ...insieme, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ts-frasi-cieche.json'), 'utf8')) };
const ctx: Contesto = { clienti: insieme.clienti, servizi: insieme.servizi, oggi: insieme.oggi };

describe('riconosciClienti', () => {
  const indice = indiceClienti(insieme.clienti);
  const migliori = (testo: string) => riconosciClienti(parole(testo), new Set(), indice).slice(0, 3).map((m) => [m.id, Math.round(m.punteggio * 100) / 100]);

  it('una parola unica e distintiva basta', () => {
    expect(migliori('contabilità per Valbrenta')[0]).toEqual(['c08', 1]);
    expect(migliori('omega')[0]).toEqual(['c18', 1]);
  });
  it('una parola comune da sola non basta; in due sì', () => {
    expect(migliori('la farmacia')[0][1]).toBeLessThan(0.86);
    expect(migliori('farmacia centrale')[0]).toEqual(['c34', 0.88]);
  });
  it('clienti che differiscono solo per la forma giuridica hanno lo stesso punteggio', () => {
    const [a, b] = migliori('per Alfa Srl');
    expect(a[1]).toBe(b[1]);
  });
  it('tollera un errore di battitura e parole spezzate o unite', () => {
    expect(migliori('Zampretti')[0][0]).toBe('c02');
    expect(migliori('Zampretti')[0][1]).toBeGreaterThanOrEqual(0.86);
    expect(migliori('edil nova costruzioni')[0][0]).toBe('c25');
    expect(migliori('edil nova costruzioni')[0][1]).toBeGreaterThanOrEqual(0.86);
    expect(migliori('edilnovacostruzioni')[0][0]).toBe('c25');
    expect(migliori('edilnovacostruzioni')[0][1]).toBeGreaterThanOrEqual(0.86);
  });
  it('un nome di battesimo non è mai certo da solo e non somiglia a un altro nome', () => {
    expect(migliori('Marco')[0][1]).toBeLessThan(0.86);
    expect(migliori('Mario').map((m) => m[0])).not.toContain('c26');
  });
  it('gli alias sono certi', () => {
    expect(migliori('il ponte')[0]).toEqual(['c30', 1]);
  });
});

describe('riconosciServizi', () => {
  const servizi = (testo: string) => riconosciServizi(parole(testo), new Set(), insieme.servizi).map((s) => s.id).sort();
  it('radici e parole chiave di più parole', () => {
    expect(servizi('contabilità')).toEqual(['s1']);
    expect(servizi('ho registrato le fatture')).toEqual(['s1']);
    expect(servizi('libro unico')).toEqual(['s5']);
    expect(servizi('prima nota')).toEqual(['s1']);
    expect(servizi('settecentotrenta')).toEqual(['s3']);
  });
  it('più servizi restano più servizi (si chiede)', () => {
    expect(servizi('dichiarazione iva')).toEqual(['s2', 's3']);
    expect(servizi('pratica inps')).toEqual(['s5', 's7']);
  });
  it('il generico non emerge mai', () => {
    expect(servizi('altro')).toEqual([]);
  });
});

describe('interpretaLocale', () => {
  it('frase completa → una proposta completa, oggi', () => {
    const [p] = interpretaLocale('2 ore per Omega Spa, contabilità', ctx);
    expect(p).toMatchObject({ cliente: { id: 'c18' }, servizio: { id: 's1' }, minuti: 120, data: insieme.oggi, motore: 'LOCALE' });
  });
  it('cliente ambiguo → id nullo con i candidati', () => {
    const [p] = interpretaLocale('2 ore di contabilità per Edilnova', ctx);
    expect(p.cliente.id).toBeNull();
    expect(p.cliente.candidati.map((c) => c.id).sort()).toEqual(['c24', 'c25']);
  });
  it('più lavori → più proposte, in ordine', () => {
    const ps = interpretaLocale('2 ore per Omega e 1 ora per Beta Industrie, contabilità', ctx);
    expect(ps.map((p) => [p.cliente.id, p.servizio.id, p.minuti])).toEqual([['c18', 's1', 120], ['c16', 's1', 60]]);
  });
  it('due clienti e una durata → si chiede quanto a ciascuno', () => {
    const ps = interpretaLocale('2 ore di contabilità per Omega e Beta Industrie', ctx);
    expect(ps.map((p) => [p.cliente.id, p.minuti])).toEqual([['c18', null], ['c16', null]]);
  });
  it('nomi di terzi non diventano clienti', () => {
    const ps = interpretaLocale('Cedolino di Mario Bianchi per Omega, 20 minuti', ctx);
    expect(ps).toHaveLength(1);
    expect(ps[0].cliente.id).toBe('c18');
  });
  it('data vaga o futura → si chiede il giorno', () => {
    expect(interpretaLocale('La settimana scorsa 3 ore di bilancio per Beta Industrie', ctx)[0].data).toBeNull();
    expect(interpretaLocale('Contabilità Omega 2 ore domani', ctx)[0].data).toBeNull();
  });
  it('la nota conserva ciò che non è stato riconosciuto', () => {
    const [p] = interpretaLocale('Contabilità Omega, 2 ore, nota: mancano le fatture di settembre', ctx);
    expect(p.nota).toMatch(/mancano/);
    expect(interpretaLocale('2 ore per Omega Spa, contabilità', ctx)[0].nota).toBeNull();
  });
});

describe('completaInSospeso', () => {
  it('la risposta scritta riempie il campo mancante della prima proposta incompleta', () => {
    const [p] = interpretaLocale('2 ore per Omega', ctx);
    expect(p.servizio.id).toBeNull();
    const out = completaInSospeso([p], 'contabilità', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].servizio.id).toBe('s1');
    expect(out[0].minuti).toBe(120);
  });
  it('una risposta con il cliente riempie il cliente', () => {
    const [p] = interpretaLocale('2 ore di contabilità', ctx);
    const out = completaInSospeso([p], 'Omega', ctx);
    expect(out[0].cliente.id).toBe('c18');
  });
  it('una risposta ambigua lascia i candidati', () => {
    const [p] = interpretaLocale('2 ore di contabilità', ctx);
    const out = completaInSospeso([p], 'Edilnova', ctx);
    expect(out[0].cliente.id).toBeNull();
    expect(out[0].cliente.candidati).toHaveLength(2);
  });
});

describe('insieme di prova del passo 0 (motore L)', () => {
  const misura = (ins: InsiemeFrasi) => {
    const c: Contesto = { clienti: ins.clienti, servizi: ins.servizi, oggi: ins.oggi };
    const v = ins.frasi.filter((f) => f.tipo !== 'audio').map((f) => valutaFrase(f, interpretaLocale(f.testo, c), ins.oggi));
    return { r: riepiloga(v), v };
  };

  it('insieme principale: zero errori silenziosi sul cliente, errori silenziosi ≤ 3%, buone ≥ 90%', () => {
    const { r, v } = misura(insieme);
    const silenziose = v.filter((x) => x.esito === 'silenziosa').map((x) => `${x.id}: ${x.dettagli.join('; ')}`);
    expect(r.erroriCliente, silenziose.join('\n')).toBe(0);
    expect(r.quotaSilenziose, silenziose.join('\n')).toBeLessThanOrEqual(0.03);
    expect(r.quotaBuone).toBeGreaterThanOrEqual(0.9);
  });

  it('insieme cieco (scritto senza vedere il riconoscitore): zero errori sul cliente, silenziosi ≤ 3%, buone ≥ 90%', () => {
    const { r, v } = misura(cieco);
    const silenziose = v.filter((x) => x.esito === 'silenziosa').map((x) => `${x.id}: ${x.dettagli.join('; ')}`);
    expect(r.erroriCliente, silenziose.join('\n')).toBe(0);
    expect(r.quotaSilenziose, silenziose.join('\n')).toBeLessThanOrEqual(0.03);
    expect(r.quotaBuone).toBeGreaterThanOrEqual(0.9);
  });
});
