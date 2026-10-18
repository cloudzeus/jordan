// lib/assistant/vector.ts — ΚΑΘΑΡΟ. Βοηθητικά για pgvector και τη συγχώνευση κατατάξεων.

/** number[] → literal του pgvector («[0.1,0.2,…]»). Πετά αν υπάρχει μη πεπερασμένη τιμή. */
export function toVectorLiteral(v: number[]): string {
  if (!v.length || v.some((x) => !Number.isFinite(x))) throw new Error('Μη έγκυρο διάνυσμα');
  return `[${v.join(',')}]`;
}

export interface Ranked { id: string; score: number }

/**
 * Reciprocal Rank Fusion: συνδυάζει κατατάξεις (διανυσματική, τρίγραμμα, κωδικοί) χωρίς να
 * χρειάζεται κοινή κλίμακα σκορ. `weights` ανά λίστα (π.χ. ακριβής κωδικός = ισχυρότερος).
 */
export function rrf(lists: Ranked[][], opts: { k?: number; weights?: number[] } = {}): Ranked[] {
  const k = opts.k ?? 60;
  const acc = new Map<string, number>();
  lists.forEach((list, li) => {
    const w = opts.weights?.[li] ?? 1;
    list.forEach((r, rank) => acc.set(r.id, (acc.get(r.id) ?? 0) + w / (k + rank + 1)));
  });
  return [...acc.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}
