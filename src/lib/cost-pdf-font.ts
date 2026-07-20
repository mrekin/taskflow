const basePath = process.env.NEXT_BASE_PATH || '';

// jsPDF caches the VFS on the doc instance, and the font is ~500KB, so fetch it
// once per session and reuse.
let fontPromise: Promise<string> | null = null;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // readAsDataURL returns "data:...;base64,XXXX" — jsPDF wants the raw base64.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * jsPDF's built-in fonts (Helvetica etc.) use WinAnsi encoding and cannot
 * render Cyrillic (or other non-Latin scripts). This lazily fetches the Roboto
 * TTF — which includes Cyrillic — from /public/fonts and returns it as base64
 * for jsPDF's VFS. Respects subpath deployment via NEXT_BASE_PATH.
 */
export function loadRobotoBase64(): Promise<string> {
  if (!fontPromise) {
    fontPromise = fetch(`${basePath}/fonts/Roboto-Regular.ttf`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load font (${r.status})`);
        return r.blob();
      })
      .then(blobToBase64);
  }
  return fontPromise;
}
