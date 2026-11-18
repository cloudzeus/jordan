import { aiDetect } from '@/app/api/admin/floorplans/_handlers';

export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: Request) { return aiDetect(req, Promise.resolve({ library: '1' })); }
