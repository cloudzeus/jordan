import 'server-only';
import { prisma } from '@/lib/db';
import { InstallGuideSchema, type InstallGuide } from './guide';

/** Οι πιο πρόσφατοι οδηγοί εγκατάστασης των ειδών (μόνο όσα έχουν). */
export async function itemGuides(mtrls: number[]): Promise<{ mtrl: number; item: string; guide: InstallGuide }[]> {
  if (!mtrls.length) return [];
  const rows = await prisma.itemInstallGuide.findMany({ where: { mtrl: { in: mtrls } }, orderBy: { createdAt: 'desc' } });
  const items = await prisma.softoneItem.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true } });
  const name = new Map(items.map((i) => [i.mtrl, `${i.code} · ${i.name}`]));
  const seen = new Set<number>();
  const out: { mtrl: number; item: string; guide: InstallGuide }[] = [];
  for (const r of rows) {
    if (seen.has(r.mtrl)) continue;
    const g = InstallGuideSchema.safeParse(r.content);
    if (!g.success) continue;
    seen.add(r.mtrl);
    out.push({ mtrl: r.mtrl, item: name.get(r.mtrl) ?? String(r.mtrl), guide: g.data });
  }
  return out;
}
