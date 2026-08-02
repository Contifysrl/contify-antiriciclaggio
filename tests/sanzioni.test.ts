import { describe, expect, it } from 'vitest';
import {
  confrontaNomi,
  leggiCsv,
  parseListaOfac,
  parseListaOnu,
  parseListaUe,
  tokenUtili,
  tokenizzaNome,
} from '../worker/src/lib/sanzioni';
import { codicePaese, paeseAltoRischio } from '../worker/src/domain/norme';

describe('Normalizzazione dei nomi (AR-M7)', () => {
  it('toglie accenti, punteggiatura e maiuscole irregolari', () => {
    expect(tokenizzaNome('Nicolás  Maduro-Moros')).toEqual(['NICOLAS', 'MADURO', 'MOROS']);
    expect(tokenizzaNome("Al-Qaida nell'Africa Occidentale")).toEqual(['AL', 'QAIDA', 'NELL', 'AFRICA', 'OCCIDENTALE']);
  });

  it('scarta forme societarie e particelle, ma mai tutto', () => {
    expect(tokenUtili(tokenizzaNome('Acme Export Trading S.r.l.'))).toEqual(['ACME', 'EXPORT']);
    expect(tokenUtili(tokenizzaNome('La S.r.l.'))).toEqual(['LA', 'S', 'R', 'L']);
  });
});

describe('Confronto dei nomi', () => {
  const t = (s: string) => tokenUtili(tokenizzaNome(s));

  it('riconosce lo stesso nome in ordine diverso', () => {
    expect(confrontaNomi(t('Rossi Mario'), t('MARIO ROSSI')).corrisponde).toBe(true);
  });

  it('riconosce il nome contenuto (patronimico in più nella lista)', () => {
    expect(confrontaNomi(t('Ivanov Konstantin'), t('IVANOV PETROV KONSTANTIN')).corrisponde).toBe(true);
  });

  it('NON scatta sul solo cognome: troppo debole', () => {
    expect(confrontaNomi(t('Rossi'), t('MARIO ROSSI COLLAUDO')).corrisponde).toBe(false);
  });

  it('NON scatta su nomi che condividono una parola qualunque', () => {
    expect(confrontaNomi(t('Costruzioni Verdi S.r.l.'), t('VERDI GIUSEPPE')).corrisponde).toBe(false);
  });

  it('le forme societarie non contano come somiglianza', () => {
    expect(confrontaNomi(t('Alfa S.r.l.'), t('BETA S.R.L.')).corrisponde).toBe(false);
  });
});

describe('Parser delle liste', () => {
  it('UE: CSV con separatore ; e colonne cercate per nome', () => {
    const csv = [
      'FileGenerationDate;Entity_LogicalId;Entity_SubjectType;NameAlias_WholeName;BirthDate_BirthDate',
      '2026-08-01;123;person;Ali Ahmed Mohamed;1970-02-03',
      '2026-08-01;124;enterprise;Acme Export Trading FZE;',
      '2026-08-01;125;person;;',   // senza nome: scartata
    ].join('\n');
    const voci = parseListaUe(csv);
    expect(voci).toHaveLength(2);
    expect(voci[0]).toMatchObject({ fonte: 'UE', id: '123', tipo: 'P', nascita: '1970-02-03' });
    expect(voci[1]).toMatchObject({ fonte: 'UE', tipo: 'E' });
  });

  it('ONU: individui con alias ed entità, via regex tolleranti', () => {
    const xml = `<CONSOLIDATED_LIST><INDIVIDUALS>
      <INDIVIDUAL><DATAID>6908555</DATAID><FIRST_NAME>MOHAMMAD</FIRST_NAME><SECOND_NAME>NAIM</SECOND_NAME>
        <INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Mullah Naim Barich</ALIAS_NAME></INDIVIDUAL_ALIAS>
        <INDIVIDUAL_DATE_OF_BIRTH><TYPE_OF_DATE>APPROXIMATELY</TYPE_OF_DATE><YEAR>1975</YEAR></INDIVIDUAL_DATE_OF_BIRTH>
      </INDIVIDUAL></INDIVIDUALS>
      <ENTITIES><ENTITY><DATAID>110</DATAID><FIRST_NAME>RADIO KOREA TRADING</FIRST_NAME></ENTITY></ENTITIES>
    </CONSOLIDATED_LIST>`;
    const voci = parseListaOnu(xml);
    expect(voci.map((v) => v.nome)).toEqual(['MOHAMMAD NAIM', 'Mullah Naim Barich', 'RADIO KOREA TRADING']);
    expect(voci[0].nascita).toBe('1975');
    expect(voci[2].tipo).toBe('E');
  });

  it('OFAC: CSV con virgole nei campi tra virgolette', () => {
    const csv = [
      '540,"AEROCARIBBEAN AIRLINES","-0-","CUBA",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"-0-"',
      '7160,"IVANOV, Petrov Konstantin","individual","SDGT",-0-,-0-,-0-,-0-,-0-,-0-,-0-,"DOB 1975"',
    ].join('\n');
    const voci = parseListaOfac(csv);
    expect(voci).toHaveLength(2);
    expect(voci[0]).toMatchObject({ id: '540', nome: 'AEROCARIBBEAN AIRLINES' });
    expect(voci[1].tipo).toBe('P');
  });

  it('leggiCsv gestisce virgolette doppie e ritorni a capo Windows', () => {
    const righe = leggiCsv('a;"b;con punto e virgola";"virgolette ""interne"""\r\nc;d;e', ';');
    expect(righe).toEqual([['a', 'b;con punto e virgola', 'virgolette "interne"'], ['c', 'd', 'e']]);
  });
});

describe('Paesi terzi ad alto rischio (Reg. 2025/1184)', () => {
  it('riconosce codici ISO e nomi scritti a mano', () => {
    expect(codicePaese('IR')).toBe('IR');
    expect(codicePaese('monaco')).toBe('MC');
    expect(codicePaese('Corea del Nord')).toBe('KP');
    expect(codicePaese('')).toBeNull();
  });

  it('applica la lista solo dalla data di vigenza', () => {
    expect(paeseAltoRischio('MC', '2026-08-02').altoRischio).toBe(true);
    expect(paeseAltoRischio('MC', '2025-01-01').altoRischio).toBe(false);
    expect(paeseAltoRischio('IT', '2026-08-02').altoRischio).toBe(false);
  });

  it('riporta fonte e decorrenza per il verbale', () => {
    const e = paeseAltoRischio('VE', '2026-08-02');
    expect(e.nomePaese).toBe('Venezuela');
    expect(e.fonte).toContain('2025/1184');
    expect(e.vigenteDal).toBe('2025-08-05');
  });
});
