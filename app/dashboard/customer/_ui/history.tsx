// Ιστορικό επικοινωνίας στο portal (προσφορά ή έργο): μηνύματα και συμβάντα σε χρονολογική σειρά. Ύφος website.
import type { HistoryEntry } from '@/lib/contracts/history-core';

const when = (iso: string) => new Date(iso).toLocaleString('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'medium', timeStyle: 'short' });

export function PortalHistory({ entries, showRef = false, empty = 'Δεν υπάρχει ακόμη ιστορικό.' }: { entries: HistoryEntry[]; showRef?: boolean; empty?: string }) {
  if (!entries.length) return <p className="text-(length:--fs-15) text-(--s-ink-2)">{empty}</p>;
  return (
    <ol className="relative space-y-5 border-l border-(--s-line) pl-6">
      {entries.map((e) => (
        <li key={`${e.source}-${e.id}`} className="relative">
          <span aria-hidden className={`absolute -left-[29px] top-1.5 size-2.5 rounded-full ${e.source === 'EVENT' ? 'bg-(--s-ink)' : e.fromCustomer ? 'bg-(--s-accent)' : 'bg-(--s-mute)'}`} />
          <p className="flex flex-wrap gap-x-2 text-(length:--fs-12) uppercase tracking-[0.12em] text-(--s-mute)">
            <span className="text-(--s-ink)">{e.title}</span>
            <span>{e.who} · <time dateTime={e.at}>{when(e.at)}</time></span>
            {showRef && e.contractRef && <span>· {e.contractRef}</span>}
            {e.revision != null && <span>· έκδ. {e.revision}</span>}
            {e.target && <span>· {e.target}</span>}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-(length:--fs-15) text-(--s-ink-2)">{e.body}</p>
        </li>
      ))}
    </ol>
  );
}
