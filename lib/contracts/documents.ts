// lib/contracts/documents.ts — SERVER. Σύνταξη εγγράφου (AI) → PDF → αρχεία έργου (ή πελάτη, πριν
// συνδεθεί PRJC) → αποστολή με email. Κάθε νέα σύνταξη είναι νέα έκδοση· οι παλιές μένουν.
import 'server-only';
import { prisma } from '@/lib/db';
import { emailBrand } from '@/lib/email/brand';
import { callout, facts, paragraph, renderEmail, none } from '@/lib/email/layout';
import { sendLeadMail } from '@/lib/lead-mail';
import { bunnyDownload } from '@/lib/bunny';
import { uploadEntityFile } from '@/lib/entity-files/service';
import { InstallGuideSchema, type InstallGuide } from '@/lib/install-guide/guide';
import { composeContractDoc } from './ai';
import { renderContractPdf, type ContractPdfData } from './pdf';
import {
  KIND_LABEL, contractRef, crewTotal, dayEl, docTitle, eur, lineNet, pdfFileName, siteText, totals,
  type ContractDoc, type ContractKind, type PromptGuide,
} from './core';
import { ContractError } from './service';

const SUBFOLDER = 'Συμβάσεις';

type User = { id: string; name: string | null; email: string };

/** Οι πιο πρόσφατοι οδηγοί εγκατάστασης των ειδών (μόνο όσα έχουν). */
async function itemGuides(mtrls: number[]): Promise<{ mtrl: number; item: string; guide: InstallGuide }[]> {
  if (!mtrls.length) return [];
  const rows = await prisma.itemInstallGuide.findMany({ where: { mtrl: { in: mtrls } }, orderBy: { createdAt: 'desc' } });
  const items = await prisma.softoneItem.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true } });
  const name = new Map(items.map((i) => [i.mtrl, `${i.code} · ${i.name}`]));
  const seen = new Set<number>();
  const out: { mtrl: number; item: string; guide: InstallGuide }[] = [];
  for (const r of rows) {
    if (seen.has(r.mtrl)) continue;
    const g = InstallGuideSchema.safeParse(r.content);
    if (!g.success) continue;
    seen.add(r.mtrl);
    out.push({ mtrl: r.mtrl, item: name.get(r.mtrl) ?? String(r.mtrl), guide: g.data });
  }
  return out;
}
const toPromptGuide = (g: { item: string; guide: InstallGuide }): PromptGuide => ({
  item: g.item, summary: g.guide.summary,
  steps: g.guide.steps.map((s) => [s.title, s.detail, s.warning ? `ΠΡΟΣΟΧΗ: ${s.warning}` : ''].filter(Boolean).join(' — ')),
  safety: g.guide.safety, checks: g.guide.qualityChecks,
});

/** Νέα έκδοση εγγράφου για τον πελάτη (partyId = null) ή για ένα συνεργείο. */
export async function generateDocument(contractId: string, partyId: string | null, user: User) {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, parties: true, milestones: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!c) throw new ContractError('Η σύμβαση δεν βρέθηκε', 404);
  const party = partyId ? c.parties.find((p) => p.id === partyId) : null;
  if (partyId && !party) throw new ContractError('Το συνεργείο δεν βρέθηκε', 404);
  if (!c.lines.length) throw new ContractError('Προσθέστε υλικά/υπηρεσίες πριν από τη σύνταξη', 409);
  if (!c.prjc && !c.trdr) throw new ContractError('Χωρίς πελάτη SoftOne ή έργο δεν υπάρχει φάκελος αρχείων για το PDF', 409);

  const audience = party ? 'PARTY' : 'CUSTOMER';
  const lines = party ? c.lines.filter((l) => l.partyId === party.id) : c.lines;
  if (party && !lines.length) throw new ContractError(`Δεν έχουν ανατεθεί γραμμές στο «${party.name}»`, 409);
  const milestones = c.milestones.filter((m) => (party ? m.partyId === party.id : !m.partyId));

  const [brand, trader, guides, partyTrader] = await Promise.all([
    emailBrand(),
    c.trdr ? prisma.softoneTrader.findUnique({ where: { trdr: c.trdr }, select: { name: true, afm: true, address: true, zip: true, city: true, email: true, phone: true } }) : null,
    itemGuides([...new Set(lines.map((l) => l.mtrl).filter((x): x is number => x != null))]),
    party?.trdr ? prisma.softoneTrader.findUnique({ where: { trdr: party.trdr }, select: { address: true, zip: true, city: true } }) : null,
  ]);
  const t = totals(c.lines, c.vatRate);
  const fee = party ? crewTotal(c.lines, party.id) : 0;
  const site = siteText(c);
  const customerName = trader?.name ?? c.customerName ?? '—';

  const { doc, model } = await composeContractDoc({
    audience, stage: c.stage, kind: c.kind as ContractKind,
    company: { name: brand.name, legalName: brand.legalName, vat: brand.vat, address: brand.address },
    customer: { name: customerName, afm: trader?.afm },
    party: party ? { name: party.name, afm: party.afm, specialty: party.specialty, scope: party.scope } : null,
    title: c.title, summary: c.summary, site,
    startDate: c.startDate?.toISOString().slice(0, 10) ?? null, endDate: c.endDate?.toISOString().slice(0, 10) ?? null,
    validUntil: c.validUntil?.toISOString().slice(0, 10) ?? null,
    lines: lines.map((l) => ({ kind: l.kind, name: l.name, code: l.code, qty: l.qty, unit: l.unit, notes: l.notes })),
    milestones: milestones.map((m) => ({ title: m.title, deliverables: m.deliverables, dueDate: m.dueDate?.toISOString().slice(0, 10) ?? null, amount: m.amount })),
    total: party ? fee : t.gross, terms: c.terms,
    guides: guides.map(toPromptGuide),
  }, { userId: user.id, contractId: c.id });

  const prev = await prisma.contractDocument.findFirst({ where: { contractId: c.id, audience, partyId: party?.id ?? null }, orderBy: { version: 'desc' }, select: { version: true } });
  const version = (prev?.version ?? 0) + 1;
  const ref = contractRef(c.number);
  const addr = (a?: { address: string | null; zip: string | null; city: string | null } | null) => (a ? [a.address, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null : null);
  const pdfData: ContractPdfData = {
    ref, docKind: party ? 'PARTY' : c.stage === 'CONTRACT' ? 'CONTRACT' : 'OFFER', version,
    projectTitle: c.title, kindLabel: KIND_LABEL[c.kind as ContractKind] ?? c.kind, issuedOn: new Date(),
    validUntil: c.validUntil?.toISOString().slice(0, 10), startDate: c.startDate?.toISOString().slice(0, 10), endDate: c.endDate?.toISOString().slice(0, 10), site,
    company: brand,
    counterparty: party
      ? { name: party.name, afm: party.afm, email: party.email, phone: party.phone, specialty: party.specialty, address: addr(partyTrader) }
      : { name: customerName, afm: trader?.afm, email: c.customerEmail ?? trader?.email, phone: c.customerPhone ?? trader?.phone, address: addr(trader) },
    lines: lines.map((l) => ({
      kind: l.kind, code: l.code, name: l.name, notes: l.notes, qty: l.qty, unit: l.unit,
      unitPrice: party ? null : l.unitPrice, discount: party ? 0 : l.discount, amount: party ? l.crewFee ?? 0 : lineNet(l),
    })),
    totals: party ? { fee } : { ...t, vatRate: c.vatRate },
    milestones: milestones.map((m) => ({ title: m.title, deliverables: m.deliverables, dueDate: m.dueDate?.toISOString().slice(0, 10) ?? null, amount: m.amount })),
    doc, itemGuides: party ? guides : [],
  };
  const pdf = await renderContractPdf(pdfData);
  const fileName = pdfFileName(c.number, c.stage, audience, version, party?.name);
  const file = await uploadEntityFile({
    type: c.prjc ? 'PROJECT' : 'TRADER', id: (c.prjc ?? c.trdr)!, buffer: pdf, name: fileName, subfolder: SUBFOLDER,
    notes: `${docTitle(c.stage, audience)} ${ref} · έκδοση ${version}${party ? ` · ${party.name}` : ''}`, user,
  });
  return prisma.contractDocument.create({
    data: {
      contractId: c.id, audience, partyId: party?.id ?? null, stage: c.stage, version, content: doc as unknown as object, model,
      fileId: file.id, fileName, createdById: user.id,
    },
  });
}

// ── Αποστολή ──────────────────────────────────────────────────────────────────────────────────
export async function sendDocument(contractId: string, docId: string, opts: { to: string; message: string | null }, user: User) {
  const d = await prisma.contractDocument.findFirst({ where: { id: docId, contractId }, include: { contract: true, party: true } });
  if (!d) throw new ContractError('Το έγγραφο δεν βρέθηκε', 404);
  if (!d.fileId) throw new ContractError('Το έγγραφο δεν έχει PDF', 409);
  const file = await prisma.entityFile.findUnique({ where: { id: d.fileId }, select: { storageKey: true } });
  if (!file) throw new ContractError('Το PDF δεν βρέθηκε στα αρχεία', 404);
  const [pdf, brand] = await Promise.all([bunnyDownload(file.storageKey), emailBrand()]);
  const c = d.contract;
  const ref = contractRef(c.number);
  const what = docTitle(d.stage, d.audience);
  const doc = d.content as unknown as ContractDoc;
  const t = totals(await prisma.contractLine.findMany({ where: { contractId } }), c.vatRate);
  const m = renderEmail({
    brand,
    subject: `${what} ${ref} · ${c.title}`,
    preheader: `${what} για «${c.title}» — στο συνημμένο PDF.`,
    label: what, eyebrow: `${ref}${d.version > 1 ? ` · έκδοση ${d.version}` : ''}`, title: c.title,
    greeting: `${d.party?.name ?? c.customerName ?? 'Αγαπητέ συνεργάτη'},`,
    intro: d.audience === 'PARTY'
      ? `Σας αποστέλλουμε τη σύμβαση ανάθεσης εργασιών για το έργο «${c.title}», μαζί με τις αναλυτικές οδηγίες εγκατάστασης. Παρακαλούμε διαβάστε τη και επιστρέψτε τη υπογεγραμμένη.`
      : d.stage === 'OFFER'
        ? `Σας ευχαριστούμε για το ενδιαφέρον. Στο συνημμένο PDF θα βρείτε την προσφορά μας για το έργο «${c.title}».`
        : `Σας αποστέλλουμε τη σύμβαση για το έργο «${c.title}». Παρακαλούμε διαβάστε τη και επιστρέψτε τη υπογεγραμμένη.`,
    blocks: [
      opts.message ? callout('accent', opts.message) : none,
      doc?.scopeSummary ? paragraph(doc.scopeSummary) : none,
      facts([
        ['Αριθμός', ref],
        ['Τοποθεσία', siteText(c)],
        d.audience === 'CUSTOMER' ? ['Σύνολο με ΦΠΑ', eur(t.gross)] : ['Έναρξη', c.startDate ? dayEl(c.startDate) : null],
        d.stage === 'OFFER' && d.audience === 'CUSTOMER' ? ['Ισχύς έως', c.validUntil ? dayEl(c.validUntil) : null] : ['Λήξη', c.endDate ? dayEl(c.endDate) : null],
      ], { title: 'Στοιχεία' }),
    ],
    signoff: true,
  });
  const result = await sendLeadMail(opts.to, m.subject, m.html, {
    text: m.text, replyTo: user.email,
    attachments: [{ filename: d.fileName ?? 'symvasi.pdf', content: new Uint8Array(pdf), contentType: 'application/pdf' }],
  });
  const sends = [...(Array.isArray(d.sends) ? d.sends : []), { to: opts.to, at: new Date().toISOString(), by: user.name || user.email, result }];
  await prisma.contractDocument.update({ where: { id: d.id }, data: { sends } });
  // Η πρώτη αποστολή προσφοράς στον πελάτη τη σημειώνει «Στάλθηκε».
  if (result === 'sent' && d.audience === 'CUSTOMER' && c.status === 'DRAFT') await prisma.contract.update({ where: { id: c.id }, data: { status: 'SENT' } });
  return result;
}

/** Μετά τη σύνδεση με PRJC: τα PDF που είχαν μπει στον φάκελο του πελάτη αντιγράφονται στο έργο. */
export async function copyDocsToProject(contractId: string, user: User) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, include: { documents: true } });
  if (!c?.prjc) return 0;
  let n = 0;
  for (const d of c.documents) {
    if (!d.fileId) continue;
    const f = await prisma.entityFile.findUnique({ where: { id: d.fileId }, include: { folder: true } });
    if (!f || f.folder.entityType === 'PROJECT') continue;
    const buf = await bunnyDownload(f.storageKey);
    const nf = await uploadEntityFile({ type: 'PROJECT', id: c.prjc, buffer: buf, name: f.name, subfolder: SUBFOLDER, notes: f.notes, user });
    await prisma.contractDocument.update({ where: { id: d.id }, data: { fileId: nf.id } });
    n++;
  }
  return n;
}
