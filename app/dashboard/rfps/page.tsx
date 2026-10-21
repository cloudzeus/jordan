import type { Metadata } from 'next';
import Link from 'next/link';
import { requireParty } from '@/lib/rbac';
import { partyName } from '@/lib/portal-party';
import { partyRfps } from '@/lib/rfp/service';
import { RECIPIENT_STATUS } from '@/lib/rfp/core';
import { Container } from '@/components/site/ui';
import { PortalShell } from '../portal-shell';
import { Empty, PageTitle } from '../customer/_ui/bits';
import { NotLinked } from '../_party/party-home';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Αιτήματα προσφοράς' };

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const day = (s: string | null) => (s ? s.split('-').reverse().join('/') : null);

/** Τα αιτήματα προσφοράς προς τον συνεργάτη/το συνεργείο: πρώτα όσα περιμένουν απάντηση. */
export default async function RfpsPage() {
  const { user, party } = await requireParty();
  if (!party) return <NotLinked user={user} />;
  const [org, all] = await Promise.all([partyName(party), partyRfps(party)]);
  const open = all.filter((r) => r.canRespond);
  const rest = all.filter((r) => !r.canRespond);
  const card = (r: (typeof all)[number]) => {
    const st = RECIPIENT_STATUS[r.status] ?? RECIPIENT_STATUS.INVITED;
    return (
      <li key={r.recipientId}>
        <Link href={`/dashboard/rfps/${r.recipientId}`} className="block h-full border border-(--s-line) bg-white p-5 transition-colors hover:border-(--s-ink)">
          <div className="flex items-center justify-between gap-3">
            <span className="text-(length:--fs-12) uppercase tracking-[0.18em] text-(--s-mute)">{r.ref}</span>
            <span className="px-2 py-0.5 text-(length:--fs-12) font-medium" style={{ color: st.color, background: st.bg }}>{st.label}</span>
          </div>
          <p className="font-site mt-3 text-(length:--fs-20) font-light leading-snug">{r.title}</p>
          <p className="mt-2 text-(length:--fs-14) text-(--s-ink-2)">{[r.area, r.dueDate ? `έως ${day(r.dueDate)}` : null].filter(Boolean).join(' · ')}</p>
          {r.bid && <p className="font-num mt-3 text-(length:--fs-18) tabular-nums">{eur(r.bid.amount ?? 0)} <span className="text-(length:--fs-13) text-(--s-mute)">χωρίς ΦΠΑ</span></p>}
        </Link>
      </li>
    );
  };
  return (
    <PortalShell user={user} org={org} active="rfps">
      <Container className="py-14 md:py-20">
        <PageTitle eyebrow="Αιτήματα προσφοράς" title="Ζητάμε την τιμή σας">
          {open.length ? `${open.length === 1 ? 'Ένα αίτημα περιμένει' : `${open.length} αιτήματα περιμένουν`} την απάντησή σας.` : null} Σε κάθε αίτημα βρίσκετε τα specs (εργασίες, ποσότητες, κάτοψη) και δίνετε το ποσό σας.
        </PageTitle>
        {all.length === 0 ? (
          <div className="mt-12"><Empty title="Κανένα αίτημα ακόμη">Όταν σας ζητήσουμε προσφορά για ένα έργο, θα εμφανιστεί εδώ.</Empty></div>
        ) : (
          <>
            {open.length > 0 && <ul className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-reveal data-stagger>{open.map(card)}</ul>}
            {rest.length > 0 && (
              <>
                <h2 className="font-site mt-16 text-(length:--fs-24) font-light">Προηγούμενα</h2>
                <ul className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{rest.map(card)}</ul>
              </>
            )}
          </>
        )}
      </Container>
    </PortalShell>
  );
}
