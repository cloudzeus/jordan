import { z } from 'zod';

export const attributeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(300),
  unit: z.string().trim().max(20).nullable().optional(),
});
export type Attribute = z.infer<typeof attributeSchema>;
export type Source = { url: string; title: string };
export type Suggestion = Attribute & { sourceUrl: string; evidence: string };
export type WebImage = { url: string; sourceUrl: string; title: string };
export type WebDocument = { url: string; sourceUrl: string; title: string };
export type SourcePreview = { url: string | null; title: string; text: string; kind: 'WEB' | 'PDF' | 'TEXT'; images: WebImage[]; documents: WebDocument[]; hash?: string };
export type Research = { attributes: Suggestion[]; images: WebImage[]; sources: Source[]; documents?: WebDocument[]; warnings?: string[]; note: string; existing: Attribute[] };
export const attributeKey = (name: string) => name.trim().normalize('NFC').toLocaleLowerCase('el');

export function mergeAttributes(existing: Attribute[], selected: Attribute[]) {
  const keys = selected.map((a) => attributeKey(a.name));
  if (new Set(keys).size !== keys.length) throw new Error('Το ίδιο χαρακτηριστικό έχει επιλεγεί δύο φορές.');
  const merged = new Map(existing.map((a) => [attributeKey(a.name), a]));
  for (const a of selected) merged.set(attributeKey(a.name), a);
  if (merged.size > 100) throw new Error('Επιτρέπονται έως 100 χαρακτηριστικά.');
  return [...merged.values()];
}

export function sameAttributes(a: Attribute[], b: Attribute[]) {
  const normalized = (xs: Attribute[]) => JSON.stringify(xs.map((x) => [x.name, x.value, x.unit || null]));
  return normalized(a) === normalized(b);
}

export function publicHttpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    if (!u.hostname.includes('.') || u.hostname.endsWith('.local') || u.hostname.endsWith('.localhost')) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

export const answerSchema = z.object({
  note: z.string().max(2000).default(''),
  attributes: z.array(attributeSchema.extend({ sourceUrl: z.string(), evidence: z.string().min(1).max(1200) })).max(40),
});

/** Only expose attributes backed by a citation returned by the search provider. */
export function parseResearch(text: string, sources: Source[]) {
  const answer = answerSchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
  const urls = new Set(sources.map((s) => publicHttpsUrl(s.url)).filter(Boolean));
  const seen = new Set<string>();
  return { note: answer.note, attributes: answer.attributes.filter((a) => {
    const url = publicHttpsUrl(a.sourceUrl);
    const key = attributeKey(a.name);
    if (!url || !urls.has(url) || seen.has(key)) return false;
    a.sourceUrl = url;
    seen.add(key);
    return true;
  }) };
}
