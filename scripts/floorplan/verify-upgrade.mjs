// Dry-run: ανεβάζει κάθε αποθηκευμένη κάτοψη σε v2 και ελέγχει ότι τα floorM2/wallsM2 μένουν ίδια
// (±1%) με τα αποθηκευμένα. READ-ONLY — κανένα write. Τρέξε: npx tsx scripts/floorplan/verify-upgrade.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { roomSheet, roomTakeoffV2 } from '../../lib/floorplan/saved.ts';
import { upgradePlanData } from '../../lib/floorplan/upgrade.ts';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const TOL = 0.01;
const off = (got, exp) => Math.abs(got - exp) > Math.max(1e-6, Math.abs(exp) * TOL);

const rows = await prisma.floorPlan.findMany({ select: { id: true, title: true, data: true, floorM2: true, wallsM2: true } });
let ok = 0;
const bad = [];
for (const r of rows) {
  try {
    const v1 = roomSheet(r.data);                 // αποδεκτό και ως πηγή αλήθειας (ίδιο με save-time)
    const v2 = roomTakeoffV2(upgradePlanData(r.data));
    if (off(v2.floorM2, v1.floorM2) || off(v2.wallsM2, v1.wallsM2)) {
      bad.push({ id: r.id, title: r.title, v1, v2, stored: { floorM2: r.floorM2, wallsM2: r.wallsM2 } });
    } else ok++;
  } catch (e) {
    bad.push({ id: r.id, title: r.title, error: String(e?.message || e) });
  }
}
console.log(`Κατόψεις: ${rows.length} · εντός ανοχής ${ok} · εκτός/σφάλμα ${bad.length}`);
for (const b of bad) console.log('  ✗', b.id, b.title, JSON.stringify(b.error ?? { v1: b.v1, v2: b.v2 }));
await prisma.$disconnect();
process.exit(bad.length ? 1 : 0);
