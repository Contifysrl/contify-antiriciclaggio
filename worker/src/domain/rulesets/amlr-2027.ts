/**
 * RULESET «AMLR 2027» — SCHELETRO (AR-M17, anticipo di M20-04).
 *
 * Il Regolamento (UE) 2024/1624 (AMLR) si applica dal 10.7.2027 e sostituisce
 * il DLgs. 231/2007 per la parte sostanziale. Le regole tecniche CNDCEC
 * andranno riemanate: finché non esistono, questo ruleset EREDITA tabelle,
 * pesi e soglie del 2025 e cambia SOLO ciò che il Regolamento fissa già
 * direttamente — la soglia della titolarità effettiva, art. 52: «ownership
 * interest of 25% or more», cioè il 25% esatto diventa sufficiente.
 *
 * Non è selezionabile per le valutazioni del rischio (non è nel catalogo dei
 * ruleset esposti): esiste perché il motore della titolarità effettiva legga
 * la soglia dalla data e perché i test lo dimostrino con una data futura.
 * Quando le regole tecniche 2027 usciranno, questo file diventa un ruleset
 * completo e il catalogo lo espone.
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
  },
};
