'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiMoreVertical, FiTrash2, FiRefreshCw, FiPlus, FiMessageSquare, FiDatabase, FiExternalLink } from 'react-icons/fi';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { AirJordanChat, type ChatMsg } from '@/components/assistant/air-jordan-chat';

export interface MemoryRow { id: string; kind: string; text: string; refKey: string | null; uses: number; updatedAt: string }
export interface KnowledgeStat { source: string; label: string; count: number }
interface Conv { id: string; title: string; updatedAt: string }

const ITEM = 'cursor-pointer gap-2 text-(length:--fs-12)';
const TRIGGER = 'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground';
const KIND_LABEL: Record<string, string> = { alias: 'Συνώνυμο', fact: 'Γεγονός', preference: 'Προτίμηση', answer: 'Επιβεβαιωμένη απάντηση' };
const KIND_COLOR: Record<string, string> = { alias: '#2563EB', fact: '#0F766E', preference: '#7C3AED', answer: '#B45309' };

const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

export function AssistantWorkspace(props: {
  tab: 'chat' | 'memory';
  canMemory: boolean;
  conversations: Conv[];
  selectedId: string | null;
  initialMessages: ChatMsg[];
  memories: MemoryRow[];
  knowledge: KnowledgeStat[];
  indexedAt: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState(props.tab);
  const [convs, setConvs] = React.useState(props.conversations);
  const [active, setActive] = React.useState<string | null>(props.selectedId);
  // Συγχρονισμός με τα νέα props μετά από router.refresh (adjust-state-while-rendering)
  const [prevConversations, setPrevConversations] = React.useState(props.conversations);
  if (props.conversations !== prevConversations) { setPrevConversations(props.conversations); setConvs(props.conversations); }

  const switchTab = (t: 'chat' | 'memory') => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'memory') url.searchParams.set('tab', 'memory'); else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url);
  };

  // ΔΕΝ γράφουμε το ?c= στο URL όσο τρέχει η συνομιλία: στο Next 16 το replaceState ξαναφορτώνει τη
  // σελίδα (RSC) και κόβει τη ροή της απάντησης (επιβεβαιωμένο: POST chat → ERR_ABORTED).
  const onConversation = (id: string | null, title?: string) => {
    setActive(id);
    if (id && title) setConvs((cs) => [{ id, title, updatedAt: new Date().toISOString() }, ...cs.filter((c) => c.id !== id)]);
  };

  const removeConv = async (c: Conv) => {
    if (!(await confirmAction({ message: `Διαγραφή της συνομιλίας «${c.title}»; Ό,τι έμαθε ο Air Jordan από αυτήν μένει στη μνήμη.`, confirmLabel: 'Διαγραφή' }))) return;
    const res = await fetch(`/api/admin/assistant/conversations/${c.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Δεν διαγράφηκε'); return; }
    setConvs((cs) => cs.filter((x) => x.id !== c.id));
    if (active === c.id) router.push('/admin/assistant');
    toast.success('Η συνομιλία διαγράφηκε');
  };

  return (
    <div className="space-y-4">
      {props.canMemory && (
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {([['chat', 'Συνομιλία', FiMessageSquare], ['memory', 'Μνήμη', FiDatabase]] as const).map(([k, label, Icon]) => (
            <button
              key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => switchTab(k)}
              className={cn('inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-(length:--fs-13) font-medium transition-colors', tab === k ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'chat' ? (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="order-2 min-w-0 lg:order-1">
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-(length:--fs-12) font-semibold text-muted-foreground">Ιστορικό</p>
                <button type="button" onClick={() => router.push('/admin/assistant')} className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-(length:--fs-12) text-primary hover:bg-(--cx-accent-soft)">
                  <FiPlus className="size-3.5" aria-hidden /> Νέα
                </button>
              </div>
              {convs.length === 0 ? (
                <p className="px-3 py-4 text-(length:--fs-12) text-muted-foreground">Καμία συνομιλία ακόμη.</p>
              ) : (
                <ul className="max-h-[50vh] overflow-y-auto py-1 lg:max-h-[calc(100dvh-14rem)]">
                  {convs.map((c) => (
                    <li key={c.id} className={cn('group flex items-center gap-1 px-1.5', active === c.id && 'bg-(--cx-accent-soft)')}>
                      <button type="button" onClick={() => router.push(`/admin/assistant?c=${c.id}`)} className="min-h-11 min-w-0 flex-1 cursor-pointer px-1.5 py-1.5 text-left">
                        <span className={cn('block truncate text-(length:--fs-13)', active === c.id ? 'font-medium text-primary' : 'text-foreground/85')}>{c.title}</span>
                        <span className="block text-(length:--fs-11) text-muted-foreground">{when(c.updatedAt)}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={TRIGGER} aria-label={`Ενέργειες για «${c.title}»`}>
                          <FiMoreVertical className="size-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className={ITEM} onSelect={() => router.push(`/admin/assistant?c=${c.id}`)}><FiExternalLink className="size-3.5" aria-hidden /> Άνοιγμα</DropdownMenuItem>
                          <DropdownMenuItem className={cn(ITEM, 'text-destructive focus:text-destructive')} onSelect={() => void removeConv(c)}><FiTrash2 className="size-3.5" aria-hidden /> Διαγραφή</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
          <div className="order-1 min-w-0 lg:order-2">
            <AirJordanChat
              key={props.selectedId ?? 'new'}
              variant="page"
              conversationId={props.selectedId}
              initialMessages={props.initialMessages}
              canMemory={props.canMemory}
              onConversation={onConversation}
            />
          </div>
        </div>
      ) : (
        <MemoryPanel memories={props.memories} knowledge={props.knowledge} indexedAt={props.indexedAt} />
      )}
    </div>
  );
}

function MemoryPanel({ memories: initial, knowledge, indexedAt }: { memories: MemoryRow[]; knowledge: KnowledgeStat[]; indexedAt: string | null }) {
  const router = useRouter();
  const [memories, setMemories] = React.useState(initial);
  const [text, setText] = React.useState('');
  const [kind, setKind] = React.useState('alias');
  const [busy, setBusy] = React.useState<'add' | 'reindex' | null>(null);
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (initial !== prevInitial) { setPrevInitial(initial); setMemories(initial); }
  const total = knowledge.reduce((s, k) => s + k.count, 0);

  const reindex = async () => {
    setBusy('reindex');
    const t = toast.loading('Επανευρετηρίαση από τη βάση της εφαρμογής…');
    try {
      const res = await fetch('/api/admin/assistant/reindex', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? 'Απέτυχε');
      toast.success(`Έτοιμο: ${j.total.toLocaleString('el-GR')} εγγραφές · ${j.changed} άλλαξαν · ${j.removed} αφαιρέθηκαν`, { id: t });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(null);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setBusy('add');
    const res = await fetch('/api/admin/assistant/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text }) });
    setBusy(null);
    if (!res.ok) { toast.error('Δεν αποθηκεύτηκε'); return; }
    setText('');
    toast.success('Ο Air Jordan θα το θυμάται');
    router.refresh();
  };

  const forget = async (m: MemoryRow) => {
    if (!(await confirmAction({ message: `Διαγραφή από τη μνήμη: «${m.text.slice(0, 120)}»;`, confirmLabel: 'Διαγραφή' }))) return;
    const res = await fetch(`/api/admin/assistant/memory/${m.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Δεν διαγράφηκε'); return; }
    setMemories((ms) => ms.filter((x) => x.id !== m.id));
    toast.success('Ξεχάστηκε');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 space-y-3">
        <form onSubmit={add} className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-(length:--fs-13) font-semibold text-foreground">Μάθε στον Air Jordan</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Είδος" className="min-h-11 rounded-md sm:w-56 border border-input bg-background px-2 text-(length:--fs-13)">
              <option value="alias">Συνώνυμο / παρατσούκλι</option>
              <option value="fact">Γεγονός</option>
              <option value="preference">Προτίμηση απάντησης</option>
            </select>
            <input
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder="π.χ. «Πορσελάνες» = ο προμηθευτής Porcelanosa (κωδ. 0012)"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-(length:--fs-13) outline-hidden focus:border-primary"
            />
            <button type="submit" disabled={busy === 'add' || text.trim().length < 3} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-(length:--fs-13) font-medium text-primary-foreground disabled:opacity-50">
              <FiPlus className="size-4" aria-hidden /> Αποθήκευση
            </button>
          </div>
          <p className="mt-2 text-(length:--fs-11) text-muted-foreground">Μαθαίνει και μόνος του στη συνομιλία («όταν λέω Χ εννοώ Υ») και από τις απαντήσεις που σημειώνετε «Σωστό — να το θυμάσαι».</p>
        </form>

        <div className="rounded-lg border border-border bg-card">
          <p className="border-b border-border px-3 py-2 text-(length:--fs-12) font-semibold text-muted-foreground">Τι έχει μάθει ({memories.length})</p>
          {memories.length === 0 ? (
            <p className="px-3 py-6 text-center text-(length:--fs-13) text-muted-foreground">Τίποτα ακόμη.</p>
          ) : (
            <ul className="divide-y divide-border">
              {memories.map((m) => (
                <li key={m.id} className="flex items-start gap-2 px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-(length:--fs-10) font-semibold" style={{ color: KIND_COLOR[m.kind] ?? '#475569', background: `${KIND_COLOR[m.kind] ?? '#475569'}14` }}>
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line text-(length:--fs-13) text-foreground/90 wrap-anywhere">{m.text}</p>
                    <p className="mt-0.5 text-(length:--fs-11) text-muted-foreground">{when(m.updatedAt)} · χρησιμοποιήθηκε {m.uses}×{m.refKey ? ` · ${m.refKey}` : ''}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={TRIGGER} aria-label="Ενέργειες μνήμης">
                      <FiMoreVertical className="size-4" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem className={cn(ITEM, 'text-destructive focus:text-destructive')} onSelect={() => void forget(m)}><FiTrash2 className="size-3.5" aria-hidden /> Ξέχασέ το</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <aside className="space-y-3">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-(length:--fs-12) font-semibold text-muted-foreground">Γνώση (pgvector)</p>
            <DropdownMenu>
              <DropdownMenuTrigger className={TRIGGER} aria-label="Ενέργειες γνώσης">
                <FiMoreVertical className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-(length:--fs-11) font-semibold text-muted-foreground">{total.toLocaleString('el-GR')} εγγραφές</DropdownMenuLabel>
                <DropdownMenuItem className={ITEM} disabled={busy === 'reindex'} onSelect={() => void reindex()}><FiRefreshCw className="size-3.5" aria-hidden /> Επανευρετηρίαση τώρα</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ul className="px-3 py-2 text-(length:--fs-12)">
            {knowledge.map((k) => (
              <li key={k.source} className="flex justify-between py-0.5"><span className="text-foreground/80">{k.label}</span><span className="tabular-nums text-muted-foreground">{k.count.toLocaleString('el-GR')}</span></li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-(length:--fs-11) text-muted-foreground">
            Τελευταία ευρετηρίαση: {indexedAt ? when(indexedAt) : '—'}. Ανανεώνεται αυτόματα κάθε 6 ώρες (μόνο ό,τι άλλαξε).
          </p>
        </div>
      </aside>
    </div>
  );
}
