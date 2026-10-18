import 'server-only';
import { prisma } from '@/lib/db';

/** MTRL → μικρογραφία της κύριας φωτογραφίας, για τις λίστες ειδών (ένα query για όλα). */
export async function primaryThumbs(): Promise<Map<number, string>> {
  const rows = await prisma.itemMedia.findMany({
    where: { kind: 'IMAGE', isPrimary: true, isInstallSample: false },
    select: { mtrl: true, thumbUrl: true, publicUrl: true },
  });
  return new Map(rows.map((r) => [r.mtrl, r.thumbUrl ?? r.publicUrl]));
}
