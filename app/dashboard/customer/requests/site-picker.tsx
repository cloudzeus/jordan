'use client';

// Επιλογή τοποθεσίας για αίτημα προσφοράς: μία από τις αποθηκευμένες ή «άλλη διεύθυνση» (ελεύθερο κείμενο).
import Link from 'next/link';
import { FiMapPin } from 'react-icons/fi';

export type PickSite = { id: string; label: string; line: string; isDefault: boolean };

export function SitePicker({ id, sites, value, onChange, text, onText, field }: {
  id: string; sites: PickSite[]; value: string; onChange: (v: string) => void; text: string; onText: (v: string) => void; field: string;
}) {
  const chosen = sites.find((s) => s.id === value);
  return (
    <div>
      <label htmlFor={id} className="block text-(length:--fs-13) text-(--s-mute)">Πού</label>
      {sites.length > 0 && (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} min-h-12`}>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.label}{s.line ? ` — ${s.line}` : ''}</option>)}
          <option value="">Άλλη διεύθυνση…</option>
        </select>
      )}
      {(!sites.length || !value) && (
        <input id={sites.length ? `${id}-text` : id} aria-label={sites.length ? 'Άλλη διεύθυνση' : undefined} value={text} onChange={(e) => onText(e.target.value)} maxLength={300}
          placeholder="Περιοχή ή διεύθυνση — π.χ. Κηφισιά" className={`${field} min-h-12 ${sites.length ? 'mt-2' : ''}`} autoComplete="street-address" />
      )}
      <p className="mt-1.5 text-(length:--fs-12) text-(--s-mute)">
        {chosen ? 'Ο τεχνικός φάκελος θα μπει σε αυτή την τοποθεσία.' : sites.length ? 'Μπορείτε να την αποθηκεύσετε στο προφίλ σας για την επόμενη φορά.' : 'Αποθηκεύστε τους χώρους σας μία φορά και διαλέγετε από λίστα.'}
      </p>
      <Link href="/dashboard/customer/profile#sites" className="s-link mt-1 inline-flex min-h-11 items-center gap-1.5 text-(length:--fs-13) font-semibold text-(--s-ink-2)">
        <FiMapPin className="size-3.5 shrink-0" aria-hidden />Οι τοποθεσίες μου
      </Link>
    </div>
  );
}
