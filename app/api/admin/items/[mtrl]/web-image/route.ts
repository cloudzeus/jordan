import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { fetchPublic } from '@/lib/item-web/fetch';
import { uploadItemMedia } from '@/lib/item-media/service';
import { badMtrl, mtrlOf } from '../media/_shared';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  if (!await prisma.softoneItem.findUnique({ where: { mtrl } })) return new NextResponse(null, { status: 404 });
  try {
    const image = await fetchPublic(new URL(req.url).searchParams.get('url') || '', 'image');
    const preview = await sharp(image.buffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    return new NextResponse(new Uint8Array(preview), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new NextResponse(null, { status: 422 }); }
}

export async function POST(req: Request, { params }: { params: Promise<{ mtrl: string }> }) {
  const user = await requirePermission('metadata.manage');
  const mtrl = await mtrlOf(params);
  if (!mtrl) return badMtrl();
  const body = z.object({ url: z.string().url().max(4000), sourceUrl: z.string().url().max(4000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'Μη έγκυρη φωτογραφία.' }, { status: 400 });
  const item = await prisma.softoneItem.findUnique({ where: { mtrl } });
  if (!item) return new NextResponse(null, { status: 404 });
  try {
    const image = await fetchPublic(body.data.url, 'image');
    const buffer = await sharp(image.buffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    const media = await uploadItemMedia({ mtrl, kind: 'IMAGE', buffer, mimeType: 'image/webp', name: `${item.name.slice(0, 100)}.webp`, userId: user.id });
    await logAudit({ userId: user.id, userEmail: user.email, action: 'item.media.web-import', resource: 'softone_item', resourceId: String(mtrl), metadata: { mediaId: media.id, sourceUrl: body.data.sourceUrl, imageUrl: body.data.url } }).catch(() => null);
    return NextResponse.json({ media }, { status: 201 });
  } catch { return NextResponse.json({ message: 'Η φωτογραφία δεν αποθηκεύτηκε. Η πηγή μπορεί να εμποδίζει τη λήψη ή το αρχείο να μην υποστηρίζεται.' }, { status: 422 }); }
}
