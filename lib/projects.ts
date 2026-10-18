import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Ετικέτες του PRJC.ACTSTATUS («Status» έργου).
 *
 * Το SoftOne ΔΕΝ δίνει τον πίνακα μνήμης `$ACTSTATUS` μέσω Web Services (το `getSelectorData`
 * απαντά «No data», και το browser των έργων δεν έχει στήλη status). Οι ετικέτες ορίζονται
 * εδώ· όσες λείπουν εμφανίζονται ως «Status N» ώστε να μη χάνεται η πληροφορία.
 */
export const PROJECT_STATUS_LABEL: Record<number, string> = {};

export function projectStatusLabel(code: number | null): string {
  if (code == null) return '—';
  return PROJECT_STATUS_LABEL[code] ?? `Status ${code}`;
}

export type ProjectListRow = {
  prjc: number;
  code: string;
  name: string;
  customer: string | null;
  supplier: string | null;
  actStatus: number | null;
  statusLabel: string;
  fromDate: string | null;
  finalDate: string | null;
  closeDate: string | null;
  isActive: boolean;
  /** Τοποθεσία εργοταξίου (ProjectSite) — πόλη/περιοχή για τη λίστα. */
  site: { line: string; lat: number; lng: number } | null;
};

/** Επωνυμίες συναλλασσομένων για τα TRDR των έργων — ένα query, όχι ένα ανά έργο. */
async function traderNames(ids: (number | null)[]): Promise<Map<number, string>> {
  const wanted = [...new Set(ids.filter((v): v is number => v != null))];
  if (wanted.length === 0) return new Map();
  const rows = await prisma.softoneTrader.findMany({ where: { trdr: { in: wanted } }, select: { trdr: true, name: true } });
  return new Map(rows.map((r) => [r.trdr, r.name]));
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function listProjects(): Promise<ProjectListRow[]> {
  const [rows, sites] = await Promise.all([
    prisma.softoneProject.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'desc' }] }),
    prisma.projectSite.findMany({ select: { prjc: true, address: true, zip: true, city: true, district: true, formatted: true, lat: true, lng: true } }),
  ]);
  const siteBy = new Map(sites.map((s) => [s.prjc, s]));
  const names = await traderNames(rows.flatMap((r) => [r.trdr, r.trdrSu]));
  return rows.map((r) => ({
    prjc: r.prjc,
    code: r.code,
    name: r.name,
    customer: r.trdr != null ? names.get(r.trdr) ?? null : null,
    supplier: r.trdrSu != null ? names.get(r.trdrSu) ?? null : null,
    actStatus: r.actStatus,
    statusLabel: projectStatusLabel(r.actStatus),
    fromDate: iso(r.fromDate),
    finalDate: iso(r.finalDate),
    closeDate: iso(r.closeDate),
    isActive: r.isActive,
    site: (() => {
      const s = siteBy.get(r.prjc);
      return s ? { line: [s.district, s.city].filter(Boolean).join(', ') || s.formatted || '', lat: s.lat, lng: s.lng } : null;
    })(),
  }));
}

export async function getProject(prjc: number) {
  const p = await prisma.softoneProject.findUnique({ where: { prjc } });
  if (!p) return null;
  const traders = await prisma.softoneTrader.findMany({
    where: { trdr: { in: [p.trdr, p.trdrSu].filter((v): v is number => v != null) } },
  });
  const byId = new Map(traders.map((t) => [t.trdr, t]));
  return {
    ...p,
    statusLabel: projectStatusLabel(p.actStatus),
    customer: p.trdr != null ? byId.get(p.trdr) ?? null : null,
    supplier: p.trdrSu != null ? byId.get(p.trdrSu) ?? null : null,
  };
}
