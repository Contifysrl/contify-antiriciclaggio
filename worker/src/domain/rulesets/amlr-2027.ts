/**
 * RULESET «AMLR 2027» (AR-M17 scheletro → AR-M20-04 titolarità effettiva completa).
 *
 * Il Regolamento (UE) 2024/1624 (AMLR) si applica dal 10.7.2027 e sostituisce
 * il DLgs. 231/2007 per la parte sostanziale. Le regole tecniche CNDCEC
 * andranno riemanate: finché non esistono, questo ruleset EREDITA tabelle,
 * pesi e soglie del 2025 e cambia SOLO ciò che il Regolamento fissa già
 * direttamente, cioè la titolarità effettiva (Capo IV):
 *  - art. 52: «ownership interest of 25% or more» — il 25% esatto basta;
 *    la partecipazione indiretta si calcola moltiplicando lungo la catena e
 *    sommando i percorsi, «unless Article 54 applies»;
 *  - art. 51: il controllo «via other means» si individua INDIPENDENTEMENTE
 *    e in parallelo alla proprietà (non più in cascata come l'art. 20 co. 3);
 *  - art. 53(2)(c): controllo tramite partecipazione = «50% più uno»;
 *  - art. 54: strutture a più livelli in cui proprietà e controllo
 *    coesistono — sono titolari effettivi (a) chi controlla, direttamente o
 *    indirettamente, un'entità con quota diretta rilevante nel cliente, e
 *    (b) chi ha una quota rilevante nell'entità che controlla il cliente;
 *  - art. 63(4) (mutatis mutandis art. 20 co. 5): in assenza, i dirigenti
 *    di livello superiore, con motivazione.
 *
 * Non è selezionabile per le valutazioni del rischio (non è nel catalogo dei
 * ruleset esposti): il motore della titolarità effettiva lo sceglie per data
 * e i test lo dimostrano con una data futura. Quando le regole tecniche 2027
 * usciranno, questo file diventa un ruleset completo e il catalogo lo espone.
 */

import type { Ruleset } from '../types';
import { CNDCEC_2025 } from './cndcec-2025';

export const AMLR_2027: Ruleset = {
  ...CNDCEC_2025,
  id: 'amlr-2027',
  etichetta: 'Regolamento (UE) 2024/1624 — scheletro in attesa delle regole tecniche',
  fonte: 'Regolamento (UE) 2024/1624 (AMLR), artt. 52-53; tabelle e pesi ereditati dalle Regole tecniche CNDCEC 2025 fino alla riemanazione',
  vigenzaDa: '2027-07-10',
  vigenzaA: null,
  titolaritaEffettiva: {
    sogliaPartecipazione: 0.25,
    sogliaInclusiva: true,
    norma: 'art. 52 Reg. (UE) 2024/1624',
    etichettaSoglia: 'pari o superiore al 25%',
    regime: 'PARALLELO_AMLR',
    sogliaControllo: 0.5,
    normaControllo: 'artt. 51, 53 e 54 Reg. (UE) 2024/1624',
    normaResiduale: 'art. 63 par. 4 Reg. (UE) 2024/1624',
  },
};
