import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export type ItemAttributeDTO = { name: string; value: string; unit: string | null };

export const attributesInput = z.object({
  attributes: z.array(z.object({
    name: z.string().trim().min(1, 'Κάθε χαρακτηριστικό χρειάζεται όνομα').max(80),
    value: z.string().trim().min(1, 'Κάθε χαρακτηριστικό χρειάζεται τιμή').max(300),
    unit: z.string().trim().max(20).nullable().optional(),
  })).max(100),
});

export async function listAttributes(mtrl: number): Promise<ItemAttributeDTO[]> {
  const rows = await prisma.itemAttribute.findMany({ where: { mtrl }, orderBy: { order: 'asc' } });
  return rows.map((r) => ({ name: r.name, value: r.value, unit: r.unit }));
}

/** Αντικατάσταση ΟΛΟΥ του συνόλου (η φόρμα στέλνει τη λίστα όπως τη βλέπει ο χρήστης, με τη σειρά της). */
export async function replaceAttributes(mtrl: number, attrs: z.infer<typeof attributesInput>['attributes']) {
  const seen = new Set<string>();
  for (const a of attrs) {
    const k = a.name.toLocaleLowerCase('el');
    if (seen.has(k)) throw new Error(`Το χαρακτηριστικό «${a.name}» υπάρχει δύο φορές.`);
    seen.add(k);
  }
  await prisma.$transaction([
    prisma.itemAttribute.deleteMany({ where: { mtrl } }),
    prisma.itemAttribute.createMany({ data: attrs.map((a, order) => ({ mtrl, name: a.name, value: a.value, unit: a.unit || null, order })) }),
  ]);
  return listAttributes(mtrl);
}
