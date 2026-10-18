// lib/assistant/search.ts — SERVER. Υβριδική αναζήτηση στη μνήμη του Air Jordan (pgvector + pg_trgm).
//
//  1. σημασιολογική: cosine απόσταση του embedding του ερωτήματος (καταλαβαίνει «πλακάκια» ≈ «κεραμικά»)·
//  2. λεκτική: word_similarity σε folded + φωνητική μορφή (τόνοι, greeklish, ορθογραφικά λάθη)·
//  3. κωδικοί: ακριβές «περιέχει» για ό,τι μοιάζει με κωδικό (ΕΡΓ-0012, ΠΑΡ0000057, ΑΦΜ).
// Οι τρεις κατατάξεις συγχωνεύονται με RRF· οι τύποι οντοτήτων που φαίνονται στο ερώτημα ενισχύονται.
import 'server-only';
import { prisma } from '@/lib/db';
import { embed } from './openrouter';
import { detectIntent, fold, keywords, numericRefs, phonetic, searchTextOf, type EntityKind } from './text';
import { rrf, toVectorLiteral, type Ranked } from './vector';

export interface KnowledgeHit {
  id: string;
  source: string;
  refKey: string;
  title: string;
  body: string;
  url: string | null;
  score: number;
}

export interface MemoryHit { id: string; kind: string; text: string; refKey: string | null; similarity: number }

const SOURCES_FOR: Record<EntityKind, string[]> = {
  project: ['project', 'document'],
  trader: ['trader'],
  item: ['item', 'service', 'unit', 'classification', 'lookup'],
  partner: ['partner'],
  offer: ['offer'],
  appointment: ['appointment'],
  lead: ['lead'],
  order_request: ['order_request'],
  help: ['wiki', 'glossary'],
};

/** Λεκτική μορφή: μόνο οι ουσιαστικές λέξεις (χωρίς «ποιο είναι το…»), folded + φωνητική. */
function lexicalForms(q: string): { folded: string; phonetic: string } {
  const kw = keywords(q).join(' ') || fold(q);
  return { folded: kw, phonetic: phonetic(kw) };
}

/** Embedding ερωτήματος — null αν ο πάροχος δεν απαντήσει (τότε μόνο λεκτική αναζήτηση). */
export async function embedQuery(q: string, userId?: string | null): Promise<string | null> {
  try {
    const [v] = await embed([q], { operation: 'assistant.query', userId });
    return toVectorLiteral(v);
  } catch (e) {
    console.error('assistant embedQuery failed', e);
    return null;
  }
}

export async function searchKnowledge(
  query: string,
  opts: { sources?: string[]; limit?: number; vector?: string | null; userId?: string | null } = {},
): Promise<KnowledgeHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 25);
  const sources = opts.sources?.length ? opts.sources : null;
  const intent = detectIntent(q);
  const vec = opts.vector !== undefined ? opts.vector : await embedQuery(q, opts.userId);
  const { folded, phonetic: ph } = lexicalForms(q);
  const nums = numericRefs(q);

  const [vecRows, trgRows, codeRows, numRows] = await Promise.all([
    vec
      ? prisma.$queryRawUnsafe<{ id: string; s: number }[]>(
        `SELECT "id", 1 - ("embedding" <=> $1::vector) AS s FROM "AssistantChunk"
         WHERE "embedding" IS NOT NULL ${sources ? 'AND "source" = ANY($2)' : ''}
         ORDER BY "embedding" <=> $1::vector LIMIT 30`,
        ...(sources ? [vec, sources] : [vec]),
      )
      : Promise.resolve([]),
    prisma.$queryRawUnsafe<{ id: string; s: number }[]>(
      `SELECT "id", GREATEST(word_similarity($1, "searchText"), word_similarity($2, "searchText")) AS s
       FROM "AssistantChunk" ${sources ? 'WHERE "source" = ANY($3)' : ''}
       ORDER BY s DESC LIMIT 30`,
      ...(sources ? [folded, ph, sources] : [folded, ph]),
    ),
    intent.codes.length
      ? prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "AssistantChunk" WHERE (${intent.codes.map((_, i) => `"searchText" LIKE $${i * 2 + 1} OR "searchText" LIKE $${i * 2 + 2}`).join(' OR ')})
         ${sources ? `AND "source" = ANY($${intent.codes.length * 2 + 1})` : ''} LIMIT 30`,
        ...intent.codes.flatMap((c) => [`%${fold(c)}%`, `%${phonetic(c)}%`]),
        ...(sources ? [sources] : []),
      )
      : Promise.resolve([]),
    // «έργο 40» → κωδικός 0000040: η λέξη του ΚΩΔΙΚΟΥ στον τίτλο («Έργο 0000040 · …»), με όσα μηδενικά μπροστά —
    // όχι αριθμοί μέσα στο όνομα («40kg»).
    nums.length
      ? prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "AssistantChunk" WHERE "title" ~ $1 ${sources ? 'AND "source" = ANY($2)' : ''} LIMIT 30`,
        `^[^·]*\\s0*(${nums.join('|')})\\s·`,
        ...(sources ? [sources] : []),
      )
      : Promise.resolve([]),
  ]);

  const vecList: Ranked[] = vecRows.filter((r) => r.s > 0.2).map((r) => ({ id: r.id, score: r.s }));
  const trgList: Ranked[] = trgRows.filter((r) => r.s >= 0.3).map((r) => ({ id: r.id, score: r.s }));
  const codeList: Ranked[] = codeRows.map((r) => ({ id: r.id, score: 1 }));
  const numList: Ranked[] = numRows.map((r) => ({ id: r.id, score: 1 }));
  const fused = rrf([vecList, trgList, codeList, numList], { weights: [1, 1.1, 2, 1.5] });
  if (!fused.length) return [];

  const rows = await prisma.assistantChunk.findMany({
    where: { id: { in: fused.slice(0, 60).map((f) => f.id) } },
    select: { id: true, source: true, refKey: true, title: true, body: true, url: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const boosted = new Set(intent.entities.flatMap((e) => SOURCES_FOR[e]));
  return fused
    .map((f) => {
      const r = byId.get(f.id);
      if (!r) return null;
      return { ...r, score: f.score * (boosted.has(r.source) ? 1.35 : 1) };
    })
    .filter((x): x is KnowledgeHit => !!x)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Μνήμες (ό,τι έχει μάθει) σχετικές με το ερώτημα. Σημειώνει τη χρήση τους. */
export async function searchMemories(query: string, vec: string | null, limit = 6): Promise<MemoryHit[]> {
  const { folded, phonetic: ph } = lexicalForms(query);
  const rows = vec
    ? await prisma.$queryRawUnsafe<MemoryHit[]>(
      `SELECT "id", "kind", "text", "refKey",
              GREATEST(COALESCE(1 - ("embedding" <=> $1::vector), 0), word_similarity($2, "searchText"), word_similarity($3, "searchText")) AS similarity
       FROM "AssistantMemory" ORDER BY similarity DESC LIMIT $4`,
      vec, folded, ph, limit * 2,
    )
    : await prisma.$queryRawUnsafe<MemoryHit[]>(
      `SELECT "id", "kind", "text", "refKey", GREATEST(word_similarity($1, "searchText"), word_similarity($2, "searchText")) AS similarity
       FROM "AssistantMemory" ORDER BY similarity DESC LIMIT $3`,
      folded, ph, limit * 2,
    );
  const hits = rows.filter((r) => r.similarity >= 0.42).slice(0, limit);
  if (hits.length) {
    await prisma.assistantMemory.updateMany({ where: { id: { in: hits.map((h) => h.id) } }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => null);
  }
  return hits;
}

export const MEMORY_KINDS = ['alias', 'fact', 'preference', 'answer'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/**
 * Αποθηκεύει κάτι που έμαθε. Αν υπάρχει ήδη σχεδόν ίδια μνήμη (cosine ≥ 0.93), την ενημερώνει
 * αντί να γράψει διπλότυπο. Γράφει ΜΟΝΟ στο AssistantMemory.
 */
export async function remember(input: { kind: MemoryKind; text: string; refKey?: string | null; userId?: string | null; messageId?: string | null }): Promise<{ id: string; updated: boolean }> {
  const text = input.text.trim().slice(0, 1000);
  if (!text) throw new Error('Κενή μνήμη');
  const vec = await embedQuery(text, input.userId);
  if (vec) {
    const [near] = await prisma.$queryRawUnsafe<{ id: string; s: number }[]>(
      `SELECT "id", 1 - ("embedding" <=> $1::vector) AS s FROM "AssistantMemory" WHERE "embedding" IS NOT NULL AND "kind" = $2 ORDER BY "embedding" <=> $1::vector LIMIT 1`,
      vec, input.kind,
    );
    if (near && near.s >= 0.93) {
      await prisma.$executeRawUnsafe(
        `UPDATE "AssistantMemory" SET "text" = $1, "searchText" = $2, "embedding" = $3::vector, "refKey" = COALESCE($4, "refKey"), "updatedAt" = now() WHERE "id" = $5`,
        text, searchTextOf(text), vec, input.refKey ?? null, near.id,
      );
      return { id: near.id, updated: true };
    }
  }
  const row = await prisma.assistantMemory.create({
    data: { kind: input.kind, text, refKey: input.refKey ?? null, searchText: searchTextOf(text), userId: input.userId ?? null, messageId: input.messageId ?? null },
    select: { id: true },
  });
  if (vec) await prisma.$executeRawUnsafe(`UPDATE "AssistantMemory" SET "embedding" = $1::vector WHERE "id" = $2`, vec, row.id);
  return { id: row.id, updated: false };
}
