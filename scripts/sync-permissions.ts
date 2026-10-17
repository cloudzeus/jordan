/**
 * Συγχρονισμός δικαιωμάτων: ο κατάλογος του lib/permissions.ts → βάση, και μετάβαση ρόλων.
 *
 *   npm run permissions:sync            (εφαρμογή)
 *   npm run permissions:sync -- --dry   (μόνο αναφορά)
 *
 * 1. Upsert κάθε Permission του καταλόγου (κλειδί, ομάδα, περιγραφή, σειρά).
 * 2. SUPER_ADMIN: όλα. ADMIN: οι προεπιλογές του (ROLE_DEFAULTS.ADMIN).
 * 3. Κάθε ρόλος με παλιό metadata.read/manage παίρνει τα αντίστοιχα νέα ανά ενότητα (LEGACY_GRANTS),
 *    ώστε κανείς να μη χάσει πρόσβαση. ΔΕΝ αφαιρεί ποτέ τίποτα. Ξανατρέχει χωρίς διπλοεγγραφές.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LEGACY_GRANTS, PERMISSIONS, ROLE_DEFAULTS } from '../lib/permissions';

const dry = process.argv.includes('--dry');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // 1. Κατάλογος
  const existing = new Set((await prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const added = PERMISSIONS.filter((p) => !existing.has(p.key)).map((p) => p.key);
  if (!dry) {
    for (let i = 0; i < PERMISSIONS.length; i++) {
      const p = PERMISSIONS[i];
      await prisma.permission.upsert({
        where: { key: p.key },
        update: { resource: p.resource, action: p.action, description: p.description },
        create: { key: p.key, resource: p.resource, action: p.action, description: p.description, order: i },
      });
    }
  }
  console.log(`Δικαιώματα καταλόγου: ${PERMISSIONS.length} · νέα: ${added.length ? added.join(', ') : '—'}`);

  // 2–3. Ρόλοι
  const perms = new Map((await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]));
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: { select: { key: true } } } } }, orderBy: { order: 'asc' } });
  for (const role of roles) {
    const has = new Set(role.permissions.map((rp) => rp.permission.key));
    const want = new Set<string>();
    if (role.key === 'SUPER_ADMIN') PERMISSIONS.forEach((p) => want.add(p.key));
    if (role.key === 'ADMIN') (ROLE_DEFAULTS.ADMIN ?? []).forEach((k) => want.add(k));
    for (const [legacy, grants] of Object.entries(LEGACY_GRANTS)) if (has.has(legacy)) grants.forEach((k) => want.add(k));
    const missing = [...want].filter((k) => !has.has(k) && perms.has(k));
    if (!missing.length) continue;
    console.log(`  ${role.name}: +${missing.length} (${missing.join(', ')})`);
    if (!dry) {
      await prisma.rolePermission.createMany({
        data: missing.map((k) => ({ roleId: role.id, permissionId: perms.get(k)! })),
        skipDuplicates: true,
      });
    }
  }
  console.log(dry ? 'Δοκιμή — καμία αλλαγή.' : '✓ Ολοκληρώθηκε.');
}

main().finally(() => prisma.$disconnect());
