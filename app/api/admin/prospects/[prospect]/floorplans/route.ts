import { listPlans, savePlan } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ prospect: string }> };

// Χαρτογραφήσεις κάτοψης του δυνητικού πελάτη (πριν υπάρξει στο SoftOne): GET λίστα, POST νέα/ενημέρωση (multipart).
export async function GET(_req: Request, ctx: Ctx) { return listPlans(ctx.params); }
export async function POST(req: Request, ctx: Ctx) { return savePlan(req, ctx.params); }
