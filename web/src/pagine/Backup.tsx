import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBanner, HelpLink, Modal } from '../components/ui';
import { PiedeLegale } from '../componenti';

// ── Backup (AR-M11) ────────────────────────────────────────────
// Pagina dedicata nel menu, come in Assist. Il contenuto è il blocco
// backup/ripristino/eliminazione nato in AR-M4 dentro Impostazioni,
// promosso a pagina; la voce di menu è visibile al solo titolare.

export function Backup() {
  return (
    <>
      <h1>Backup <HelpLink sezione="backup" /></h1>
      <p className="occhiello">
        Le fotografie notturne dell’archivio dello studio: da qui le scarichi, ne fai una al momento,
        o riporti l’archivio a una data precedente. Qui vive anche l’eliminazione dell’archivio.
      </p>
      <BackupArchivio />
      <PiedeLegale />
    </>
  );
}

// ── Backup, ripristino ed eliminazione archivio (AR-M4) ────────

interface BackupRiga {
  key: string;
  tipo: 'daily' | 'monthly' | 'pre-ripristino' | 'pre-eliminazione';
  bytes: number;
  caricatoIl: string;
  righe: number | null;
  trigger: string | null;
}

const ETICHETTA_TIPO_BACKUP: Record<BackupRiga['tipo'], string> = {
  daily: 'giornaliero',
  monthly: 'mensile',
  'pre-ripristino': 'pre-ripristino',
  'pre-eliminazione': 'pre-eliminazione',
};

function dimensione(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataOraIt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function BackupArchivio() {
  const [backups, setBackups] = useState<BackupRiga[]>([]);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [daRipristinare, setDaRipristinare] = useState<BackupRiga | null>(null);
  const [eliminaAperto, setEliminaAperto] = useState(false);

  const carica = () => api.get<{ backups: BackupRiga[] }>('/backup').then((r) => setBackups(r.backups)).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); }, []);

  const backupAdesso = async () => {
    setErrore(''); setEsito(''); setInCorso(true);
    try {
      const r = await api.post<{ key: string; righe: number }>('/backup');
      setEsito(`Backup eseguito: ${r.righe} righe messe al sicuro.`);
      carica();
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="scheda">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="!m-0">Backup dell’archivio</h3>
        <button className="btn btn-secondary btn-sm" onClick={backupAdesso} disabled={inCorso}>
          {inCorso ? 'Backup in corso…' : 'Esegui un backup adesso'}
        </button>
      </div>
      <div className="aiuto">
        Ogni notte l’archivio dello studio viene fotografato automaticamente su server nell’Unione Europea:
        restano gli ultimi 30 backup giornalieri e 12 mensili. Da qui puoi scaricarli o riportare
        l’archivio a una data precedente (art. 32 co. 2 DLgs. 231/2007).
      </div>
      {esito && <div className="riquadro info !my-2">{esito}</div>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {backups.length === 0 ? (
        <div className="text-sm text-ink-400 py-3">
          Nessun backup ancora presente: il primo verrà creato questa notte, oppure eseguine uno adesso.
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>Data</th><th>Tipo</th><th>Contenuto</th><th>Dimensione</th><th /></tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.key}>
                <td className="font-semibold whitespace-nowrap">{dataOraIt(b.caricatoIl)}</td>
                <td>
                  <Badge tone={b.tipo === 'monthly' ? 'teal' : b.tipo === 'daily' ? 'gray' : 'amber'}>
                    {ETICHETTA_TIPO_BACKUP[b.tipo]}
                  </Badge>
                </td>
                <td>{b.righe !== null ? `${b.righe} righe` : '—'}</td>
                <td>{dimensione(b.bytes)}</td>
                <td className="text-right whitespace-nowrap">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => api.scarica(`/backup/scarica?key=${encodeURIComponent(b.key)}`).catch((e) => setErrore(e.message))}
                  >
                    Scarica
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDaRipristinare(b)}>Ripristina…</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 pt-4 border-t border-red-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-red-700 text-sm">Elimina l’archivio</div>
            <div className="aiuto !mt-0.5">
              Svuota clienti, fascicoli, valutazioni, documenti e segnalazioni dello studio.
              Prima viene creato un backup di sicurezza, da cui tutto resta recuperabile.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm !text-red-700 shrink-0" onClick={() => setEliminaAperto(true)}>
            Elimina archivio…
          </button>
        </div>
      </div>

      {daRipristinare && (
        <RipristinaModal backup={daRipristinare} onChiudi={() => setDaRipristinare(null)} />
      )}
      {eliminaAperto && (
        <EliminaArchivioModal onChiudi={() => setEliminaAperto(false)} />
      )}
    </div>
  );
}

function RipristinaModal({ backup, onChiudi }: { backup: BackupRiga; onChiudi: () => void }) {
  const [parola, setParola] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState<{ righeRipristinate: number; backupPreRipristino: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ righeRipristinate: number; backupPreRipristino: string }>('/backup/ripristina', {
        key: backup.key,
        conferma: parola.trim().toUpperCase(),
      });
      setFatto(r);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  if (fatto) {
    return (
      <Modal title="Ripristino completato" onClose={() => window.location.reload()}>
        <div className="space-y-3 text-sm">
          <div className="riquadro info !my-0">
            L’archivio è tornato alla fotografia del {dataOraIt(backup.caricatoIl)}:{' '}
            <strong>{fatto.righeRipristinate} righe</strong> ripristinate.
          </div>
          <p>
            Lo stato che c’era un attimo prima del ripristino è al sicuro nella lista dei backup
            con tipo «pre-ripristino»: anche questa operazione è reversibile.
          </p>
          <div className="text-right">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica l’applicazione</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Ripristina un backup" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <p>
          Stai per riportare <strong>tutto l’archivio dello studio</strong> alla fotografia del{' '}
          <strong>{dataOraIt(backup.caricatoIl)}</strong>
          {backup.righe !== null && <> ({backup.righe} righe)</>}: ciò che è stato inserito o modificato
          dopo quella data sparirà dall’archivio.
        </p>
        <div className="riquadro avviso !my-0">
          Prima di toccare qualsiasi dato verrà creata una fotografia di sicurezza («pre-ripristino»):
          se cambi idea, potrai tornare allo stato di adesso. Gli utenti, le password e il registro
          degli accessi non vengono toccati.
        </div>
        <div>
          <label className="label">Per confermare scrivi RIPRISTINA</label>
          <input className="input" value={parola} onChange={(e) => setParola(e.target.value)} autoFocus placeholder="RIPRISTINA" />
        </div>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio || parola.trim().toUpperCase() !== 'RIPRISTINA'}>
            {invio ? 'Ripristino in corso…' : 'Ripristina l’archivio'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EliminaArchivioModal({ onChiudi }: { onChiudi: () => void }) {
  const [passo, setPasso] = useState(1);
  const [parola, setParola] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState<{ totale: number } | null>(null);

  const elimina = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ totale: number }>('/backup/elimina-archivio', { conferma: parola.trim().toUpperCase() });
      setFatto(r);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  if (fatto) {
    return (
      <Modal title="Archivio eliminato" onClose={() => window.location.reload()}>
        <div className="space-y-3 text-sm">
          <div className="riquadro info !my-0">
            Archivio svuotato: <strong>{fatto.totale} righe</strong> rimosse.
          </div>
          <p>
            La fotografia di sicurezza («pre-eliminazione») è nella lista dei backup: da lì
            l’archivio resta interamente recuperabile con un ripristino.
          </p>
          <div className="text-right">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica l’applicazione</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Elimina l’archivio — passo ${passo} di 3`} onClose={onChiudi}>
      {passo === 1 && (
        <div className="space-y-3 text-sm">
          <p>
            Questa operazione <strong>svuota l’intero archivio dello studio</strong>: clienti, fascicoli,
            valutazioni del rischio, documenti, operazioni, segnalazioni, astensioni, formazione e
            autovalutazioni.
          </p>
          <p>Non tocca: gli utenti e le loro password, le impostazioni dello studio, il registro degli accessi.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary" onClick={() => setPasso(2)}>Ho capito, continua</button>
          </div>
        </div>
      )}
      {passo === 2 && (
        <div className="space-y-3 text-sm">
          <div className="riquadro avviso !my-0">
            Prima dell’eliminazione viene creato <strong>obbligatoriamente</strong> un backup di sicurezza:
            se il backup non riesce, l’archivio non viene toccato. Dal backup («pre-eliminazione»)
            tutto resta recuperabile con un ripristino.
          </div>
          <p>
            Ricorda che i documenti acquisiti sono soggetti a conservazione decennale
            (art. 31 DLgs. 231/2007): eliminali solo se l’obbligo è assolto altrove
            o se si tratta di dati di prova.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary" onClick={() => setPasso(3)}>Continua</button>
          </div>
        </div>
      )}
      {passo === 3 && (
        <form onSubmit={elimina} className="space-y-3 text-sm">
          <p>Ultimo passaggio: per eliminare davvero l’archivio scrivi la parola di conferma.</p>
          <div>
            <label className="label">Per confermare scrivi ELIMINA</label>
            <input className="input" value={parola} onChange={(e) => setParola(e.target.value)} autoFocus placeholder="ELIMINA" />
          </div>
          {errore && <div className="errore">{errore}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary !bg-red-600 hover:!bg-red-700" disabled={invio || parola.trim().toUpperCase() !== 'ELIMINA'}>
              {invio ? 'Eliminazione in corso…' : 'Elimina l’archivio'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
