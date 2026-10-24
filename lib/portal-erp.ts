import 'server-only';
import { prisma } from '@/lib/db';
import { softoneGetTable } from '@/lib/softone';
import {
  customerTotals, PROJECT_STATE_LABEL, projectState, toCustomerDoc, type CustomerDoc, type RawDoc,
} from '@/lib/portal-erp-core';

/**
 * Έργα & παραγγελίες ΤΟΥ πελάτη στο B2B portal — ζωντανά από το SoftOne (επίσημο GetTable) και
 * από τον καθρέφτη έργων. Το TRDR έρχεται ΠΑΝΤΑ από τη σύνδεση (User.customerTrdr), ποτέ από URL.
 *
 * Επιβεβαιωμένο στο atelier (2026-10-18):
 *  • πωλήσεις (1351): FINDOC.TRDR = ο πελάτης· παραγγελίες σειρά 7021, κατάσταση από FULLYTRANSF.
 *  • εισπράξεις (1413): το TRDR της κεφαλής είναι το ΤΑΜΕΙΟ/η ΤΡΑΠΕΖΑ (π.χ. «Alpha Bank»), όχι ο
 *    πελάτης — γι' αυτό οι πληρωμές φαίνονται μόνο ανά έργο (PRJC του πελάτη), ποτέ με φίλτρο TRDR.
 * Αγορές (1251) και πληρωμές προμηθευτών (1412) ΔΕΝ ζητούνται καν (φίλτρο SOSOURCE στο query).
 */

const DOC_FIELDS = ['FINDOC', 'FINCODE', 'TRNDATE', 'SERIES', 'SOSOURCE', 'PRJC', 'NETAMNT', 'VATAMNT', 'SUMAMNT', 'ISCANCEL', 'FULLYTRANSF'];
const LINE_FIELDS = ['MTRLINES', 'FINDOC', 'MTRL', 'MTRUNIT', 'QTY1', 'QTY1COV', 'QTY1CANC', 'PRICE', 'DISC1PRC', 'LINEVAL', 'COMMENTS1'];

const isId = (n: number) => Number.isInteger(n) && n > 0;
// Demo εγγραφές: αρνητικά TRDR/PRJC μόνο στη βάση μας — φαίνονται στην πύλη, χωρίς καμία κλήση στο SoftOne.
const isDemo = (n: number) => Number.isInteger(n) && n < 0;
const isRecord = (n: number) => isId(n) || isDemo(n);

async function seriesNamer() {
  const rows = await prisma.softoneDocSeries.findMany({ where: { sosource: { in: [1351, 1413] } }, select: { sosource: true, code: true, name: true } });
  const m = new Map(rows.map((r) => [`${r.sosource}:${r.code}`, r.name]));
  return (sosource: number, series: string) => m.get(`${sosource}:${series}`) ?? null;
}

const sortDocs = (a: CustomerDoc, b: CustomerDoc) => (b.date ?? '').localeCompare(a.date ?? '') || b.findoc - a.findoc;

/** Όλα τα παραστατικά πωλήσεων του πελάτη (παραγγελίες, δελτία, τιμολόγια, πιστωτικά, προσφορές). */
export async function customerSalesDocs(trdr: number): Promise<CustomerDoc[]> {
  if (!isId(trdr)) return [];
  const [rows, name] = await Promise.all([softoneGetTable('FINDOC', DOC_FIELDS, `SOSOURCE=1351 AND TRDR=${trdr}`), seriesNamer()]);
  return rows.map((r) => toCustomerDoc(r, name)).filter((d): d is CustomerDoc => !!d).sort(sortDocs);
}

/** Ένα παραστατικό ΤΟΥ πελάτη με τις γραμμές του — null αν δεν του ανήκει. */
export async function customerSalesDoc(trdr: number, findoc: number) {
  if (!isId(trdr) || !isId(findoc)) return null;
  const [head] = await softoneGetTable('FINDOC', DOC_FIELDS, `FINDOC=${findoc} AND SOSOURCE=1351 AND TRDR=${trdr}`);
  if (!head) return null;
  const [name, lines] = await Promise.all([seriesNamer(), softoneGetTable('MTRLINES', LINE_FIELDS, `FINDOC=${findoc}`)]);
  const doc = toCustomerDoc(head, name);
  if (!doc) return null;
  const n = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const mtrls = [...new Set(lines.map((l) => n(l.MTRL)).filter(isId))];
  const [items, units] = await Promise.all([
    prisma.softoneItem.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true } }),
    prisma.softoneUnit.findMany({ select: { code: true, shortcut: true } }),
  ]);
  const item = new Map(items.map((i) => [i.mtrl, i]));
  const unit = new Map(units.map((u) => [u.code, u.shortcut]));
  const project = doc.prjc ? await prisma.softoneProject.findFirst({ where: { prjc: doc.prjc, trdr }, select: { prjc: true, code: true, name: true } }) : null;
  return {
    doc,
    project,
    lines: lines.map((l) => {
      const mtrl = n(l.MTRL);
      return {
        id: n(l.MTRLINES), mtrl, code: item.get(mtrl)?.code ?? null, name: item.get(mtrl)?.name ?? `Είδος #${mtrl}`,
        unit: unit.get(n(l.MTRUNIT)) ?? null,
        qty: n(l.QTY1), executed: n(l.QTY1COV), cancelled: n(l.QTY1CANC),
        price: n(l.PRICE), discount: n(l.DISC1PRC), value: n(l.LINEVAL), comment: l.COMMENTS1 || null,
      };
    }).sort((a, b) => a.id - b.id),
  };
}

/** Τα έργα του πελάτη (καθρέφτης PRJC), χωρίς κανένα οικονομικό στοιχείο κόστους. */
export async function customerProjects(trdr: number) {
  if (!isRecord(trdr)) return [];
  const rows = await prisma.softoneProject.findMany({ where: { trdr }, orderBy: [{ isActive: 'desc' }, { fromDate: 'desc' }, { code: 'desc' }] });
  return rows.map((p) => {
    const state = projectState(p);
    return {
      prjc: p.prjc, code: p.code, name: p.name, state, stateLabel: PROJECT_STATE_LABEL[state],
      fromDate: p.fromDate?.toISOString().slice(0, 10) ?? null,
      finalDate: p.finalDate?.toISOString().slice(0, 10) ?? null,
      closeDate: p.closeDate?.toISOString().slice(0, 10) ?? null,
    };
  });
}

/** Ένα έργο ΤΟΥ πελάτη με τα παραστατικά του (πωλήσεις προς τον πελάτη + πληρωμές του). */
export async function customerProject(trdr: number, prjc: number) {
  if (!isRecord(trdr) || !isRecord(prjc)) return null;
  const p = await prisma.softoneProject.findFirst({ where: { prjc, trdr } });
  if (!p) return null;
  const [rows, name, requests] = await Promise.all([
    isDemo(prjc) ? Promise.resolve([]) : softoneGetTable('FINDOC', DOC_FIELDS, `PRJC=${prjc} AND ((SOSOURCE=1351 AND TRDR=${trdr}) OR SOSOURCE=1413)`),
    seriesNamer(),
    prisma.orderRequest.count({ where: { trdr, prjc } }),
  ]);
  const docs = (rows as RawDoc[]).map((r) => toCustomerDoc(r, name)).filter((d): d is CustomerDoc => !!d).sort(sortDocs);
  const state = projectState(p);
  return {
    project: {
      prjc: p.prjc, code: p.code, name: p.name, state, stateLabel: PROJECT_STATE_LABEL[state],
      fromDate: p.fromDate?.toISOString().slice(0, 10) ?? null,
      finalDate: p.finalDate?.toISOString().slice(0, 10) ?? null,
      closeDate: p.closeDate?.toISOString().slice(0, 10) ?? null,
    },
    docs,
    totals: customerTotals(docs),
    requests,
  };
}

export type CustomerProject = Awaited<ReturnType<typeof customerProjects>>[number];
