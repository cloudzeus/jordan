// lib/customer-profile.ts — SERVER. Προφίλ πελάτη στην πύλη: στοιχεία επαφής, τοποθεσίες (με τις εγκαταστάσεις
// και τον τεχνικό φάκελο της καθεμίας) και αιτήματα αλλαγής εταιρικών στοιχείων. Τίποτα δεν γράφεται στο SoftOne.
import 'server-only';
import { prisma } from '@/lib/db';
import { contractRef } from '@/lib/contracts/core';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { appUrl } from '@/lib/app-url';
import { COMPANY_FIELDS, companyChanges, siteLine, type CompanyChange, type CompanyData, type ContactInput, type SiteInput } from './customer-profile-core';

export class ProfileError extends Error {}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ds = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Ό,τι δείχνει η σελίδα «Το προφίλ μου». */
export async function customerProfile(trdr: number, userId: string) {
  const [trader, contact, user, sites, contracts, requests] = await Promise.all([
    prisma.softoneTrader.findUnique({ where: { trdr }, select: Object.fromEntries([...COMPANY_FIELDS.map((f) => [f.key, true]), ['code', true]]) as Record<string, true> }),
    prisma.customerContact.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.customerSite.findMany({ where: { trdr }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    prisma.contract.findMany({
      where: { trdr, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, title: true, status: true, prjc: true, customerSiteId: true, siteAddress: true, siteCity: true, startDate: true, endDate: true, acceptedAt: true, updatedAt: true },
    }),
    prisma.customerChangeRequest.findMany({ where: { trdr }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  // Ο πελάτης βλέπει μόνο ό,τι του στείλαμε ή ζήτησε ο ίδιος (όχι εσωτερικά προσχέδια).
  const requested = new Set((await prisma.contractEvent.findMany({ where: { type: 'REQUESTED', contract: { trdr } }, select: { contractId: true } })).map((e) => e.contractId));
  const visible = contracts.filter((c) => c.status !== 'DRAFT' || requested.has(c.id));
  const install = (c: (typeof contracts)[number]) => ({
    id: c.id, ref: contractRef(c.number), title: c.title, status: c.status, prjc: c.prjc,
    address: [c.siteAddress, c.siteCity].filter(Boolean).join(', ') || null,
    date: ds(c.endDate ?? c.acceptedAt ?? c.startDate ?? c.updatedAt),
    dossier: ['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(c.status),
  });
  return {
    company: (trader ?? {}) as CompanyData & { code?: string },
    contact: { name: user?.name ?? contact?.name ?? '', email: user?.email ?? '', role: contact?.role ?? null, phone: contact?.phone ?? null, mobile: contact?.mobile ?? null },
    sites: sites.map((s) => ({ ...s, line: siteLine(s), installs: visible.filter((c) => c.customerSiteId === s.id).map(install) })),
    unassigned: visible.filter((c) => !c.customerSiteId).map(install),
    requests: requests.map((r) => ({ id: r.id, status: r.status, at: r.createdAt.toISOString(), changes: r.changes as CompanyChange[], note: r.note, reply: r.reply })),
  };
}
export type CustomerProfile = Awaited<ReturnType<typeof customerProfile>>;

/** Για τη φόρμα αιτήματος: οι τοποθεσίες του πελάτη. */
export async function customerSites(trdr: number) {
  const rows = await prisma.customerSite.findMany({ where: { trdr }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true, label: true, address: true, zip: true, district: true, city: true, floor: true, isDefault: true } });
  return rows.map((s) => ({ id: s.id, label: s.label, line: siteLine(s), isDefault: s.isDefault }));
}

export async function saveSite(trdr: number, id: string | null, input: SiteInput, by: string) {
  if (id && !(await prisma.customerSite.findFirst({ where: { id, trdr }, select: { id: true } }))) throw new ProfileError('Η τοποθεσία δεν βρέθηκε');
  const first = (await prisma.customerSite.count({ where: { trdr } })) === 0;
  const data = { ...input, isDefault: input.isDefault || first };
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.customerSite.updateMany({ where: { trdr, isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
    const s = id ? await tx.customerSite.update({ where: { id }, data }) : await tx.customerSite.create({ data: { ...data, trdr, createdById: by } });
    // Οι ανοιχτές προσφορές της τοποθεσίας κρατούν τη νέα διεύθυνση (οι ολοκληρωμένες μένουν ως είχαν).
    if (id) await tx.contract.updateMany({ where: { customerSiteId: id, trdr, status: { in: ['DRAFT', 'SENT'] } }, data: { siteAddress: [s.address, s.floor].filter(Boolean).join(', ') || null, siteZip: s.zip, siteDistrict: s.district, siteCity: s.city } });
    return s;
  });
}

export async function deleteSite(trdr: number, id: string) {
  const s = await prisma.customerSite.findFirst({ where: { id, trdr }, select: { id: true, isDefault: true, _count: { select: { contracts: true } } } });
  if (!s) throw new ProfileError('Η τοποθεσία δεν βρέθηκε');
  if (s._count.contracts) throw new ProfileError('Υπάρχουν προσφορές ή έργα σε αυτή την τοποθεσία — δεν διαγράφεται, για να μείνει ο τεχνικός φάκελος.');
  await prisma.customerSite.delete({ where: { id } });
  if (s.isDefault) {
    const next = await prisma.customerSite.findFirst({ where: { trdr }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (next) await prisma.customerSite.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

/** Ο πελάτης δένει μια παλιότερη προσφορά/έργο σε τοποθεσία του (για να μπει στον σωστό τεχνικό φάκελο). */
export async function assignContractSite(trdr: number, contractId: string, siteId: string | null) {
  const [c, s] = await Promise.all([
    prisma.contract.findFirst({ where: { id: contractId, trdr }, select: { id: true } }),
    siteId ? prisma.customerSite.findFirst({ where: { id: siteId, trdr }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!c || (siteId && !s)) throw new ProfileError('Δεν βρέθηκε');
  await prisma.contract.update({ where: { id: contractId }, data: { customerSiteId: siteId } });
}

/** Τα δικά του στοιχεία επαφής: όνομα χρήστη + η επαφή του πελάτη (δικά μας δεδομένα). */
export async function saveContact(trdr: number, user: { id: string; email: string }, input: ContactInput) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name: input.name } }),
    prisma.customerContact.upsert({
      where: { userId: user.id },
      update: { name: input.name, role: input.role, phone: input.phone, mobile: input.mobile },
      create: { trdr, userId: user.id, name: input.name, role: input.role, phone: input.phone, mobile: input.mobile, email: user.email },
    }),
  ]);
}

/** Αίτημα αλλαγής εταιρικών στοιχείων → το προσωπικό (email + λίστα στο admin). Δεν αγγίζει το SoftOne. */
export async function requestCompanyChange(trdr: number, user: { id: string; email: string; name: string | null }, values: Record<string, string | null>, note: string | null) {
  if (await prisma.customerChangeRequest.count({ where: { trdr, status: 'PENDING' } })) throw new ProfileError('Έχετε ήδη ένα αίτημα αλλαγής σε εξέλιξη — θα σας ενημερώσουμε μόλις ολοκληρωθεί.');
  const current = await prisma.softoneTrader.findUnique({ where: { trdr } });
  if (!current) throw new ProfileError('Δεν βρέθηκαν τα στοιχεία σας');
  const { changes, error } = companyChanges(current as CompanyData, values);
  if (error) throw new ProfileError(error);
  const r = await prisma.customerChangeRequest.create({ data: { trdr, userId: user.id, userEmail: user.email, changes, note } });
  void notifyStaff(current.name, changes, note, user).catch((e) => console.error('[profile-change-mail]', e instanceof Error ? e.message : e));
  return r;
}

async function notifyStaff(company: string, changes: CompanyChange[], note: string | null, by: { email: string; name: string | null }) {
  const [brand, inbox, override] = await Promise.all([emailBrand(), getSetting<string>('company.email'), getSetting<string>('orders.notifyEmail')]);
  if (override?.trim().toLowerCase() === 'off') return;
  const link = appUrl() ? `${appUrl()}/admin/customer-changes` : null;
  const rows = changes.map((c) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(c.label)}</td><td style="padding:4px 12px 4px 0;text-decoration:line-through;color:#888">${esc(c.from ?? '—')}</td><td style="padding:4px 0"><b>${esc(c.to ?? '—')}</b></td></tr>`).join('');
  const html = `<p>Ο πελάτης <b>${esc(company)}</b> (${esc(by.name ?? '')} · ${esc(by.email)}) ζητά αλλαγή στοιχείων:</p><table>${rows}</table>${note ? `<p>Σημείωση: ${esc(note)}</p>` : ''}<p>Η αλλαγή <b>δεν</b> έχει περάσει στο SoftOne.${link ? ` <a href="${link}">Άνοιγμα αιτήματος</a>` : ''}</p>`;
  const text = `${company} ζητά αλλαγή στοιχείων:\n${changes.map((c) => `${c.label}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join('\n')}${note ? `\nΣημείωση: ${note}` : ''}`;
  await sendTransactionalEmail(override?.trim() || inbox?.trim() || mailgunConfig().address, `Αλλαγή στοιχείων πελάτη — ${company}`, html, { fromName: brand.name, replyTo: by.email, text });
}
