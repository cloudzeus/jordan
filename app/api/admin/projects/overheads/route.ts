import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { createOverheadRate, listOverheadRates, overheadRateInput } from '@/lib/overheads';
import { refreshProjectFinancials } from '@/lib/project-profit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — τα ποσοστά γενικών εξόδων (κοινά με το «Πραγματικό κόστος»).
export async function GET() {
  await requirePermission('projects.financials');
  return NextResponse.json({ rates: await listOverheadRates() });
}

// POST — νέο ποσοστό: { validFrom, validTo?, percent, category?, note? }. Ρυθμίσεις ⇒ projects.manage.
export async function POST(req: Request) {
  await requirePermission('projects.financials');
  const u = await requirePermission('projects.manage');
  const parsed = overheadRateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  const rate = await createOverheadRate(parsed.data, u.id);
  await logAudit({ userId: u.id, userEmail: u.email, action: 'overhead.rate.create', resource: 'overhead_rate', resourceId: rate.id, metadata: rate }).catch(() => null);
  // Τα έργα ξαναϋπολογίζονται στο παρασκήνιο· η σελίδα κάνει refresh όταν τελειώσει.
  await refreshProjectFinancials().catch(() => null);
  return NextResponse.json({ rate }, { status: 201 });
}
