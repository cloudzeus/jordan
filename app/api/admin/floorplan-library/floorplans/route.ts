import { listPlans, savePlan } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET() { return listPlans(Promise.resolve({ library: '1' })); }
export async function POST(req: Request) { return savePlan(req, Promise.resolve({ library: '1' })); }
