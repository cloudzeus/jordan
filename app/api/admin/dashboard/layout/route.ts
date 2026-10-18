import { NextResponse } from 'next/server';
import { getCurrentUserWithPermissions, PORTAL_HOME } from '@/lib/rbac';
import { loadLayout, resetLayout, saveLayout, accessOf } from '@/lib/dashboard/layout-store';
import { defaultLayout } from '@/lib/dashboard/widgets';

// Διάταξη της αρχικής του προσωπικού — μόνο για τον ίδιο τον συνδεδεμένο χρήστη (ποτέ userId από το σώμα).
async function staff() {
  const u = await getCurrentUserWithPermissions();
  if (!u) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  if (u.role.key && PORTAL_HOME[u.role.key]) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
  return { user: u } as const;
}

export async function GET() {
  const s = await staff();
  if ('error' in s) return s.error;
  return NextResponse.json(await loadLayout(s.user));
}

export async function PUT(req: Request) {
  const s = await staff();
  if ('error' in s) return s.error;
  const body = await req.json().catch(() => null);
  if (JSON.stringify(body ?? null).length > 8_000) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const layout = await saveLayout(s.user, body);
  if (!layout) return NextResponse.json({ error: 'invalid', message: 'Μη έγκυρη διάταξη' }, { status: 400 });
  return NextResponse.json({ layout, custom: true });
}

export async function DELETE() {
  const s = await staff();
  if ('error' in s) return s.error;
  await resetLayout(s.user.id);
  return NextResponse.json({ layout: defaultLayout(accessOf(s.user)), custom: false });
}
