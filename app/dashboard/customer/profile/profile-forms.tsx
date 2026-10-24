'use client';

// Προφίλ πελάτη: στοιχεία επαφής, αίτημα αλλαγής εταιρικών στοιχείων, τοποθεσίες. Ύφος website (.site.portal).
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FiCheck, FiEdit2, FiLoader, FiMapPin, FiMoreVertical, FiPlus, FiStar, FiTrash2, FiX } from 'react-icons/fi';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { COMPANY_FIELDS, type CompanyData } from '@/lib/customer-profile-core';
import { assignSiteAction, deleteSiteAction, requestCompanyChangeAction, saveContactAction, saveSiteAction } from './actions';

const field = 'mt-1.5 min-h-12 w-full rounded-lg border border-(--s-line) bg-white px-3 text-(length:--fs-15) text-(--s-ink) outline-hidden transition-colors focus-visible:border-(--s-ink) disabled:bg-(--s-paper) disabled:text-(--s-ink-2)';
const label = 'block text-(length:--fs-13) font-semibold text-(--s-ink-2)';

type Result = { ok: true } | { ok: false; message: string };

/** Κοινή συμπεριφορά υποβολής: φόρτωση, μήνυμα σφάλματος, «αποθηκεύτηκε», ανανέωση σελίδας. */
function useSubmit() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const run = (fn: () => Promise<Result>, after?: () => void) => start(async () => {
    setError(null); setDone(false);
    const r = await fn();
    if (!r.ok) { setError(r.message); return; }
    setDone(true); after?.(); router.refresh();
  });
  return { pending, error, done, run, setDone };
}

function Feedback({ error, done, okText }: { error: string | null; done: boolean; okText: string }) {
  if (error) return <p role="alert" className="text-(length:--fs-14) font-medium text-(--s-danger)">{error}</p>;
  if (done) return <p role="status" className="inline-flex items-center gap-1.5 text-(length:--fs-14) font-medium text-(--s-done)"><FiCheck className="size-4" aria-hidden />{okText}</p>;
  return null;
}

function Text({ id, l, value, onChange, disabled, type = 'text', auto, hint }: { id: string; l: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string; auto?: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{l}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} autoComplete={auto} className={field} />
      {hint && <p className="mt-1 text-(length:--fs-13) text-(--s-mute)">{hint}</p>}
    </div>
  );
}

export function ContactForm({ initial, locked }: { initial: { name: string; email: string; role: string | null; phone: string | null; mobile: string | null }; locked: string | null }) {
  const [v, setV] = React.useState({ name: initial.name, role: initial.role ?? '', phone: initial.phone ?? '', mobile: initial.mobile ?? '' });
  const s = useSubmit();
  const up = (k: keyof typeof v) => (x: string) => { s.setDone(false); setV((p) => ({ ...p, [k]: x })); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); s.run(() => saveContactAction(v)); }} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Text id="pf-name" l="Ονοματεπώνυμο" value={v.name} onChange={up('name')} disabled={!!locked} auto="name" />
        <Text id="pf-role" l="Ιδιότητα (προαιρετικό)" value={v.role} onChange={up('role')} disabled={!!locked} auto="organization-title" hint="Π.χ. «Ιδιοκτήτης» ή «Υπεύθυνος έργου»" />
        <Text id="pf-mobile" l="Κινητό" type="tel" value={v.mobile} onChange={up('mobile')} disabled={!!locked} auto="tel" hint="Σε αυτό σας καλούμε για ραντεβού και παραδόσεις" />
        <Text id="pf-phone" l="Σταθερό (προαιρετικό)" type="tel" value={v.phone} onChange={up('phone')} disabled={!!locked} auto="tel-local" />
      </div>
      <p className="text-(length:--fs-14) text-(--s-ink-2)">Email σύνδεσης: <span className="font-semibold text-(--s-ink)">{initial.email}</span> — για αλλαγή του, επικοινωνήστε μαζί μας.</p>
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={s.pending || !!locked} className="p-btn p-btn-primary">{s.pending ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}Αποθήκευση</button>
        <Feedback error={locked ?? s.error} done={s.done} okText="Αποθηκεύτηκε" />
      </div>
    </form>
  );
}

export function CompanyForm({ company, pending: hasPending, locked }: { company: CompanyData; pending: boolean; locked: string | null }) {
  const [edit, setEdit] = React.useState(false);
  const [v, setV] = React.useState<Record<string, string>>(() => Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, company[f.key] ?? ''])));
  const [note, setNote] = React.useState('');
  const s = useSubmit();
  if (!edit) {
    return (
      <div>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {COMPANY_FIELDS.map((f) => (
            <div key={f.key} className="border-b border-(--s-line) pb-3">
              <dt className="p-label text-(--s-ink-2)">{f.label}</dt>
              <dd className="mt-1 text-(length:--fs-16) text-(--s-ink)">{company[f.key] || <span className="text-(--s-mute)">—</span>}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => setEdit(true)} disabled={hasPending || !!locked} className="p-btn p-btn-ghost"><FiEdit2 className="size-4" aria-hidden />Ζητήστε αλλαγή</button>
          {s.done && <Feedback error={null} done okText="Το αίτημα στάλθηκε — θα σας ενημερώσουμε μόλις περάσει η αλλαγή." />}
          {hasPending && !s.done && <p className="text-(length:--fs-14) text-(--s-ink-2)">Έχετε αίτημα αλλαγής σε εξέλιξη (δείτε παρακάτω).</p>}
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); s.run(() => requestCompanyChangeAction({ values: v, note: note || null }), () => setEdit(false)); }} className="space-y-5">
      <p className="rounded-lg bg-(--s-paper) p-4 text-(length:--fs-15) text-(--s-ink-2)">Αλλάξτε ό,τι χρειάζεται. Τα εταιρικά στοιχεία μπαίνουν στα τιμολόγιά σας, γι’ αυτό τα ελέγχουμε πριν τα περάσουμε — θα σας ενημερώσουμε μόλις γίνει.</p>
      <div className="grid gap-5 sm:grid-cols-2">
        {COMPANY_FIELDS.map((f) => <Text key={f.key} id={`pc-${f.key}`} l={f.label} value={v[f.key] ?? ''} onChange={(x) => setV((p) => ({ ...p, [f.key]: x }))} type={f.key === 'email' ? 'email' : f.key === 'phone' ? 'tel' : 'text'} />)}
      </div>
      <div>
        <label htmlFor="pc-note" className={label}>Σημείωση για εμάς (προαιρετικό)</label>
        <textarea id="pc-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} className={`${field} py-3`} placeholder="Π.χ. «Αλλάξαμε έδρα από 1/11»" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={s.pending} className="p-btn p-btn-primary">{s.pending ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}Αποστολή αιτήματος</button>
        <button type="button" onClick={() => setEdit(false)} className="p-btn p-btn-ghost"><FiX className="size-4" aria-hidden />Άκυρο</button>
        <Feedback error={s.error} done={false} okText="" />
      </div>
    </form>
  );
}

export type SiteRow = { id: string; label: string; address: string | null; zip: string | null; district: string | null; city: string | null; floor: string | null; notes: string | null; isDefault: boolean };
const EMPTY = { label: '', address: '', zip: '', district: '', city: '', floor: '', notes: '', isDefault: false };

function SiteForm({ site, onClose, first }: { site: SiteRow | null; onClose: () => void; first: boolean }) {
  const [v, setV] = React.useState(() => site ? { label: site.label, address: site.address ?? '', zip: site.zip ?? '', district: site.district ?? '', city: site.city ?? '', floor: site.floor ?? '', notes: site.notes ?? '', isDefault: site.isDefault } : { ...EMPTY, isDefault: first });
  const s = useSubmit();
  const up = (k: Exclude<keyof typeof v, 'isDefault'>) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  const p = site?.id ?? 'new';
  return (
    <form onSubmit={(e) => { e.preventDefault(); s.run(() => saveSiteAction(site?.id ?? null, v), onClose); }} className="space-y-5 rounded-xl bg-(--s-paper) p-5 sm:p-6" aria-label={site ? `Επεξεργασία: ${site.label}` : 'Νέα τοποθεσία'}>
      <p className="text-(length:--fs-17) font-semibold text-(--s-ink)">{site ? 'Επεξεργασία τοποθεσίας' : 'Νέα τοποθεσία'}</p>
      <div className="grid gap-5 sm:grid-cols-6">
        <div className="sm:col-span-6"><Text id={`st-label-${p}`} l="Όνομα" value={v.label} onChange={up('label')} hint="Πώς τη λέτε εσείς — π.χ. «Σπίτι Κηφισιά», «Κατάστημα Γλυφάδας»" /></div>
        <div className="sm:col-span-4"><Text id={`st-addr-${p}`} l="Οδός και αριθμός" value={v.address} onChange={up('address')} auto="street-address" /></div>
        <div className="sm:col-span-2"><Text id={`st-floor-${p}`} l="Όροφος / διαμέρισμα" value={v.floor} onChange={up('floor')} /></div>
        <div className="sm:col-span-2"><Text id={`st-zip-${p}`} l="ΤΚ" value={v.zip} onChange={up('zip')} auto="postal-code" /></div>
        <div className="sm:col-span-2"><Text id={`st-dist-${p}`} l="Περιοχή" value={v.district} onChange={up('district')} /></div>
        <div className="sm:col-span-2"><Text id={`st-city-${p}`} l="Πόλη" value={v.city} onChange={up('city')} auto="address-level2" /></div>
        <div className="sm:col-span-6">
          <label htmlFor={`st-notes-${p}`} className={label}>Χρήσιμα για το συνεργείο (προαιρετικό)</label>
          <textarea id={`st-notes-${p}`} value={v.notes} onChange={(e) => up('notes')(e.target.value)} rows={3} maxLength={600} className={`${field} py-3`} placeholder="Πρόσβαση, ασανσέρ, στάθμευση, ώρες που επιτρέπονται εργασίες" />
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-(length:--fs-15) text-(--s-ink)">
        <input type="checkbox" checked={v.isDefault} onChange={(e) => setV((x) => ({ ...x, isDefault: e.target.checked }))} className="size-5 accent-(--s-accent)" />
        Κύρια τοποθεσία (προτείνεται πρώτη στα νέα αιτήματα)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={s.pending} className="p-btn p-btn-primary">{s.pending ? <FiLoader className="size-4 animate-spin" aria-hidden /> : <FiCheck className="size-4" aria-hidden />}Αποθήκευση</button>
        <button type="button" onClick={onClose} className="p-btn p-btn-ghost"><FiX className="size-4" aria-hidden />Άκυρο</button>
        <Feedback error={s.error} done={false} okText="" />
      </div>
    </form>
  );
}

/** Τοποθεσίες: κάρτα ανά τοποθεσία (το περιεχόμενό της — εγκαταστάσεις/φάκελοι — το δίνει η σελίδα ως children). */
export function SitesManager({ sites, children, locked }: { sites: (SiteRow & { line: string; installs: number })[]; children: Record<string, React.ReactNode>; locked: string | null }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const s = useSubmit();
  return (
    <div className="space-y-6">
      {sites.map((site) => editing === site.id ? <SiteForm key={site.id} site={site} first={false} onClose={() => setEditing(null)} /> : (
        <article key={site.id} className="rounded-xl ring-1 ring-(--s-line)">
          <header className="flex items-start gap-4 p-5 sm:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-(--s-accent)/10 text-(--s-accent)"><FiMapPin className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-center gap-2 text-(length:--fs-18) font-semibold text-(--s-ink)">
                {site.label}
                {site.isDefault && <span className="p-chip" data-tone="done"><FiStar className="size-3" aria-hidden />Κύρια</span>}
              </h3>
              <p className="mt-0.5 text-(length:--fs-15) text-(--s-ink-2)">{site.line || '—'}</p>
              {site.notes && <p className="mt-2 border-l-2 border-(--s-line) pl-3 text-(length:--fs-14) text-(--s-ink-2)">{site.notes}</p>}
            </div>
            {!locked && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="grid size-11 shrink-0 place-items-center rounded-lg text-(--s-ink-2) hover:bg-(--s-paper)" aria-label={`Ενέργειες για ${site.label}`}><FiMoreVertical className="size-5" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => setEditing(site.id)}><FiEdit2 className="size-4" />Επεξεργασία</DropdownMenuItem>
                  {!site.isDefault && <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => s.run(() => saveSiteAction(site.id, { ...site, isDefault: true }))}><FiStar className="size-4" />Ορισμός ως κύρια</DropdownMenuItem>}
                  <DropdownMenuItem className="cursor-pointer gap-2 text-(--s-danger)" disabled={site.installs > 0}
                    onSelect={() => { if (window.confirm(`Να διαγραφεί η τοποθεσία «${site.label}»;`)) s.run(() => deleteSiteAction(site.id)); }}>
                    <FiTrash2 className="size-4" />{site.installs > 0 ? 'Διαγραφή (έχει έργα)' : 'Διαγραφή'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </header>
          <div className="border-t border-(--s-line) p-5 sm:p-6">{children[site.id]}</div>
        </article>
      ))}
      <Feedback error={s.error} done={false} okText="" />
      {editing === 'new' ? <SiteForm site={null} first={!sites.length} onClose={() => setEditing(null)} />
        : <button type="button" onClick={() => setEditing('new')} disabled={!!locked} className="p-btn p-btn-ghost"><FiPlus className="size-4" aria-hidden />Νέα τοποθεσία</button>}
    </div>
  );
}

/** Παλιότερη προσφορά/έργο χωρίς τοποθεσία: ο πελάτης τη βάζει στη σωστή. */
export function AssignSite({ contractId, sites, locked }: { contractId: string; sites: { id: string; label: string }[]; locked: boolean }) {
  const s = useSubmit();
  if (!sites.length) return null;
  return (
    <label className="flex items-center gap-2 text-(length:--fs-13) text-(--s-ink-2)">
      <span className="sr-only">Τοποθεσία</span>
      <select defaultValue="" disabled={locked || s.pending} onChange={(e) => e.target.value && s.run(() => assignSiteAction(contractId, e.target.value))}
        className="min-h-11 rounded-lg border border-(--s-line) bg-white px-2 text-(length:--fs-14) text-(--s-ink)">
        <option value="">Σε ποια τοποθεσία;</option>
        {sites.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      {s.error && <span role="alert" className="text-(--s-danger)">{s.error}</span>}
    </label>
  );
}
