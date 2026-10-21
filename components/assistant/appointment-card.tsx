'use client';

import * as React from 'react';
import Link from 'next/link';
import { FiCalendar, FiCheck, FiX, FiAlertTriangle, FiInfo, FiLoader, FiClock, FiMapPin, FiUser } from 'react-icons/fi';
import type { AppointmentCard as Card } from '@/lib/assistant/tools';

type State = { k: 'idle' } | { k: 'busy' } | { k: 'done'; summary: string } | { k: 'cancelled' } | { k: 'error'; message: string; overlap?: boolean };

/**
 * Κάρτα επιβεβαίωσης ραντεβού του Air Jordan. Το ραντεβού κλείνεται ΜΟΝΟ με το «Επιβεβαίωση»
 * (POST /api/admin/assistant/appointments με το υπογεγραμμένο token της πρότασης).
 */
export function AppointmentConfirmCard({ card, conversationId, onBooked }: { card: Card; conversationId: string | null; onBooked?: (summary: string) => void }) {
  const [state, setState] = React.useState<State>({ k: 'idle' });

  const confirm = async (allowOverlap: boolean) => {
    setState({ k: 'busy' });
    try {
      const res = await fetch('/api/admin/assistant/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: card.token, conversationId, allowOverlap }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ k: 'error', message: j.message ?? 'Το ραντεβού δεν κλείστηκε', overlap: !!j.overlap }); return; }
      setState({ k: 'done', summary: j.summary });
      onBooked?.(j.summary);
    } catch {
      setState({ k: 'error', message: 'Πρόβλημα σύνδεσης — δοκιμάστε ξανά' });
    }
  };

  const row = (Icon: React.ComponentType<{ className?: string }>, label: string, value: React.ReactNode) => (
    <div className="flex gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="text-foreground">{value}</span></div>
    </div>
  );

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-primary/30 bg-(--cx-accent-soft)/50">
      <div className="flex items-center gap-2 border-b border-primary/20 bg-(--cx-accent-soft) px-3 py-2 text-(length:--fs-13) font-semibold text-primary">
        <FiCalendar className="size-4" aria-hidden /> Νέο ραντεβού — επιβεβαίωση
      </div>
      <div className="space-y-1.5 px-3 py-2.5 text-(length:--fs-13)">
        {row(FiUser, 'Με', <><strong className="font-semibold">{card.with}</strong>{card.sub && <span className="block text-(length:--fs-12) text-muted-foreground">{card.sub}</span>}</>)}
        {row(FiClock, 'Πότε', <>{card.when} <span className="text-muted-foreground">({card.minutes}′)</span></>)}
        {row(FiMapPin, 'Πού', card.place)}
        {card.topic && row(FiInfo, 'Θέμα', card.topic)}
        {card.notes && row(FiInfo, 'Σημειώσεις', card.notes)}
        {card.assumed.length > 0 && (
          <p className="flex gap-1.5 rounded-md bg-background/70 px-2 py-1 text-(length:--fs-12) text-muted-foreground"><FiInfo className="mt-0.5 size-3.5 shrink-0" aria-hidden />Κατάλαβα: {card.assumed.join(' · ')}</p>
        )}
        {card.warnings.map((w) => (
          <p key={w} className="flex gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-(length:--fs-12) text-amber-800"><FiAlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{w}</p>
        ))}
        <div className="pt-1 text-(length:--fs-12) text-muted-foreground">
          Με την επιβεβαίωση:
          <ul className="ml-4 mt-0.5 list-disc">{card.saveTo.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-primary/20 px-3 py-2">
        {state.k === 'done' ? (
          <p className="flex items-start gap-1.5 text-(length:--fs-13) text-emerald-700"><FiCheck className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{state.summary} <Link href="/admin/appointments" className="underline">Ημερολόγιο</Link></span></p>
        ) : state.k === 'cancelled' ? (
          <p className="text-(length:--fs-13) text-muted-foreground">Ακυρώθηκε — δεν κλείστηκε ραντεβού.</p>
        ) : (
          <>
            <button
              type="button" disabled={state.k === 'busy'}
              onClick={() => void confirm(card.overlap || (state.k === 'error' && !!state.overlap))}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-(length:--fs-13) font-medium text-primary-foreground disabled:opacity-60"
            >
              {state.k === 'busy' ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}
              {state.k === 'busy' ? 'Κλείνω…' : card.overlap || (state.k === 'error' && state.overlap) ? 'Επιβεβαίωση παρά την επικάλυψη' : 'Επιβεβαίωση'}
            </button>
            <button type="button" disabled={state.k === 'busy'} onClick={() => setState({ k: 'cancelled' })} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-(length:--fs-13) text-foreground/80 disabled:opacity-60">
              <FiX className="size-4" aria-hidden /> Ακύρωση
            </button>
            {state.k === 'error' && <p className="w-full text-(length:--fs-12) text-destructive">{state.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
