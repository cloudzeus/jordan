import { createOffer, offerDefaults } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ prjc: string }> };

// Προσφορά από τη χαρτογράφηση κάτοψης του έργου: GET προεπιλογές του modal, POST καταχώριση (πρόχειρη).
export async function GET(_req: Request, ctx: Ctx) { return offerDefaults(ctx.params); }
export async function POST(req: Request, ctx: Ctx) { return createOffer(req, ctx.params); }
