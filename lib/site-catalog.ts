import 'server-only';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { classificationMembers } from '@/lib/item-classifications';

/**
 * Δεδομένα του δημόσιου website: κατάλογος ΧΩΡΙΣ τιμές. Πηγή: ο καθρέφτης ειδών (SoftoneItem), οι
 * φωτογραφίες (ItemMedia) και οι κατηγορίες (SoftoneClassification + μέλη από SoftOne, cache 5′).
 * Αν το SoftOne δεν απαντά, ο κατάλογος δουλεύει χωρίς φίλτρο κατηγορίας — ποτέ «σπασμένη» σελίδα.
 */

export type SiteKind = 'stone' | 'tile' | 'sack';
const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
export function siteKind(name: string): SiteKind {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout|χρωστ/.test(n)) return 'sack';
  if (/πετρ|stone|τραβερτ|travert|μαρμαρ/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stone';
  return 'tile';
}

export async function company() {
  const [name, legal, phone, email, address, logoUrl] = await Promise.all([
    getSetting<string>('company.name'), getSetting<string>('company.legalName'), getSetting<string>('company.phone'),
    getSetting<string>('company.email'), getSetting<string>('company.address'), getSetting<string>('company.logoUrl'),
  ]);
  return { name: (name ?? 'ATELIER').trim(), legal: legal?.trim() ?? null, phone: phone ?? null, email: email ?? null, address: address ?? null, logoUrl: logoUrl || null };
}

async function membership() {
  try {
    const m = await classificationMembers();
    return new Map(m.filter((x) => x.sodtype === 51).map((x) => [x.mtrl, { category: x.category, group: x.group }]));
  } catch {
    return null;
  }
}

/** Κατηγορίες ειδών με πλήθος ενεργών ειδών (μόνο όσες έχουν είδη). */
export async function siteCategories() {
  const [cats, mem] = await Promise.all([
    prisma.softoneClassification.findMany({ where: { kind: 'CATEGORY', sodtype: 51, isActive: true }, orderBy: { code: 'asc' }, select: { code: true, name: true } }),
    membership(),
  ]);
  if (!mem) return [];
  const count = new Map<number, number>();
  for (const v of mem.values()) if (v.category != null) count.set(v.category, (count.get(v.category) ?? 0) + 1);
  return cats.map((c) => ({ code: c.code, name: c.name, count: count.get(c.code) ?? 0 })).filter((c) => c.count > 0);
}

async function photos(mtrls: number[]) {
  const media = await prisma.itemMedia.findMany({
    where: { mtrl: { in: mtrls }, kind: 'IMAGE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { mtrl: true, publicUrl: true, thumbUrl: true },
  });
  const out = new Map<number, { url: string; thumb: string }[]>();
  for (const m of media) out.set(m.mtrl, [...(out.get(m.mtrl) ?? []), { url: m.publicUrl, thumb: m.thumbUrl ?? m.publicUrl }]);
  return out;
}

export const PAGE_SIZE = 24;

export async function siteProducts(opts: { q?: string; category?: number | null; page?: number; take?: number; mtrls?: number[] }) {
  const mem = opts.category != null ? await membership() : null;
  const inCategory = mem && opts.category != null ? [...mem.entries()].filter(([, v]) => v.category === opts.category).map(([k]) => k) : null;
  const q = opts.q?.trim();
  const where = {
    isService: false, isActive: true,
    ...(inCategory ? { mtrl: { in: inCategory } } : {}),
    ...(opts.mtrls ? { AND: [{ mtrl: { in: opts.mtrls } }] } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q, mode: 'insensitive' as const } }, { name2: { contains: q, mode: 'insensitive' as const } }] } : {}),
  };
  const take = opts.take ?? PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const [total, items] = await Promise.all([
    prisma.softoneItem.count({ where }),
    prisma.softoneItem.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * take, take, select: { mtrl: true, code: true, name: true, unit1: true } }),
  ]);
  const [ph, units] = await Promise.all([photos(items.map((i) => i.mtrl)), prisma.softoneUnit.findMany({ select: { code: true, shortcut: true } })]);
  const unit = new Map(units.map((u) => [String(u.code), u.shortcut]));
  return {
    total, page, pages: Math.max(1, Math.ceil(total / take)),
    items: items.map((i) => ({ mtrl: i.mtrl, code: i.code, name: i.name, unit: i.unit1 ? unit.get(i.unit1) ?? null : null, photo: ph.get(i.mtrl)?.[0]?.thumb ?? null, kind: siteKind(i.name) })),
  };
}

export async function siteProduct(mtrl: number) {
  const item = await prisma.softoneItem.findFirst({ where: { mtrl, isService: false, isActive: true }, select: { mtrl: true, code: true, name: true, name2: true, unit1: true } });
  if (!item) return null;
  const [ph, attrs, mem, unit, classes] = await Promise.all([
    photos([mtrl]),
    prisma.itemAttribute.findMany({ where: { mtrl }, orderBy: { order: "asc" }, select: { name: true, value: true, unit: true } }).catch(() => []),
    membership(),
    item.unit1 ? prisma.softoneUnit.findUnique({ where: { code: Number(item.unit1) }, select: { shortcut: true, name: true } }) : null,
    prisma.softoneClassification.findMany({ where: { sodtype: 51 }, select: { kind: true, code: true, name: true } }),
  ]);
  const m = mem?.get(mtrl);
  const label = (kind: string, code: number | null | undefined) => (code == null ? null : classes.find((c) => c.kind === kind && c.code === code)?.name ?? null);
  return {
    ...item, photos: ph.get(mtrl) ?? [], attributes: attrs, unit: unit?.name ?? null, kind: siteKind(item.name),
    category: m ? { code: m.category, name: label('CATEGORY', m.category) } : null,
    group: m ? label('GROUP', m.group) : null,
  };
}

/** Για τα «σχετικά»: άλλα είδη της ίδιας κατηγορίας. */
export async function related(mtrl: number, category: number | null | undefined) {
  if (category == null) return [];
  const r = await siteProducts({ category, take: 9 });
  return r.items.filter((i) => i.mtrl !== mtrl).slice(0, 8);
}
