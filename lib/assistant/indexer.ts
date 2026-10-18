// lib/assistant/indexer.ts — SERVER. Χτίζει τη «γνώση» του Air Jordan (AssistantChunk + pgvector) από
// ΤΗ ΒΑΣΗ ΤΗΣ ΕΦΑΡΜΟΓΗΣ — που ήδη κρατά καθρέφτη του SoftOne — και από το wiki + το γλωσσάρι SoftOne.
//
// Ένα κομμάτι ανά οντότητα (έργο, παραστατικό έργου, συναλλασσόμενος, είδος/υπηρεσία, συνεργάτης,
// προσφορά, ραντεβού, lead, αίτημα παραγγελίας, μητρώο, σελίδα wiki, όρος γλωσσαρίου). Ξαναϋπολογίζεται
// μόνο ό,τι άλλαξε (contentHash) και παίρνει νέο embedding· ό,τι χάθηκε από την πηγή σβήνεται.
// ΔΕΝ γράφει πουθενά αλλού και ΔΕΝ καλεί το SoftOne.
import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';
import { SODTYPE_LABEL } from '@/lib/softone';
import { projectStatusLabel } from '@/lib/projects';
import type { ProjectProfit } from '@/lib/project-profit/calc';
import { GLOSSARY } from './glossary';
import { searchTextOf } from './text';
import { embed } from './openrouter';
import { toVectorLiteral } from './vector';

export interface KnowledgeDoc {
  source: string;
  refKey: string;
  title: string;
  body: string;
  url?: string | null;
  meta?: Record<string, unknown> | null;
  /** Επιπλέον όροι αναζήτησης (κωδικοί, συνώνυμα) που δεν χρειάζεται να διαβάσει το μοντέλο. */
  extra?: string[];
}

const LAST_INDEX_KEY = 'assistant.lastIndexAt';
const STALE_MS = 6 * 3600_000;

const eur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(n);
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const line = (label: string, v: unknown) => (v == null || v === '' ? null : `${label}: ${v}`);
const lines = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join('\n');

/** Όλα τα κομμάτια γνώσης από τη βάση της εφαρμογής, το wiki και το γλωσσάρι. */
export async function buildKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const [
    projects, financials, budget, traders, contacts, items, stock, lookups, classifications, units,
    partners, partnerProjects, offers, orderRequests, appointments, leads,
  ] = await Promise.all([
    prisma.softoneProject.findMany(),
    prisma.projectFinancials.findMany(),
    prisma.projectBudgetLine.findMany({ select: { prjc: true, code: true, name: true, qty: true, unitPrice: true, unit: true } }),
    prisma.softoneTrader.findMany(),
    prisma.customerContact.findMany({ select: { trdr: true, name: true, role: true, phone: true, mobile: true, email: true } }),
    prisma.softoneItem.findMany(),
    prisma.softoneStock.findMany({ select: { mtrl: true, whouse: true, qty: true } }),
    prisma.softoneLookup.findMany(),
    prisma.softoneClassification.findMany(),
    prisma.softoneUnit.findMany({ select: { code: true, shortcut: true, name: true, interCode: true, isActive: true } }),
    prisma.partner.findMany({ include: { contacts: { select: { name: true, role: true, phone: true, mobile: true, email: true } } } }),
    prisma.partnerProject.findMany({ select: { partnerId: true, prjc: true, role: true } }),
    prisma.containerOffer.findMany({ include: { items: { select: { code: true, name: true, baseUnit: true, prices: true } } } }),
    prisma.orderRequest.findMany({ include: { lines: { select: { code: true, name: true, qty: true, unit: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.appointment.findMany({ orderBy: { startsAt: 'desc' }, take: 500 }),
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }),
  ]);

  const traderById = new Map(traders.map((t) => [t.trdr, t]));
  const traderName = (id: number | null | undefined) => (id != null ? traderById.get(id)?.name ?? `#${id}` : null);
  const projectById = new Map(projects.map((p) => [p.prjc, p]));
  const lookupName = new Map(lookups.map((l) => [`${l.kind}:${l.code}`, l.name]));
  const unitName = (code: string | null) => (code ? lookupName.get(`MTRUNIT:${code}`) ?? code : null);
  const finBy = new Map(financials.map((f) => [f.prjc, f]));
  const group = <T, K>(xs: T[], k: (x: T) => K) => {
    const m = new Map<K, T[]>();
    for (const x of xs) { const a = m.get(k(x)) ?? []; a.push(x); m.set(k(x), a); }
    return m;
  };
  const budgetBy = group(budget, (b) => b.prjc);
  const contactsBy = group(contacts, (c) => c.trdr);
  const stockBy = group(stock, (s) => s.mtrl);
  const partnersByPrjc = group(partnerProjects, (p) => p.prjc);
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const projectsByTrader = new Map<number, typeof projects>();
  for (const p of projects) for (const t of [p.trdr, p.trdrSu]) if (t != null) projectsByTrader.set(t, [...(projectsByTrader.get(t) ?? []), p]);

  const docs: KnowledgeDoc[] = [];

  // ── Έργα + τα παραστατικά τους (από το αποθηκευμένο στιγμιότυπο κερδοφορίας) ──
  for (const p of projects) {
    const f = finBy.get(p.prjc);
    const profit = (f?.data ?? null) as ProjectProfit | null;
    const b = budgetBy.get(p.prjc) ?? [];
    const partnersHere = (partnersByPrjc.get(p.prjc) ?? []).map((pp) => {
      const pa = partnerById.get(pp.partnerId);
      return pa ? `${pa.name}${pp.role ? ` (${pp.role})` : ''}` : null;
    }).filter(Boolean);
    docs.push({
      source: 'project',
      refKey: `project:${p.prjc}`,
      title: `Έργο ${p.code} · ${p.name}`,
      url: `/admin/projects/${p.prjc}`,
      meta: { prjc: p.prjc, code: p.code },
      body: lines(
        line('Κωδικός', p.code), line('Όνομα', p.name),
        line('Πελάτης', traderName(p.trdr)), line('Προμηθευτής', traderName(p.trdrSu)),
        line('Status', projectStatusLabel(p.actStatus)), line('Ενεργό', p.isActive ? 'ναι' : 'όχι'),
        line('Έναρξη', day(p.fromDate)), line('Λήξη', day(p.finalDate)), line('Κλείσιμο', day(p.closeDate)),
        line('Παρατηρήσεις', p.remarks),
        partnersHere.length ? line('Συνεργάτες', partnersHere.join(', ')) : null,
        f ? `Οικονομικά (εσωτερικά, υπολογισμός ${day(f.computedAt)}): έσοδα ${eur(f.revenue)}, κόστος ${eur(f.costs)}, γενικά έξοδα ${eur(f.overhead)}, καθαρό κέρδος ${eur(f.netProfit)}, περιθώριο ${f.marginPct == null ? '—' : `${f.marginPct.toFixed(1)}%`}, εισπράξεις ${eur(f.collected)}, ανοιχτό υπόλοιπο ${eur(f.openAmount)}, πληρωμές προμηθευτών ${eur(f.paid)}${f.issues ? `, δεδομένα που λείπουν: ${f.issues}` : ''}` : 'Οικονομικά: δεν έχουν υπολογιστεί',
        b.length ? `Προϋπολογισμός (${b.length} γραμμές): ${b.slice(0, 15).map((x) => `${x.code} ${x.name} ${x.qty}${x.unit ? ` ${x.unit}` : ''}`).join('; ')}` : null,
      ),
      extra: [traderById.get(p.trdr ?? -1)?.code, traderById.get(p.trdr ?? -1)?.afm].filter((x): x is string => !!x),
    });
    if (profit) {
      const all = [
        ...profit.revenue.docs.map((d) => ({ d, role: 'Πώληση' })),
        ...profit.costs.docs.map((d) => ({ d, role: 'Αγορά/κόστος' })),
        ...profit.collections.docs.map((d) => ({ d, role: 'Είσπραξη' })),
        ...profit.payments.docs.map((d) => ({ d, role: 'Πληρωμή' })),
      ];
      const seen = new Set<number>();
      for (const { d, role } of all) {
        if (seen.has(d.findoc)) continue;
        seen.add(d.findoc);
        docs.push({
          source: 'document',
          refKey: `document:${d.findoc}`,
          title: `Παραστατικό ${d.fincode}${d.seriesName ? ` (${d.seriesName})` : ''}`,
          url: `/admin/projects/${p.prjc}`,
          meta: { findoc: d.findoc, prjc: p.prjc, fincode: d.fincode },
          body: lines(
            line('Αριθμός', d.fincode), line('Ημερομηνία', day(d.date)), line('Τύπος', `${role} · ${d.seriesName ?? d.series}`),
            line('Συναλλασσόμενος', d.traderName), line('Έργο', `${p.code} · ${p.name}`),
            line('Καθαρή αξία (για το έργο)', eur(d.net)), line('Μικτή αξία', eur(d.gross)),
            d.partial ? 'Μόνο μέρος του παραστατικού αφορά το έργο.' : null,
            line('ΜΑΡΚ myDATA', d.mark),
          ),
        });
      }
    }
  }

  // ── Συναλλασσόμενοι ──
  for (const t of traders) {
    const cs = contactsBy.get(t.trdr) ?? [];
    const ps = projectsByTrader.get(t.trdr) ?? [];
    const kind = SODTYPE_LABEL[t.sodtype] ?? t.kind;
    docs.push({
      source: 'trader',
      refKey: `trader:${t.trdr}`,
      title: `${kind} ${t.code} · ${t.name}`,
      url: `/admin/traders?type=${t.sodtype}`,
      meta: { trdr: t.trdr, code: t.code, sodtype: t.sodtype },
      body: lines(
        line('Τύπος', kind), line('Κωδικός', t.code), line('Επωνυμία', t.name), line('ΑΦΜ', t.afm), line('ΔΟΥ', t.doy),
        line('Επάγγελμα', t.profession), line('Διεύθυνση', [t.address, t.district, t.zip, t.city].filter(Boolean).join(', ')),
        line('Τηλέφωνα', [t.phone, t.phone2].filter(Boolean).join(', ')), line('Email', t.email), line('Web', t.webpage),
        line('Ενεργός', t.isActive ? 'ναι' : 'όχι'),
        cs.length ? `Επαφές: ${cs.map((c) => [c.name, c.role, c.mobile ?? c.phone, c.email].filter(Boolean).join(' / ')).join('; ')}` : null,
        ps.length ? `Έργα: ${ps.map((p) => `${p.code} ${p.name}${p.trdrSu === t.trdr ? ' (ως προμηθευτής)' : ''}`).join('; ')}` : null,
      ),
    });
  }

  // ── Είδη & υπηρεσίες ──
  const whName = (w: string) => lookupName.get(`WHOUSE:${w}`) ?? `Αποθήκη ${w}`;
  for (const i of items) {
    const st = stockBy.get(i.mtrl) ?? [];
    const total = st.reduce((s, x) => s + x.qty, 0);
    docs.push({
      source: i.isService ? 'service' : 'item',
      refKey: `item:${i.mtrl}`,
      title: `${i.isService ? 'Υπηρεσία' : 'Είδος'} ${i.code} · ${i.name}`,
      url: i.isService ? '/admin/services' : '/admin/items',
      meta: { mtrl: i.mtrl, code: i.code },
      body: lines(
        line('Κωδικός', i.code), line('Barcode/EAN', i.code1), line('Κωδ. εργοστασίου', i.code2),
        line('Περιγραφή', i.name), line('Περιγραφή 2', i.name2),
        line('Μονάδα', unitName(i.unit1)),
        i.unitBuy ? line('Μονάδα αγορών', `${unitName(i.unitBuy)}${i.buyRatio ? ` (= ${i.buyRatio} ${unitName(i.unit1) ?? ''})` : ''}`) : null,
        i.unitSell ? line('Μονάδα πώλησης', `${unitName(i.unitSell)}${i.sellRatio ? ` (= ${i.sellRatio} ${unitName(i.unit1) ?? ''})` : ''}`) : null,
        line('Τιμή λιανικής', i.price != null ? eur(i.price) : null),
        !i.isService ? (st.length ? `Απόθεμα (καθρέφτης): σύνολο ${total} — ${st.map((s) => `${whName(s.whouse)} ${s.qty}`).join(', ')}` : 'Απόθεμα: καμία εγγραφή') : null,
        line('Ενεργό', i.isActive ? 'ναι' : 'όχι'),
      ),
    });
  }

  // ── Μητρώα (μονάδες, κατηγορίες, ομάδες, ΦΠΑ, αποθήκες …) ──
  for (const l of lookups) {
    docs.push({ source: 'lookup', refKey: `lookup:${l.kind}:${l.code}`, title: `${l.kind} ${l.code} · ${l.name}`, url: '/admin/reference-data', body: `Μητρώο SoftOne ${l.kind}: κωδικός ${l.code}, περιγραφή «${l.name}».` });
  }
  for (const c of classifications) {
    docs.push({
      source: 'classification', refKey: `classification:${c.kind}:${c.sodtype}:${c.code}`,
      title: `${c.kind === 'CATEGORY' ? 'Κατηγορία' : 'Ομάδα'} ${c.sodtype === 52 ? 'υπηρεσιών' : 'ειδών'} · ${c.name}`,
      url: '/admin/classifications', body: lines(line('Κωδικός', c.code), line('Σύντμηση', c.shortCode), line('Όνομα', c.name), line('Ενεργή', c.isActive ? 'ναι' : 'όχι')),
    });
  }
  for (const u of units) {
    docs.push({ source: 'unit', refKey: `unit:${u.code}`, title: `Μονάδα μέτρησης ${u.shortcut} · ${u.name}`, url: '/admin/units', body: lines(line('Κωδικός', u.code), line('Σύντμηση', u.shortcut), line('Διεθνής', u.interCode), line('Ενεργή', u.isActive ? 'ναι' : 'όχι')) });
  }

  // ── Συνεργάτες ──
  const prjcOfPartner = group(partnerProjects, (p) => p.partnerId);
  for (const p of partners) {
    const prs = (prjcOfPartner.get(p.id) ?? []).map((x) => projectById.get(x.prjc)).filter(Boolean);
    docs.push({
      source: 'partner', refKey: `partner:${p.id}`, title: `Συνεργάτης · ${p.name}${p.specialty ? ` (${p.specialty})` : ''}`, url: '/admin/partners',
      body: lines(
        line('Όνομα', p.name), line('Διακριτικός', p.tradeName), line('Ειδικότητα', p.specialty), line('ΑΦΜ', p.afm),
        line('Διεύθυνση', [p.address, p.zip, p.city].filter(Boolean).join(', ')), line('Τηλέφωνα', [p.phone, p.mobile].filter(Boolean).join(', ')),
        line('Email', p.email), line('Σημειώσεις', p.notes),
        p.contacts.length ? `Επαφές: ${p.contacts.map((c) => [c.name, c.role, c.mobile ?? c.phone, c.email].filter(Boolean).join(' / ')).join('; ')}` : null,
        prs.length ? `Έργα: ${prs.map((x) => `${x!.code} ${x!.name}`).join('; ')}` : null,
      ),
    });
  }

  // ── Δυναμικές προσφορές container ──
  for (const o of offers) {
    docs.push({
      source: 'offer', refKey: `offer:${o.id}`, title: `Δυναμική προσφορά · ${o.title ?? o.id}`, url: '/admin/dynamic-offers',
      body: lines(
        line('Κατάσταση', o.status), line('Χωρητικότητα', `${o.capacityPallets} παλέτες`), line('Λήξη συμμετοχής', day(o.closesAt)),
        line('Σημειώσεις', o.notes),
        o.items.length ? `Είδη: ${o.items.map((i) => `${i.code} ${i.name} (τιμές ${i.prices.map((x) => eur(x)).join(' → ')}${i.baseUnit ? `/${i.baseUnit}` : ''})`).join('; ')}` : null,
      ),
    });
  }

  // ── Αιτήματα παραγγελίας (portal) ──
  for (const r of orderRequests) {
    const num = `ΑΠ-${String(r.number).padStart(6, '0')}`;
    docs.push({
      source: 'order_request', refKey: `order_request:${r.id}`, title: `Αίτημα παραγγελίας ${num} · ${traderName(r.trdr)}`, url: '/admin/order-requests',
      body: lines(
        line('Αριθμός', num), line('Πελάτης', traderName(r.trdr)), line('Έργο', r.prjc ? (projectById.get(r.prjc)?.code ?? r.prjc) : null),
        line('Κατάσταση', r.status), line('Ημερομηνία', day(r.createdAt)), line('Παράδοση', day(r.deliveryDate)), line('Παραστατικό SoftOne', r.softoneFincode),
        line('Σημειώσεις', r.notes),
        r.lines.length ? `Γραμμές: ${r.lines.map((l) => `${l.code ?? ''} ${l.name} × ${l.qty}${l.unit ? ` ${l.unit}` : ''}`).join('; ')}` : null,
      ),
    });
  }

  // ── Ραντεβού & leads ──
  for (const a of appointments) {
    const num = `ΡΝΤ-${String(a.number).padStart(6, '0')}`;
    docs.push({
      source: 'appointment', refKey: `appointment:${a.id}`, title: `Ραντεβού ${num} · ${a.name} · ${day(a.startsAt)}`, url: '/admin/appointments',
      body: lines(
        line('Αριθμός', num), line('Πότε', a.startsAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'), line('Κατάσταση', a.status),
        line('Επισκέπτης', a.name), line('Εταιρεία', a.company ?? traderName(a.trdr)), line('Email', a.email), line('Τηλέφωνο', a.phone),
        line('Θέμα', a.topic), line('Μήνυμα', a.message?.slice(0, 400)),
      ),
    });
  }
  for (const l of leads) {
    docs.push({
      source: 'lead', refKey: `lead:${l.id}`, title: `Lead · ${l.name ?? l.email}`, url: '/admin/leads',
      body: lines(line('Όνομα', l.name), line('Εταιρεία', l.company), line('Email', l.email), line('Τηλέφωνο', l.phone), line('Επάγγελμα', l.profession), line('Πηγές', l.sources.join(', ')), line('SoftOne', l.softoneCode ?? l.softoneStatus), line('Ημερομηνία', day(l.createdAt))),
    });
  }

  // ── Wiki & γλωσσάρι ──
  docs.push(...(await wikiDocs()));
  for (const g of GLOSSARY) docs.push({ source: 'glossary', refKey: `glossary:${g.key}`, title: g.title, body: g.body });

  return docs;
}

/** Σελίδες wiki (docs/wiki/**.mdx) — ένα κομμάτι ανά ενότητα «## …». */
async function wikiDocs(): Promise<KnowledgeDoc[]> {
  const root = path.join(process.cwd(), 'docs', 'wiki');
  const out: KnowledgeDoc[] = [];
  const walk = async (dir: string): Promise<string[]> => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(ents.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : Promise.resolve(e.name.endsWith('.mdx') ? [path.join(dir, e.name)] : []))));
    return nested.flat();
  };
  for (const file of await walk(root)) {
    const raw = await fs.readFile(file, 'utf8');
    const slug = path.relative(root, file).replace(/\.mdx$/, '').split(path.sep).join('/');
    const fm = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
    const title = /^title:\s*"?(.*?)"?\s*$/m.exec(fm?.[1] ?? '')?.[1] ?? slug;
    const body = raw.slice(fm?.[0].length ?? 0)
      .replace(/<\/?(Steps|li|Callout|Screenshot|RoleBadge)[^>]*>/g, ' ')
      .replace(/\*\*/g, '');
    const sections = body.split(/\n(?=## )/);
    sections.forEach((sec, i) => {
      const heading = /^##\s+(.*)/.exec(sec)?.[1]?.trim();
      const text = sec.replace(/^##\s+.*\n/, '').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length < 20) return;
      out.push({
        source: 'wiki', refKey: `wiki:${slug}#${i}`, title: `Οδηγός: ${title}${heading ? ` — ${heading}` : ''}`,
        url: `/wiki/${slug}`, body: text.slice(0, 3000),
      });
    });
  }
  return out;
}

const hashOf = (d: KnowledgeDoc) => createHash('sha1').update(`${d.title}\n${d.body}\n${d.url ?? ''}\n${(d.extra ?? []).join(' ')}`).digest('hex');

export type IndexRun = { total: number; changed: number; embedded: number; removed: number; ms: number; at: string };

let running: Promise<IndexRun> | null = null;

/** Επανευρετηρίαση: upsert ό,τι άλλαξε, embeddings για ό,τι δεν έχει, διαγραφή ό,τι χάθηκε. */
export function reindexKnowledge(opts: { userId?: string | null } = {}): Promise<IndexRun> {
  running ??= doReindex(opts).finally(() => { running = null; });
  return running;
}

async function doReindex(opts: { userId?: string | null }): Promise<IndexRun> {
  const started = Date.now();
  const docs = [...new Map((await buildKnowledgeDocs()).map((d) => [d.refKey, d])).values()];
  const existing = await prisma.assistantChunk.findMany({ select: { refKey: true, contentHash: true } });
  const have = new Map(existing.map((e) => [e.refKey, e.contentHash]));
  const wanted = new Set(docs.map((d) => d.refKey));

  const rowOf = (d: KnowledgeDoc, h: string) => ({
    refKey: d.refKey, source: d.source, title: d.title, body: d.body, url: d.url ?? null, meta: (d.meta ?? undefined) as never,
    searchText: searchTextOf(d.title, d.body, ...(d.extra ?? [])), contentHash: h,
  });
  const fresh: ReturnType<typeof rowOf>[] = [];
  const changedRows: ReturnType<typeof rowOf>[] = [];
  for (const d of docs) {
    const h = hashOf(d);
    const prev = have.get(d.refKey);
    if (prev === h) continue;
    (prev == null ? fresh : changedRows).push(rowOf(d, h));
  }
  for (let i = 0; i < fresh.length; i += 500) {
    await prisma.assistantChunk.createMany({ data: fresh.slice(i, i + 500), skipDuplicates: true });
  }
  // Αλλαγμένο περιεχόμενο ⇒ το παλιό embedding δεν ισχύει: μηδενίζεται και ξαναϋπολογίζεται.
  for (let i = 0; i < changedRows.length; i += 50) {
    await prisma.$transaction(changedRows.slice(i, i + 50).map(({ refKey, ...data }) => prisma.assistantChunk.update({ where: { refKey }, data })));
  }
  if (changedRows.length) {
    await prisma.$executeRaw`UPDATE "AssistantChunk" SET "embedding" = NULL WHERE "refKey" = ANY(${changedRows.map((r) => r.refKey)})`;
  }
  const gone = existing.filter((e) => !wanted.has(e.refKey)).map((e) => e.refKey);
  if (gone.length) await prisma.assistantChunk.deleteMany({ where: { refKey: { in: gone } } });

  const embedded = await embedMissingChunks(opts.userId);
  const at = new Date().toISOString();
  await setSetting(LAST_INDEX_KEY, at).catch(() => null);
  return { total: docs.length, changed: fresh.length + changedRows.length, embedded, removed: gone.length, ms: Date.now() - started, at };
}

/** Embeddings για όσα κομμάτια δεν έχουν (σε παρτίδες, μία ενημέρωση ανά παρτίδα). */
export async function embedMissingChunks(userId?: string | null): Promise<number> {
  let n = 0;
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; title: string; body: string }[]>`
      SELECT "id", "title", "body" FROM "AssistantChunk" WHERE "embedding" IS NULL LIMIT 192`;
    if (!rows.length) return n;
    const vecs = await embed(rows.map((r) => `${r.title}\n${r.body}`), { operation: 'assistant.index', userId });
    await prisma.$executeRawUnsafe(
      `UPDATE "AssistantChunk" AS c SET "embedding" = v.e::vector FROM unnest($1::text[], $2::text[]) AS v(id, e) WHERE c."id" = v.id`,
      rows.map((r) => r.id), vecs.map(toVectorLiteral),
    );
    n += rows.length;
  }
}

/** Πότε έγινε η τελευταία ευρετηρίαση (ISO) ή null. */
export async function lastIndexAt(): Promise<string | null> {
  return (await getSetting<string>(LAST_INDEX_KEY)) ?? null;
}

/** Ξεκινά επανευρετηρίαση στο παρασκήνιο αν η μνήμη παλιώσει — δεν περιμένει. */
export async function reindexIfStale(): Promise<void> {
  const at = await lastIndexAt();
  if (!at || Date.now() - new Date(at).getTime() > STALE_MS) void reindexKnowledge().catch((e) => console.error('assistant reindex failed', e));
}
