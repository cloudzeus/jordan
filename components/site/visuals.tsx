/** Πλήθος φωτογραφιών στο public/site/stones (stone-1.jpg … stone-N.jpg). */
const STONES = 9;

/**
 * Είδος χωρίς δική του φωτογραφία: ΠΡΟΣΩΡΙΝΑ μια φωτογραφία πέτρας, σταθερή ανά είδος (από το MTRL —
 * ίδια παντού, δεν «αλλάζει» σε κάθε φόρτωση), με διακριτική σήμανση «Ενδεικτική φωτογραφία».
 * Μόλις ανέβουν φωτογραφίες στο είδος (ItemMedia), εμφανίζονται αυτές.
 */
export function ProductPlaceholder({ mtrl, name, label = true }: { mtrl: number; name: string; label?: boolean }) {
  const n = (Math.abs(Math.imul(mtrl, 2654435761)) % STONES) + 1;
  return (
    <div className="relative size-full bg-(--s-paper)">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/site/stones/stone-${n}.jpg`} alt={`${name} — ενδεικτική φωτογραφία`} loading="lazy" decoding="async" className="s-img size-full object-cover" />
      {label && <span className="absolute bottom-2 left-2 bg-white/85 px-2 py-0.5 text-(length:--fs-11) text-(--s-ink-2)">Ενδεικτική φωτογραφία</span>}
    </div>
  );
}
