import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { generateProjectProgressPdf } from '@/lib/project-progress/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** POST → φτιάχνει το PDF «Αναφορά πορείας έργου», το σώζει στα αρχεία του έργου και επιστρέφει το fileId. */
export async function POST(_req: Request, { params }: { params: Promise<{ prjc: string }> }) {
  const user = await requirePermission('projects.manage');
  const { prjc: prjcStr } = await params;
  const prjc = Number(prjcStr);
  if (!Number.isInteger(prjc) || prjc <= 0) return NextResponse.json({ message: 'Άκυρο έργο' }, { status: 400 });
  try {
    const { fileId, fileName } = await generateProjectProgressPdf(prjc, { id: user.id, name: user.name, email: user.email });
    return NextResponse.json({ fileId, fileName });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ message: (e as Error).message || 'Αποτυχία δημιουργίας αναφοράς' }, { status });
  }
}
