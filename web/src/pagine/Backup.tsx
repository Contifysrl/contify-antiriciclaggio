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
        o riporti l’archivio a una data precedente. L’eliminazione dell’archivio è nella «Zona di
        sicurezza» in fondo a Impostazioni.
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


      {daRipristinare && (
        <RipristinaModal backup={daRipristinare} onChiudi={() => setDaRipristinare(null)} />
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

