import Link from 'next/link';
import { portalData } from '@/lib/portal-data';
import type { UserWithRole } from '@/lib/rbac';
import { Container, Eyebrow } from '@/components/site/ui';
import { ProductPlaceholder } from '@/components/site/visuals';
import { tierColor } from '@/components/site/tier-colors';
import { PortalShell } from './portal-shell';

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });

/** Αρχική πελάτη/συνεργάτη: τα προϊόντα δυναμικής τιμολόγησης που του στάλθηκαν — επιλέγει και μπαίνει. */
export async function Portal({ user }: { user: NonNullable<UserWithRole> }) {
  const data = await portalData(user);
  const open = data.offers.filter((o) => o.status === 'OPEN');
  const closed = data.offers.filter((o) => o.status === 'CLOSED');

  return (
    <PortalShell user={user} org={data.org}>
      <Container className="py-14 md:py-20">
        <Eyebrow>Δυναμικές προσφορές</Eyebrow>
        <h1 className="font-site mt-4 text-[length:var(--fs-36)] font-light leading-tight">Καλώς ήρθατε{user.name ? `, ${user.name}` : ''}</h1>
        <p className="mt-4 max-w-2xl text-[length:var(--fs-16)] text-[var(--s-ink-2)]">
          Κάθε κοινό container έχει ένα ή περισσότερα προϊόντα. Επιλέξτε το, δείτε τα από κοντά και κλείστε όσες παλέτες χρειάζεστε — όσο γεμίζει, οι τιμές πέφτουν για όλους.
        </p>

        {open.length === 0 ? (
          <div className="mt-14 border border-dashed border-[var(--s-line)] px-6 py-16 text-center">
            <p className="font-site text-[length:var(--fs-20)] font-light">Δεν υπάρχει ανοιχτή προσφορά αυτή τη στιγμή</p>
            <p className="mt-2 text-[length:var(--fs-14)] text-[var(--s-ink-2)]">Θα σας ενημερώσουμε με email μόλις ανοίξει νέο κοινό container.</p>
          </div>
        ) : (
          <ul className="mt-14 grid gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {open.map((o) => {
              const idx = Math.max(0, o.levels.findIndex((t) => t.level === o.currentLevel));
              const color = tierColor(idx, o.levels.length);
              const lead = o.items[0];
              return (
                <li key={o.id}>
                  <Link href={`/dashboard/offers/${o.id}`} className="group block">
                    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--s-paper)]">
                      {o.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={o.photo} alt={o.title} className="s-img size-full object-cover" />
                        : <ProductPlaceholder mtrl={lead?.mtrl ?? 0} name={o.title} label={false} />}
                      <span className="absolute left-3 top-3 bg-white/90 px-2.5 py-1 text-[length:var(--fs-12)] font-medium">{o.items.length > 1 ? `${o.items.length} προϊόντα · κοινό container` : 'Κοινό container'}</span>
                      {(o.mine > 0 || o.myPending.length > 0) && (
                        <span className="absolute right-3 top-3 bg-[var(--s-ink)] px-2.5 py-1 text-[length:var(--fs-12)] text-white">
                          {o.mine > 0 ? `Η κράτησή σας: ${num(o.mine)} παλ.` : 'Αίτημα σε αναμονή'}
                        </span>
                      )}
                    </div>
                    <p className="font-site mt-5 text-[length:var(--fs-20)] font-light leading-snug group-hover:underline group-hover:underline-offset-4">{o.title}</p>
                    {/* Τα προϊόντα με την τρέχουσα τιμή τους (στο χρώμα του κλιμακίου) */}
                    <ul className="mt-3 divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
                      {o.items.slice(0, 4).map((it) => (
                        <li key={it.id} className="flex items-baseline justify-between gap-3 py-2">
                          <span className="min-w-0 truncate text-[length:var(--fs-14)]" title={it.name}>{it.name}</span>
                          <span className="shrink-0 text-right">
                            <span className="font-num text-[length:var(--fs-20)] font-light" style={{ color }}>{it.current ? eur(it.current.price) : '—'}</span>
                            <span className="text-[length:var(--fs-12)] text-[var(--s-mute)]"> /{it.baseUnit ?? 'τ.μ.'}</span>
                          </span>
                        </li>
                      ))}
                      {o.items.length > 4 && <li className="py-2 text-[length:var(--fs-13)] text-[var(--s-mute)]">+ {o.items.length - 4} ακόμη</li>}
                    </ul>
                    {/* Γέμισμα: λεπτή μπάρα με τα σκαλοπάτια σε χρώμα */}
                    <div className="relative mt-5 h-1 bg-[var(--s-line)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(o.percent)} aria-label="Γέμισμα container">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${o.percent}%`, background: color }} />
                      {o.levels.slice(1).map((t, i) => (
                        <span key={t.level} className="absolute -top-1 h-3 w-px" style={{ left: `${(t.fromPallets / Math.max(1, o.capacity)) * 100}%`, background: tierColor(i + 1, o.levels.length) }} />
                      ))}
                    </div>
                    <p className="mt-2 flex justify-between text-[length:var(--fs-13)] text-[var(--s-ink-2)]">
                      <span className="tabular-nums">{num(o.filled)} / {num(o.capacity)} παλέτες</span>
                      <span>{o.nextLevel ? <>επόμενη πτώση σε <b className="font-medium tabular-nums">{num(o.nextLevel.missing)}</b> παλ.</> : 'καλύτερη τιμή'}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {closed.length > 0 && (
          <section className="mt-20">
            <h2 className="font-site text-[length:var(--fs-20)] font-light">Κλεισμένα container</h2>
            <ul className="mt-4 border-t border-[var(--s-line)]">
              {closed.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--s-line)] py-4 text-[length:var(--fs-14)]">
                  <span>{o.title}</span>
                  <span className="ml-auto tabular-nums">τελικό κλιμάκιο <b className="font-medium">W0{o.currentLevel}</b>{o.items.length === 1 && o.items[0].current ? ` · ${eur(o.items[0].current.price)}/${o.items[0].baseUnit ?? 'τ.μ.'}` : ''}</span>
                  {o.mine > 0 && <span className="text-[var(--s-mute)]">η κράτησή σας: {num(o.mine)} παλ.</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>
    </PortalShell>
  );
}
