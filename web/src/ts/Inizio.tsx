import { HelpLink } from '../components/ui';
import { Icona } from '../components/icone';
import { PiedeLegale } from '../componenti';

// ── Contify Timesheet — pagina iniziale provvisoria (TS-M0) ─────
// In TS-M1 la sostituisce `ts-registra`: il riepilogo del proprio lavoro in
// alto e la chat sotto. Qui si dice solo che il modulo è attivo e in
// preparazione, con gli stessi componenti e lo stesso tono di AR.

export function TsInizio({ tsRuolo, amministratore }: { tsRuolo: string | null; amministratore: boolean }) {
  return (
    <>
      <h1>Timesheet <HelpLink sezione="moduli" /></h1>
      <p className="occhiello">La rilevazione delle ore dello studio, dalla registrazione al proforma.</p>
      <div className="scheda">
        <div className="flex items-start gap-3">
          <span className="shrink-0 mt-0.5 text-teal-600"><Icona nome="orologio" size={22} /></span>
          <div className="text-sm text-ink-600 leading-relaxed">
            <div className="font-semibold text-ink-800 mb-1">Contify Timesheet è in preparazione</div>
            <p className="mb-2">
              Il modulo è attivo per il tuo studio. La registrazione delle ore arriva con la prossima tappa:
              chi lavora scrive o dice per chi ha lavorato e cosa ha fatto, il programma capisce cliente,
              servizio e durata; chi dirige lo studio vede il lavoro registrato e prepara i proforma.
            </p>
            <p className="mb-0">
              {amministratore
                ? <>Già da ora puoi assegnare i ruoli Timesheet alle persone dello studio in <a href="#impostazioni">Impostazioni → Utenti</a>.</>
                : tsRuolo === 'TITOLARE'
                  ? <>Il tuo ruolo in Timesheet è <strong>titolare</strong>: vedrai il lavoro di tutto lo studio.</>
                  : <>Il tuo ruolo in Timesheet è <strong>collaboratore</strong>: registrerai il tuo lavoro e vedrai il tuo riepilogo.</>}
            </p>
          </div>
        </div>
      </div>
      <PiedeLegale />
    </>
  );
}
