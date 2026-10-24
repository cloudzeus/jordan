'use client';

// Βοηθός κειμένου για ΚΑΘΕ πεδίο κειμένου της διαχείρισης (μόνο ADMIN / SUPER_ADMIN):
//  - 🎤 υπαγόρευση: ηχογράφηση → μεταγραφή (Gemini) ή, ως εφεδρεία, αναγνώριση του browser·
//    το κείμενο μπαίνει στη θέση του κέρσορα·
//  - ✨ AI μορφοποίηση: διόρθωση/δομή με βάση το ΠΟΥ γράφεται (ετικέτα, παράθυρο, σελίδα,
//    γειτονικά πεδία). Με επιλεγμένο τμήμα μορφοποιείται μόνο αυτό.
//
// Ένα στρώμα στο admin layout αντί για αλλαγή σε κάθε φόρμα: κουμπώνει αυτόματα σε κάθε <textarea>
// (και σε <input data-text-assist="on">) όταν πάρει focus. Η μπάρα αποδίδεται ΜΕΣΑ στο ίδιο
// positioned container με το πεδίο — όχι στο body — ώστε τα Radix dialogs να μη τη θεωρούν «κλικ
// έξω» και να μην κλείνουν. Η τιμή γράφεται με execCommand('insertText') (κρατά το Ctrl+Z και
// ενημερώνει τις controlled φόρμες του React)· εφεδρεία ο native setter + event `input`.
//
// Εξαίρεση πεδίου: `data-text-assist="off"` στο πεδίο ή σε πρόγονο. Επιπλέον οδηγία προς το AI:
// `data-ai-context="…"` στο πεδίο ή σε πρόγονο.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Loader2, Mic, Sparkles, Square, Undo2 } from 'lucide-react';
import { useVoiceInput } from '@/components/assistant/use-voice-input';

type Field = HTMLTextAreaElement | HTMLInputElement;

function isEligible(el: EventTarget | null): el is Field {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[data-text-assist="off"]')) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return el.dataset.textAssist === 'on' && !el.disabled && !el.readOnly && ['text', 'search', ''].includes(el.type);
  }
  return false;
}

const clean = (s: string | null | undefined, n = 200) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Ετικέτα του πεδίου: <label for>, aria-label(ledby), γονικό <label>, ή το προηγούμενο «label-άκι». */
function labelOf(el: Field): string {
  const l = el.labels?.[0];
  if (l) {
    const copy = l.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('textarea,input,select,button').forEach((n) => n.remove());
    const t = clean(copy.textContent);
    if (t) return t.replace(/\s*\*$/, '');
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = clean(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
    if (t) return t;
  }
  // Προηγούμενο αδελφάκι ή του γονέα που μοιάζει με ετικέτα (σύντομο κείμενο, όχι πεδίο).
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    let prev = node.previousElementSibling;
    while (prev && !clean(prev.textContent)) prev = prev.previousElementSibling;
    if (prev && !prev.querySelector('textarea,input,select')) {
      const t = clean(prev.textContent, 120);
      if (t && t.length <= 120) return t.replace(/\s*\*$/, '');
    }
  }
  return '';
}

function sectionOf(el: Field): string {
  const dlg = el.closest('[role="dialog"],[role="alertdialog"]');
  if (dlg) {
    const h = dlg.querySelector('[data-slot="dialog-title"],h1,h2,h3,[id$="-title"]');
    const t = clean(h?.textContent);
    if (t) return t;
  }
  const fs = el.closest('fieldset')?.querySelector('legend');
  if (fs) return clean(fs.textContent);
  // Κοντινότερη επικεφαλίδα κάρτας/ενότητας πάνω από το πεδίο.
  let p: Element | null = el.parentElement;
  for (let depth = 0; p && depth < 6; depth++, p = p.parentElement) {
    const h = p.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > header h2, :scope > header h3, :scope > div > h3');
    if (h && !h.contains(el)) return clean(h.textContent);
  }
  return '';
}

/** Τιμές άλλων πεδίων της ίδιας φόρμας/παραθύρου — πλαίσιο για το AI (π.χ. τίτλος έργου). */
function siblingsOf(el: Field): { label: string; value: string }[] {
  const scope = el.closest('form,[role="dialog"],[role="alertdialog"]');
  if (!scope) return [];
  const out: { label: string; value: string }[] = [];
  scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select').forEach((f) => {
    if (out.length >= 10 || f === el) return;
    if (f instanceof HTMLInputElement && !['text', 'number', 'date', 'email', 'search', 'tel', ''].includes(f.type)) return;
    if (f.closest('[data-text-assist="off"]')) return;
    const value = f instanceof HTMLSelectElement ? clean(f.selectedOptions[0]?.textContent, 300) : clean(f.value, 300);
    if (!value) return;
    const label = labelOf(f as Field) || clean(f.getAttribute('placeholder') ?? f.name, 120);
    if (label) out.push({ label: label.slice(0, 120), value });
  });
  return out;
}

function fieldContext(el: Field) {
  return {
    label: labelOf(el) || undefined,
    placeholder: clean(el.placeholder, 300) || undefined,
    name: clean(el.name || el.id, 120) || undefined,
    section: sectionOf(el) || undefined,
    page: clean(document.querySelector('main h1')?.textContent) || clean(document.title) || undefined,
    path: location.pathname,
    hint: clean(el.closest('[data-ai-context]')?.getAttribute('data-ai-context'), 600) || undefined,
    siblings: siblingsOf(el),
  };
}

/** Αντικαθιστά [start,end) με `text`, ώστε να ενημερωθεί και το React state (και να δουλεύει το Ctrl+Z). */
function replaceRange(el: Field, start: number, end: number, text: string) {
  el.focus();
  el.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok || el.value.slice(start, start + text.length) !== text) {
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
}

/** Το positioned container μέσα στο οποίο αποδίδεται η μπάρα (ίδιο με του πεδίου). */
function containerOf(el: Field): HTMLElement {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if (cs.position !== 'static' || cs.transform !== 'none' || cs.contain.includes('layout')) return p;
    p = p.parentElement;
  }
  return document.body;
}

interface Pos { top: number; left: number }

function positionOf(el: Field, container: HTMLElement): Pos {
  const r = el.getBoundingClientRect();
  const scrollbar = el.scrollHeight > el.clientHeight + 1 ? 14 : 0;
  const bottom = r.bottom - 4;
  const right = r.right - 4 - scrollbar;
  if (container === document.body && getComputedStyle(document.body).position === 'static') {
    return { top: bottom + window.scrollY, left: right + window.scrollX };
  }
  const c = container.getBoundingClientRect();
  return {
    top: bottom - c.top - container.clientTop + container.scrollTop,
    left: right - c.left - container.clientLeft + container.scrollLeft,
  };
}

export function TextAssistLayer() {
  const [target, setTarget] = React.useState<Field | null>(null);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const [formatting, setFormatting] = React.useState(false);
  const [undo, setUndo] = React.useState<{ el: Field; value: string } | null>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const caretRef = React.useRef<{ el: Field; start: number; end: number } | null>(null);
  const busyRef = React.useRef(false);

  const voice = useVoiceInput({
    endpoint: '/api/admin/text-assist/transcribe',
    onText: (text) => {
      const c = caretRef.current;
      caretRef.current = null;
      if (!c || !c.el.isConnected) { toast.error('Το πεδίο έκλεισε πριν ολοκληρωθεί η μεταγραφή'); return; }
      const before = c.el.value.slice(0, c.start);
      const after = c.el.value.slice(c.end);
      const lead = before && !/\s$/.test(before) ? ' ' : '';
      const trail = after && !/^\s/.test(after) ? ' ' : '';
      replaceRange(c.el, c.start, c.end, `${lead}${text}${trail}`);
    },
    onError: (m) => toast.error(m),
  });
  const recording = voice.state !== 'idle';
  busyRef.current = recording || formatting;

  // Παρακολούθηση focus: ποιο πεδίο έχει τη μπάρα.
  React.useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const el = e.target;
      if (barRef.current?.contains(el as Node)) return;
      if (isEligible(el)) {
        if (busyRef.current) return; // σε εξέλιξη υπαγόρευση/μορφοποίηση: η μπάρα μένει στο αρχικό πεδίο
        setTarget(el);
        setContainer(containerOf(el));
      } else if (!busyRef.current) {
        setTarget(null);
      }
    };
    const onOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && barRef.current?.contains(next)) return;
      // Η επόμενη εστίαση (αν υπάρξει) θα το ξαναορίσει· αλλιώς κρύβουμε μετά από λίγο.
      setTimeout(() => {
        if (busyRef.current) return;
        const a = document.activeElement;
        if (!isEligible(a) && !barRef.current?.contains(a)) setTarget(null);
      }, 150);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);

  // Θέση: ακολουθεί το πεδίο (scroll, resize, animation παραθύρων) όσο είναι ενεργό.
  React.useEffect(() => {
    if (!target || !container) { setPos(null); return; }
    let raf = 0;
    let last = '';
    const tick = () => {
      if (!target.isConnected) { setTarget(null); return; }
      const p = positionOf(target, container);
      const key = `${Math.round(p.top)}:${Math.round(p.left)}`;
      if (key !== last) { last = key; setPos(p); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, container]);

  // Η «Αναίρεση» ισχύει μέχρι να αλλάξει ο χρήστης το κείμενο ή να φύγει από το πεδίο.
  React.useEffect(() => {
    if (!undo) return;
    const el = undo.el;
    const clear = () => setUndo(null);
    const t = setTimeout(clear, 20_000);
    el.addEventListener('keydown', clear, { once: true });
    return () => { clearTimeout(t); el.removeEventListener('keydown', clear); };
  }, [undo]);
  React.useEffect(() => { if (undo && target !== undo.el) setUndo(null); }, [target, undo]);

  const toggleMic = () => {
    if (!target) return;
    if (recording) { voice.stop(); return; }
    caretRef.current = { el: target, start: target.selectionStart ?? target.value.length, end: target.selectionEnd ?? target.value.length };
    void voice.start();
  };

  const format = async () => {
    const el = target;
    if (!el || formatting) return;
    const full = el.value;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const partial = e > s && full.slice(s, e).trim().length > 0 && e - s < full.length;
    const text = partial ? full.slice(s, e) : full;
    if (!text.trim()) { toast.info('Γράψτε ή υπαγορεύστε πρώτα κείμενο'); return; }
    setFormatting(true);
    try {
      const res = await fetch('/api/admin/text-assist/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, surrounding: partial ? full.slice(0, s) + '…' + full.slice(e) : undefined, field: fieldContext(el) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'Η AI μορφοποίηση απέτυχε');
      const out = String(j.text ?? '');
      if (!out.trim()) throw new Error('Το AI δεν επέστρεψε κείμενο');
      if (!el.isConnected) return;
      if (el.value !== full) { toast.warning('Το κείμενο άλλαξε στο μεταξύ — η μορφοποίηση δεν εφαρμόστηκε'); return; }
      if (out === text) { toast.success('Το κείμενο είναι ήδη σωστό'); return; }
      replaceRange(el, partial ? s : 0, partial ? e : full.length, out);
      setUndo({ el, value: full });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFormatting(false);
    }
  };

  const doUndo = () => {
    if (!undo || !undo.el.isConnected) return;
    replaceRange(undo.el, 0, undo.el.value.length, undo.value);
    setUndo(null);
  };

  if (!target || !container || !pos) return null;

  const btn = 'inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50';
  const keep = (e: React.MouseEvent) => e.preventDefault(); // να μη χάνει το πεδίο το focus

  return createPortal(
    <div
      ref={barRef}
      data-text-assist="off"
      role="toolbar"
      aria-label="Βοηθός κειμένου"
      className="pointer-events-auto absolute z-[60] flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur-sm"
      style={{ top: pos.top, left: pos.left, transform: 'translate(-100%, -100%)' }}
      onMouseDown={keep}
    >
      {undo && (
        <button type="button" className={`${btn} w-auto gap-1 px-1.5 text-[length:var(--fs-12)] text-muted-foreground hover:bg-muted hover:text-foreground`} onClick={doUndo} title="Επαναφορά του αρχικού κειμένου">
          <Undo2 className="size-3.5" /> Αναίρεση
        </button>
      )}
      {voice.supported && (
        <button
          type="button"
          onClick={toggleMic}
          disabled={voice.state === 'transcribing' || formatting}
          title={recording ? 'Τέλος υπαγόρευσης' : 'Υπαγόρευση (φωνή → κείμενο)'}
          aria-label={recording ? 'Τέλος υπαγόρευσης' : 'Υπαγόρευση'}
          className={voice.state === 'recording'
            ? `${btn} w-auto gap-1 bg-red-600 px-1.5 text-[length:var(--fs-12)] font-medium text-white hover:bg-red-700`
            : `${btn} text-muted-foreground hover:bg-muted hover:text-foreground`}
        >
          {voice.state === 'transcribing' ? <Loader2 className="size-4 animate-spin" />
            : voice.state === 'recording' ? <><Square className="size-3 fill-current" /><span className="tabular-nums">{Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}</span></>
              : <Mic className="size-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={format}
        disabled={formatting || recording}
        title="AI μορφοποίηση με βάση το πεδίο (με επιλογή: μόνο το επιλεγμένο)"
        aria-label="AI μορφοποίηση"
        className={`${btn} text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950`}
      >
        {formatting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      </button>
    </div>,
    container,
  );
}
