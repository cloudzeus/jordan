import { aiDetect } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// POST multipart { image } — «Αναγνώριση χώρων με AI» στην κάτοψη του δυνητικού πελάτη (πριν υπάρξει στο SoftOne).
export async function POST(req: Request, ctx: { params: Promise<{ prospect: string }> }) { return aiDetect(req, ctx.params); }
