'use client';

/**
 * Καρέ από βίντεο του CDN μέσα στον browser (το Bunny δίνει `Access-Control-Allow-Origin: *`, οπότε
 * ο καμβάς δεν «μολύνεται»). Ο server δεν έχει ffmpeg — έτσι το AI και το PDF του οδηγού παίρνουν
 * εικόνες και από τα βίντεο-δείγματα.
 */
export async function captureVideoFrames(url: string, count = 4, maxSide = 1280): Promise<{ blob: Blob; t: number }[]> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const once = (ev: string) => new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Το βίντεο δεν φορτώνει')); };
    const cleanup = () => { video.removeEventListener(ev, ok); video.removeEventListener('error', fail); };
    video.addEventListener(ev, ok, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
  try {
    await once('loadedmetadata');
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth || maxSide, video.videoHeight || maxSide));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1280) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 720) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Ο browser δεν υποστηρίζει καμβά');
    const out: { blob: Blob; t: number }[] = [];
    // Ομοιόμορφα στη διάρκεια, χωρίς την αρχή και το τέλος (συνήθως μαύρα/κουνημένα).
    for (let i = 0; i < count; i++) {
      const t = (d * (i + 1)) / (count + 1);
      const seeked = once('seeked');
      video.currentTime = t;
      await seeked;
      await frameReady(video);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Μαύρο καρέ (μη αποκωδικοποιημένο ή fade) δεν βοηθά ούτε το AI ούτε τον μάστορα.
      if (isBlank(ctx, canvas.width, canvas.height)) continue;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (blob) out.push({ blob, t });
    }
    if (!out.length) throw new Error('Δεν τραβήχτηκε κανένα καρέ');
    return out;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/** Μετά το seek: περιμένει να «παρουσιαστεί» το νέο καρέ (αλλιώς ο Chrome δίνει μερικές φορές μαύρο). */
function frameReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 60);
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (typeof v.requestVideoFrameCallback === 'function') {
      v.requestVideoFrameCallback(done);
      setTimeout(resolve, 600); // εφεδρεία: κάποιοι browsers δεν το καλούν σε paused βίντεο
    } else {
      setTimeout(resolve, 250);
    }
  });
}

/** Σχεδόν μαύρο/κενό καρέ: μέση φωτεινότητα πολύ χαμηλή σε δείγμα 32×32. */
export function isBlankPixels(data: Uint8ClampedArray): boolean {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 4) < 10;
}
function isBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  if (!x) return false;
  x.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, 32, 32);
  return isBlankPixels(x.getImageData(0, 0, 32, 32).data);
}

/** Τράβηγμα + αποθήκευση των καρέ ενός βίντεο-δείγματος. */
export async function uploadVideoFrames(mtrl: number, mediaId: string, url: string): Promise<void> {
  const frames = await captureVideoFrames(url);
  const fd = new FormData();
  frames.forEach((f, i) => { fd.append('frame', f.blob, `frame-${i + 1}.jpg`); fd.append('t', String(f.t)); });
  const res = await fetch(`/api/admin/items/${mtrl}/media/${mediaId}/frames`, { method: 'POST', body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Τα καρέ δεν αποθηκεύτηκαν');
}

/** Σήμανση/αποσήμανση δείγματος· για βίντεο που μαρκάρεται, τραβά και τα καρέ του. */
export async function toggleInstallSample(
  mtrl: number, m: { id: string; kind: string; url: string; sampleFrames: string[] }, on: boolean,
): Promise<{ framesError: string | null }> {
  const res = await fetch(`/api/admin/items/${mtrl}/media/${m.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installSample: on }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Η σήμανση απέτυχε');
  if (on && m.kind === 'VIDEO' && !m.sampleFrames.length) {
    try { await uploadVideoFrames(mtrl, m.id, m.url); } catch (e) { return { framesError: (e as Error).message }; }
  }
  return { framesError: null };
}
