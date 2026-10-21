import { aiDetect } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// POST multipart { image } — «Αναγνώριση χώρων με AI» στην κάτοψη του πελάτη (προσφορά πριν από το έργο).
export async function POST(req: Request, ctx: { params: Promise<{ trdr: string }> }) { return aiDetect(req, ctx.params); }
