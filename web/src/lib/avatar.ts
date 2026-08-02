// ── Foto profilo utente (AR-M3, da Assist) ─────────────────────
// Ritaglio centrale quadrato + ridimensionamento a 128px → data URL JPEG.
// Tutto lato browser: al server arrivano ~10-20 KB, mai il file originale.

export function ridimensionaAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Scegli un file immagine (JPG, PNG, WebP…)'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const LATO = 128;
        const canvas = document.createElement('canvas');
        canvas.width = LATO;
        canvas.height = LATO;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas non disponibile in questo browser');
        const lato = Math.min(img.width, img.height);
        const sx = (img.width - lato) / 2;
        const sy = (img.height - lato) / 2;
        ctx.drawImage(img, sx, sy, lato, lato, 0, 0, LATO, LATO);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Elaborazione immagine fallita'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non leggibile'));
    };
    img.src = url;
  });
}

// ── Logo dello studio (AR-M6) ──────────────────────────────────
// Nessun ritaglio: il logo si RIDUCE (mai ingrandito) dentro 600x160
// mantenendo le proporzioni, su PNG per conservare la trasparenza.
// Al server arrivano data URL + dimensioni: servono al .docx per
// calcolare l'ingombro nell'intestazione dei verbali.

export function ridimensionaLogo(file: File): Promise<{ dataUrl: string; larghezza: number; altezza: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Scegli un file immagine (PNG, JPG, WebP…)'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX_L = 600;
        const MAX_A = 160;
        const scala = Math.min(1, MAX_L / img.width, MAX_A / img.height);
        const larghezza = Math.max(1, Math.round(img.width * scala));
        const altezza = Math.max(1, Math.round(img.height * scala));
        const canvas = document.createElement('canvas');
        canvas.width = larghezza;
        canvas.height = altezza;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas non disponibile in questo browser');
        ctx.drawImage(img, 0, 0, larghezza, altezza);
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.length > 160_000) {
          reject(new Error('Il logo resta troppo pesante anche ridotto: usa un\'immagine più semplice (PNG piccolo)'));
          return;
        }
        resolve({ dataUrl, larghezza, altezza });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Elaborazione immagine fallita'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non leggibile'));
    };
    img.src = url;
  });
}
