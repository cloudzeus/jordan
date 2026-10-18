import { NextResponse } from 'next/server';
import { staffWith } from '@/lib/staff-guard';
import { softoneUsers } from '@/lib/softone-action';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — οι ενεργοί χρήστες του SoftOne (USERS), για σύνδεση με χρήστες της εφαρμογής. Μόνο ανάγνωση.
export async function GET(req: Request) {
  const g = await staffWith('users.softone_link');
  if ('error' in g) return g.error;
  try {
    return NextResponse.json({ users: await softoneUsers(new URL(req.url).searchParams.get('fresh') === '1') });
  } catch (e) {
    return NextResponse.json({ error: 'softone', message: `SoftOne: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
