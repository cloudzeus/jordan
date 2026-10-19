'use client';

import * as React from 'react';

// Φωνή → κείμενο για τον Air Jordan.
//  1. Κύρια οδός: ηχογράφηση στον browser (MediaRecorder: webm/opus στον Chrome, mp4/aac στο Safari) →
//     /api/admin/assistant/transcribe (OpenRouter, Gemini) — καλή στα Ελληνικά με αγγλικούς όρους και
//     ονόματα προμηθευτών (το server στέλνει λεξιλόγιο).
//  2. Εφεδρεία: η ενσωματωμένη αναγνώριση του browser (Web Speech API, el-GR) — όταν δεν υπάρχει
//     MediaRecorder/μικρόφωνο ή όταν η μεταγραφή στον server αποτύχει (από την επόμενη φορά).
// Το κείμενο ΔΕΝ στέλνεται αυτόματα: μπαίνει στο πεδίο για διόρθωση.

export type VoiceState = 'idle' | 'recording' | 'transcribing';

type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export function useVoiceInput(opts: { onText: (text: string) => void; onError: (message: string) => void; /** Endpoint μεταγραφής (προεπιλογή: Air Jordan). */ endpoint?: string }) {
  const [state, setState] = React.useState<VoiceState>('idle');
  const [seconds, setSeconds] = React.useState(0);
  const [mode, setMode] = React.useState<'server' | 'browser'>('server');
  const recRef = React.useRef<MediaRecorder | null>(null);
  const speechRef = React.useRef<SpeechRec | null>(null);
  const chunks = React.useRef<Blob[]>([]);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const cb = React.useRef(opts);
  cb.current = opts;

  // Μετά το mount (όχι στο render) — αλλιώς διαφέρει το HTML του server από του browser.
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => { setSupported(!!navigator.mediaDevices?.getUserMedia || !!speechCtor()); }, []);

  const stopTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const startTimer = () => {
    setSeconds(0);
    stopTimer();
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const startBrowser = React.useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) { cb.current.onError('Ο browser δεν υποστηρίζει αναγνώριση φωνής'); return; }
    const rec = new Ctor();
    rec.lang = 'el-GR';
    rec.interimResults = false;
    rec.continuous = true;
    let text = '';
    rec.onresult = (e) => {
      text = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
    };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') cb.current.onError(`Αναγνώριση φωνής: ${e.error}`); };
    rec.onend = () => { stopTimer(); setState('idle'); if (text) cb.current.onText(text); };
    speechRef.current = rec;
    rec.start();
    setState('recording');
    startTimer();
  }, []);

  const start = React.useCallback(async () => {
    if (state !== 'idle') return;
    const mime = pickMime();
    if (mode === 'browser' || !mime || !navigator.mediaDevices?.getUserMedia) { startBrowser(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      // Ένταση φωνής κατά την ηχογράφηση: σχεδόν σιωπή ⇒ δεν στέλνεται (το μοντέλο «ακούει» φράσεις στον θόρυβο).
      let peak = 0;
      let meter: { ctx: AudioContext; raf: number } | null = null;
      try {
        const ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        const tick = () => {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          peak = Math.max(peak, Math.sqrt(sum / buf.length));
          if (meter) meter.raf = requestAnimationFrame(tick);
        };
        meter = { ctx, raf: requestAnimationFrame(tick) };
      } catch { peak = 1; /* χωρίς Web Audio: δεν ελέγχουμε */ }
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        if (meter) { cancelAnimationFrame(meter.raf); void meter.ctx.close(); meter = null; }
        const blob = new Blob(chunks.current, { type: mime.split(';')[0] });
        if (blob.size < 2000) { setState('idle'); return; } // πολύ σύντομο — τυχαίο πάτημα
        if (peak < 0.012) { setState('idle'); cb.current.onError('Δεν ακούστηκε ομιλία — μιλήστε πιο κοντά στο μικρόφωνο'); return; }
        setState('transcribing');
        try {
          const fd = new FormData();
          fd.append('audio', blob, `voice.${mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'}`);
          const res = await fetch(cb.current.endpoint ?? '/api/admin/assistant/transcribe', { method: 'POST', body: fd });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.message ?? 'Η μεταγραφή απέτυχε');
          if (j.text) cb.current.onText(j.text);
          else cb.current.onError('Δεν ακούστηκε ομιλία');
        } catch (e) {
          if (speechCtor()) setMode('browser');
          cb.current.onError(`${(e as Error).message}${speechCtor() ? ' — την επόμενη φορά χρησιμοποιώ την αναγνώριση του browser' : ''}`);
        } finally {
          setState('idle');
        }
      };
      recRef.current = rec;
      rec.start();
      setState('recording');
      startTimer();
    } catch {
      cb.current.onError('Δεν επετράπη η πρόσβαση στο μικρόφωνο');
      setState('idle');
    }
  }, [mode, startBrowser, state]);

  const stop = React.useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    recRef.current = null;
    if (speechRef.current) { speechRef.current.stop(); speechRef.current = null; }
  }, []);

  React.useEffect(() => () => { stopTimer(); recRef.current?.stop(); speechRef.current?.stop(); }, []);

  return { state, seconds, supported, mode, start, stop };
}
