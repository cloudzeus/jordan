import { aiDetect } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// POST multipart { image } — «Αναγνώριση χώρων με AI» στην κάτοψη του έργου.
export async function POST(req: Request, ctx: { params: Promise<{ prjc: string }> }) { return aiDetect(req, ctx.params); }
