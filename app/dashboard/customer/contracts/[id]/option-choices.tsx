'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiCheck, FiChevronDown, FiLoader } from 'react-icons/fi';
import type { OptionView } from '@/lib/contracts/options';

const eur = (n: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);
const qty = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

/**
 * Εναλλακτικές της προσφοράς: για κάθε χώρο ή εργασία δύο προτάσεις (Α/Β) με την τιμή τους. Ο πελάτης
 * διαλέγει μία· το σύνολο της προσφοράς αλλάζει αμέσως. Μετά την αποδοχή μένει μόνο η ένδειξη. Ύφος website.
 */
export function OptionChoices({ options, vatRate, editable, disabledReason, onChoose }: {
  options: OptionView[]; vatRate: number; editable: boolean; disabledReason?: string | null;
  onChoose: (group: string, option: 'A' | 'B') => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const gross = (n: number) => n * (1 + vatRate / 100);

  const pick = async (key: string, o: 'A' | 'B') => {
    setBusy(`${key}:${o}`); setError(null);
    const r = await onChoose(key, o);
    setBusy(null);
    if (!r.ok) { setError(r.message ?? 'Η επιλογή δεν αποθηκεύτηκε.'); return; }
    router.refresh();
  };

  return (
    <section aria-labelledby="options">
      <p className="text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Επιλογές</p>
      <h2 id="options" className="font-site mt-2 text-(length:--fs-24) font-medium">Διαλέξτε υλικό</h2>
      <p className="mt-1 text-(length:--fs-15) text-(--s-ink-2)">
        {editable ? 'Σε αυτά τα σημεία σας προτείνουμε δύο επιλογές. Διαλέξτε αυτή που προτιμάτε — το σύνολο της προσφοράς ενημερώνεται αμέσως.' : 'Οι επιλογές που ισχύουν σε αυτή την προσφορά.'}
      </p>
      {disabledReason && <p className="mt-3 border-l-2 border-(--s-accent) bg-(--s-paper) px-4 py-3 text-(length:--fs-13) text-(--s-ink-2)">{disabledReason}</p>}
      {error && <p role="alert" className="mt-3 border-l-2 border-[#B91C1C] bg-[#FEF2F2] px-4 py-3 text-(length:--fs-14) text-[#991B1B]">{error}</p>}
      <ul className="mt-6 space-y-6">
        {options.map((g) => (
          <li key={g.key}>
            <fieldset>
              <legend className="font-site text-(length:--fs-18)">{g.label}</legend>
              <div role="radiogroup" aria-label={`Επιλογή για ${g.label}`} className="mt-3 grid gap-3 md:grid-cols-2">
                {(['A', 'B'] as const).map((o) => {
                  const side = o === 'A' ? g.a : g.b;
                  const other = o === 'A' ? g.b : g.a;
                  const diff = gross(side.net) - gross(other.net);
                  const chosen = g.chosen === o;
                  const k = `${g.key}:${o}`;
                  const shown = open.has(k);
                  return (
                    <div key={o} className={`relative border bg-white p-5 transition-colors ${chosen ? 'border-(--s-ink) ring-1 ring-(--s-ink)' : 'border-(--s-line)'}`}>
                      <button type="button" role="radio" aria-checked={chosen} disabled={!editable || chosen || !!busy} onClick={() => void pick(g.key, o)}
                        className={`flex w-full items-start gap-3 text-left ${editable && !chosen ? 'cursor-pointer' : 'cursor-default'} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--s-ink)`}>
                        <span aria-hidden className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${chosen ? 'border-(--s-ink) bg-(--s-ink) text-white' : 'border-(--s-line) text-(--s-mute)'}`}>
                          {busy === k ? <FiLoader className="size-3.5 animate-spin motion-reduce:animate-none" /> : chosen ? <FiCheck className="size-3.5" /> : <span className="text-(length:--fs-12)">{o === 'A' ? 'Α' : 'Β'}</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-(length:--fs-12) uppercase tracking-[0.14em] text-(--s-mute)">Επιλογή {o === 'A' ? 'Α' : 'Β'}{chosen ? ' · η επιλογή σας' : ''}</span>
                          <span className="mt-1 block text-(length:--fs-16) font-medium text-(--s-ink)">{side.title}</span>
                          <span className="font-num mt-2 block text-(length:--fs-22) tabular-nums text-(--s-ink)">{eur(gross(side.net))}</span>
                          <span className="block text-(length:--fs-12) text-(--s-mute)">με ΦΠΑ{!chosen && Math.abs(diff) >= 0.01 ? ` · ${diff > 0 ? '+' : '−'}${eur(Math.abs(diff))} από την άλλη επιλογή` : ''}</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} aria-expanded={shown}
                        className="s-link mt-3 inline-flex min-h-11 items-center gap-1 text-(length:--fs-13) text-(--s-ink-2)">
                        Τι περιλαμβάνει ({side.lines.length}) <FiChevronDown className={`size-3.5 transition-transform ${shown ? 'rotate-180' : ''}`} aria-hidden />
                      </button>
                      {shown && (
                        <ul className="mt-1 space-y-1 border-t border-(--s-line) pt-2 text-(length:--fs-13) text-(--s-ink-2)">
                          {side.lines.map((l) => (
                            <li key={l.id} className="flex gap-3"><span className="min-w-0 flex-1">{l.name}</span><span className="shrink-0 tabular-nums">{qty(l.qty)}{l.unit ? ` ${l.unit}` : ''}</span></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
    </section>
  );
}
