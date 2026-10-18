import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { mailgunConfig, sendTransactionalEmail } from '@/lib/mailgun';
import { emailBrand } from '@/lib/email/brand';
import { orderRequestStaffEmail } from '@/lib/email/templates';
import {
  customerCanCancel, deliveryDateProblem, mergeLines, ORDER_REQUEST_LABEL, requestCode, staffCanMove,
  type OrderRequestInput, type OrderRequestStatus,
} from '@/lib/order-requests-core';
import { appUrl } from '@/lib/app-url';

/**
 * Αιτήματα παραγγελίας από το B2B portal. Αποθηκεύονται ΜΟΝΟ στη βάση της εφαρμογής — καμία
 * εγγραφή στο SoftOne. Το προσωπικό ειδοποιείται με email και τα βλέπει στο Operations →
 * «Αιτήματα παραγγελίας», όπου τα επιβεβαιώνει/απορρίπτει και σημειώνει το παραστατικό του SoftOne.
 */

export class OrderRequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const num = (n: number) => n.toLocaleString('el-GR', { maximumFractionDigits: 3 });

export async function createOrderRequest(trdr: number, userId: string, input: OrderRequestInput, opts: { notify?: boolean } = {}) {
  const dateProblem = deliveryDateProblem(input.deliveryDate);
  if (dateProblem) throw new OrderRequestError(dateProblem);
  const lines = mergeLines(input.lines);

  // Μόνο ενεργά είδη του καταλόγου· η ονομασία/μονάδα κρατιέται ως στιγμιότυπο.
  const [items, units] = await Promise.all([
    prisma.softoneItem.findMany({ where: { mtrl: { in: lines.map((l) => l.mtrl) }, isActive: true }, select: { mtrl: true, code: true, name: true, unit1: true } }),
    prisma.softoneUnit.findMany({ select: { code: true, shortcut: true } }),
  ]);
  const item = new Map(items.map((i) => [i.mtrl, i]));
  const missing = lines.filter((l) => !item.has(l.mtrl));
  if (missing.length) throw new OrderRequestError('Κάποιο υλικό δεν είναι πλέον διαθέσιμο στον κατάλογο — αφαιρέστε το και ξαναδοκιμάστε');
  const unit = new Map(units.map((u) => [String(u.code), u.shortcut]));

  // Το έργο πρέπει να είναι ΤΟΥ πελάτη.
  if (input.prjc != null) {
    const p = await prisma.softoneProject.findFirst({ where: { prjc: input.prjc, trdr }, select: { prjc: true } });
    if (!p) throw new OrderRequestError('Το έργο δεν βρέθηκε', 404);
  }

  const created = await prisma.orderRequest.create({
    data: {
      trdr, createdById: userId, prjc: input.prjc,
      customerRef: input.customerRef, deliveryAddress: input.deliveryAddress,
      deliveryDate: input.deliveryDate ? new Date(`${input.deliveryDate}T00:00:00Z`) : null,
      notes: input.notes,
      lines: {
        create: lines.map((l, i) => {
          const it = item.get(l.mtrl)!;
          return { mtrl: l.mtrl, code: it.code, name: it.name, unit: it.unit1 ? unit.get(it.unit1) ?? null : null, qty: l.qty, note: l.note, sortOrder: i };
        }),
      },
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (opts.notify !== false) await notifyStaff(created.id);
  return created;
}

/** Τα αιτήματα ενός πελάτη (νεότερα πρώτα). */
export async function customerOrderRequests(trdr: number) {
  const rows = await prisma.orderRequest.findMany({
    where: { trdr }, orderBy: { createdAt: 'desc' }, take: 100,
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  const projects = await projectNames(rows.map((r) => r.prjc));
  return rows.map((r) => view(r, projects));
}

export async function cancelOrderRequest(trdr: number, id: string) {
  const r = await prisma.orderRequest.findFirst({ where: { id, trdr }, select: { id: true, status: true } });
  if (!r) throw new OrderRequestError('Το αίτημα δεν βρέθηκε', 404);
  if (!customerCanCancel(r.status)) throw new OrderRequestError('Το αίτημα είναι ήδη σε επεξεργασία — επικοινωνήστε μαζί μας για αλλαγές', 409);
  return prisma.orderRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
}

/** Για το προσωπικό: όλα τα αιτήματα, με επωνυμία πελάτη και όνομα χρήστη. */
export async function listOrderRequests() {
  const rows = await prisma.orderRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 500, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
  const [traders, users, projects] = await Promise.all([
    prisma.softoneTrader.findMany({ where: { trdr: { in: [...new Set(rows.map((r) => r.trdr))] } }, select: { trdr: true, name: true, code: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true, email: true } }),
    projectNames(rows.map((r) => r.prjc)),
  ]);
  const t = new Map(traders.map((x) => [x.trdr, x]));
  const u = new Map(users.map((x) => [x.id, x]));
  return rows.map((r) => ({
    ...view(r, projects),
    customer: t.get(r.trdr)?.name ?? `Πελάτης #${r.trdr}`,
    customerCode: t.get(r.trdr)?.code ?? null,
    requester: u.get(r.createdById) ? { name: u.get(r.createdById)!.name, email: u.get(r.createdById)!.email } : null,
  }));
}

export const countPendingOrderRequests = () => prisma.orderRequest.count({ where: { status: 'SUBMITTED' } });

export async function updateOrderRequest(id: string, staffId: string, change: { status: OrderRequestStatus; staffNote?: string | null; softoneFincode?: string | null }) {
  const r = await prisma.orderRequest.findUnique({ where: { id }, select: { status: true } });
  if (!r) throw new OrderRequestError('Το αίτημα δεν βρέθηκε', 404);
  if (r.status !== change.status && !staffCanMove(r.status, change.status)) {
    throw new OrderRequestError(`Δεν γίνεται αλλαγή από «${ORDER_REQUEST_LABEL[r.status as OrderRequestStatus] ?? r.status}» σε «${ORDER_REQUEST_LABEL[change.status]}»`, 409);
  }
  const decided = change.status === 'CONFIRMED' || change.status === 'REJECTED';
  return prisma.orderRequest.update({
    where: { id },
    data: {
      status: change.status,
      ...(change.staffNote !== undefined ? { staffNote: change.staffNote } : {}),
      ...(change.softoneFincode !== undefined ? { softoneFincode: change.softoneFincode } : {}),
      ...(decided && r.status !== change.status ? { decidedById: staffId, decidedAt: new Date() } : {}),
    },
  });
}

// ── βοηθητικά ────────────────────────────────────────────────────────────────────────────

async function projectNames(ids: (number | null)[]) {
  const wanted = [...new Set(ids.filter((v): v is number => v != null))];
  if (!wanted.length) return new Map<number, { code: string; name: string }>();
  const rows = await prisma.softoneProject.findMany({ where: { prjc: { in: wanted } }, select: { prjc: true, code: true, name: true } });
  return new Map(rows.map((p) => [p.prjc, { code: p.code, name: p.name }]));
}

type Row = Prisma.OrderRequestGetPayload<{ include: { lines: true } }>;

function view(r: Row, projects: Map<number, { code: string; name: string }>) {
  return {
    id: r.id, number: r.number, code: requestCode(r.number), status: r.status as OrderRequestStatus,
    statusLabel: ORDER_REQUEST_LABEL[r.status as OrderRequestStatus] ?? r.status,
    canCancel: customerCanCancel(r.status),
    project: r.prjc != null ? { prjc: r.prjc, ...(projects.get(r.prjc) ?? { code: '', name: `Έργο #${r.prjc}` }) } : null,
    customerRef: r.customerRef, deliveryAddress: r.deliveryAddress,
    deliveryDate: r.deliveryDate ? r.deliveryDate.toISOString().slice(0, 10) : null,
    notes: r.notes, staffNote: r.staffNote, softoneFincode: r.softoneFincode,
    createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
    lines: r.lines.map((l) => ({ id: l.id, mtrl: l.mtrl, code: l.code, name: l.name, unit: l.unit, qty: l.qty, note: l.note })),
  };
}
export type OrderRequestView = ReturnType<typeof view>;

/**
 * Email στο προσωπικό — best-effort, ποτέ δεν ρίχνει την υποβολή. Παραλήπτης: η ρύθμιση
 * `orders.notifyEmail` αλλιώς το email της εταιρείας. Τιμή «off» = καμία αποστολή (π.χ. σε δοκιμές).
 */
async function notifyStaff(id: string) {
  try {
    const r = await prisma.orderRequest.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    if (!r) return;
    const [brand, inbox, override, trader, user] = await Promise.all([
      emailBrand(), getSetting<string>('company.email'), getSetting<string>('orders.notifyEmail'),
      prisma.softoneTrader.findUnique({ where: { trdr: r.trdr }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: r.createdById }, select: { name: true, email: true } }),
    ]);
    if (override?.trim().toLowerCase() === 'off') return;
    const to = override?.trim() || inbox?.trim() || mailgunConfig().address;
    const m = orderRequestStaffEmail(brand, {
      code: requestCode(r.number), who: trader?.name ?? `Πελάτης #${r.trdr}`,
      from: `${user?.name ?? ''} ${user?.email ? `(${user.email})` : ''}`.trim() || null,
      customerRef: r.customerRef, delivery: r.deliveryDate ? r.deliveryDate.toISOString().slice(0, 10) : null, address: r.deliveryAddress,
      lines: r.lines.map((l) => ({ code: l.code, name: l.name, note: l.note, qty: `${num(l.qty)} ${l.unit ?? ''}`.trim() })),
      notes: r.notes, link: appUrl() ? `${appUrl()}/admin/order-requests` : null,
    });
    await sendTransactionalEmail(to, m.subject, m.html, { fromName: brand.name, replyTo: user?.email ?? null, text: m.text });
  } catch (e) {
    console.error('[order-request-mail]', e instanceof Error ? e.message : e);
  }
}
