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
