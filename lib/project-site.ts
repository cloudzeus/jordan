import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { reverseGeocode } from '@/lib/geocode';
import { validCoords } from '@/lib/coords';
import { parseCandidates, type SiteCandidate } from '@/lib/project-site-core';

/**
 * Τοποθεσία έργου (πίνακας `ProjectSite`). Αναζήτηση διεύθυνσης και αντίστροφη γεωκωδικοποίηση με τον
 * MapTiler (MAPTILER_API_KEY μόνο στον server). Μόνο η εφαρμογή γράφει εδώ — το SoftOne δεν αγγίζεται.
 */
export type ProjectSiteView = {
  prjc: number; address: string | null; zip: string | null; district: string | null; city: string | null;
  formatted: string | null; lat: number; lng: number; source: string; precision: string | null; updatedAt: string;
};

export const siteInput = z.object({
  address: z.string().trim().max(200).nullable().optional(),
  zip: z.string().trim().max(10).nullable().optional(),
  district: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  formatted: z.string().trim().max(300).nullable().optional(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  source: z.enum(['geocode', 'marker', 'manual']).default('geocode'),
  precision: z.enum(['exact', 'street', 'area']).nullable().optional(),
});
export type SiteInput = z.infer<typeof siteInput>;

const view = (r: { prjc: number; address: string | null; zip: string | null; district: string | null; city: string | null; formatted: string | null; lat: number; lng: number; source: string; precision: string | null; updatedAt: Date }): ProjectSiteView => ({
  prjc: r.prjc, address: r.address, zip: r.zip, district: r.district, city: r.city, formatted: r.formatted,
  lat: r.lat, lng: r.lng, source: r.source, precision: r.precision, updatedAt: r.updatedAt.toISOString(),
});

export async function getProjectSite(prjc: number): Promise<ProjectSiteView | null> {
  const r = await prisma.projectSite.findUnique({ where: { prjc } });
  return r ? view(r) : null;
}

export async function listProjectSites(): Promise<Map<number, ProjectSiteView>> {
  const rows = await prisma.projectSite.findMany();
  return new Map(rows.map((r) => [r.prjc, view(r)]));
}

export class SiteError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function saveProjectSite(prjc: number, input: SiteInput, userId: string | null): Promise<ProjectSiteView> {
  const c = validCoords(input.lat, input.lng);
  if (!c) throw new SiteError('Μη έγκυρες συντεταγμένες.');
  const project = await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true } });
  if (!project) throw new SiteError('Το έργο δεν υπάρχει.', 404);
  const data = {
    address: input.address || null, zip: input.zip || null, district: input.district || null, city: input.city || null,
    formatted: input.formatted || null, lat: c.lat, lng: c.lng, source: input.source, precision: input.precision ?? null, updatedById: userId,
  };
  return view(await prisma.projectSite.upsert({ where: { prjc }, update: data, create: { prjc, ...data } }));
}

export async function deleteProjectSite(prjc: number): Promise<boolean> {
  const r = await prisma.projectSite.deleteMany({ where: { prjc } });
  return r.count > 0;
}

/** Αναζήτηση διεύθυνσης: έως 5 υποψήφια, τα ακριβέστερα πρώτα. */
export async function searchSiteAddress(q: string): Promise<SiteCandidate[]> {
  const key = process.env.MAPTILER_API_KEY;
  if (!key) throw new SiteError('Δεν έχει ρυθμιστεί η υπηρεσία χαρτών (MAPTILER_API_KEY).', 503);
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}&country=gr&language=el&limit=5`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) throw new SiteError('Η υπηρεσία χαρτών δεν απάντησε — δοκίμασε ξανά.', 502);
  return parseCandidates(await res.json());
}

/** Αντίστροφη: ποια διεύθυνση είναι στο σημείο της πινέζας. */
export async function reverseSite(lat: number, lng: number): Promise<SiteCandidate | null> {
  const c = validCoords(lat, lng);
  if (!c) throw new SiteError('Μη έγκυρες συντεταγμένες.');
  const data = await reverseGeocode(c.lat, c.lng).catch(() => { throw new SiteError('Η υπηρεσία χαρτών δεν απάντησε — δοκίμασε ξανά.', 502); });
  const best = parseCandidates(data, 1)[0];
  // Το σημείο είναι αυτό που άφησε ο χρήστης — η διεύθυνση είναι η πλησιέστερη που βρέθηκε.
  return best ? { ...best, lat: c.lat, lng: c.lng } : null;
}
