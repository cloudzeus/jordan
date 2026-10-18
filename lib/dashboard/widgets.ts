// lib/dashboard/widgets.ts — ΚΑΘΑΡΟ (χωρίς βάση/SoftOne). Το μητρώο των widgets της αρχικής του
// προσωπικού (/admin) και οι κανόνες διάταξης: ποιος βλέπει τι, προεπιλογή ανά ρόλο, συγχώνευση της
// αποθηκευμένης διάταξης του χρήστη με ό,τι επιτρέπεται σήμερα. Δοκιμάζεται στο __tests__/widgets.test.ts.

import { ASSISTANT_ROLES } from '@/lib/assistant/access-rules';

export const WIDGET_SIZES = ['sm', 'md', 'lg'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];
// Σε μεγάλη οθόνη: ⅓ · ⅔ · ολόκληρο (όλα πολλαπλάσια του ⅓, ώστε ένα μικρό + ένα μεσαίο γεμίζουν τη γραμμή).
export const WIDGET_SIZE_LABEL: Record<WidgetSize, string> = { sm: 'Μικρό (⅓)', md: 'Μεσαίο (⅔)', lg: 'Πλήρες πλάτος' };

export type WidgetDef = {
  id: string;
  title: string;
  description: string;
  size: WidgetSize;
  /** Όλα απαιτούνται (ο SUPER_ADMIN τα έχει πάντα). */
  requires: string[];
  /** Μόνο αυτοί οι ρόλοι, ό,τι δικαίωμα κι αν έχει άλλος (π.χ. Air Jordan). */
  roles?: ReadonlySet<string>;
};

export const WIDGETS: WidgetDef[] = [
  { id: 'finance-kpis', title: 'Οικονομικά έργων', description: 'Τιμολογήσεις & εισπράξεις μήνα, ανοιχτό υπόλοιπο, καθαρό κέρδος', size: 'lg', requires: ['projects.financials'] },
  { id: 'revenue-chart', title: 'Τιμολογήσεις & κόστος ανά μήνα', description: 'Τελευταίοι 12 μήνες, από το στιγμιότυπο κερδοφορίας', size: 'md', requires: ['projects.financials'] },
  { id: 'projects-risk', title: 'Έργα σε κίνδυνο', description: 'Ζημιά, χαμηλό περιθώριο ή δεδομένα που λείπουν', size: 'md', requires: ['projects.financials'] },
  { id: 'ageing', title: 'Ενηλικίωση απαιτήσεων', description: 'Ανείσπρακτα τιμολόγια έργων ανά ηλικία', size: 'sm', requires: ['projects.financials'] },
  { id: 'appointments', title: 'Ραντεβού', description: 'Σήμερα και τις επόμενες 7 ημέρες', size: 'md', requires: ['appointments.read'] },
  { id: 'my-tasks', title: 'Εργασίες', description: 'Οι δικές μου, καθυστερημένες και όσες λήγουν σύντομα', size: 'md', requires: ['projects.read'] },
  { id: 'tasks-pipeline', title: 'Ροή εργασιών', description: 'Ανοιχτές εργασίες έργων ανά φάση', size: 'sm', requires: ['projects.read'] },
  { id: 'order-requests', title: 'Αιτήματα παραγγελίας', description: 'Από το B2B portal, περιμένουν απάντηση', size: 'sm', requires: ['order_requests.read'] },
  { id: 'offers', title: 'Προσφορές & κρατήσεις', description: 'Ανοιχτά container, πληρότητα, αιτήματα κράτησης', size: 'sm', requires: ['dynamic_offers.read'] },
  { id: 'ocr-activity', title: 'Παραστατικά OCR', description: 'Νέα έγγραφα και καταχωρίσεις, 30 ημέρες', size: 'md', requires: ['ocr.read'] },
  { id: 'ocr-attention', title: 'Χρειάζονται προσοχή', description: 'Ουρές OCR που περιμένουν ενέργεια', size: 'sm', requires: ['ocr.read'] },
  { id: 'accounting', title: 'Λογιστήριο & integrator', description: 'Ερωτήματα λογιστή και θέματα integrator', size: 'sm', requires: ['metadata.read'] },
  { id: 'leads', title: 'Leads & newsletter', description: 'Νέες επαφές από το website, 12 εβδομάδες', size: 'md', requires: ['leads.read'] },
  { id: 'assistant', title: 'Air Jordan', description: 'Ρώτα τον βοηθό AI για έργα, πελάτες, υλικά', size: 'sm', requires: ['assistant.use'], roles: ASSISTANT_ROLES },
  { id: 'activity', title: 'Πρόσφατη δραστηριότητα', description: 'Τελευταίες ενέργειες χρηστών (audit log)', size: 'md', requires: ['system.audit'] },
];

export const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

/** Σειρά προεπιλογής — διοίκηση: πρώτα τα οικονομικά· προσωπικό: πρώτα η μέρα του. */
// Ζεύγη «μεσαίο + μικρό» ώστε κάθε γραμμή να γεμίζει (⅔ + ⅓).
const ADMIN_ORDER = [
  'finance-kpis',
  'revenue-chart', 'ageing',
  'projects-risk', 'offers',
  'appointments', 'order-requests',
  'my-tasks', 'tasks-pipeline',
  'ocr-activity', 'ocr-attention',
  'leads', 'accounting',
  'activity', 'assistant',
];
const STAFF_ORDER = [
  'appointments', 'order-requests',
  'my-tasks', 'tasks-pipeline',
  'leads', 'offers',
  'ocr-activity', 'ocr-attention',
  'finance-kpis', 'revenue-chart', 'ageing', 'projects-risk', 'accounting', 'activity', 'assistant',
];
/** Κρυμμένα από προεπιλογή (ο χρήστης τα ανοίγει από το μενού). */
const DEFAULT_HIDDEN: Record<string, string[]> = { ADMIN: ['activity'], STAFF: ['activity', 'accounting'] };

export type Access = { roleKey: string | null | undefined; permissions: ReadonlySet<string> };

export function canSeeWidget(w: WidgetDef, a: Access): boolean {
  if (w.roles && (!a.roleKey || !w.roles.has(a.roleKey))) return false;
  if (a.roleKey === 'SUPER_ADMIN') return true;
  return w.requires.every((k) => a.permissions.has(k));
}

export function allowedWidgetIds(a: Access): string[] {
  return WIDGETS.filter((w) => canSeeWidget(w, a)).map((w) => w.id);
}

export type Layout = { order: string[]; hidden: string[]; sizes: Record<string, WidgetSize> };

const isAdminRole = (r: string | null | undefined) => r === 'SUPER_ADMIN' || r === 'ADMIN';

export function defaultLayout(a: Access): Layout {
  const allowed = new Set(allowedWidgetIds(a));
  const admin = isAdminRole(a.roleKey);
  const order = (admin ? ADMIN_ORDER : STAFF_ORDER).filter((id) => allowed.has(id));
  // Ό,τι μπήκε στο μητρώο αλλά ξεχάστηκε από τις λίστες: στο τέλος, ορατό.
  for (const id of allowed) if (!order.includes(id)) order.push(id);
  const hidden = (DEFAULT_HIDDEN[admin ? 'ADMIN' : 'STAFF'] ?? []).filter((id) => allowed.has(id));
  // Ποτέ άδεια αρχική επειδή η προεπιλογή έκρυψε το μοναδικό widget του χρήστη.
  return { order, hidden: hidden.length === order.length ? [] : hidden, sizes: {} };
}

/**
 * Καθαρίζει ό,τι ήρθε από τον client/τη βάση: μόνο γνωστά ids, χωρίς διπλά, έγκυρα μεγέθη.
 * ΔΕΝ φιλτράρει με δικαιώματα — αν ο χρήστης χάσει και ξαναπάρει ένα δικαίωμα, η θέση του μένει.
 */
export function sanitizeLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ids = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && WIDGET_BY_ID.has(x)) : [])];
  const sizes: Record<string, WidgetSize> = {};
  if (r.sizes && typeof r.sizes === 'object') {
    for (const [k, v] of Object.entries(r.sizes as Record<string, unknown>)) {
      if (WIDGET_BY_ID.has(k) && (WIDGET_SIZES as readonly string[]).includes(v as string)) sizes[k] = v as WidgetSize;
    }
  }
  return { order: ids(r.order), hidden: ids(r.hidden), sizes };
}

/**
 * Η διάταξη που βλέπει ο χρήστης: η αποθηκευμένη, περιορισμένη σε ό,τι επιτρέπεται τώρα. Νέα widgets
 * (ή νέο δικαίωμα) μπαίνουν στη θέση της προεπιλογής τους — όχι στο τέλος, όπου κανείς δεν τα βρίσκει.
 */
export function resolveLayout(saved: unknown, a: Access): Layout {
  const def = defaultLayout(a);
  const s = sanitizeLayout(saved);
  if (!s || s.order.length === 0) return def;
  const allowed = new Set(def.order);
  const order = s.order.filter((id) => allowed.has(id));
  for (const id of def.order) {
    if (order.includes(id)) continue;
    // Μετά τον πλησιέστερο προηγούμενο της προεπιλογής που υπάρχει ήδη.
    const di = def.order.indexOf(id);
    const prev = def.order.slice(0, di).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
  }
  const hidden = s.hidden.filter((id) => allowed.has(id));
  const sizes = Object.fromEntries(Object.entries(s.sizes).filter(([id]) => allowed.has(id)));
  return { order, hidden, sizes };
}

export const sizeOf = (l: Layout, id: string): WidgetSize => l.sizes[id] ?? WIDGET_BY_ID.get(id)?.size ?? 'md';

/** Μετακίνηση στη λίστα (πληκτρολόγιο/μενού): «πάνω», «κάτω», «πρώτο», «τελευταίο» — μόνο ανάμεσα στα ορατά. */
export function moveWidget(l: Layout, id: string, to: 'up' | 'down' | 'first' | 'last'): Layout {
  const hidden = new Set(l.hidden);
  const visible = l.order.filter((x) => !hidden.has(x));
  const i = visible.indexOf(id);
  if (i < 0) return l;
  const j = to === 'up' ? i - 1 : to === 'down' ? i + 1 : to === 'first' ? 0 : visible.length - 1;
  if (j < 0 || j >= visible.length || j === i) return l;
  const target = visible[j];
  const order = l.order.filter((x) => x !== id);
  const at = order.indexOf(target);
  order.splice(j > i ? at + 1 : at, 0, id);
  return { ...l, order };
}

/** Αποτέλεσμα drag & drop: το `id` πάει στη θέση του `overId`. */
export function dropWidget(l: Layout, id: string, overId: string): Layout {
  if (id === overId) return l;
  const from = l.order.indexOf(id), to = l.order.indexOf(overId);
  if (from < 0 || to < 0) return l;
  const order = [...l.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...l, order };
}

export function setHidden(l: Layout, id: string, hide: boolean): Layout {
  const hidden = l.hidden.filter((x) => x !== id);
  if (hide) hidden.push(id);
  return { ...l, hidden };
}

export function setSize(l: Layout, id: string, size: WidgetSize): Layout {
  const sizes = { ...l.sizes };
  if (WIDGET_BY_ID.get(id)?.size === size) delete sizes[id];
  else sizes[id] = size;
  return { ...l, sizes };
}
