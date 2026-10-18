'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FiMoreVertical, FiMic, FiSend, FiPlus, FiMaximize2, FiDatabase, FiCheck, FiX, FiCopy, FiExternalLink, FiSquare, FiLoader,
} from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AirJordanAvatar } from './air-jordan-icon';
import { MarkdownView } from './markdown-view';
import { useVoiceInput } from './use-voice-input';
import { AppointmentConfirmCard } from './appointment-card';
import type { AppointmentCard } from '@/lib/assistant/tools';

export interface Citation { refKey: string; label: string; url: string | null }
export interface ChatMsg {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  feedback?: number | null;
  error?: boolean;
  cards?: AppointmentCard[];
}

const ITEM = 'cursor-pointer gap-2 text-[length:var(--fs-12)]';
const TRIGGER = 'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground';

const SUGGESTIONS = [
  'Ποια έργα είναι ενεργά και πόσο κέρδος έχουν;',
  'Πόσα χρωστάμε στον προμηθευτή…',
  'Τελευταία τιμή αγοράς και απόθεμα για…',
  'Τι υλικά πήγαν στο έργο…',
];

function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

export function AirJordanChat({
  variant, conversationId: initialId = null, initialMessages = [], canMemory = false, onClose, onConversation,
}: {
  variant: 'panel' | 'page';
  conversationId?: string | null;
  initialMessages?: ChatMsg[];
  canMemory?: boolean;
  onClose?: () => void;
  /** Νέα/άλλη συνομιλία (για τη λίστα ιστορικού της σελίδας). Για αλλαγή συνομιλίας από έξω: νέο `key`. */
  onConversation?: (id: string | null, title?: string) => void;
}) {
  const [conversationId, setConversationId] = React.useState<string | null>(initialId);
  const [messages, setMessages] = React.useState<ChatMsg[]>(initialMessages);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [steps, setSteps] = React.useState<string[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, steps]);

  const voice = useVoiceInput({
    onText: (t) => {
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
      requestAnimationFrame(() => { inputRef.current?.focus(); autoSize(); });
    },
    onError: (m) => toast.error(m),
  });

  const autoSize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const newConversation = () => {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setSteps([]);
    onConversation?.(null);
    inputRef.current?.focus();
  };

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput('');
    requestAnimationFrame(autoSize);
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setBusy(true);
    setSteps([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/admin/assistant/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationId }), signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? 'Ο Air Jordan δεν απάντησε');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let answered = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'conversation') { setConversationId(ev.id); onConversation?.(ev.id, ev.title); }
          else if (ev.type === 'step') setSteps((s) => (s.at(-1) === ev.label ? s : [...s, ev.label]));
          else if (ev.type === 'answer') { answered = true; setMessages((m) => [...m, { id: ev.messageId, role: 'assistant', content: ev.text, citations: ev.citations, cards: ev.cards }]); }
          else if (ev.type === 'error') { answered = true; setMessages((m) => [...m, { role: 'assistant', content: ev.message, error: true }]); }
        }
      }
      if (!answered) throw new Error('Η σύνδεση διακόπηκε πριν την απάντηση');
    } catch (e) {
      if (!ctrl.signal.aborted) setMessages((m) => [...m, { role: 'assistant', content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
      setSteps([]);
      abortRef.current = null;
    }
  };

  const feedback = async (msg: ChatMsg, value: 1 | -1) => {
    if (!msg.id) return;
    const res = await fetch(`/api/admin/assistant/messages/${msg.id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
    if (!res.ok) { toast.error('Δεν αποθηκεύτηκε'); return; }
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, feedback: value } : x)));
    toast.success(value === 1 ? 'Θα το θυμάμαι για παρόμοιες ερωτήσεις' : 'Σημειώθηκε ως λάθος — δεν θα το θυμάμαι');
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Αντιγράφηκε'); } catch { toast.error('Δεν επετράπη η αντιγραφή'); }
  };

  // Push-to-talk: κράτημα = ηχογράφηση όσο είναι πατημένο· σύντομο πάτημα = εναλλαγή (πάτα ξανά για τέλος).
  const pressAt = React.useRef(0);
  const onMicDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (voice.state === 'recording') { voice.stop(); return; }
    if (voice.state !== 'idle') return;
    pressAt.current = Date.now();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    void voice.start();
  };
  const onMicUp = () => {
    if (voice.state === 'recording' && pressAt.current && Date.now() - pressAt.current > 450) voice.stop();
    pressAt.current = 0;
  };

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  return (
    <div className={cn('flex min-h-0 flex-col bg-background', variant === 'panel' ? 'h-full' : 'h-[calc(100dvh-12rem)] min-h-[420px] rounded-lg border border-border')}>
      {/* Κεφαλίδα */}
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
        <AirJordanAvatar size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--fs-14)] font-semibold leading-tight text-foreground">Air Jordan</p>
          <p className="truncate text-[length:var(--fs-11)] text-muted-foreground">Έργα · συναλλασσόμενοι · υλικά · ραντεβού</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={TRIGGER} aria-label="Ενέργειες Air Jordan">
            <FiMoreVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Air Jordan</DropdownMenuLabel>
            <DropdownMenuItem className={ITEM} onSelect={newConversation}><FiPlus className="size-3.5" aria-hidden /> Νέα συνομιλία</DropdownMenuItem>
            {variant === 'panel' && (
              <DropdownMenuItem className={ITEM} asChild>
                <Link href={conversationId ? `/admin/assistant?c=${conversationId}` : '/admin/assistant'} onClick={onClose}><FiMaximize2 className="size-3.5" aria-hidden /> Πλήρης σελίδα & ιστορικό</Link>
              </DropdownMenuItem>
            )}
            {canMemory && (
              <DropdownMenuItem className={ITEM} asChild>
                <Link href="/admin/assistant?tab=memory" onClick={onClose}><FiDatabase className="size-3.5" aria-hidden /> Τι έχει μάθει (μνήμη)</Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {onClose && (
          <button type="button" onClick={onClose} className={TRIGGER} aria-label="Κλείσιμο">
            <FiX className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Μηνύματα */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 pt-6 text-center">
            <AirJordanAvatar size={56} />
            <div>
              <p className="text-[length:var(--fs-16)] font-semibold text-foreground">Γεια! Είμαι ο Air Jordan.</p>
              <p className="mt-1 text-[length:var(--fs-13)] text-muted-foreground">
                Ρωτήστε με — γραπτά ή με τη φωνή — για έργα, πελάτες, προμηθευτές, υλικά και προϊόντα. Απαντώ με βάση τα δεδομένα της εφαρμογής και του SoftOne, με παραπομπές.
              </p>
            </div>
            <div className="flex w-full flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s} type="button"
                  onClick={() => (s.endsWith('…') ? (setInput(s.replace(/…$/, ' ')), inputRef.current?.focus()) : void send(s))}
                  className="min-h-11 cursor-pointer rounded-md border border-border bg-card px-3 py-2 text-left text-[length:var(--fs-13)] text-foreground/80 transition-colors hover:border-primary/40 hover:bg-[var(--cx-accent-soft)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[length:var(--fs-14)] text-primary-foreground [overflow-wrap:anywhere]">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-2">
              <AirJordanAvatar size={26} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className={cn('rounded-2xl rounded-tl-md border px-3.5 py-2.5', m.error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-card')}>
                  {m.error ? <p className="text-[length:var(--fs-13)]">{m.content}</p> : <MarkdownView text={m.content} />}
                </div>
                {m.cards?.map((c) => <AppointmentConfirmCard key={c.token} card={c} conversationId={conversationId} />)}
                {!m.error && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {(m.citations ?? []).map((c) => (
                      c.url ? (
                        <Link key={c.refKey} href={c.url} title={c.label} className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[length:var(--fs-11)] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                          <FiExternalLink className="size-3 shrink-0" aria-hidden /><span className="truncate">{c.label}</span>
                        </Link>
                      ) : (
                        <span key={c.refKey} className="max-w-[16rem] truncate rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[length:var(--fs-11)] text-muted-foreground">{c.label}</span>
                      )
                    ))}
                    {m.feedback === 1 && <span className="inline-flex items-center gap-1 text-[length:var(--fs-11)] text-emerald-600"><FiCheck className="size-3" aria-hidden /> Στη μνήμη</span>}
                    {m.feedback === -1 && <span className="text-[length:var(--fs-11)] text-muted-foreground">Σημειώθηκε λάθος</span>}
                    <DropdownMenu>
                      <DropdownMenuTrigger className={cn(TRIGGER, 'ml-auto size-7')} aria-label="Ενέργειες απάντησης">
                        <FiMoreVertical className="size-3.5" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuItem className={ITEM} disabled={!m.id} onSelect={() => void feedback(m, 1)}><FiCheck className="size-3.5 text-emerald-600" aria-hidden /> Σωστό — να το θυμάσαι</DropdownMenuItem>
                        <DropdownMenuItem className={ITEM} disabled={!m.id} onSelect={() => void feedback(m, -1)}><FiX className="size-3.5 text-destructive" aria-hidden /> Λάθος απάντηση</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className={ITEM} onSelect={() => void copy(m.content)}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          )
        ))}

        {busy && (
          <div className="flex gap-2">
            <AirJordanAvatar size={26} className="mt-0.5 shrink-0" />
            <div className="rounded-2xl rounded-tl-md border border-border bg-card px-3.5 py-2.5">
              <ul className="space-y-1 text-[length:var(--fs-12)] text-muted-foreground">
                {(steps.length ? steps : ['Σκέφτομαι']).map((s, j, arr) => (
                  <li key={j} className="flex items-center gap-1.5">
                    {j === arr.length - 1 ? <FiLoader className="size-3 animate-spin text-primary" aria-hidden /> : <FiCheck className="size-3 text-emerald-600" aria-hidden />}
                    {s}…
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Εισαγωγή */}
      <div className="border-t border-border p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {voice.state !== 'idle' && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--cx-accent-soft)] px-3 py-1.5 text-[length:var(--fs-12)] text-primary">
            {voice.state === 'recording' ? (
              <>
                <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-red-500" /></span>
                Ακούω… {String(Math.floor(voice.seconds / 60)).padStart(1, '0')}:{String(voice.seconds % 60).padStart(2, '0')} — αφήστε (ή πατήστε ξανά) το μικρόφωνο για τέλος
              </>
            ) : (
              <><FiLoader className="size-3.5 animate-spin" aria-hidden /> Μεταγραφή… (θα μπορείτε να τη διορθώσετε πριν την αποστολή)</>
            )}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <textarea
            ref={inputRef}
            data-aj-input=""
            value={input}
            rows={1}
            onChange={(e) => { setInput(e.target.value); autoSize(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
            }}
            placeholder={voice.state === 'transcribing' ? 'Μεταγραφή…' : 'Ρωτήστε για έργο, προμηθευτή, υλικό…'}
            aria-label="Ερώτηση προς τον Air Jordan"
            className="max-h-[180px] min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-[length:var(--fs-14)] leading-snug outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          {voice.supported && (
            <button
              type="button"
              onPointerDown={onMicDown}
              onPointerUp={onMicUp}
              onPointerCancel={onMicUp}
              onContextMenu={(e) => e.preventDefault()}
              disabled={voice.state === 'transcribing' || busy}
              aria-pressed={voice.state === 'recording'}
              aria-label={voice.state === 'recording' ? 'Τέλος ηχογράφησης' : 'Μιλήστε (κρατήστε πατημένο)'}
              title="Κρατήστε πατημένο και μιλήστε — ή πατήστε μία φορά για έναρξη/τέλος"
              className={cn(
                'inline-flex size-11 shrink-0 cursor-pointer touch-none select-none items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                voice.state === 'recording' ? 'border-red-500 bg-red-500 text-white' : 'border-border bg-card text-foreground/70 hover:border-primary/40 hover:text-primary',
              )}
            >
              {voice.state === 'transcribing' ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiMic className="size-4" aria-hidden />}
            </button>
          )}
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Διακοπή" className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground/70 hover:text-destructive">
              <FiSquare className="size-4" aria-hidden />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Αποστολή" className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
              <FiSend className="size-4" aria-hidden />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
