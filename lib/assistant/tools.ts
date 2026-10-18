// lib/assistant/tools.ts — SERVER. Τα εργαλεία του Air Jordan. ΟΛΑ ΜΟΝΟ ΑΝΑΓΝΩΣΗ, εκτός από το
// `remember`, που γράφει στη δική του μνήμη (AssistantMemory). Πρώτη πηγή η βάση της εφαρμογής (καθρέφτης
// SoftOne)· ζωντανά από το SoftOne (GetTable) μόνο ό,τι δεν καθρεφτίζεται: καρτέλα/υπόλοιπο, κινήσεις
// έργου, αγορές είδους, συντεταγμένες. Κάθε αποτέλεσμα φέρει `refs` — τις πηγές για τις παραπομπές.
import 'server-only';
import { prisma } from '@/lib/db';
import { resolveParty } from '@/lib/appointment-parties';
import { softoneGetTable, SODTYPE_LABEL } from '@/lib/softone';
import { getProject, projectStatusLabel } from '@/lib/projects';
import { getProjectFinancials, listProjectFinancials } from '@/lib/project-profit';
import { fetchProjectActivity } from '@/lib/project-activity';
import { traderActivity } from '@/lib/trader-activity';
import { itemStock } from '@/lib/item-stock';
import { itemPurchases } from '@/lib/item-purchases';
import { lastPurchasePrices } from '@/lib/last-purchase-price';
import type { ToolDef } from './openrouter';
import { MEMORY_KINDS, remember, searchKnowledge, type MemoryKind } from './search';
import { fold } from './text';
import { parsePeriod, type Period } from './period';
import { projectCustomerBalance, turnover } from './finance';
import { appointmentsBetween, checkSlot, findParties, freeSlots, pickParty, signProposal } from './calendar';
import { parseWhen } from './when';
import { formatSlotEl, zonedParts, zonedToUtc } from '@/lib/appointments-core';
import { appointmentsSoftoneEnabled } from '@/lib/appointment-softone';

export interface Ref { refKey: string; label: string; url: string | null }
export interface ToolContext { userId: string; canFinancials: boolean; canSchedule?: boolean; messageId?: string | null; vector?: string | null }

/** Κάρτα επιβεβαίωσης ραντεβού — το ραντεβού δημιουργείται ΜΟΝΟ όταν ο χρήστης πατήσει «Επιβεβαίωση». */
export interface AppointmentCard {
  type: 'appointment';
  token: string;
  when: string;
  minutes: number;
  with: string;
  sub: string;
  email: string | null;
  place: string;
  topic: string | null;
  notes: string | null;
  warnings: string[];
  assumed: string[];
  /** Η ώρα είναι γεμάτη: η επιβεβαίωση θα κλείσει ραντεβού πάνω σε άλλο. */
  overlap: boolean;
  saveTo: string[];
}
export interface ToolResult { data: unknown; refs: Ref[]; card?: AppointmentCard }

const SOURCE_ENUM = ['project', 'document', 'trader', 'item', 'service', 'unit', 'classification', 'lookup', 'partner', 'offer', 'order_request', 'appointment', 'lead', 'wiki', 'glossary'];

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Αναζήτηση στη μνήμη της εφαρμογής (έργα, παραστατικά έργων, πελάτες/προμηθευτές, είδη/υπηρεσίες, συνεργάτες, προσφορές, αιτήματα, ραντεβού, leads, μητρώα, οδηγός χρήσης, γλωσσάρι SoftOne). Καταλαβαίνει ελληνικά, greeklish, χωρίς τόνους, κομμάτια κωδικών και συνώνυμα. Χρησιμοποίησέ το ΠΡΩΤΟ για να βρεις ποια οντότητα εννοεί ο χρήστης.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Λέξεις-κλειδιά: όνομα, κωδικός, ΑΦΜ, περιγραφή υλικού, θέμα.' },
          types: { type: 'array', items: { type: 'string', enum: SOURCE_ENUM }, description: 'Προαιρετικά: περιορισμός σε τύπους.' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project',
      description: 'Πλήρη στοιχεία ενός έργου από τη βάση: πελάτης, status, ημερομηνίες, συνεργάτες, προϋπολογισμός, οικονομικά (έσοδα, κόστος, καθαρό κέρδος, περιθώριο, εισπράξεις, ανοιχτό υπόλοιπο) και τα παραστατικά του με ΜΑΡΚ. Δώσε prjc (αριθμό) ή code.',
      parameters: { type: 'object', properties: { prjc: { type: 'integer' }, code: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_materials',
      description: 'ΖΩΝΤΑΝΑ από το SoftOne: τα υλικά/υπηρεσίες που κινήθηκαν σε ένα έργο (ποσότητα, αξία, τελευταία τιμή αγοράς) και σύνολα ανά ενότητα. Για ερωτήσεις «τι υλικά πήγαν στο έργο».',
      parameters: { type: 'object', properties: { prjc: { type: 'integer' } }, required: ['prjc'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'Λίστα έργων από τη βάση με οικονομικά, ταξινομημένη. Για ερωτήσεις «ποια έργα είναι ενεργά», «τα πιο κερδοφόρα», «ποια έχουν ανοιχτό υπόλοιπο», «έργα του πελάτη Χ».',
      parameters: {
        type: 'object',
        properties: {
          active: { type: 'boolean' },
          customer_trdr: { type: 'integer' },
          sort: { type: 'string', enum: ['recent', 'profit', 'loss', 'margin', 'revenue', 'open'] },
          limit: { type: 'integer', minimum: 1, maximum: 60 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trader',
      description: 'Πελάτης/προμηθευτής: στοιχεία, ΑΦΜ, διεύθυνση, τηλέφωνα, επαφές, έργα, θέση στον χάρτη, και (ζωντανά από SoftOne) υπόλοιπο καρτέλας, τελευταία πληρωμή, τελευταίες κινήσεις, παραγγελίες. Δώσε trdr ή code.',
      parameters: {
        type: 'object',
        properties: { trdr: { type: 'integer' }, code: { type: 'string' }, include_ledger: { type: 'boolean', description: 'Υπόλοιπο & κινήσεις (ζωντανά από SoftOne, πιο αργό). Βάλε false όταν ρωτούν μόνο στοιχεία επικοινωνίας/διεύθυνση/έργα.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_item',
      description: 'Είδος/υλικό/υπηρεσία: κωδικοί, μονάδες, τιμή λιανικής, απόθεμα ανά αποθήκη, και (ζωντανά) τελευταία τιμή αγοράς, μέσο κόστος, προμηθευτές, σε ποια έργα χρησιμοποιήθηκε. Δώσε mtrl ή code.',
      parameters: { type: 'object', properties: { mtrl: { type: 'integer' }, code: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_turnover',
      description: 'Τζίρος (πωλήσεις) ή αγορές μιας ΠΕΡΙΟΔΟΥ, ζωντανά από το SoftOne: καθαρά (χωρίς ΦΠΑ) και μικτά, τιμολόγια μείον πιστωτικά (παραγγελίες/δελτία/προσφορές δεν μετρούν), ανά μήνα, κορυφαίοι πελάτες/προμηθευτές, μεγαλύτερα παραστατικά. Προαιρετικά για έναν πελάτη/προμηθευτή ή ένα έργο. Για «τι τζίρο έκανα αυτό τον μήνα», «πωλήσεις πέρσι», «αγορές Q3».',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Η περίοδος όπως την είπε ο χρήστης: «αυτό τον μήνα», «πέρσι», «Q3 2025», «Μάιος», «φέτος», «από 1/3/2026 έως 15/4/2026».' },
          from: { type: 'string', description: 'Εναλλακτικά: yyyy-mm-dd (συμπεριλαμβάνεται)' },
          to: { type: 'string', description: 'Εναλλακτικά: yyyy-mm-dd (συμπεριλαμβάνεται)' },
          side: { type: 'string', enum: ['sales', 'purchases'], description: 'sales = τζίρος/πωλήσεις (προεπιλογή), purchases = αγορές' },
          trdr: { type: 'integer', description: 'Μόνο για αυτόν τον πελάτη/προμηθευτή' },
          trader_code: { type: 'string' },
          prjc: { type: 'integer', description: 'Μόνο για αυτό το έργο' },
          project_code: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_project_balance',
      description: 'Υπόλοιπο του ΠΕΛΑΤΗ ΣΕ ΕΝΑ ΕΡΓΟ: μικτά τιμολογημένα, εισπράξεις, ανοιχτό υπόλοιπο με παλαιότητα, τα τιμολόγια και οι εισπράξεις του έργου, και τα «Δεδομένα που λείπουν». Για «πόσα μας χρωστά ο πελάτης στο έργο Χ». (Το συνολικό υπόλοιπο του πελάτη σε όλα τα έργα: get_trader.)',
      parameters: { type: 'object', properties: { prjc: { type: 'integer' }, code: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointments',
      description: 'Ραντεβού του ημερολογίου της εφαρμογής για μια μέρα/περίοδο (ώρα Αθήνας): ποιος, πότε, πού, θέμα, κατάσταση. Προεπιλογή: τα δικά μου (ανατεθειμένα σε μένα + χωρίς ανάθεση) σήμερα. Για «τι ραντεβού έχω σήμερα/αύριο/αυτή την εβδομάδα».',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', description: '«σήμερα», «αύριο», «Δευτέρα», «αυτή την εβδομάδα», «20/10»…' },
          scope: { type: 'string', enum: ['mine', 'all'], description: 'mine (προεπιλογή) ή all = όλων' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_appointment',
      description: 'ΠΡΟΤΑΣΗ νέου ραντεβού με πελάτη/επαφή/συνεργάτη: βρίσκει με ποιον, ερμηνεύει μέρα/ώρα (ώρα Αθήνας), ελέγχει αν η ώρα είναι ελεύθερη και δείχνει στον χρήστη ΚΑΡΤΑ ΕΠΙΒΕΒΑΙΩΣΗΣ. ΔΕΝ κλείνει τίποτα — το ραντεβού γίνεται μόνο αν ο χρήστης πατήσει «Επιβεβαίωση» στην κάρτα. Νέος πελάτης που δεν υπάρχει: δεν γίνεται από εδώ (Ημερολόγιο → Νέο ραντεβού).',
      parameters: {
        type: 'object',
        properties: {
          with: { type: 'string', description: 'Με ποιον, όπως το είπε ο χρήστης (όνομα, εταιρεία, κωδικός).' },
          party_kind: { type: 'string', enum: ['trader', 'contact', 'partner', 'partnerContact'], description: 'Αν είναι ήδη γνωστό από προηγούμενο βήμα.' },
          party_id: { type: 'string' },
          when: { type: 'string', description: 'Μέρα και ώρα όπως τις είπε ο χρήστης: «στις 4 το απόγευμα της Δευτέρας», «αύριο 10:30».' },
          date: { type: 'string', description: 'Εναλλακτικά yyyy-mm-dd' },
          time: { type: 'string', description: 'Εναλλακτικά HH:MM (24ωρο, ώρα Αθήνας)' },
          minutes: { type: 'integer', description: 'Διάρκεια (προεπιλογή 60)' },
          place: { type: 'string', enum: ['atelier', 'customer'], description: 'Πού: στο atelier (προεπιλογή) ή στον πελάτη' },
          location: { type: 'string', description: 'Διεύθυνση όταν είναι στον πελάτη' },
          topic: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Αποθήκευσε κάτι που ΕΜΑΘΕΣ από τον χρήστη για να το θυμάσαι στο μέλλον: συνώνυμο/παρατσούκλι οντότητας («όταν λέω Πορσελάνες εννοώ τον προμηθευτή Porcelanosa 30-0012»), γεγονός που δεν υπάρχει στα δεδομένα, ή προτίμηση στον τρόπο απάντησης. ΜΗΝ αποθηκεύεις αριθμούς που αλλάζουν (υπόλοιπα, αποθέματα).',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: MEMORY_KINDS.filter((k) => k !== 'answer') },
          text: { type: 'string', description: 'Αυτοτελής πρόταση στα Ελληνικά, με κωδικό οντότητας όπου υπάρχει.' },
          ref_key: { type: 'string', description: 'π.χ. trader:45, project:12, item:301' },
        },
        required: ['kind', 'text'],
      },
    },
  },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const int = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Αριθμητικός κωδικός χωρίς τα μηδενικά μπροστά: «40» → «0000040». Πίνακας/στήλη από σταθερή λίστα. */
async function byPaddedCode<T>(table: 'SoftoneProject' | 'SoftoneTrader' | 'SoftoneItem', idCol: 'prjc' | 'trdr' | 'mtrl', code: string): Promise<T | null> {
  if (!/^\d{1,12}$/.test(code)) return null;
  const rows = await prisma.$queryRawUnsafe<T[]>(
    `SELECT "${idCol}" FROM "${table}" WHERE ltrim("code", '0') = ltrim($1, '0') ORDER BY "isActive" DESC LIMIT 1`, code,
  );
  return rows[0] ?? null;
}

async function resolveProject(args: Record<string, unknown>): Promise<number | null> {
  const id = int(args.prjc);
  if (id) return id;
  const code = str(args.code);
  if (!code) return null;
  const p = await prisma.softoneProject.findFirst({ where: { code: { equals: code, mode: 'insensitive' } }, select: { prjc: true } });
  if (p) return p.prjc;
  return (await byPaddedCode<{ prjc: number }>('SoftoneProject', 'prjc', code))?.prjc ?? null;
}
async function resolveTrader(args: Record<string, unknown>): Promise<number | null> {
  const id = int(args.trdr);
  if (id) return id;
  const code = str(args.code);
  if (!code) return null;
  const t = await prisma.softoneTrader.findFirst({ where: { OR: [{ code: { equals: code, mode: 'insensitive' } }, { afm: code }] }, select: { trdr: true } });
  if (t) return t.trdr;
  return (await byPaddedCode<{ trdr: number }>('SoftoneTrader', 'trdr', code))?.trdr ?? null;
}
async function resolveItem(args: Record<string, unknown>): Promise<number | null> {
  const id = int(args.mtrl);
  if (id) return id;
  const code = str(args.code);
  if (!code) return null;
  const i = await prisma.softoneItem.findFirst({
    where: { OR: [{ code: { equals: code, mode: 'insensitive' } }, { code1: code }, { code2: { equals: code, mode: 'insensitive' } }] },
    select: { mtrl: true },
  });
  if (i) return i.mtrl;
  return (await byPaddedCode<{ mtrl: number }>('SoftoneItem', 'mtrl', code))?.mtrl ?? null;
}

const notFound = (what: string): ToolResult => ({ data: { error: `Δεν βρέθηκε ${what} — δοκίμασε search_knowledge.` }, refs: [] });
const liveError = (e: unknown) => `Το SoftOne δεν απάντησε (${(e as Error).message?.slice(0, 120)}) — τα ζωντανά στοιχεία λείπουν.`;

const projectRef = (p: { prjc: number; code: string; name: string }): Ref => ({ refKey: `project:${p.prjc}`, label: `Έργο ${p.code}`, url: `/admin/projects/${p.prjc}` });

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case 'search_knowledge': {
      const types = Array.isArray(args.types) ? (args.types as unknown[]).filter((t): t is string => typeof t === 'string' && SOURCE_ENUM.includes(t)) : undefined;
      const q = str(args.query) ?? '';
      const hits = await searchKnowledge(q, { sources: types, limit: Number(args.limit) || 8, userId: ctx.userId });
      const visible = ctx.canFinancials ? hits : hits.map((h) => ({ ...h, body: h.body.replace(/^Οικονομικά.*$/gm, '') }));
      return {
        data: visible.length ? visible.map((h) => ({ ref: h.refKey, type: h.source, title: h.title, text: h.body.slice(0, 1200) })) : { result: 'Κανένα αποτέλεσμα' },
        refs: visible.slice(0, 5).map((h) => ({ refKey: h.refKey, label: h.title, url: h.url })),
      };
    }

    case 'get_project': {
      const prjc = await resolveProject(args);
      const p = prjc ? await getProject(prjc) : null;
      if (!p) return notFound('έργο');
      const [fin, budget, partners] = await Promise.all([
        ctx.canFinancials ? getProjectFinancials(p.prjc) : Promise.resolve(null),
        prisma.projectBudgetLine.findMany({ where: { prjc: p.prjc }, select: { code: true, name: true, qty: true, unit: true, unitPrice: true } }),
        prisma.partnerProject.findMany({ where: { prjc: p.prjc }, include: { partner: { select: { name: true, specialty: true } } } }),
      ]);
      const pf = fin?.profit;
      const docs = pf ? [
        ...pf.revenue.docs.map((d) => ({ ...d, role: 'πώληση' })),
        ...pf.costs.docs.map((d) => ({ ...d, role: 'κόστος' })),
        ...pf.collections.docs.map((d) => ({ ...d, role: 'είσπραξη' })),
        ...pf.payments.docs.map((d) => ({ ...d, role: 'πληρωμή' })),
      ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) : [];
      return {
        data: {
          ref: `project:${p.prjc}`, prjc: p.prjc, code: p.code, name: p.name, active: p.isActive,
          status: projectStatusLabel(p.actStatus), customer: p.customer ? { trdr: p.customer.trdr, code: p.customer.code, name: p.customer.name } : null,
          supplier: p.supplier ? { trdr: p.supplier.trdr, code: p.supplier.code, name: p.supplier.name } : null,
          from: iso(p.fromDate), final: iso(p.finalDate), closed: iso(p.closeDate), remarks: p.remarks,
          partners: partners.map((x) => `${x.partner.name}${x.role ? ` (${x.role})` : ''}`),
          budget: budget.map((b) => ({ code: b.code, name: b.name, qty: b.qty, unit: b.unit, unitPrice: b.unitPrice })),
          financials: !ctx.canFinancials ? 'Χωρίς δικαίωμα projects.financials'
            : pf ? {
              computedAt: fin!.computedAt, revenueNet: pf.revenue.net, revenueGross: pf.revenue.gross, collected: pf.collections.collected, open: pf.collections.open,
              costs: pf.costs.total, costByCategory: pf.costs.byCategory, overhead: pf.overhead.total, netProfit: pf.netProfit, marginPct: pf.marginPct,
              supplierPayments: pf.payments.paid, cash: pf.cash, budgetTotal: pf.budget.total,
              missingData: fin!.issues.map((i) => i.title),
            } : 'Δεν έχουν υπολογιστεί οικονομικά',
          documents: docs.slice(0, 40).map((d) => ({ fincode: d.fincode, date: iso(d.date), role: d.role, series: d.seriesName ?? d.series, trader: d.traderName, net: d.net, gross: d.gross, partial: d.partial || undefined, mark: d.mark })),
          documentsTotal: docs.length,
        },
        refs: [projectRef(p)],
      };
    }

    case 'get_project_materials': {
      const prjc = await resolveProject(args);
      const p = prjc ? await prisma.softoneProject.findUnique({ where: { prjc }, select: { prjc: true, code: true, name: true } }) : null;
      if (!p) return notFound('έργο');
      try {
        const a = await fetchProjectActivity(p.prjc);
        return {
          data: {
            ref: `project:${p.prjc}`, project: `${p.code} · ${p.name}`, source: 'SoftOne ζωντανά', fetchedAt: a.fetchedAt,
            totals: a.totals.map((t) => ({ family: t.family, docs: t.docs, net: round2(t.net), total: round2(t.total) })),
            materials: a.materials.slice(0, 60).map((m) => ({
              code: m.code, name: m.name, service: m.isService || undefined, family: m.family, qty: round2(m.qty), unit: m.unit, value: round2(m.value),
              lastPurchase: m.lastPurchase ? { unitCost: round2(m.lastPurchase.unitCost), date: iso(m.lastPurchase.date), doc: m.lastPurchase.fincode } : null,
            })),
          },
          refs: [projectRef(p), ...a.materials.slice(0, 6).map((m) => ({ refKey: `item:${m.mtrl}`, label: `${m.isService ? 'Υπηρεσία' : 'Είδος'} ${m.code ?? m.mtrl} · ${m.name}`, url: m.isService ? '/admin/services' : '/admin/items' }))],
        };
      } catch (e) {
        return { data: { error: liveError(e) }, refs: [projectRef(p)] };
      }
    }

    case 'list_projects': {
      const [rows, fins] = await Promise.all([prisma.softoneProject.findMany(), ctx.canFinancials ? listProjectFinancials() : Promise.resolve(new Map())]);
      const traders = await prisma.softoneTrader.findMany({ where: { trdr: { in: rows.map((r) => r.trdr).filter((x): x is number => x != null) } }, select: { trdr: true, name: true } });
      const tn = new Map(traders.map((t) => [t.trdr, t.name]));
      let list = rows
        .filter((r) => (typeof args.active === 'boolean' ? r.isActive === args.active : true))
        .filter((r) => (int(args.customer_trdr) ? r.trdr === int(args.customer_trdr) : true))
        .map((r) => {
          const f = fins.get(r.prjc);
          return {
            prjc: r.prjc, code: r.code, name: r.name, customer: r.trdr != null ? tn.get(r.trdr) ?? null : null, active: r.isActive,
            from: iso(r.fromDate), status: projectStatusLabel(r.actStatus),
            ...(f ? { revenue: round2(f.revenue), costs: round2(f.costs), netProfit: round2(f.netProfit), marginPct: f.marginPct == null ? null : round2(f.marginPct), open: round2(f.openAmount) } : {}),
          };
        });
      const sort = String(args.sort ?? 'recent');
      const by: Record<string, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
        recent: (a, b) => (b.from ?? '').localeCompare(a.from ?? '') || b.code.localeCompare(a.code),
        profit: (a, b) => (b.netProfit ?? -Infinity) - (a.netProfit ?? -Infinity),
        loss: (a, b) => (a.netProfit ?? Infinity) - (b.netProfit ?? Infinity),
        margin: (a, b) => (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity),
        revenue: (a, b) => (b.revenue ?? 0) - (a.revenue ?? 0),
        open: (a, b) => (b.open ?? 0) - (a.open ?? 0),
      };
      list = list.sort(by[sort] ?? by.recent);
      const limit = Math.min(Number(args.limit) || 15, 60);
      return { data: { count: list.length, financials: ctx.canFinancials, projects: list.slice(0, limit) }, refs: list.slice(0, 5).map(projectRef) };
    }

    case 'get_trader': {
      const trdr = await resolveTrader(args);
      const t = trdr ? await prisma.softoneTrader.findUnique({ where: { trdr } }) : null;
      if (!t) return notFound('συναλλασσόμενος');
      const [contacts, projects, coords] = await Promise.all([
        prisma.customerContact.findMany({ where: { trdr: t.trdr }, select: { name: true, role: true, phone: true, mobile: true, email: true, isPrimary: true } }),
        prisma.softoneProject.findMany({ where: { OR: [{ trdr: t.trdr }, { trdrSu: t.trdr }] }, select: { prjc: true, code: true, name: true, isActive: true, trdr: true } }),
        softoneGetTable('TRDR', ['LATITUDE', 'LONGITUDE'], `TRDR=${t.trdr}`).then((r) => r[0] ?? null).catch(() => null),
      ]);
      const lat = Number(coords?.LATITUDE), lng = Number(coords?.LONGITUDE);
      let ledger: unknown = 'Δεν ζητήθηκε';
      if (args.include_ledger !== false) {
        try {
          const a = await traderActivity(t.trdr);
          ledger = {
            source: 'SoftOne ζωντανά', fetchedAt: a.fetchedAt, side: a.side === 'customer' ? 'πελάτης' : 'προμηθευτής',
            balance: a.softone.balance, debit: a.softone.debit, credit: a.softone.credit,
            balanceMeaning: a.side === 'customer' ? (a.softone.balance > 0 ? 'μας χρωστά' : a.softone.balance < 0 ? 'πιστωτικό υπόλοιπο' : 'εξοφλημένος') : (a.softone.balance < 0 ? 'του χρωστάμε' : a.softone.balance > 0 ? 'χρεωστικό υπόλοιπο' : 'εξοφλημένος'),
            reconciliationOk: a.softone.matches,
            byYear: a.byYear,
            lastPayment: a.lastPayment,
            recent: a.ledger.slice(0, 12).map((d) => ({ fincode: d.fincode, date: iso(d.date), kind: d.kindLabel, amount: d.amount, side: d.side === 'D' ? 'χρέωση' : 'πίστωση', balanceAfter: d.balance, project: d.project })),
            openOrders: a.orders.slice(0, 8).map((d) => ({ fincode: d.fincode, date: iso(d.date), amount: d.amount })),
            quotes: a.quotes.slice(0, 5).map((d) => ({ fincode: d.fincode, date: iso(d.date), amount: d.amount })),
          };
        } catch (e) {
          ledger = { error: liveError(e) };
        }
      }
      return {
        data: {
          ref: `trader:${t.trdr}`, trdr: t.trdr, code: t.code, name: t.name, type: SODTYPE_LABEL[t.sodtype] ?? t.kind, afm: t.afm, doy: t.doy, profession: t.profession,
          address: [t.address, t.district, t.zip, t.city].filter(Boolean).join(', ') || null,
          phones: [t.phone, t.phone2].filter(Boolean), email: t.email, web: t.webpage, active: t.isActive,
          location: Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng, map: `https://www.google.com/maps?q=${lat},${lng}` } : 'Χωρίς συντεταγμένες στο SoftOne',
          contacts,
          projects: projects.map((p) => ({ code: p.code, name: p.name, active: p.isActive, role: p.trdr === t.trdr ? 'πελάτης' : 'προμηθευτής' })),
          ledger,
        },
        refs: [{ refKey: `trader:${t.trdr}`, label: `${SODTYPE_LABEL[t.sodtype] ?? 'Συναλλασσόμενος'} ${t.code} · ${t.name}`, url: `/admin/traders?type=${t.sodtype}` }],
      };
    }

    case 'get_item': {
      const mtrl = await resolveItem(args);
      const i = mtrl ? await prisma.softoneItem.findUnique({ where: { mtrl } }) : null;
      if (!i) return notFound('είδος');
      const units = await prisma.softoneLookup.findMany({ where: { kind: 'MTRUNIT', code: { in: [i.unit1, i.unitBuy, i.unitSell].filter((x): x is string => !!x) } } });
      const un = (c: string | null) => (c ? units.find((u) => u.code === c)?.name ?? c : null);
      const [stock, budgetUse, lp, purchases] = await Promise.all([
        i.isService ? Promise.resolve(null) : itemStock(i.mtrl, false).catch(() => null),
        prisma.projectBudgetLine.findMany({ where: { mtrl: i.mtrl }, select: { prjc: true, qty: true } }),
        lastPurchasePrices([i.mtrl]).then((m) => m.get(i.mtrl) ?? null).catch((e) => ({ error: liveError(e) })),
        itemPurchases(i.mtrl).catch((e) => ({ error: liveError(e) })),
      ]);
      const budgetProjects = await prisma.softoneProject.findMany({ where: { prjc: { in: budgetUse.map((b) => b.prjc) } }, select: { prjc: true, code: true, name: true } });
      const pur = 'error' in purchases ? purchases : {
        totals: purchases.totals,
        suppliers: [...new Set(purchases.lines.filter((l) => !l.cancelled && l.kind === 'invoice').map((l) => l.supplier).filter(Boolean))],
        projects: [...new Set(purchases.lines.map((l) => l.project).filter(Boolean))],
        recent: purchases.lines.filter((l) => !l.cancelled).slice(0, 10).map((l) => ({ fincode: l.fincode, date: iso(l.date), kind: l.kindLabel, supplier: l.supplier, qty: l.qty, unitCost: round2(l.unitCost), project: l.project })),
      };
      return {
        data: {
          ref: `item:${i.mtrl}`, mtrl: i.mtrl, code: i.code, barcode: i.code1, factoryCode: i.code2, name: i.name, name2: i.name2,
          type: i.isService ? 'υπηρεσία' : 'είδος', active: i.isActive, retailPrice: i.price,
          unit: un(i.unit1), purchaseUnit: i.unitBuy ? { unit: un(i.unitBuy), ratio: i.buyRatio } : null, salesUnit: i.unitSell ? { unit: un(i.unitSell), ratio: i.sellRatio } : null,
          stock: stock ? { total: stock.total, unit: stock.unit, byWarehouse: stock.warehouses.filter((w) => w.qty !== 0), asOf: stock.syncedAt } : i.isService ? 'Υπηρεσία — χωρίς απόθεμα' : 'Χωρίς στοιχεία αποθέματος',
          lastPurchase: lp && !('error' in lp) ? { unitCostNet: round2(lp.unitCost), date: iso(lp.date), doc: lp.fincode } : lp ?? 'Καμία αγορά με τιμολόγιο',
          purchases: pur,
          inBudgetOf: budgetProjects.map((p) => `${p.code} ${p.name}`),
        },
        refs: [{ refKey: `item:${i.mtrl}`, label: `${i.isService ? 'Υπηρεσία' : 'Είδος'} ${i.code} · ${i.name}`, url: i.isService ? '/admin/services' : '/admin/items' }],
      };
    }

    case 'get_turnover': {
      let period: Period | null = null;
      const iso = /^\d{4}-\d{2}-\d{2}$/;
      if (typeof args.from === 'string' && iso.test(args.from) && typeof args.to === 'string' && iso.test(args.to)) {
        const end = new Date(`${args.to}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        period = { from: args.from, to: end.toISOString().slice(0, 10), label: `${args.from.split('-').reverse().join('/')} – ${args.to.split('-').reverse().join('/')}` };
      } else if (str(args.period)) {
        period = parsePeriod(String(args.period));
      }
      if (!period) return { data: { error: 'Δεν κατάλαβα την περίοδο — ρώτα τον χρήστη (π.χ. «αυτό τον μήνα», «πέρσι», «Q3 2025»).' }, refs: [] };
      const trdr = await resolveTrader({ trdr: args.trdr, code: args.trader_code });
      const prjc = await resolveProject({ prjc: args.prjc, code: args.project_code });
      if ((args.trdr || args.trader_code) && !trdr) return notFound('συναλλασσόμενος');
      if ((args.prjc || args.project_code) && !prjc) return notFound('έργο');
      try {
        const t = await turnover({ period, side: args.side === 'purchases' ? 'purchases' : 'sales', trdr, prjc });
        const refs: Ref[] = [];
        if (prjc && t.filter.project) refs.push({ refKey: `project:${prjc}`, label: `Έργο ${t.filter.project}`, url: `/admin/projects/${prjc}` });
        if (trdr && t.filter.trader) refs.push({ refKey: `trader:${trdr}`, label: `Συναλλασσόμενος ${t.filter.trader}`, url: '/admin/traders' });
        // Τα έργα των μεγαλύτερων παραστατικών — σύνδεσμος στην καρτέλα τους.
        const projCodes = [...new Set(t.largest.map((d) => d.project?.split(' · ')[0]).filter((c): c is string => !!c))];
        if (projCodes.length) {
          const ps = await prisma.softoneProject.findMany({ where: { code: { in: projCodes } }, select: { prjc: true, code: true, name: true } });
          refs.push(...ps.map(projectRef));
        }
        return {
          data: {
            what: t.side === 'sales' ? 'Τζίρος (πωλήσεις 1351): τιμολόγια+αποδείξεις − πιστωτικά' : 'Αγορές (1251): τιμολόγια − πιστωτικά',
            source: 'SoftOne ζωντανά',
            period: { label: t.period.label, fromInclusive: t.period.from, toInclusive: new Date(Date.parse(`${t.period.to}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) },
            filter: t.filter,
            netExclVat: t.net, grossInclVat: t.gross, invoices: t.invoices, credits: t.credits,
            byMonth: t.byMonth, topTraders: t.topTraders,
            largestDocs: t.largest.map((d) => ({ fincode: d.fincode, date: d.date, series: d.seriesName ?? d.series, kind: d.kind, trader: d.trader, project: d.project, net: d.net, gross: d.gross })),
            notCounted: t.excluded,
            unknownSeries: t.unknownSeries.length ? `Σειρές άγνωστες στην εφαρμογή (δεν μετρήθηκαν): ${t.unknownSeries.join(', ')} — ο αριθμός ίσως είναι ελλιπής` : undefined,
            fetchedAt: t.fetchedAt,
          },
          refs,
        };
      } catch (e) {
        return { data: { error: liveError(e) }, refs: [] };
      }
    }

    case 'get_customer_project_balance': {
      if (!ctx.canFinancials) return { data: { error: 'Ο χρήστης δεν έχει δικαίωμα στα οικονομικά έργων.' }, refs: [] };
      const prjc = await resolveProject(args);
      const b = prjc ? await projectCustomerBalance(prjc) : null;
      if (!b) return notFound('έργο');
      const refs: Ref[] = [projectRef(b.project)];
      if (b.customer) refs.push({ refKey: `trader:${b.customer.trdr}`, label: `Πελάτης ${b.customer.code} · ${b.customer.name}`, url: '/admin/traders?type=13' });
      if (!b.computed) return { data: { project: `${b.project.code} · ${b.project.name}`, error: 'Τα οικονομικά του έργου δεν έχουν υπολογιστεί ακόμη.' }, refs };
      return {
        data: {
          source: `Στιγμιότυπο κερδοφορίας έργου (υπολογισμός ${b.computedAt.slice(0, 16).replace('T', ' ')} UTC)`,
          project: `${b.project.code} · ${b.project.name}`, customer: b.customer ? `${b.customer.code} · ${b.customer.name}` : null,
          amountsAre: 'ΜΙΚΤΑ (με ΦΠΑ) — όπως πληρώνει ο πελάτης',
          invoicedGross: b.invoicedGross, invoicedNet: b.invoicedNet, received: b.received, refunds: b.refunds, collected: b.collected,
          openBalance: b.open, openMeaning: b.open > 0 ? 'ο πελάτης χρωστά' : b.open < 0 ? 'πιστωτικό (εισπράχθηκαν περισσότερα)' : 'εξοφλημένο',
          ageing: b.ageing, invoices: b.invoices, collections: b.collections,
          caveat: 'Μετρούν μόνο παραστατικά δεμένα με το έργο (PRJC) — τιμολόγια/εμβάσματα χωρίς έργο δεν φαίνονται εδώ (βλ. get_trader για το συνολικό υπόλοιπο).',
          missingData: b.missingData,
        },
        refs,
      };
    }

    case 'get_appointments': {
      const text = str(args.period) ?? 'σήμερα';
      const scope = args.scope === 'all' ? 'all' : 'mine';
      const day = parseWhen(text).date;
      let per = day ? null : parsePeriod(text);
      // Για το ημερολόγιο «αυτή την εβδομάδα» = ολόκληρη η εβδομάδα (Δευτέρα–Κυριακή), όχι μέχρι σήμερα.
      if (per?.label === 'Αυτή την εβδομάδα') per = { ...per, to: new Date(Date.parse(`${per.from}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10) };
      const fromD = day ?? per?.from ?? zonedParts(new Date()).date;
      const toD = day ? new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : per?.to ?? fromD;
      const label = day ? formatSlotEl(zonedToUtc(day, '12:00').toISOString()).split(',').slice(0, 2).join(',') : per?.label ?? text;
      const list = await appointmentsBetween(zonedToUtc(fromD, '00:00'), zonedToUtc(toD, '00:00'), { userId: ctx.userId, scope });
      return {
        data: { period: label, scope: scope === 'mine' ? 'δικά μου (ανατεθειμένα σε μένα + χωρίς ανάθεση)' : 'όλων', count: list.length, appointments: list },
        refs: [{ refKey: 'calendar', label: 'Ημερολόγιο ραντεβού', url: '/admin/appointments' }],
      };
    }

    case 'propose_appointment': {
      if (!ctx.canSchedule) return { data: { error: 'Ο χρήστης δεν έχει δικαίωμα να κλείνει ραντεβού (appointments.schedule).' }, refs: [] };
      // 1. Με ποιον
      let party: { kind: 'trader' | 'contact' | 'partner' | 'partnerContact'; id: string } | null = null;
      const kinds = ['trader', 'contact', 'partner', 'partnerContact'] as const;
      if (str(args.party_id) && kinds.includes(args.party_kind as (typeof kinds)[number])) party = { kind: args.party_kind as (typeof kinds)[number], id: String(args.party_id) };
      else {
        const q = str(args.with);
        if (!q) return { data: { error: 'Με ποιον είναι το ραντεβού; Ρώτα τον χρήστη.' }, refs: [] };
        const cands = await findParties(q);
        if (!cands.length) return { data: { error: `Δεν βρέθηκε πελάτης/επαφή/συνεργάτης «${q}». Αν είναι νέος πελάτης, κλείνεται από Ημερολόγιο ραντεβού → Νέο ραντεβού (εκεί δημιουργείται και στο SoftOne).` }, refs: [{ refKey: 'calendar', label: 'Ημερολόγιο ραντεβού', url: '/admin/appointments' }] };
        const one = pickParty(q, cands);
        if (!one) return { data: { ambiguous: true, ask: 'Ρώτα τον χρήστη ποιον εννοεί (δώσε τις επιλογές με περιγραφή) και ξανακάλεσε με party_kind + party_id.', candidates: cands.map((c) => ({ party_kind: c.kind, party_id: c.id, label: c.label, sub: c.sub })) }, refs: [] };
        party = { kind: one.kind, id: one.id };
      }
      const snap = await resolveParty(party).catch(() => null);
      if (!snap) return notFound('πελάτης/επαφή');

      // 2. Πότε
      const w = str(args.when) ? parseWhen(String(args.when)) : { date: null, time: null, partOfDay: null, assumed: [] as string[] };
      const date = (typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : null) ?? w.date;
      const time = (typeof args.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(args.time) ? args.time : null) ?? w.time;
      if (!date) return { data: { error: 'Ποια μέρα; Ρώτα τον χρήστη.' }, refs: [] };
      if (!time) {
        const free = await freeSlots(date, w.partOfDay);
        return { data: { needTime: true, date, freeTimes: free, ask: free.length ? `Ρώτα ποια ώρα — ελεύθερες: ${free.join(', ')}` : 'Ρώτα ποια ώρα — δεν υπάρχει ελεύθερη θέση στο ωράριο εκείνης της μέρας.' }, refs: [] };
      }
      const minutes = Number.isInteger(args.minutes) && Number(args.minutes) >= 15 && Number(args.minutes) <= 600 ? Number(args.minutes) : 60;
      const start = zonedToUtc(date, time);
      const check = await checkSlot(start, minutes);
      if (check.past) return { data: { error: `Η ώρα ${formatSlotEl(start.toISOString())} έχει περάσει — ρώτα για άλλη.` }, refs: [] };
      const place = args.place === 'customer' ? 'customer' : 'atelier';
      const location = place === 'customer' ? str(args.location) : null;
      const topic = str(args.topic);
      const notes = str(args.notes);
      const token = signProposal({ uid: ctx.userId, party, start: start.toISOString(), minutes, place, location, topic, notes });
      const [softoneOn, me] = await Promise.all([
        appointmentsSoftoneEnabled().catch(() => false),
        prisma.user.findUnique({ where: { id: ctx.userId }, select: { softoneUserId: true } }),
      ]);
      const softoneLine = !softoneOn ? 'SoftOne: η αποστολή ραντεβού είναι κλειστή (Ρυθμίσεις ραντεβού) — δεν θα σταλεί'
        : !me?.softoneUserId ? 'SoftOne: δεν θα σταλεί — ο χρήστης σας δεν είναι συνδεδεμένος με χρήστη SoftOne (Χρήστες → SoftOne)'
          : 'SoftOne — Ραντεβού (CRM)';
      const card: AppointmentCard = {
        type: 'appointment', token,
        when: formatSlotEl(start.toISOString(), new Date(start.getTime() + minutes * 60_000).toISOString()),
        minutes,
        with: snap.company && snap.company !== snap.name ? `${snap.name} (${snap.company})` : snap.name,
        sub: [snap.phone, snap.email].filter(Boolean).join(' · '),
        email: snap.email,
        place: place === 'customer' ? `Στον πελάτη${location ? `: ${location}` : ''}` : 'Στο atelier',
        topic, notes,
        warnings: check.warnings,
        assumed: w.assumed,
        overlap: check.full,
        saveTo: [
          'Ημερολόγιο της εφαρμογής (επιβεβαιωμένο)',
          softoneLine,
          snap.email ? `Email με .ics σε εσάς και στο ${snap.email}` : 'Email με .ics σε εσάς (ο προσκεκλημένος δεν έχει email)',
        ],
      };
      return {
        data: { proposal: 'Εμφανίστηκε κάρτα επιβεβαίωσης στον χρήστη. ΔΕΝ έχει κλειστεί ακόμη — πες του να πατήσει «Επιβεβαίωση» στην κάρτα.', when: card.when, with: card.with, place: card.place, warnings: card.warnings, assumed: card.assumed, overlapping: check.overlapping },
        refs: [],
        card,
      };
    }

    case 'remember': {
      const kind = String(args.kind) as MemoryKind;
      if (!MEMORY_KINDS.includes(kind) || kind === 'answer') return { data: { error: 'Μη έγκυρο είδος μνήμης' }, refs: [] };
      const text = str(args.text);
      if (!text) return { data: { error: 'Κενό κείμενο' }, refs: [] };
      const refKey = str(args.ref_key);
      const r = await remember({ kind, text, refKey: refKey && /^[a-z_]+:[\w:-]+$/.test(refKey) ? refKey : null, userId: ctx.userId, messageId: ctx.messageId });
      return { data: { saved: true, updated: r.updated }, refs: [] };
    }
  }
  return { data: { error: `Άγνωστο εργαλείο ${name}` }, refs: [] };
}

/** Σύντομη ελληνική περιγραφή βήματος για το UI («Ψάχνω…», «Διαβάζω την καρτέλα…»). */
export function stepLabel(name: string, args: Record<string, unknown>): string {
  const q = str(args.query) ?? str(args.code) ?? (args.prjc ?? args.trdr ?? args.mtrl ?? '');
  switch (name) {
    case 'search_knowledge': return `Ψάχνω «${String(q).slice(0, 40)}»`;
    case 'get_project': return 'Διαβάζω το έργο';
    case 'get_project_materials': return 'Φέρνω τα υλικά του έργου από το SoftOne';
    case 'list_projects': return 'Συγκεντρώνω τα έργα';
    case 'get_trader': return args.include_ledger === false ? 'Διαβάζω τον συναλλασσόμενο' : 'Διαβάζω την καρτέλα από το SoftOne';
    case 'get_item': return 'Διαβάζω το είδος, απόθεμα & αγορές';
    case 'remember': return 'Το κρατώ στη μνήμη';
    case 'get_appointments': return 'Κοιτάζω το ημερολόγιο';
    case 'propose_appointment': return 'Ετοιμάζω το ραντεβού για επιβεβαίωση';
    case 'get_turnover': return args.side === 'purchases' ? 'Υπολογίζω τις αγορές της περιόδου από το SoftOne' : 'Υπολογίζω τον τζίρο της περιόδου από το SoftOne';
    case 'get_customer_project_balance': return 'Διαβάζω το υπόλοιπο του πελάτη στο έργο';
    default: return fold(name);
  }
}
