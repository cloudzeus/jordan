import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { runDueOffers } from '@/lib/container-offers';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Cron (π.χ. κάθε 10′): δημοσιεύει προγραμματισμένες δυναμικές προσφορές και στέλνει εκκρεμείς
// ειδοποιήσεις πτώσης τιμής. Authorization: Bearer CRON_SECRET (ίδιο μοτίβο με το /api/cron/backup).
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET || '';
  const auth = req.headers.get('authorization') ?? '';
  if (!expected || auth !== `Bearer ${expected}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const r = await runDueOffers();
    if (r.published || r.drops) await logAudit({ action: 'offer.cron', resource: 'dynamic_offer', metadata: r }).catch(() => null);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
