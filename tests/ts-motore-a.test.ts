import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { interpretaLocale, type Contesto, type Proposta } from '../worker/src/ts/interpretazione';
import { estraiJson, fondi, interpretaConMotoreA, preparaRichiesta, validaRisposta, type ChiamaModello } from '../worker/src/ts/motore-a';
import type { InsiemeFrasi } from './lib/valuta-frasi';

// ── TS-M1 passo 2: motore A (modello presso Cloudflare) ──
// Regola di fusione, nata dalla prova del 5/10/2026 sull'insieme principale:
// usata al posto del locale, la risposta del modello peggiorava tutto (3 errori
// sul cliente, 14 silenziosi, domande superflue dove il locale era certo).
// Quindi: il locale decide ciò che è certo; il modello può solo SUGGERIRE, cioè
// mettere un candidato in testa dove il locale non ha deciso. Mai certo da solo.

const insieme: InsiemeFrasi = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ts-frasi.json'), 'utf8'));
const ctx: Contesto = { clienti: insieme.clienti, servizi: insieme.servizi, oggi: insieme.oggi };

function rispostaModello(reg: Array<Partial<{ cliente: string | null; candidati_cliente: string[]; servizio: string | null; candidati_servizio: string[]; minuti: number | null; data: string | null; nota: string | null }>>) {
  return { registrazioni: reg.map((r) => ({ cliente: null, candidati_cliente: [], servizio: null, candidati_servizio: [], minuti: null, data: null, nota: null, ...r })) };
}
const ids = (p: Proposta) => ({ c: p.cliente.id, cc: p.cliente.candidati.map((x) => x.id), s: p.servizio.id, sc: p.servizio.candidati.map((x) => x.id), m: p.minuti, d: p.data, motore: p.motore });

describe('fondi (locale + modello)', () => {
  it('non tocca un cliente o un servizio che il locale ha deciso, anche se il modello li mette in dubbio', () => {
    const locali = interpretaLocale('2 ore di contabilità per Omega', ctx); // c18 e s1 certi
    const { clientiInviati, fatti } = preparaRichiesta('2 ore di contabilità per Omega', ctx, locali);
    const m = validaRisposta(rispostaModello([{ candidati_cliente: ['c18'], candidati_servizio: ['s1', 's6'] }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(ids(out[0])).toMatchObject({ c: 'c18', s: 's1', m: 120, d: '2026-10-05', motore: 'LOCALE' });
  });

  it('non lascia che il modello scelga fra i candidati del locale: mette solo il suo in testa', () => {
    const locali = interpretaLocale('2 ore di contabilità per Edilnova', ctx); // c24/c25 ambigui
    expect(locali[0].cliente.id).toBeNull();
    const { clientiInviati, fatti } = preparaRichiesta('2 ore di contabilità per Edilnova', ctx, locali);
    const m = validaRisposta(rispostaModello([{ cliente: 'c25', servizio: 's1' }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(out[0].cliente.id).toBeNull();
    expect(out[0].cliente.candidati.map((x) => x.id)).toEqual(['c25', 'c24']);
    expect(out[0].servizio.id).toBe('s1');
    expect(out[0].motore).toBe('AI');
  });

  it('un nome di battesimo resta una domanda anche se il modello è sicuro', () => {
    const locali = interpretaLocale('Mario, 730, 2 ore', ctx); // c27 solo candidato
    const { clientiInviati, fatti } = preparaRichiesta('Mario, 730, 2 ore', ctx, locali);
    const m = validaRisposta(rispostaModello([{ cliente: 'c27', servizio: 's3', minuti: 120 }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(ids(out[0])).toMatchObject({ c: null, cc: ['c27'], s: 's3', m: 120 });
  });

  it('dove il locale non ha trovato nessun cliente, il modello non ne riceve e non ne introduce', () => {
    const locali = interpretaLocale('2 ore di contabilità per Zeta Quadra', ctx); // nessun candidato
    expect(locali[0].cliente.candidati).toEqual([]);
    const { messaggi, clientiInviati, fatti } = preparaRichiesta('2 ore di contabilità per Zeta Quadra', ctx, locali);
    expect(clientiInviati).toEqual([]); // mai l'elenco dello studio
    expect(messaggi[1].content).toContain('(nessuno');
    expect(messaggi[1].content).not.toContain('Omega Spa');
    // Anche se il modello rispondesse con un id valido (qui ne forziamo uno), non entra: l'elenco inviato era vuoto.
    const m = validaRisposta(rispostaModello([{ cliente: 'c18', candidati_cliente: ['c16'], servizio: 's1' }]), ctx, [{ id: 'c18', nome: 'Omega Spa' }, { id: 'c16', nome: 'Beta' }], fatti)!;
    const out = fondi(locali, m, ctx);
    expect(out[0].cliente).toEqual({ id: null, candidati: [] });
    expect(out[0].motore).toBe('LOCALE');
  });

  it('un servizio che il locale non ha trovato o trova ambiguo resta una domanda: il modello ordina i candidati', () => {
    const locali = interpretaLocale('F24 IVA per Esempio Srl, 20 minuti', ctx); // s2/s7 ambigui
    expect(locali[0].servizio.id).toBeNull();
    const { clientiInviati, fatti } = preparaRichiesta('F24 IVA per Esempio Srl, 20 minuti', ctx, locali);
    const m = validaRisposta(rispostaModello([{ cliente: 'c15', servizio: 's7' }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(out[0].servizio.id).toBeNull();
    expect(out[0].servizio.candidati.map((x) => x.id)).toEqual(['s7', 's2']);

    const senza = interpretaLocale('2 ore per Omega', ctx); // nessun servizio
    const r2 = preparaRichiesta('2 ore per Omega', ctx, senza);
    const m2 = validaRisposta(rispostaModello([{ cliente: 'c18', servizio: 's6', candidati_servizio: ['s1'] }]), ctx, r2.clientiInviati, r2.fatti)!;
    const out2 = fondi(senza, m2, ctx);
    expect(out2[0].servizio.id).toBeNull();
    expect(out2[0].servizio.candidati.map((x) => x.id)).toEqual(['s6', 's1']);
  });

  it('minuti, data, nota e numero di registrazioni restano quelli del locale', () => {
    const locali = interpretaLocale('2 ore di contabilità per Omega e Beta Industrie', ctx); // totale senza ripartizione: minuti null
    expect(locali).toHaveLength(2);
    expect(locali[0].minuti).toBeNull();
    const { clientiInviati, fatti } = preparaRichiesta('2 ore di contabilità per Omega e Beta Industrie', ctx, locali);
    const m = validaRisposta(rispostaModello([{ cliente: 'c18', servizio: 's1', minuti: 120 }, { cliente: 'c16', servizio: 's1', minuti: 120 }, { cliente: 'c15', servizio: 's1', minuti: 120 }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.minuti)).toEqual([null, null]);
    expect(out.map((p) => p.data)).toEqual(['2026-10-05', '2026-10-05']);
    expect(out.map((p) => p.nota)).toEqual(locali.map((p) => p.nota));
  });

  it('se la frase non nomina nessun cliente (nessun testo residuo), i clienti inventati dal modello non compaiono', () => {
    const locali = interpretaLocale('Ieri 2 ore di cedolini', ctx);
    expect(locali[0].cliente.candidati).toEqual([]);
    expect(locali[0].nota).toBeNull();
    const { clientiInviati, fatti } = preparaRichiesta('Ieri 2 ore di cedolini', ctx, locali);
    const m = validaRisposta(rispostaModello([{ cliente: 'c20', servizio: 's5' }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(out[0].cliente.candidati).toEqual([]);
    expect(out[0].motore).toBe('LOCALE');
  });

  it('più di quattro clienti suggeriti valgono come «non so»', () => {
    const locali = interpretaLocale('2 ore di contabilità per Edilnova', ctx);
    const { fatti } = preparaRichiesta('2 ore di contabilità per Edilnova', ctx, locali);
    const tanti = ['c01', 'c02', 'c03', 'c04', 'c25'].map((id) => ({ id, nome: id }));
    const m = validaRisposta(rispostaModello([{ cliente: null, candidati_cliente: ['c01', 'c02', 'c03', 'c04', 'c25'], servizio: 's1' }]), ctx, tanti, fatti)!;
    expect(m[0].cliente.candidati).toEqual([]);
    expect(fondi(locali, m, ctx)[0].cliente.candidati.map((x) => x.id)).toEqual(locali[0].cliente.candidati.map((x) => x.id));
  });

  it('il servizio generico suggerito dal modello non entra nemmeno fra i candidati', () => {
    const locali = interpretaLocale('2 ore per Omega', ctx);
    const { clientiInviati, fatti } = preparaRichiesta('2 ore per Omega', ctx, locali);
    const m = validaRisposta(rispostaModello([{ cliente: 'c18', servizio: 's8', candidati_servizio: ['s8', 's6'] }]), ctx, clientiInviati, fatti)!;
    const out = fondi(locali, m, ctx);
    expect(out[0].servizio.candidati.map((x) => x.id)).toEqual(['s6']);
  });
});

describe('interpretaConMotoreA', () => {
  const chiamaCon = (reg: unknown): ChiamaModello => async () => ({ testo: JSON.stringify(reg) });

  it('non chiama il modello se il locale è completo', async () => {
    let chiamate = 0;
    const esito = await interpretaConMotoreA('2 ore di contabilità per Omega', ctx, async () => { chiamate++; return { testo: '{}' }; });
    expect(chiamate).toBe(0);
    expect(esito.aiChiamata).toBe(false);
  });

  it('con una risposta valida fonde: il suggerimento del modello va in testa, il locale resta certo', async () => {
    const esito = await interpretaConMotoreA('2 ore per Omega', ctx, chiamaCon(rispostaModello([{ cliente: 'c18', servizio: 's6' }])));
    expect(esito.aiChiamata).toBe(true);
    expect(esito.ripiego).toBeUndefined();
    expect(ids(esito.proposte[0])).toMatchObject({ c: 'c18', s: null, sc: ['s6'], m: 120, motore: 'AI' });
  });

  it('risposta malformata, vuota o in errore: vale il solo locale', async () => {
    const a = await interpretaConMotoreA('2 ore per Omega', ctx, chiamaCon({ registrazioni: [] }));
    expect(a.ripiego).toBe('risposta non valida');
    expect(ids(a.proposte[0])).toMatchObject({ c: 'c18', s: null, sc: [], motore: 'LOCALE' });
    const b = await interpretaConMotoreA('2 ore per Omega', ctx, async () => { throw new Error('rete'); });
    expect(b.ripiego).toMatch(/errore del modello/);
    expect(b.proposte[0].motore).toBe('LOCALE');
  });

  it('estraiJson tollera testo attorno al JSON', () => {
    expect(estraiJson('Ecco: {"registrazioni":[]} fine')).toEqual({ registrazioni: [] });
    expect(estraiJson('niente')).toBeNull();
  });
});
