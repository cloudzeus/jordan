import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { deleteProjectSite, getProjectSite, saveProjectSite, siteInput, SiteError } from '@/lib/project-site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prjcOf = async (ctx: { params: Promise<{ prjc: string }> }) => {
  const n = Number((await ctx.params).prjc);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET — η τοποθεσία του έργου (ή null).
export async function GET(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  await requirePermission('projects.read');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  return NextResponse.json({ site: await getProjectSite(prjc) });
}

// PUT — αποθήκευση τοποθεσίας: { address, zip, district, city, formatted, lat, lng, source, precision }.
export async function PUT(req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  const parsed = siteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία' }, { status: 400 });
  try {
    const site = await saveProjectSite(prjc, parsed.data, u.id);
    await logAudit({ userId: u.id, userEmail: u.email, action: 'project.site.save', resource: 'project', resourceId: String(prjc), metadata: site }).catch(() => null);
    return NextResponse.json({ site });
  } catch (e) {
    if (e instanceof SiteError) return NextResponse.json({ error: 'site_error', message: e.message }, { status: e.status });
    throw e;
  }
}

// DELETE — αφαίρεση τοποθεσίας.
export async function DELETE(_req: Request, ctx: { params: Promise<{ prjc: string }> }) {
  const u = await requirePermission('projects.manage');
  const prjc = await prjcOf(ctx);
  if (!prjc) return NextResponse.json({ error: 'invalid_prjc' }, { status: 400 });
  const removed = await deleteProjectSite(prjc);
  if (removed) await logAudit({ userId: u.id, userEmail: u.email, action: 'project.site.delete', resource: 'project', resourceId: String(prjc) }).catch(() => null);
  return NextResponse.json({ ok: true, removed });
}
