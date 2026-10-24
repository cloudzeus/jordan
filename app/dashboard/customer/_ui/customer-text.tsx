// «Κείμενο για τον πελάτη» με δομή: σύντομες γραμμές χωρίς τελεία → επικεφαλίδες, «• …» → λίστα,
// «1. …» → βήματα, τα υπόλοιπα παράγραφοι. Το κείμενο το γράφει ο χρήστης ή το AI σε απλό κείμενο.
type Block = { kind: 'h' | 'p' | 'ul' | 'ol'; items: string[] };

export function textBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[•\-–]\s+(.*)$/);
    const step = line.match(/^\d+[.)]\s+(.*)$/);
    const last = out[out.length - 1];
    if (bullet) { if (last?.kind === 'ul') last.items.push(bullet[1]); else out.push({ kind: 'ul', items: [bullet[1]] }); continue; }
    if (step) { if (last?.kind === 'ol') last.items.push(step[1]); else out.push({ kind: 'ol', items: [step[1]] }); continue; }
    const heading = line.length <= 60 && !/[.!;·:,]$/.test(line) && !/[.!;]\s/.test(line);
    out.push({ kind: heading ? 'h' : 'p', items: [line] });
  }
  return out;
}

export function CustomerText({ text }: { text: string }) {
  return (
    <div className="max-w-2xl space-y-4 text-(length:--fs-17) leading-relaxed text-(--s-ink-2)">
      {textBlocks(text).map((b, i) => {
        if (b.kind === 'h') return <h3 key={i} className="pt-2 text-(length:--fs-18) font-semibold text-(--s-ink)">{b.items[0]}</h3>;
        if (b.kind === 'p') return <p key={i}>{b.items[0]}</p>;
        if (b.kind === 'ul') return (
          <ul key={i} className="space-y-2">
            {b.items.map((x) => <li key={x} className="relative pl-5 before:absolute before:left-0 before:top-[0.7em] before:size-1.5 before:rounded-full before:bg-(--s-accent)">{x}</li>)}
          </ul>
        );
        return (
          <ol key={i} className="space-y-2">
            {b.items.map((x, j) => (
              <li key={x} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-(--s-ink) text-(length:--fs-13) font-semibold text-white">{j + 1}</span>
                <span>{x}</span>
              </li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}
