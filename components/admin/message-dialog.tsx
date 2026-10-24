'use client';

// «Επικοινωνία»: μήνυμα προς πελάτη, συνεργείο ή συνεργάτη ενός έργου/πελάτη — email και/ή πύλη — ή καταγραφή
// επικοινωνίας που έγινε αλλού (τηλέφωνο, συνάντηση). Όλα μπαίνουν στο ιστορικό του έργου και του πελάτη.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiLoader, FiMail, FiPaperclip, FiPhoneCall, FiSend, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AUDIENCE_LABEL, type Audience, type Recipient } from '@/lib/messages-core';
import { messageRecipientsAction, sendMessageAction } from '@/app/admin/messages/actions';
import { RichTextEditor, type RichValue } from '@/components/admin/rich-text-editor';

const lbl = 'mb-1 block text-(length:--fs-12) font-medium';
const ORDER: Audience[] = ['CUSTOMER', 'SUPPLIER', 'PARTNER', 'INTERNAL'];

export function MessageDialog({ open, onOpenChange, prjc = null, trdr = null, label }: {
  open: boolean; onOpenChange: (o: boolean) => void; prjc?: number | null; trdr?: number | null; label: string;
}) {
  const router = useRouter();
  const [recipients, setRecipients] = React.useState<Recipient[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [to, setTo] = React.useState('');
  const [kind, setKind] = React.useState<'SEND' | 'LOG'>('SEND');
  const [viaEmail, setViaEmail] = React.useState(true);
  const [viaPortal, setViaPortal] = React.useState(true);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState<RichValue>({ html: '', text: '' });
  const [cc, setCc] = React.useState<string[]>([]);
  const [ccDraft, setCcDraft] = React.useState('');
  const [editorKey, setEditorKey] = React.useState(0);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    void messageRecipientsAction({ prjc, trdr }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setError(r.message); return; }
      setRecipients(r.data);
      setTo((cur) => cur || r.data[0]?.key || '');
    });
    return () => { alive = false; };
  }, [open, prjc, trdr]);

  const r = recipients?.find((x) => x.key === to) ?? null;
  const internal = r?.audience === 'INTERNAL';
  const canEmail = !!r?.email && !internal && kind === 'SEND';
  const canPortal = r?.audience === 'CUSTOMER' && kind === 'SEND';
  const willEmail = canEmail && viaEmail, willPortal = canPortal && viaPortal;
  const noChannel = kind === 'SEND' && !internal && !willEmail && !willPortal;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const addCc = (raw: string) => {
    const list = raw.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const bad = list.filter((x) => !EMAIL_RE.test(x));
    if (bad.length) toast.error(`Μη έγκυρο email: ${bad.join(', ')}`);
    setCc((cur) => [...new Set([...cur, ...list.filter((x) => EMAIL_RE.test(x) && x !== r?.email?.toLowerCase())])].slice(0, 10));
    setCcDraft('');
  };
  const ccOptions = (recipients ?? []).filter((x) => x.email && x.key !== to && !cc.includes(x.email.toLowerCase()));
  const reset = () => { setSubject(''); setBody({ html: '', text: '' }); setCc([]); setCcDraft(''); setFiles([]); setKind('SEND'); setEditorKey((k) => k + 1); };
  const submit = async () => {
    if (!r) return;
    setBusy(true);
    const fd = new FormData();
    const pending = ccDraft.trim() && EMAIL_RE.test(ccDraft.trim()) ? [ccDraft.trim().toLowerCase()] : [];
    fd.set('data', JSON.stringify({ prjc, trdr, recipientKey: r.key, kind, viaEmail: willEmail, viaPortal: willPortal, subject, body: body.text, bodyHtml: body.html || null, cc: willEmail ? [...cc, ...pending] : [] }));
    for (const f of files) fd.append('files', f);
    const res = await sendMessageAction(fd);
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(kind === 'LOG' ? 'Η επικοινωνία καταγράφηκε στο ιστορικό'
      : res.data.emailStatus === 'BLOCKED' ? 'Καταγράφηκε — το email δεν στάλθηκε (πριν το live μόνο προσωπικό)'
      : res.data.emailStatus === 'FAILED' ? 'Καταγράφηκε, αλλά το email απέτυχε' : 'Το μήνυμα στάλθηκε');
    reset(); onOpenChange(false); router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Επικοινωνία</DialogTitle>
          <DialogDescription>{label} · μπαίνει στο ιστορικό του έργου και του πελάτη</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {error && <p role="alert" className="text-(length:--fs-12) text-destructive">{error}</p>}
          {/* Τρόπος: αποστολή ή καταγραφή επικοινωνίας που έγινε αλλού. */}
          <div className="inline-flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Τρόπος">
            {([['SEND', 'Αποστολή', FiSend], ['LOG', 'Καταγραφή (τηλέφωνο, συνάντηση)', FiPhoneCall]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={cn('inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 text-(length:--fs-12) font-medium', kind === k ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="size-3.5" aria-hidden />{l}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="msg-to" className={lbl}>{kind === 'LOG' ? 'Με ποιον' : 'Προς'}</label>
            <select id="msg-to" value={to} onChange={(e) => setTo(e.target.value)} disabled={!recipients}
              className="h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-(length:--fs-12)">
              {!recipients && <option>Φόρτωση…</option>}
              {ORDER.map((a) => {
                const list = (recipients ?? []).filter((x) => x.audience === a && (kind === 'SEND' || a !== 'INTERNAL'));
                return list.length ? (
                  <optgroup key={a} label={AUDIENCE_LABEL[a]}>
                    {list.map((x) => <option key={x.key} value={x.key}>{x.name}{x.email ? ` · ${x.email}` : ''}{x.hint ? ` (${x.hint})` : ''}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </div>
          {kind === 'SEND' && !internal && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-(length:--fs-12)">
              <label className={cn('inline-flex min-h-7 items-center gap-2', canEmail ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" checked={willEmail} disabled={!canEmail} onChange={(e) => setViaEmail(e.target.checked)} className="size-4 accent-(--primary)" />
                <FiMail className="size-3.5" aria-hidden />Email{!r?.email && r ? ' (χωρίς email)' : ''}
              </label>
              <label className={cn('inline-flex min-h-7 items-center gap-2', canPortal ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" checked={willPortal} disabled={!canPortal} onChange={(e) => setViaPortal(e.target.checked)} className="size-4 accent-(--primary)" />
                Στην πύλη του πελάτη
              </label>
            </div>
          )}
          {willEmail && (
            <div>
              <label htmlFor="msg-cc" className={lbl}>Κοινοποίηση (Cc)</label>
              <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-1.5 py-1 focus-within:ring-2 focus-within:ring-ring">
                {cc.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-(length:--fs-11)">
                    {e}
                    <button type="button" aria-label={`Αφαίρεση ${e}`} onClick={() => setCc((x) => x.filter((y) => y !== e))} className="cursor-pointer text-muted-foreground hover:text-destructive"><FiX className="size-3" /></button>
                  </span>
                ))}
                <input id="msg-cc" list="msg-cc-list" value={ccDraft} onChange={(e) => { const v = e.target.value; if (/[,;]$/.test(v)) addCc(v); else setCcDraft(v); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ccDraft.trim()) { e.preventDefault(); addCc(ccDraft); } else if (e.key === 'Backspace' && !ccDraft && cc.length) setCc((x) => x.slice(0, -1)); }}
                  onBlur={() => { if (ccDraft.trim()) addCc(ccDraft); }} type="email" inputMode="email" autoComplete="off"
                  placeholder={cc.length ? '' : 'email ή επιλογή από τους εμπλεκόμενους'} className="h-6 min-w-40 flex-1 border-0 bg-transparent px-1 text-(length:--fs-12) shadow-none outline-hidden" />
                <datalist id="msg-cc-list">
                  {ccOptions.map((x) => <option key={x.key} value={x.email!}>{`${AUDIENCE_LABEL[x.audience]}: ${x.name}`}</option>)}
                </datalist>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="msg-subject" className={lbl}>{kind === 'LOG' ? 'Τι αφορούσε' : 'Θέμα'}</label>
            <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="h-8 text-(length:--fs-12)"
              placeholder={kind === 'LOG' ? 'π.χ. Τηλεφώνημα για την ημερομηνία παράδοσης' : 'π.χ. Παράδοση υλικών την Τρίτη'} />
          </div>
          <div>
            <label htmlFor="msg-body" className={lbl}>{kind === 'LOG' ? 'Τι ειπώθηκε / τι συμφωνήθηκε' : 'Μήνυμα'}</label>
            <RichTextEditor key={editorKey} id="msg-body" onChange={setBody} ariaLabel={kind === 'LOG' ? 'Τι ειπώθηκε' : 'Μήνυμα'}
              placeholder={kind === 'LOG' ? 'Σύντομα τι συζητήθηκε και τι συμφωνήθηκε…' : 'Γράψτε το μήνυμα…'} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-(length:--fs-12) text-muted-foreground hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
              <FiPaperclip className="size-3.5" aria-hidden />Συνημμένα
              <input type="file" multiple className="sr-only" onChange={(e) => { const l = e.target.files; if (l) setFiles((x) => [...x, ...[...l]].slice(0, 10)); e.target.value = ''; }} />
            </label>
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-(length:--fs-11)">
                <span className="max-w-40 truncate">{f.name}</span>
                <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="cursor-pointer text-muted-foreground hover:text-destructive"><FiX className="size-3" /></button>
              </span>
            ))}
          </div>
          {files.length > 0 && <p className="text-(length:--fs-11) text-muted-foreground">Τα συνημμένα αποθηκεύονται και στα αρχεία του {prjc != null ? 'έργου' : 'πελάτη'} (φάκελος «Επικοινωνία»).</p>}
          {willEmail && <p className="text-(length:--fs-11) text-muted-foreground">Το email φεύγει με την ταυτότητα της εταιρείας και κωδικό αναφοράς στο θέμα — η απάντηση θα συνδεθεί με αυτό το μήνυμα.</p>}
          {noChannel && <p className="text-(length:--fs-11) text-amber-800">Διαλέξτε email ή πύλη — ή «Καταγραφή» για επικοινωνία που έγινε αλλού.</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Άκυρο</Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || !r || subject.trim().length < 2 || body.text.length < 2 || noChannel} className="gap-1.5">
            {busy ? <FiLoader className="size-4 animate-spin" aria-hidden /> : kind === 'LOG' ? <FiPhoneCall className="size-4" aria-hidden /> : <FiSend className="size-4" aria-hidden />}
            {kind === 'LOG' ? 'Καταγραφή' : internal ? 'Αποθήκευση' : 'Αποστολή'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
