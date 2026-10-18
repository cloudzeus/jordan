import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { testConnection } from '@/lib/viva';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Δοκιμή Viva με τα αποθηκευμένα στοιχεία: OAuth token (Smart Checkout) + webhook key (Merchant ID/API key).
// Δεν δημιουργεί payment order και δεν χρεώνει τίποτα.
export async function POST() {
  const u = await requirePermission('system.settings');
  const result = await testConnection();
  await logAudit({ userId: u.id, userEmail: u.email, action: 'settings.viva.test', resource: 'setting', metadata: { env: result.env, oauth: result.oauth, basic: result.basic } }).catch(() => null);
  return NextResponse.json(result, { status: result.oauth && result.basic ? 200 : 502 });
}
