import { FiLogOut, FiPackage, FiPhone, FiMail, FiCheckCircle } from 'react-icons/fi';
import { getSetting } from '@/lib/settings';
import { portalData } from '@/lib/portal-data';
import type { UserWithRole } from '@/lib/rbac';
import { OfferShowcase } from '@/components/site/offer-showcase';

const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const loadOf = (name: string): 'stones' | 'boxes' | 'sacks' => {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout/.test(n)) return 'sacks';
  if (/πετρ|stone|τραβερτ|travert/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stones';
  return 'boxes';
};

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 2 });
const pal = (n: number) => { const w = Math.floor(n + 1e-9); const h = Math.abs(n - w - 0.5) < 1e-6; return `${h ? (w ? `${w}½` : '½') : num(n)} ${n <= 1 ? 'παλέτα' : 'παλέτες'}`; };

/** Το portal πελάτη/συνεργάτη: οι ανοιχτές δυναμικές προσφορές που του στάλθηκαν. Server component. */
export async function Portal({ user }: { user: NonNullable<UserWithRole> }) {
  const [data, company, phone, email] = await Promise.all([
    portalData(user), getSetting<string>('company.name'), getSetting<string>('company.phone'), getSetting<string>('company.email'),
  ]);
  const brand = (company ?? 'ATELIER').trim();
  const open = data.offers.filter((o) => o.status === 'OPEN');
  const closed = data.offers.filter((o) => o.status === 'CLOSED');

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-900 text-white dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="text-[length:var(--fs-18)] font-extrabold tracking-wide">{brand}</span>
          <span className="hidden text-[length:var(--fs-12)] text-slate-300 sm:inline">· {data.org ?? (user.role.key === 'CUSTOMER' ? 'Πελάτης' : 'Συνεργάτης')}</span>
          <span className="ml-auto truncate text-[length:var(--fs-12)] text-slate-300">{user.name ?? user.email}</span>
          <form action="/api/auth/logout" method="post">
            <button className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[length:var(--fs-12)] text-slate-200 transition-colors hover:bg-white/10" aria-label="Αποσύνδεση">
              <FiLogOut className="size-4" aria-hidden /><span className="hidden sm:inline">Αποσύνδεση</span>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section>
          <h1 className="text-[length:var(--fs-24)] font-bold text-slate-900 dark:text-white">Καλώς ήρθατε{user.name ? `, ${user.name}` : ''}</h1>
          <p className="mt-1 text-[length:var(--fs-14)] text-slate-600 dark:text-slate-300">
            Κοινά container: κάθε συνεργάτης κλείνει όσες παλέτες χρειάζεται (από ½) και, όσο γεμίζει το container, η τιμή <strong>πέφτει για όλους</strong>.
          </p>
        </section>

        {open.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <FiPackage className="mx-auto size-10 text-slate-400" aria-hidden />
            <p className="mt-3 text-[length:var(--fs-15)] font-semibold">Δεν υπάρχει ανοιχτή προσφορά αυτή τη στιγμή</p>
            <p className="mt-1 text-[length:var(--fs-13)] text-slate-500">Θα σας ενημερώσουμε με email μόλις ανοίξει νέο κοινό container.</p>
          </div>
        )}

        {open.map((o) => {
          const unit = o.baseUnit ?? 'τ.μ.';
          const subject = encodeURIComponent(`Κράτηση — ${o.title ?? o.name}`);
          return (
            <article key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* Ζωντανή βιτρίνα: το container γεμίζει ως το πραγματικό γέμισμα, η τιμή πέφτει στα κλιμάκια. */}
              <div className="site p-5 sm:p-8">
                <OfferShowcase
                  mode="live"
                  product={{ name: o.name, code: o.code, load: loadOf(o.name), unit, perPallet: o.sqmPerPallet, eyebrow: o.title ?? 'Κοινό container' }}
                  capacity={o.capacity} filled={o.filled}
                  tiers={o.tiers.map((t) => ({ from: t.fromPallets, value: t.price, label: eur(t.price) }))}
                  valueCaption={`Τιμή ανά ${unit} · για όλους`}
                  extra={[
                    { label: 'Συμμετέχοντες', value: String(o.customers) },
                    { label: 'Ελάχιστη παραγγελία', value: pal(o.minOrder) },
                    ...(o.closesAt ? [{ label: 'Συμμετοχή έως', value: new Date(o.closesAt).toLocaleDateString('el-GR', { day: 'numeric', month: 'long' }) }] : []),
                    ...(o.mine > 0 ? [{ label: 'Η κράτησή σας', value: `${pal(o.mine)} · ${num(o.mine * o.sqmPerPallet)} ${unit}` }] : []),
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                {o.mine > 0 && (
                  <span className="mr-auto flex items-center gap-2 text-[length:var(--fs-13)] text-sky-900 dark:text-sky-200">
                    <FiCheckCircle className="size-4" aria-hidden /> Η κράτησή σας: <strong>{pal(o.mine)}</strong>
                  </span>
                )}
                {email && <a href={`mailto:${email}?subject=${subject}`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 text-[length:var(--fs-14)] font-semibold text-white transition-colors hover:bg-slate-700"><FiMail className="size-4" aria-hidden /> {o.mine > 0 ? 'Αύξηση κράτησης' : 'Κλείστε παλέτες'}</a>}
                {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-[length:var(--fs-14)] font-semibold transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><FiPhone className="size-4" aria-hidden /> {phone}</a>}
              </div>
            </article>
          );
        })}

        {closed.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[length:var(--fs-15)] font-semibold">Κλεισμένα container</h2>
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {closed.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[length:var(--fs-13)]">
                  <span className="font-medium">{o.title ?? o.name}</span>
                  <span className="ml-auto tabular-nums">τελική τιμή <strong>{o.current ? eur(o.current.price) : '—'}</strong>/{o.baseUnit ?? 'τ.μ.'}</span>
                  {o.mine > 0 && <span className="rounded bg-sky-50 px-2 py-0.5 text-[length:var(--fs-12)] text-sky-800">η κράτησή σας: {pal(o.mine)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-[length:var(--fs-12)] text-slate-500">{brand}{phone ? ` · ${phone}` : ''}{email ? ` · ${email}` : ''}</footer>
    </div>
  );
}
