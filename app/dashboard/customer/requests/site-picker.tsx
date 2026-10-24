'use client';

// Επιλογή τοποθεσίας για αίτημα προσφοράς: μία από τις αποθηκευμένες ή «άλλη διεύθυνση» (ελεύθερο κείμενο).
// ΥΠΟΧΡΕΩΤΙΚΗ: η θέση ορίζει μεταφορικά, επίβλεψη και συνεργείο — αρκεί πόλη ή περιοχή.
import Link from 'next/link';
import { FiMapPin } from 'react-icons/fi';

export type PickSite = { id: string; label: string; line: string; isDefault: boolean };

export function SitePicker({ id, sites, value, onChange, text, onText, field, showError = false }: {
  id: string; sites: PickSite[]; value: string; onChange: (v: string) => void; text: string; onText: (v: string) => void; field: string;
  /** Δείξε το «λείπει» (μετά από απόπειρα αποστολής). */
  showError?: boolean;
}) {
  const chosen = sites.find((s) => s.id === value);
  const missing = !chosen && text.trim().length < 2;
  const errId = `${id}-err`;
  return (
    <div>
      <label htmlFor={id} className="block text-(length:--fs-13) text-(--s-mute)">Πού είναι το έργο <span aria-hidden>*</span></label>
      {sites.length > 0 && (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} min-h-12`}>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.label}{s.line ? ` — ${s.line}` : ''}</option>)}
          <option value="">Άλλη διεύθυνση…</option>
        </select>
      )}
      {(!sites.length || !value) && (
        <input id={sites.length ? `${id}-text` : id} aria-label={sites.length ? 'Άλλη διεύθυνση' : undefined} value={text} onChange={(e) => onText(e.target.value)} maxLength={300}
          required aria-required="true" aria-invalid={showError && missing} aria-describedby={showError && missing ? errId : undefined}
          placeholder="Πόλη, περιοχή ή διεύθυνση — π.χ. Κηφισιά, Θάσος" className={`${field} min-h-12 ${sites.length ? 'mt-2' : ''} ${showError && missing ? 'border-[#B42318]' : ''}`} autoComplete="street-address" />
      )}
      {showError && missing && <p id={errId} className="mt-1.5 text-(length:--fs-13) text-[#B42318]">Πείτε μας πού είναι το έργο — αρκεί η πόλη ή η περιοχή.</p>}
      <p className="mt-1.5 text-(length:--fs-12) text-(--s-mute)">
        {chosen ? 'Ο τεχνικός φάκελος θα μπει σε αυτή την τοποθεσία.'
          : 'Η θέση μάς χρειάζεται για μεταφορικά, επίβλεψη και το συνεργείο που θα αναλάβει. Αν δεν θέλετε να δώσετε διεύθυνση, αρκεί η πόλη ή η περιοχή.'}
      </p>
      <Link href="/dashboard/customer/profile#sites" className="s-link mt-1 inline-flex min-h-11 items-center gap-1.5 text-(length:--fs-13) font-semibold text-(--s-ink-2)">
        <FiMapPin className="size-3.5 shrink-0" aria-hidden />Οι τοποθεσίες μου
      </Link>
    </div>
  );
}
