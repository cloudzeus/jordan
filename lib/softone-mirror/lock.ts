// lib/softone-mirror/lock.ts — SERVER. «Ένας τη φορά» για τον συγχρονισμό καθρεφτών, ανάμεσα σε ΟΛΑ τα
// instances που βλέπουν την ίδια βάση (dev :3000, preview :3001, deploy, cron).
//
// Γιατί μίσθωση σε γραμμή και όχι `pg_advisory_lock`: η εφαρμογή μιλά στη βάση μέσω PgBouncer σε
// transaction mode — ένα session lock θα «ανήκε» σε όποια σύνδεση του pool έτυχε και θα χανόταν.
// Η μίσθωση λήγει μόνη της (crash, kill), ώστε ένας νεκρός κάτοχος να μην κλειδώνει για πάντα.
import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Παίρνει τη μίσθωση αν είναι ελεύθερη, ληγμένη ή ήδη δική μας. ΕΝΑ ατομικό statement: δύο
 * ταυτόχρονοι υποψήφιοι δεν μπορούν να κερδίσουν και οι δύο. Ο χρόνος είναι του Postgres (όχι του
 * κάθε server), ώστε ρολόγια που αποκλίνουν να μην κλέβουν ζωντανή μίσθωση.
 */
export async function acquireLease(name: string, owner: string, ttlMs: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ owner: string }[]>`
    INSERT INTO "SoftoneSyncLease" ("name", "owner", "expiresAt")
    VALUES (${name}, ${owner}, (now() AT TIME ZONE 'UTC') + (${Math.round(ttlMs)} * interval '1 millisecond'))
    ON CONFLICT ("name") DO UPDATE
      SET "owner" = EXCLUDED."owner", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "SoftoneSyncLease"."expiresAt" < (now() AT TIME ZONE 'UTC') OR "SoftoneSyncLease"."owner" = EXCLUDED."owner"
    RETURNING "owner"`;
  return rows.length === 1 && rows[0].owner === owner;
}

/** Παράταση όσο δουλεύουμε. `false` = τη χάσαμε (κάποιος την πήρε ως ληγμένη) — σταματάμε. */
export async function renewLease(name: string, owner: string, ttlMs: number): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "SoftoneSyncLease" SET "expiresAt" = (now() AT TIME ZONE 'UTC') + (${Math.round(ttlMs)} * interval '1 millisecond')
    WHERE "name" = ${name} AND "owner" = ${owner}`;
  return n === 1;
}

/** Απελευθέρωση — ΜΟΝΟ της δικής μας μίσθωσης. */
export async function releaseLease(name: string, owner: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "SoftoneSyncLease" WHERE "name" = ${name} AND "owner" = ${owner}`;
}

/** Ποιος την κρατά τώρα (για την οθόνη κατάστασης). */
export async function leaseHolder(name: string): Promise<{ owner: string; expiresAt: Date } | null> {
  const row = await prisma.softoneSyncLease.findUnique({ where: { name } });
  return row && row.expiresAt.getTime() > Date.now() ? { owner: row.owner, expiresAt: row.expiresAt } : null;
}
