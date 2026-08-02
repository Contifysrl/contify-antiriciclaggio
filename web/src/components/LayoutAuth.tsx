import { ReactNode } from 'react';

// ── Layout delle pagine di autenticazione (portato da Assist, AR-M1) ──
// Stile "floating card": sfondo a tutto schermo con il gradiente scuro
// ufficiale Pantone 7474C e anelli Contify in filigrana; al centro una
// card bianca con, a sinistra, un pannello sfumato di benvenuto e, a
// destra, il form con il logo in alto. Pre-login parla il PRODOTTO
// (Contify AR); lo studio compare solo dopo l'accesso, dal database.

// Colori ufficiali del marchio, scritti per esteso di proposito: il logo
// non seguirà mai il tema colore scelto dall'utente. Il teal Pantone
// 7474 C è identità Contify, non una preferenza personale.
const LOGO_SCURO = '#0a6068';
const LOGO_CHIARO = '#0e8a8f';

/** Logo Contify AR: anello + wordmark testuale. */
export function LogoContify({ inverso = false, altezza = 30 }: { inverso?: boolean; altezza?: number }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/anello-contify.png"
        alt="Contify"
        style={{ height: altezza, width: 'auto' }}
        className={inverso ? 'brightness-0 invert' : ''}
      />
      <div className="leading-none whitespace-nowrap">
        <span
          className="text-lg font-extrabold tracking-tight"
          style={{ color: inverso ? '#ffffff' : LOGO_SCURO }}
        >
          Contify
        </span>
        <span
          className="text-lg font-light tracking-tight ml-1"
          style={{ color: inverso ? '#99CECF' : LOGO_CHIARO }}
        >
          AR
        </span>
      </div>
    </div>
  );
}

/** Anello Contify in filigrana: bianco via brightness/invert, opacità
 *  bassa, leggera rotazione per varietà. */
function Filigrana({ size, x, y, opacita, rotazione = 0 }: { size: number; x: string; y: string; opacita: number; rotazione?: number }) {
  return (
    <img
      src="/anello-contify.png"
      alt=""
      aria-hidden="true"
      className="absolute pointer-events-none select-none brightness-0 invert"
      style={{ width: size, height: size, left: x, top: y, opacity: opacita, transform: `rotate(${rotazione}deg)` }}
    />
  );
}

export function LayoutAuth({
  titolo,
  sottotitolo,
  children,
  benvenutoTitolo = 'Che bello rivederti!',
  benvenutoTesto = 'Fascicoli, verifiche e adempimenti antiriciclaggio dello studio, sempre in ordine. Accedi con le tue credenziali.',
  dicitura = 'Contify AR · AntiRiciclaggio',
}: {
  titolo: string;
  sottotitolo?: string;
  children: ReactNode;
  benvenutoTitolo?: string;
  benvenutoTesto?: string;
  /** Riga in fondo al form: il payoff del prodotto (o, in futuro, la dicitura dello studio). */
  dicitura?: string;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 md:p-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(150deg, #04595B 0%, #023C3E 47%, #01262A 100%)' }}
    >
      {/* Anelli Contify in filigrana sullo sfondo */}
      <Filigrana size={520} x="-8%" y="-30%" opacita={0.06} rotazione={-18} />
      <Filigrana size={300} x="74%" y="-14%" opacita={0.05} rotazione={24} />
      <Filigrana size={460} x="83%" y="58%" opacita={0.06} rotazione={10} />
      <Filigrana size={230} x="7%" y="72%" opacita={0.045} rotazione={-30} />

      {/* Card flottante */}
      <div className="relative w-full max-w-4xl bg-ink-0 rounded-2xl shadow-2xl overflow-hidden flex min-h-[560px]">
        {/* Pannello di benvenuto (solo da md in su) */}
        <div
          className="hidden md:flex md:w-[42%] m-4 rounded-2xl relative flex-col justify-center p-10 overflow-hidden shrink-0"
          style={{ background: 'linear-gradient(160deg, #0E8A8F 0%, #048587 45%, #0A6068 100%)' }}
        >
          <img
            src="/anello-contify.png"
            alt=""
            aria-hidden="true"
            className="absolute pointer-events-none select-none brightness-0 invert"
            style={{ width: 300, height: 300, right: -100, top: -100, opacity: 0.14, transform: 'rotate(18deg)' }}
          />
          <img
            src="/anello-contify.png"
            alt=""
            aria-hidden="true"
            className="absolute pointer-events-none select-none brightness-0 invert"
            style={{ width: 240, height: 240, left: -80, bottom: -80, opacity: 0.11, transform: 'rotate(-12deg)' }}
          />
          <div className="relative z-10">
            <h1 className="text-3xl font-extrabold text-white leading-tight mb-4">
              {benvenutoTitolo}
            </h1>
            <p className="text-sm leading-relaxed text-white/85 max-w-[240px]">
              {benvenutoTesto}
            </p>
          </div>
          <div className="absolute bottom-8 left-10 z-10 text-[11px] text-white/60">
            © {new Date().getFullYear()} Contify Srl
          </div>
        </div>

        {/* Colonna form */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-8 pt-7 md:px-10">
            <LogoContify altezza={26} />
          </div>
          <div className="flex-1 flex flex-col justify-center px-8 pb-8 md:px-14">
            <div className="w-full max-w-sm mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-ink-900">{titolo}</h2>
                {sottotitolo && <p className="text-ink-500 text-sm mt-1.5">{sottotitolo}</p>}
              </div>
              {children}
              <div className="text-[11px] text-ink-300 mt-8 text-center">{dicitura}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
