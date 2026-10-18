import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { softoneGetTable } from '@/lib/softone';
import { validCoords } from '@/lib/coords';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Σημεία για τον χάρτη συναλλασσομένων. Η θέση ζει ΜΟΝΟ στο SoftOne (TRDR.LATITUDE/LONGITUDE) — διαβάζεται
 * ζωντανά με ένα GetTable και ενώνεται με τον τοπικό καθρέφτη (επωνυμία, διεύθυνση, επικοινωνία).
 */
export async function GET() {
  const u = await getCurrentUserWithPermissions();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role.key !== 'SUPER_ADMIN' && !u.permissionKeys.has('metadata.read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const live = await softoneGetTable('TRDR', ['TRDR', 'SODTYPE', 'LATITUDE', 'LONGITUDE'], 'SODTYPE IN (12,13,14,15,16) AND ISACTIVE=1');
    const withPos = live.map((r) => ({ trdr: Number(r.TRDR), sodtype: Number(r.SODTYPE), pos: validCoords(r.LATITUDE, r.LONGITUDE) }))
      .filter((r) => r.pos && !(r.pos.lat === 0 && r.pos.lng === 0));
    const mirror = await prisma.softoneTrader.findMany({
      where: { trdr: { in: withPos.map((r) => r.trdr) } },
      select: { trdr: true, code: true, name: true, address: true, zip: true, city: true, phone: true, email: true, afm: true },
    });
    const m = new Map(mirror.map((t) => [t.trdr, t]));
    const points = withPos.map((r) => {
      const t = m.get(r.trdr);
      return { trdr: r.trdr, sodtype: r.sodtype, lat: r.pos!.lat, lng: r.pos!.lng, code: t?.code ?? null, name: t?.name ?? `#${r.trdr}`, address: [t?.address, [t?.zip, t?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null, phone: t?.phone ?? null, email: t?.email ?? null, afm: t?.afm ?? null };
    });
    return NextResponse.json({ points, total: live.length });
  } catch (e) {
    return NextResponse.json({ error: 'softone', message: (e as Error).message }, { status: 502 });
  }
}
