'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  FiClock, FiDownload, FiEye, FiFileText, FiFolder, FiLoader, FiMail, FiMoreVertical, FiRefreshCw, FiSend, FiZap,
} from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { crewTotal, docTitle, eur } from '@/lib/contracts/core';
import type { ContractView } from '@/lib/contracts/service';
import { sendDocumentAction } from '../actions';

type Doc = ContractView['documents'][number];
const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const pdfUrl = (d: Doc, inline = true) => `/api/admin/entity-files/file/${d.fileId}${inline ? '?inline=1' : ''}`;
const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Έγγραφα της σύμβασης: μία κάρτα για τον πελάτη και μία ανά συνεργείο. «Σύνταξη με AI» φτιάχνει νέα
 * έκδοση (OpenRouter → PDF στα αρχεία)· «Αποστολή» στέλνει το PDF με email σε οποιονδήποτε.
 */
export function DocumentsPanel({ contract: c, canManage }: { contract: ContractView; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [send, setSend] = React.useState<Doc | null>(null);

  const targets = [
    { key: 'customer', partyId: null as string | null, title: docTitle(c.stage, 'CUSTOMER'), who: c.customer?.name ?? c.customerName ?? 'Πελάτης', amount: c.totals.gross, ok: c.lines.length > 0 },
    ...c.parties.map((p) => ({ key: p.key, partyId: p.key as string | null, title: 'Σύμβαση ανάθεσης εργασιών', who: p.name, amount: crewTotal(c.lines.map((l) => ({ ...l, partyId: l.partyKey })), p.key), ok: c.lines.some((l) => l.partyKey === p.key) })),
  ];

  const generate = async (partyId: string | null, key: string) => {
    setBusy(key);
    const tid = toast.loading('Το AI συντάσσει το έγγραφο… (έως 1–2 λεπτά)');
    try {
      const r = await fetch(`/api/admin/contracts/${c.id}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partyId }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(b.message ?? 'Η σύνταξη απέτυχε', { id: tid }); return; }
      toast.success('Έτοιμο — το PDF μπήκε στα αρχεία', { id: tid });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border border-t-[3px] border-t-emerald-500 bg-card shadow-xs">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-emerald-50/70 px-4 py-2.5">
        <div>
          <h2 className="flex items-center gap-2.5 text-(length:--fs-14) font-semibold"><span className="inline-flex size-7 items-center justify-center rounded-md bg-emerald-600 text-white shadow-xs"><FiFileText className="size-3.5" /></span> Έγγραφα</h2>
          <p className="text-(length:--fs-12) text-muted-foreground">Προσφορά/σύμβαση πελάτη και μία σύμβαση για κάθε συνεργείο — PDF στα αρχεία {c.prjc ? 'του έργου' : 'του πελάτη (μέχρι να συνδεθεί έργο)'}</p>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {targets.map((t) => {
          const docs = c.documents.filter((d) => (t.partyId ? d.partyId === t.partyId : d.audience === 'CUSTOMER'));
          const last = docs[0];
          const sent = last?.sends.filter((s) => s.result === 'sent') ?? [];
          return (
            <li key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-md ring-1', !last ? 'bg-muted text-muted-foreground ring-border' : t.partyId ? 'bg-orange-50 text-orange-700 ring-orange-200' : 'bg-indigo-50 text-indigo-700 ring-indigo-200')}><FiFileText className="size-4" /></span>
              <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                <p className="truncate text-(length:--fs-13) font-medium">{t.title} · {t.who}</p>
                <p className="truncate text-(length:--fs-11) text-muted-foreground">
                  {last ? <>PDF v{last.version}{last.revision ? ` · έκδ. προσφοράς ${last.revision}` : ''} · {when(last.createdAt)}{sent.length ? <> · <FiMail className="inline size-3" /> {sent[sent.length - 1].to}</> : ' · δεν έχει σταλεί'}</> : 'Δεν έχει συνταχθεί'}
                  {' · '}{eur(t.amount)}
                </p>
              </div>
              {last?.fileId && (
                <a href={pdfUrl(last)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-(length:--fs-12) hover:bg-muted"><FiEye className="size-3.5" />PDF</a>
              )}
              {canManage && (
                <Button size="sm" variant={last ? 'secondary' : 'default'} disabled={!!busy || !t.ok} onClick={() => generate(t.partyId, t.key)} className="gap-1.5" title={!t.ok ? 'Δεν υπάρχουν γραμμές για αυτό το έγγραφο' : undefined}>
                  {busy === t.key ? <FiLoader className="size-3.5 animate-spin" /> : last ? <FiRefreshCw className="size-3.5" /> : <FiZap className="size-3.5" />}
                  {last ? 'Νέο PDF' : 'Σύνταξη με AI'}
                </Button>
              )}
              {last && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted" aria-label={`Ενέργειες εγγράφου ${t.who}`}>
                    <FiMoreVertical className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    {canManage && <DropdownMenuItem className={ITEM} onSelect={() => setSend(last)}><FiSend className="size-3.5" />Αποστολή με email…</DropdownMenuItem>}
                    <DropdownMenuItem className={ITEM} onSelect={() => window.open(pdfUrl(last, false), '_blank')}><FiDownload className="size-3.5" />Λήψη PDF</DropdownMenuItem>
                    <DropdownMenuItem className={ITEM} onSelect={() => router.push(c.prjc ? `/admin/projects/${c.prjc}#files` : '/admin/traders')}><FiFolder className="size-3.5" />Άνοιγμα στα αρχεία</DropdownMenuItem>
                    {docs.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-(length:--fs-11) text-muted-foreground">Προηγούμενες εκδόσεις</DropdownMenuLabel>
                        {docs.slice(1, 8).map((d) => (
                          <DropdownMenuItem key={d.id} className={ITEM} onSelect={() => d.fileId && window.open(pdfUrl(d), '_blank')}><FiClock className="size-3.5" />PDF v{d.version}{d.revision ? ` · έκδ. ${d.revision}` : ''} · {when(d.createdAt)}</DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
      <SendDialog doc={send} onClose={() => setSend(null)} contract={c} />
    </section>
  );
}

/** Αποστολή: προεπιλεγμένος παραλήπτης ο αποδέκτης του εγγράφου, αλλά επιτρέπεται οποιοσδήποτε (πελάτης / συνεργείο / άλλο email). */
function SendDialog({ doc, onClose, contract: c }: { doc: Doc | null; onClose: () => void; contract: ContractView }) {
  const recipients = [
    ...(c.customerEmail ? [{ label: `Πελάτης · ${c.customer?.name ?? c.customerName}`, email: c.customerEmail }] : []),
    ...c.parties.filter((p) => p.email).map((p) => ({ label: `Συνεργείο · ${p.name}`, email: p.email! })),
  ];
  const [to, setTo] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  // Προεπιλογή παραλήπτη όταν ανοίγει για έγγραφο (adjust-state-while-rendering)
  const [prevDeps, setPrevDeps] = React.useState<{ doc: Doc | null; c: ContractView }>({ doc: null, c });
  if (prevDeps.doc !== doc || prevDeps.c !== c) {
    setPrevDeps({ doc, c });
    if (doc) {
      const own = doc.partyId ? c.parties.find((p) => p.key === doc.partyId)?.email : c.customerEmail;
      setTo(own ?? ''); setMessage('');
    }
  }
  const noSite = !!doc && doc.audience === 'CUSTOMER' && doc.stage === 'OFFER' && !c.siteLabel;
  const go = async () => {
    if (!doc || noSite) return;
    setBusy(true);
    const r = await sendDocumentAction(c.id, doc.id, { to, message });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(r.data.result === 'skipped' ? 'Δοκιμαστική λειτουργία — το email δεν στάλθηκε πραγματικά' : `Στάλθηκε στο ${to}`);
    onClose();
  };
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Αποστολή εγγράφου</DialogTitle>
          <DialogDescription>{doc ? `${docTitle(doc.stage, doc.audience)} · έκδοση ${doc.version} — το PDF πηγαίνει ως συνημμένο.` : ''}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {noSite && (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-(length:--fs-12) text-amber-900">
              Η προσφορά δεν έχει τοποθεσία έργου. Ορίστε την στα <a href="#c-basics" onClick={onClose} className="font-medium underline">Βασικά στοιχεία</a> (αρκεί πόλη ή περιοχή) και στείλτε μετά.
            </p>
          )}
          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipients.map((r) => (
                <button key={r.email + r.label} type="button" onClick={() => setTo(r.email)} className={cn('min-h-8 rounded-full border px-2.5 text-(length:--fs-11)', to === r.email ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>{r.label}</button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="send-to">Παραλήπτης</Label>
            <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@…" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-msg">Μήνυμα (προαιρετικό)</Label>
            <textarea id="send-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-(length:--fs-13) outline-hidden focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Άκυρο</Button>
          <Button onClick={go} disabled={busy || noSite || !/^\S+@\S+\.\S+$/.test(to)} className="gap-1.5">{busy ? <FiLoader className="size-4 animate-spin" /> : <FiSend className="size-4" />}Αποστολή</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
