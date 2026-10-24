// scripts/demo-portal.ts — Demo πελάτης για το portal: πελάτης, έργο, προσφορές, σύμβαση με πληρωμές, εργασίες,
// συνεργεία και ιστορικό. ΜΟΝΟ στη βάση της εφαρμογής: αρνητικά TRDR/PRJC (δεν υπάρχουν ποτέ στο SoftOne,
// ο συγχρονισμός δεν τα αγγίζει και οι ενέργειες προς SoftOne τα αρνούνται).
//   npx tsx --env-file=.env scripts/demo-portal.ts            # δημιουργία / ανανέωση
//   npx tsx --env-file=.env scripts/demo-portal.ts --remove   # αφαίρεση όλων των demo δεδομένων
import { prisma } from '@/lib/db';

const TRDR = -900001;
const PRJC = -900001;
const EMAIL = 'gkozyris@dgsmart.gr';
const CUSTOMER = 'ΕΠΙΔΕΙΞΗ — DGsmart';
const TAG = 'ΕΠΙΔΕΙΞΗ ·';
const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
const at = (offset: number, h = 10) => { const d = day(offset); d.setUTCHours(h); return d; };
const log = (s: string) => console.log(s);

async function remove() {
  const cs = await prisma.contract.findMany({ where: { trdr: TRDR }, select: { id: true } });
  await prisma.contract.deleteMany({ where: { id: { in: cs.map((c) => c.id) } } });
  await prisma.projectTask.deleteMany({ where: { prjc: PRJC } });
  await prisma.projectBudgetLine.deleteMany({ where: { prjc: PRJC } });
  await prisma.softoneProject.deleteMany({ where: { prjc: PRJC } });
  await prisma.user.updateMany({ where: { email: EMAIL, customerTrdr: TRDR }, data: { customerTrdr: null } });
  await prisma.softoneTrader.deleteMany({ where: { trdr: TRDR } });
  log(`− αφαιρέθηκαν ${cs.length} συμβάσεις/προσφορές, το έργο και ο demo πελάτης`);
}

async function seed() {
  // ── Πελάτης & έργο (μόνο στη βάση μας) ──
  await prisma.softoneTrader.upsert({
    where: { trdr: TRDR },
    create: { trdr: TRDR, sodtype: 13, kind: 'Πελάτης', code: 'DEMO-01', name: CUSTOMER, email: EMAIL, city: 'Κηφισιά', address: 'Λεωφ. Κηφισίας 100', phone: '210 000 0000' },
    update: { name: CUSTOMER, email: EMAIL },
  });
  await prisma.softoneProject.upsert({
    where: { prjc: PRJC },
    create: { prjc: PRJC, code: 'DEMO-2026-01', name: `${TAG} Ανακαίνιση μπάνιου & κουζίνας — Κηφισιά`, trdr: TRDR, isActive: true, fromDate: day(-24), finalDate: day(36), crdDate: day(-30), remarks: 'Demo έργο — δεν υπάρχει στο SoftOne' },
    update: { trdr: TRDR, isActive: true },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'CUSTOMER' }, select: { id: true } });
  const user = await prisma.user.update({ where: { email: EMAIL }, data: { roleId: role.id, customerTrdr: TRDR, isActive: true }, select: { id: true, name: true } });
  const staff = await prisma.user.findFirst({ where: { role: { key: { in: ['SUPER_ADMIN', 'ADMIN'] } }, isActive: true }, select: { id: true, name: true, email: true } });
  const staffName = staff?.name || staff?.email || 'Atelier';

  // Καθαρή εκκίνηση για ό,τι φτιάχνει αυτό το script (η προσφορά-πέτρα μένει, μόνο μεταφέρεται).
  await prisma.contract.deleteMany({ where: { trdr: TRDR, title: { startsWith: TAG } } });
  await prisma.projectTask.deleteMany({ where: { prjc: PRJC } });

  const customer = { trdr: TRDR, customerName: CUSTOMER, customerEmail: EMAIL, customerPhone: '210 000 0000' };

  // ── 1. Προσφορά «Στάλθηκε» με κάτοψη: η demo προσφορά πέτρας περνά στον demo πελάτη ──
  const stone = await prisma.contract.findFirst({ where: { title: { startsWith: 'ΕΠΙΔΕΙΞΗ — Πέτρινα δάπεδα' } }, select: { id: true, status: true, number: true } });
  if (stone) {
    await prisma.contract.update({ where: { id: stone.id }, data: { ...customer, status: stone.status === 'DRAFT' ? 'SENT' : stone.status, validUntil: day(21) } });
    log(`✓ προσφορά πέτρας ΣΥΜ-${String(stone.number).padStart(6, '0')} → ${CUSTOMER} (Στάλθηκε)`);
  } else log('! δεν βρέθηκε η demo προσφορά πέτρας — τρέξτε πρώτα scripts/demo-stone-offer.ts');

  // ── 2. Ενεργή σύμβαση στο demo έργο: πληρωμές, συνεργείο, εργασίες, ιστορικό ──
  const active = await prisma.contract.create({
    data: {
      ...customer, title: `${TAG} Μπάνιο & κουζίνα — τσιμεντοκονία και πέτρα`, kind: 'PRODUCT_INSTALL', stage: 'CONTRACT', status: 'ACTIVE', prjc: PRJC, revision: 2,
      summary: 'Ανακαίνιση μπάνιου με τσιμεντοκονία σε δάπεδο και τοίχους, πάγκος κουζίνας από πέτρα.',
      customerText: 'Τι θα κάνουμε\n• Μπάνιο: τσιμεντοκονία σε δάπεδο και τοίχους, με στεγάνωση.\n• Κουζίνα: νέος πάγκος από φυσική πέτρα και επένδυση πίσω από τον πάγκο.\n\nΠώς θα προχωρήσουμε\n1. Αποξήλωση και προετοιμασία.\n2. Στεγάνωση και τσιμεντοκονία στο μπάνιο.\n3. Τοποθέτηση πάγκου κουζίνας.\n4. Τελικός καθαρισμός και παράδοση.',
      startDate: day(-20), endDate: day(36), vatRate: 24, acceptedAt: at(-26), activatedAt: at(-24),
      lines: { create: [
        { kind: 'MATERIAL', code: 'DEMO-TK', name: 'Τσιμεντοκονία μικροτσιμέντου (σετ)', unit: 'm²', qty: 28, unitPrice: 42, sortOrder: 0 },
        { kind: 'MATERIAL', code: 'DEMO-ST', name: 'Στεγανωτικό σύστημα μπάνιου', unit: 'm²', qty: 28, unitPrice: 9.5, sortOrder: 1 },
        { kind: 'MATERIAL', code: 'DEMO-PG', name: 'Πάγκος κουζίνας — μάρμαρο Βόλακα 3cm', unit: 'm', qty: 4.2, unitPrice: 310, sortOrder: 2 },
        { kind: 'SERVICE', code: 'DEMO-ER', name: 'Εφαρμογή τσιμεντοκονίας', unit: 'm²', qty: 28, unitPrice: 38, sortOrder: 3 },
        { kind: 'SERVICE', code: 'DEMO-TP', name: 'Τοποθέτηση πάγκου κουζίνας', unit: 'τεμ.', qty: 1, unitPrice: 450, sortOrder: 4 },
      ] },
      parties: { create: [{ kind: 'PARTNER', name: `${TAG} Συνεργείο τσιμεντοκονίας`, specialty: 'Τσιμεντοκονίες', scope: 'Μπάνιο', sortOrder: 0 }] },
    },
    select: { id: true, number: true },
  });
  const net = 28 * 42 + 28 * 9.5 + 4.2 * 310 + 28 * 38 + 450;
  const gross = Math.round(net * 1.24 * 100) / 100;
  const ms = [
    { title: 'Προκαταβολή με την υπογραφή', pct: 0.3, status: 'PAID', due: -24, doneAt: at(-24), paidAt: at(-23) },
    { title: 'Ολοκλήρωση μπάνιου', pct: 0.4, status: 'DONE', due: 4, doneAt: at(-1), paidAt: null, note: 'Ολοκληρώθηκε η τσιμεντοκονία σε δάπεδο και τοίχους. Αναμονή 7 ημερών πριν τη χρήση της ντουζιέρας.' },
    { title: 'Παράδοση έργου', pct: 0.3, status: 'PENDING', due: 36, doneAt: null, paidAt: null },
  ];
  for (const [i, m] of ms.entries()) {
    await prisma.contractMilestone.create({
      data: {
        contractId: active.id, title: m.title, amount: Math.round(gross * m.pct * 100) / 100, dueDate: day(m.due), status: m.status, sortOrder: i,
        doneAt: m.doneAt, paidAt: m.paidAt, deliveryNote: m.note ?? null, deliveredById: m.note ? staff?.id ?? null : null,
      },
    });
  }

  // Εργασίες του έργου (ορατές στον πελάτη) με πρόοδο και ανάθεση στο συνεργείο.
  const tasks = [
    { name: 'Αυτοψία & επιμέτρηση', start: -22, dur: 1, progress: 100 },
    { name: 'Αποξήλωση παλιών πλακιδίων', start: -20, dur: 3, progress: 100 },
    { name: 'Στεγάνωση μπάνιου', start: -15, dur: 2, progress: 100 },
    { name: 'Τσιμεντοκονία μπάνιου (δάπεδο & τοίχοι)', start: -10, dur: 8, progress: 100 },
    { name: 'Τοποθέτηση πάγκου κουζίνας', start: 3, dur: 2, progress: 30 },
    { name: 'Τελικός καθαρισμός & παράδοση', start: 33, dur: 1, progress: 0 },
  ];
  let prev: string | null = null;
  for (const [i, t] of tasks.entries()) {
    const row: { id: string } = await prisma.projectTask.create({
      data: {
        prjc: PRJC, name: t.name, startDate: day(t.start), durationValue: t.dur, durationUnit: 'DAYS', progress: t.progress, sortOrder: i, customerVisible: true,
        completedAt: t.progress === 100 ? at(t.start + t.dur) : null, createdById: staff?.id ?? null,
        ...(prev ? { dependsOn: { create: [{ dependsOnId: prev }] } } : {}),
      },
      select: { id: true },
    });
    prev = row.id;
  }

  // Ιστορικό: συμβάντα + συζήτηση με τον πελάτη.
  const ev = (type: string, offset: number, summary: string, actorKind = 'STAFF', revision: number | null = null) => ({
    contractId: active.id, type, actorKind, actorName: actorKind === 'CUSTOMER' ? user.name ?? EMAIL : staffName, summary, customer: true, revision, createdAt: at(offset),
  });
  await prisma.contractEvent.createMany({ data: [
    ev('SENT', -30, `Στάλθηκε η έκδοση 1 της προσφοράς · σύνολο ${(gross * 1.05).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}`, 'STAFF', 1),
    ev('SENT', -27, `Στάλθηκε η έκδοση 2 της προσφοράς · σύνολο ${gross.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}`, 'STAFF', 2),
    ev('ACCEPTED', -26, `Αποδοχή της έκδοσης 2 από τον πελάτη · ${gross.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}`, 'CUSTOMER', 2),
    ev('ACTIVATED', -24, 'Ξεκίνησε το έργο'),
  ] });
  const q = await prisma.contractNote.create({ data: {
    contractId: active.id, kind: 'CHANGE', targetType: 'CONTRACT', body: 'Μπορούμε να πάμε σε πιο ανοιχτό γκρι χρώμα στην τσιμεντοκονία; Και αν γίνεται λίγο φθηνότερα.',
    shareWith: ['CUSTOMER'], authorKind: 'CUSTOMER', authorId: user.id, authorName: user.name ?? EMAIL, revision: 1, createdAt: at(-29), resolvedAt: at(-27),
  } });
  await prisma.contractNote.create({ data: {
    contractId: active.id, kind: 'NOTE', targetType: 'CONTRACT', replyToId: q.id, body: 'Αλλάξαμε σε ανοιχτό γκρι (RAL 7035) και δώσαμε έκπτωση 5% στην τσιμεντοκονία. Σας στείλαμε την έκδοση 2.',
    shareWith: ['CUSTOMER'], authorKind: 'STAFF', authorId: staff?.id ?? null, authorName: staffName, revision: 1, createdAt: at(-27, 9),
  } });
  await prisma.contractEvent.create({ data: ev('RESOLVED', -27, 'Ολοκληρώθηκε: «Μπορούμε να πάμε σε πιο ανοιχτό γκρι χρώμα…»') });
  const q2 = await prisma.contractNote.create({ data: {
    contractId: active.id, kind: 'QUESTION', targetType: 'MILESTONE', targetLabel: 'Πληρωμή: Ολοκλήρωση μπάνιου', body: 'Πότε μπορούμε να χρησιμοποιήσουμε τη ντουζιέρα;',
    shareWith: ['CUSTOMER'], authorKind: 'CUSTOMER', authorId: user.id, authorName: user.name ?? EMAIL, revision: 2, createdAt: at(0, 8),
  } });
  void q2;
  await prisma.contractNote.create({ data: {
    contractId: active.id, kind: 'NOTE', targetType: 'CONTRACT', body: 'Πρόσβαση στο διαμέρισμα 08:00–15:00. Το κλειδί είναι στον θυρωρό.', shareWith: ['CUSTOMER'],
    authorKind: 'STAFF', authorId: staff?.id ?? null, authorName: staffName, revision: 2, createdAt: at(-23),
  } });

  // ── Αίτημα προσφοράς από την πύλη, ακόμη σε επεξεργασία (πρόχειρη προσφορά για εμάς) ──
  const reqText = 'Θέλουμε πέτρινο δάπεδο στη βεράντα (περίπου 25 m²), αντιολισθητικό, σε ανοιχτό χρώμα. Σήμερα υπάρχουν παλιά πλακάκια.';
  const req = await prisma.contract.create({
    data: { ...customer, title: `${TAG} Πέτρινο δάπεδο βεράντας`, kind: 'PRODUCT_INSTALL', stage: 'OFFER', status: 'DRAFT', summary: `Αίτημα πελάτη από την πύλη:\n${reqText}`, siteAddress: 'Κηφισιά', startDate: day(45) },
    select: { id: true },
  });
  await prisma.contractNote.create({ data: { contractId: req.id, kind: 'NOTE', targetType: 'CONTRACT', body: reqText, shareWith: ['CUSTOMER'], authorKind: 'CUSTOMER', authorId: user.id, authorName: user.name ?? EMAIL, revision: 1, createdAt: at(-2) } });
  await prisma.contractEvent.create({ data: { contractId: req.id, type: 'REQUESTED', actorKind: 'CUSTOMER', actorName: user.name ?? EMAIL, summary: `Αίτημα προσφοράς: ${TAG} Πέτρινο δάπεδο βεράντας`, customer: true, createdAt: at(-2) } });

  // ── 3. Ολοκληρωμένη μικρή σύμβαση (εξοφλημένη) ──
  const done = await prisma.contract.create({
    data: {
      ...customer, title: `${TAG} Μπάνιο επισκεπτών — τσιμεντοκονία & πέτρα`, kind: 'PRODUCT_INSTALL', stage: 'CONTRACT', status: 'COMPLETED', prjc: PRJC, revision: 1,
      summary: 'Τσιμεντοκονία σε δάπεδο και τοίχους του μπάνιου επισκεπτών, πάγκος νιπτήρα από τραβερτίνο, με στεγάνωση.', siteAddress: 'Λεωφ. Κηφισίας 100', siteCity: 'Κηφισιά',
      customerText: 'Ανακαινίσαμε το μπάνιο επισκεπτών με τσιμεντοκονία σε ανοιχτό γκρι, πάγκο νιπτήρα από τραβερτίνο και πλήρη στεγάνωση.', startDate: day(-48), endDate: day(-31), vatRate: 24,
      acceptedAt: at(-36), activatedAt: at(-35), completedAt: at(-31),
      lines: { create: [
        { kind: 'MATERIAL', code: 'DEMO-TK', name: 'Τσιμεντοκονία μικροτσιμέντου — RAL 7035 ανοιχτό γκρι', unit: 'm²', qty: 14.5, unitPrice: 42, sortOrder: 0 },
        { kind: 'MATERIAL', code: 'DEMO-ST', name: 'Στεγανωτικό σύστημα μπάνιου (2 στρώσεις + ταινία γωνιών)', unit: 'm²', qty: 14.5, unitPrice: 9.5, sortOrder: 1 },
        { kind: 'MATERIAL', code: 'DEMO-TR', name: 'Πάγκος νιπτήρα — τραβερτίνο Classic 3cm, γυαλιστερό', unit: 'm', qty: 1.2, unitPrice: 280, sortOrder: 2 },
        { kind: 'SERVICE', code: 'DEMO-ER', name: 'Εφαρμογή τσιμεντοκονίας', unit: 'm²', qty: 14.5, unitPrice: 38, sortOrder: 3 },
        { kind: 'SERVICE', code: 'DEMO-TP', name: 'Τοποθέτηση πάγκου νιπτήρα', unit: 'τεμ.', qty: 1, unitPrice: 180, sortOrder: 4 },
      ] },
      milestones: { create: [
        { title: 'Προκαταβολή', amount: 900, dueDate: day(-48), status: 'PAID', doneAt: at(-48), paidAt: at(-48), sortOrder: 0 },
        { title: 'Παράδοση μπάνιου', amount: Math.round(((14.5 * 42 + 14.5 * 9.5 + 1.2 * 280 + 14.5 * 38 + 180) * 1.24 - 900) * 100) / 100, dueDate: day(-31), status: 'PAID', doneAt: at(-31), paidAt: at(-30), sortOrder: 1,
          deliveryNote: 'Παραδόθηκε καθαρό. Τσιμεντοκονία 2 στρώσεις + 2 στρώσεις βερνίκι πολυουρεθάνης. Η ντουζιέρα χρησιμοποιείται από τις 7 ημέρες μετά.' },
      ] },
    },
    select: { id: true },
  });
  await prisma.contractEvent.createMany({ data: [
    { contractId: done.id, type: 'ACCEPTED', actorKind: 'CUSTOMER', actorName: user.name ?? EMAIL, summary: 'Αποδοχή της έκδοσης 1 από τον πελάτη', customer: true, revision: 1, createdAt: at(-36) },
    { contractId: done.id, type: 'COMPLETED', actorKind: 'STAFF', actorName: staffName, summary: 'Ολοκληρώθηκε', customer: true, createdAt: at(-31) },
  ] });

  log(`✓ ενεργή σύμβαση ΣΥΜ-${String(active.number).padStart(6, '0')} στο έργο DEMO-2026-01 · ${tasks.length} εργασίες · 3 πληρωμές (1 εξοφλημένη)`);
  log('✓ ολοκληρωμένη σύμβαση «Μπάνιο επισκεπτών» (για τον τεχνικό φάκελο)');
  log(`✓ ${EMAIL} → Πελάτης «${CUSTOMER}»`);
}

(process.argv.includes('--remove') ? remove() : seed())
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
