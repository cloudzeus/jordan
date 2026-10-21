import { createOffer, offerDefaults } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ trdr: string }> };

// Προσφορά από τη χαρτογράφηση κάτοψης του πελάτη (προσφορά πριν από το έργο): GET προεπιλογές του modal, POST καταχώριση (πρόχειρη).
export async function GET(_req: Request, ctx: Ctx) { return offerDefaults(ctx.params); }
export async function POST(req: Request, ctx: Ctx) { return createOffer(req, ctx.params); }
