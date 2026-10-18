'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiMail,
  FiGrid, FiUsers, FiShield, FiKey, FiImage, FiChevronDown, FiList, FiTag, FiMaximize2, FiTrendingDown, FiShoppingCart,
  FiActivity, FiSettings, FiFileText, FiLogOut, FiDatabase, FiBriefcase, FiLayers, FiCpu, FiBookOpen, FiBook, FiUserCheck, FiBox, FiTool, FiFolder, FiAlertCircle, FiUserPlus, FiPackage, FiPlayCircle, FiUploadCloud, FiHelpCircle, FiClipboard, FiCalendar, FiTarget, FiCheckSquare, FiMenu, FiX,
} from 'react-icons/fi';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AirJordanIcon } from '@/components/assistant/air-jordan-icon';

type IconType = React.ComponentType<{ className?: string }>;

type NavItem = {
  href: string;
  label: string;
  icon: IconType;
  exact?: boolean;
  permissions?: string[];
  /** When set, only users with this role.key can see this item. */
  requireRoleKey?: string;
  /** When set, only these role.keys can see this item (π.χ. Air Jordan: ADMIN / SUPER_ADMIN). */
  roleKeys?: string[];
  badgeKey?: keyof Badges;
};
type NavGroup = { label: string; items: NavItem[] };

export interface Badges {
  pendingUsers?: number;
  /** Εκκρεμείς εκδότες χωρίς συναλλασσόμενο — από /api/admin/ocr/queues/counts. */
  newTraders?: number;
  /** Ομάδες γραμμών χωρίς αντιστοίχιση — από το ίδιο endpoint. */
  newItems?: number;
  /** Εργασίες σάρωσης που τρέχουν ή περιμένουν — από /api/admin/ocr/templates/jobs?count=1. */
  activeJobs?: number;
  /** Ερωτήματα λογιστή χωρίς ισχύουσα απάντηση — από /api/admin/accounting/counts. */
  openQuestions?: number;
  /** Ανοιχτά θέματα για τον integrator — από το ίδιο endpoint. */
  integratorOpen?: number;
  /** Νέα αιτήματα παραγγελίας από το B2B portal (κατάσταση «Υποβλήθηκε») — από το admin layout. */
  orderRequests?: number;
  /** Ραντεβού atelier που περιμένουν επιβεβαίωση — από το admin layout. */
  appointments?: number;
}

/** DGsoft wordmark shown at the top of the sidebar. */
const BRAND_LOGO_URL = 'https://espa-stamos.b-cdn.net/media/2026/05/dgplain-9bb7skuy.webp';
const OPEN_GROUPS_KEY = 'admin-sidebar-open-groups';

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Επισκόπηση',
    items: [
      { href: '/admin', label: 'Dashboard', icon: FiGrid, exact: true },
      { href: '/admin/assistant', label: 'Air Jordan', icon: AirJordanIcon, permissions: ['assistant.use'], roleKeys: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/projects', label: 'Έργα', icon: FiBriefcase, permissions: ['projects.read'] },
      { href: '/admin/tasks', label: 'Εργασίες & Gantt', icon: FiCheckSquare, permissions: ['projects.read'] },
      { href: '/admin/dynamic-offers', label: 'Δυναμικές προσφορές', icon: FiTrendingDown, permissions: ['dynamic_offers.read'] },
      { href: '/admin/order-requests', label: 'Αιτήματα παραγγελίας', icon: FiShoppingCart, permissions: ['order_requests.read'], badgeKey: 'orderRequests' },
      { href: '/admin/appointments', label: 'Ραντεβού atelier', icon: FiCalendar, permissions: ['appointments.read'], badgeKey: 'appointments' },
      { href: '/admin/leads', label: 'Leads & newsletter', icon: FiTarget, permissions: ['leads.read'] },
      { href: '/admin/emails', label: 'Πρότυπα email', icon: FiMail, permissions: ['metadata.read'] },
      { href: '/admin/partners', label: 'Συνεργάτες', icon: FiUsers, permissions: ['partners.read'] },
      { href: '/admin/classifications', label: 'Κατηγορίες & ομάδες', icon: FiTag, permissions: ['classifications.read'] },
      { href: '/admin/units', label: 'Μονάδες μέτρησης', icon: FiMaximize2, permissions: ['units.read'] },
    ],
  },
  {
    label: 'Δεδομένα',
    items: [
      { href: '/admin/traders', label: 'Συναλλασσόμενοι', icon: FiUserCheck, permissions: ['metadata.read'] },
      { href: '/admin/items', label: 'Είδη', icon: FiBox, permissions: ['metadata.read'] },
      { href: '/admin/services', label: 'Υπηρεσίες', icon: FiTool, permissions: ['metadata.read'] },
      { href: '/admin/expenses', label: 'Έξοδα & λογιστικά', icon: FiBookOpen, permissions: ['metadata.read'] },
      { href: '/admin/doc-series', label: 'Σειρές παραστατικών', icon: FiList, permissions: ['metadata.read'] },
      { href: '/admin/reference-data', label: 'Μητρώα αναφοράς', icon: FiLayers, permissions: ['metadata.read'] },
      { href: '/admin/document-types', label: 'Τύποι Δικαιολογητικών', icon: FiFileText, permissions: ['metadata.read'] },
      { href: '/admin/business-types', label: 'Νομικές Μορφές', icon: FiBriefcase, permissions: ['metadata.read'] },
      { href: '/admin/media', label: 'Media', icon: FiImage },
      { href: '/admin/ocr', label: 'OCR / Έγγραφα', icon: FiCpu, permissions: ['ocr.read'], exact: true },
      { href: '/admin/ocr/batches', label: 'Φάκελοι OCR', icon: FiFolder, permissions: ['ocr.read'] },
      { href: '/admin/ocr/new-traders', label: 'Νέοι συναλλασσόμενοι', icon: FiUserPlus, permissions: ['ocr.read'], badgeKey: 'newTraders' },
      { href: '/admin/ocr/new-items', label: 'Είδη & έξοδα', icon: FiPackage, permissions: ['ocr.read'], badgeKey: 'newItems' },
      { href: '/admin/ocr/pending', label: 'Εκκρεμότητες OCR', icon: FiAlertCircle, permissions: ['ocr.read'] },
      { href: '/admin/ocr/posted', label: 'Αναρτημένα SoftOne', icon: FiUploadCloud, permissions: ['ocr.read'] },
      { href: '/admin/ocr/templates', label: 'Πρότυπα εξαγωγής', icon: FiLayers, permissions: ['ocr.read'], exact: true },
      { href: '/admin/ocr/templates/jobs', label: 'Εργασίες σάρωσης', icon: FiPlayCircle, permissions: ['ocr.read'], badgeKey: 'activeJobs' },
    ],
  },
  {
    // Για τον λογιστή της επιχείρησης και τον integrator: πώς λογιστικοποιείται κάθε δαπάνη και τι
    // πρέπει να γίνει στο SoftOne.
    label: 'Λογιστική αρχικοποίηση',
    items: [
      { href: '/admin/softone/accounts', label: 'Λογιστικό σχέδιο', icon: FiBook, permissions: ['metadata.read'] },
      { href: '/admin/accounting/questions', label: 'Ερωτήματα λογιστή', icon: FiHelpCircle, permissions: ['metadata.read'], badgeKey: 'openQuestions' },
      { href: '/admin/accounting/integrator', label: 'Αναφορά integrator', icon: FiClipboard, permissions: ['metadata.read'], badgeKey: 'integratorOpen' },
    ],
  },
  {
    label: 'Σύστημα',
    items: [
      { href: '/admin/audit', label: 'Audit log', icon: FiActivity, permissions: ['system.audit'] },
      { href: '/admin/backups', label: 'Backups', icon: FiDatabase, permissions: ['system.backups'] },
      { href: '/admin/settings', label: 'Ρυθμίσεις', icon: FiSettings, permissions: ['system.settings'] },
      { href: '/admin/ai-usage', label: 'AI Usage', icon: FiCpu, requireRoleKey: 'SUPER_ADMIN' },
      { href: '/admin/docs', label: 'API Docs', icon: FiFileText },
    ],
  },
  {
    label: 'Access control',
    items: [
      { href: '/admin/users', label: 'Χρήστες', icon: FiUsers, permissions: ['users.read'], badgeKey: 'pendingUsers' },
      { href: '/admin/roles', label: 'Ρόλοι', icon: FiShield, permissions: ['roles.read'] },
      { href: '/admin/permissions', label: 'Δικαιώματα', icon: FiKey, permissions: ['permissions.read'] },
    ],
  },
  {
    label: 'Βοήθεια',
    items: [
      { href: '/wiki', label: 'Οδηγός Χρήστη', icon: FiBookOpen },
    ],
  },
];

import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import type { LocaleCode } from '@/i18n/locales';

interface Props {
  user: { name?: string | null; email?: string | null };
  roleName: string;
  roleKey?: string | null;
  locale: LocaleCode;
  permissionKeys: string[];
  badges?: Badges;
}

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(' '); }

export function AdminSidebar({ user, roleName, roleKey, locale, permissionKeys, badges = {} }: Props) {
  const path = usePathname();
  const initials = (user.name ?? user.email ?? '??')
    .split(/[\s@]/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  const allowed = (perms?: string[]) => !perms || perms.length === 0 || perms.some((p) => permissionKeys.includes(p));
  const allowedItem = (it: NavItem) => allowed(it.permissions) && (!it.requireRoleKey || it.requireRoleKey === roleKey) && (!it.roleKeys || (!!roleKey && it.roleKeys.includes(roleKey)));
  const isActive = (item: NavItem) => item.exact ? path === item.href : (path === item.href || path.startsWith(`${item.href}/`));

  // Collapsible groups: all open by default, remembered per browser, and the
  // group holding the current route is always forced open on navigation.
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  /**
   * ΣΥΜΠΤΥΞΗ ΣΕ ΣΤΕΝΕΣ ΟΘΟΝΕΣ. Σε business laptop 1280px το sidebar των 244px είναι το **19%**
   * της οθόνης — και ο πίνακας παραστατικών, που θέλει ~1100px, αναγκαζόταν σε μόνιμη οριζόντια
   * κύλιση. Κάτω από 1440px ανοίγει συμπτυγμένο (μόνο εικονίδια, 60px) και κερδίζονται 184px.
   *
   * Ο χρήστης έχει πάντα τον τελευταίο λόγο: η επιλογή του αποθηκεύεται και ΝΙΚΑΕΙ το πλάτος —
   * ένα sidebar που ξαναμαζεύεται μόνο του σε κάθε φόρτωση είναι χειρότερο από στενή οθόνη.
   */
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem('admin.sidebar.collapsed'); } catch { /* private mode */ }
    if (saved === '1' || saved === '0') { setCollapsed(saved === '1'); return; }
    setCollapsed(window.innerWidth < 1440);
  }, []);
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem('admin.sidebar.collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '{}') as Record<string, boolean>;
      setOpen(saved);
    } catch { /* ignore */ }
  }, []);
  React.useEffect(() => {
    const current = NAV_GROUPS.find((g) => g.items.some(isActive));
    if (current && open[current.label] === false) {
      setOpen((o) => ({ ...o, [current.label]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const toggleGroup = (label: string) => {
    setOpen((o) => {
      // `undefined` σημαίνει «αυτόματο» (ανοιχτό αν είσαι μέσα). Το πρώτο κλικ πρέπει να
      // αντιστρέψει ό,τι ΒΛΕΠΕΙ ο χρήστης, όχι ό,τι λέει το αποθηκευμένο.
      const showing = o[label] ?? NAV_GROUPS.find((g) => g.label === label)?.items.some(isActive) ?? false;
      const next = { ...o, [label]: !showing };
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Queue badges («Νέοι συναλλασσόμενοι» / «Είδη & έξοδα») — fetched once on
  // mount. Any failure (404 while the route is not deployed, offline, 403) is
  // swallowed: the badge is decoration, never a blocker.
  const [queueCounts, setQueueCounts] = React.useState<Pick<Badges, 'newTraders' | 'newItems' | 'activeJobs' | 'openQuestions' | 'integratorOpen'>>({});
  const canReadOcr = permissionKeys.includes('ocr.read');
  React.useEffect(() => {
    if (!canReadOcr) return;
    let cancelled = false;
    fetch('/api/admin/ocr/queues/counts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { traders?: unknown; items?: unknown } | null) => {
        if (cancelled || !d) return;
        setQueueCounts((p) => ({ ...p, newTraders: Number(d.traders) || 0, newItems: Number(d.items) || 0 }));
      })
      .catch(() => { /* badges are optional */ });
    // Οι ενεργές εργασίες σάρωσης είναι ξεχωριστό, φθηνό ερώτημα (ένα COUNT) — ζητείται και
    // περιοδικά, γιατί σε αντίθεση με τις ουρές αλλάζει μόνο του όσο ο χρήστης κοιτά αλλού.
    const jobs = () => fetch('/api/admin/ocr/templates/jobs?count=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { active?: unknown } | null) => { if (!cancelled && d) setQueueCounts((p) => ({ ...p, activeJobs: Number(d.active) || 0 })); })
      .catch(() => { /* badges are optional */ });
    void jobs();
    const timer = setInterval(() => { void jobs(); }, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [canReadOcr]);
  const canReadMeta = permissionKeys.includes('metadata.read');
  React.useEffect(() => {
    if (!canReadMeta) return;
    let cancelled = false;
    fetch('/api/admin/accounting/counts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { questions?: unknown; integrator?: unknown } | null) => {
        if (!cancelled && d) setQueueCounts((p) => ({ ...p, openQuestions: Number(d.questions) || 0, integratorOpen: Number(d.integrator) || 0 }));
      })
      .catch(() => { /* badges are optional */ });
    return () => { cancelled = true; };
  }, [canReadMeta, path]);
  const allBadges: Badges = { ...badges, ...queueCounts };

  return (
    <aside
      data-collapsed={collapsed ? '' : undefined}
      className={cn(
        'sticky top-0 hidden h-dvh max-h-dvh shrink-0 flex-col self-start overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex cx-transition',
        collapsed ? 'w-[60px]' : 'w-[244px]',
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <Link href="/admin" className="-m-1.5 flex items-center rounded-md p-1.5" aria-label="DGsoft">
          <img src={BRAND_LOGO_URL} alt="DGsoft" className="h-7 w-auto" />
        </Link>
        {!collapsed && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[length:var(--fs-10)] font-medium uppercase tracking-wide text-muted-foreground">
            <FiShield className="size-3" /> Admin
          </span>
        )}
        <button
          type="button" onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Άνοιγμα πλαϊνού μενού' : 'Σύμπτυξη πλαϊνού μενού'}
          title={collapsed ? 'Άνοιγμα μενού' : 'Σύμπτυξη μενού'}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground cx-transition hover:bg-[var(--cx-hover)] hover:text-foreground',
            collapsed ? 'mx-auto' : 'ml-1',
          )}
        >
          <FiChevronDown aria-hidden className={cn('size-3.5', collapsed ? '-rotate-90' : 'rotate-90')} />
        </button>
      </div>

      <div className={cn('shrink-0 border-b border-sidebar-border px-4 py-2.5', collapsed && 'hidden')}>
        <p className="cx-eyebrow">Ρόλος</p>
        <p className="mt-0.5 truncate text-[length:var(--fs-13)] font-medium text-foreground">{roleName}</p>
      </div>

      {/* Κλειστές ομάδες = το μενού χωράει. Όταν ο χρήστης ανοίξει πολλές, κυλάει ΜΟΝΟ η λίστα
          (κεφαλίδα/υποσέλιδο μένουν ορατά) — αλλιώς τα κάτω links έβγαιναν εκτός οθόνης χωρίς τρόπο πρόσβασης. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-2 py-3 [scrollbar-width:thin]">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(allowedItem);
          if (visible.length === 0) return null;
          /**
           * ΑΝΟΙΧΤΗ ΜΟΝΟ Η ΕΝΕΡΓΗ ΟΜΑΔΑ (εκτός αν ο χρήστης είπε αλλιώς).
           *
           * Πριν: όλες ανοιχτές εξ ορισμού → ~1150px περιεχόμενο σε 800px οθόνη → scroller μέσα
           * στο μενού. Ένα μενού που κυλάει κρύβει τον προορισμό που ψάχνεις και παλεύει με το
           * scroll της σελίδας. Τώρα το μενού ΧΩΡΑΕΙ, και η επιλογή του χρήστη υπερισχύει.
           */
          const expanded = open[group.label] ?? group.items.some(isActive);
          const groupId = `nav-group-${group.label.replace(/\s+/g, '-')}`;
          return (
            <div key={group.label} className={cn('rounded-md cx-transition', expanded && !collapsed && 'bg-[var(--cx-expanded-bg)] pb-1 shadow-[inset_3px_0_0_var(--cx-expanded-edge)]')}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={expanded}
                aria-controls={groupId}
                className={cn(
                  'mb-1 flex h-7 w-full items-center gap-1 rounded-sm px-2 text-left cx-transition hover:bg-[var(--cx-hover)]',
                  // Μαζεμένο: ο τίτλος ομάδας φεύγει, αλλά η ομάδα ΔΕΝ κλείνει — αλλιώς τα
                  // εικονίδια θα κρύβονταν κι αυτά και το μενού θα ήταν άχρηστο.
                  collapsed && 'hidden',
                )}
              >
                <span className="cx-eyebrow flex-1">{group.label}</span>
                <FiChevronDown
                  aria-hidden
                  className={cn('size-3.5 text-muted-foreground/80 cx-transition', expanded ? 'rotate-0' : '-rotate-90')}
                />
              </button>
              <ul id={groupId} className={cn('flex-col', expanded ? 'flex' : 'hidden')}>
                {visible.map((item) => {
                  const active = isActive(item);
                  const badge = item.badgeKey ? allBadges[item.badgeKey] : undefined;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        className={cn(
                          'group/item relative flex h-8 items-center rounded-sm text-[length:var(--fs-13)] font-medium cx-transition',
                          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2',
                          active
                            ? 'bg-[var(--cx-accent-soft)] text-foreground'
                            : 'text-muted-foreground hover:bg-[var(--cx-hover)] hover:text-foreground',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-[var(--cx-accent)] cx-transition',
                            active ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <item.icon className={cn('size-3.5', active ? 'text-[var(--cx-accent)]' : 'text-muted-foreground/80')} />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {badge !== undefined && badge > 0 && (
                          collapsed
                            // Μαζεμένο: ο αριθμός δεν χωράει, αλλά η ΕΙΔΟΠΟΙΗΣΗ δεν επιτρέπεται να
                            // χαθεί — μένει ως κουκκίδα, με το πλήθος στο tooltip.
                            ? (
                              <span
                                aria-hidden
                                title={`${item.label}: ${badge}`}
                                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--cx-accent)]"
                              />
                            )
                            : (
                              <span className="min-w-[18px] rounded-full px-1 text-center text-[length:var(--fs-10)] font-medium tabular-nums text-muted-foreground ring-1 ring-inset ring-border/70">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2 space-y-2">
        {!collapsed && (
          <div className="px-1">
            <LocaleSwitcher currentLocale={locale} />
          </div>
        )}
        <div className={cn('flex items-center rounded-sm py-1.5', collapsed ? 'flex-col gap-1 px-0' : 'gap-2.5 px-2')}>
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[length:var(--fs-10)] font-medium text-foreground">
            {initials || 'U'}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[length:var(--fs-12)] font-medium text-foreground">{user.name ?? user.email ?? 'User'}</p>
              <p className="truncate text-[length:var(--fs-10)] uppercase tracking-wide text-muted-foreground">{roleName.toLowerCase()}</p>
            </div>
          )}
          <Link
            href="/api/auth/signout"
            title="Αποσύνδεση"
            className="grid size-7 place-items-center rounded-sm text-muted-foreground cx-transition hover:bg-[var(--cx-hover)] hover:text-foreground"
          >
            <FiLogOut className="size-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

// ---------------- Mobile: κάτω μπάρα + συρτάρι με ΟΛΟ το μενού ----------------

/**
 * Κάτω από 1024px το πλαϊνό μενού κρύβεται. Η κάτω μπάρα έχει έως 4 συντομεύσεις (όσες επιτρέπουν
 * τα δικαιώματα) και το «Μενού», που ανοίγει συρτάρι με όλες τις ομάδες — ίδια λίστα με το sidebar.
 */
const MOBILE_SHORTCUTS: NavItem[] = [
  { href: '/admin', label: 'Αρχική', icon: FiGrid, exact: true },
  { href: '/admin/projects', label: 'Έργα', icon: FiBriefcase, permissions: ['projects.read'] },
  { href: '/admin/tasks', label: 'Εργασίες', icon: FiCheckSquare, permissions: ['projects.read'] },
  { href: '/admin/appointments', label: 'Ραντεβού', icon: FiCalendar, permissions: ['appointments.read'], badgeKey: 'appointments' },
  { href: '/admin/ocr', label: 'OCR', icon: FiCpu, permissions: ['ocr.read'], exact: true },
  { href: '/admin/users', label: 'Χρήστες', icon: FiUsers, permissions: ['users.read'] },
  { href: '/admin/settings', label: 'Ρυθμίσεις', icon: FiSettings, permissions: ['system.settings'] },
];

export function AdminBottomNav({ permissionKeys, roleKey, roleName, user, badges = {} }: Pick<Props, 'permissionKeys' | 'roleKey' | 'roleName' | 'user' | 'badges'>) {
  const path = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { setOpen(false); }, [path]);
  const allowed = (it: NavItem) => (!it.permissions || it.permissions.length === 0 || it.permissions.some((p) => permissionKeys.includes(p)))
    && (!it.requireRoleKey || it.requireRoleKey === roleKey) && (!it.roleKeys || (!!roleKey && it.roleKeys.includes(roleKey)));
  const isActive = (it: NavItem) => (it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`));
  const shortcuts = MOBILE_SHORTCUTS.filter(allowed).slice(0, 4);
  const inShortcut = shortcuts.some(isActive);

  const tab = (active: boolean) => cn(
    'relative flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 text-[length:var(--fs-10)] font-medium cx-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  );

  return (
    <>
      <nav aria-label="Κύρια πλοήγηση" className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${shortcuts.length + 1}, minmax(0, 1fr))` }}>
        {shortcuts.map((item) => {
          const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive(item) ? 'page' : undefined} className={tab(isActive(item))}>
              <item.icon className="size-4" />
              <span className="w-full truncate text-center">{item.label}</span>
              {badge !== undefined && badge > 0 && <span className="absolute right-[calc(50%-1.1rem)] top-1 size-2 rounded-full bg-[var(--cx-accent)]" aria-label={`${badge} σε αναμονή`} />}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={tab(!inShortcut && path !== '/admin')}>
          <FiMenu className="size-4" />
          <span>Μενού</span>
        </button>
      </nav>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 lg:hidden data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-[min(20rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-xl outline-none lg:hidden data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
            <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-sidebar-border px-4 pt-[env(safe-area-inset-top)]">
              <img src={BRAND_LOGO_URL} alt="DGsoft" className="h-7 w-auto" />
              <DialogPrimitive.Title className="sr-only">Μενού διαχείρισης</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Όλες οι ενότητες της διαχείρισης</DialogPrimitive.Description>
              <DialogPrimitive.Close className="ml-auto grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-[var(--cx-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Κλείσιμο μενού">
                <FiX className="size-5" />
              </DialogPrimitive.Close>
            </div>
            {/* Στο κινητό το συρτάρι ΚΥΛΑΕΙ: όλες οι ομάδες ανοιχτές, χωρίς κρυφούς προορισμούς. */}
            <nav aria-label="Όλες οι ενότητες" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
              {NAV_GROUPS.map((group) => {
                const visible = group.items.filter(allowed);
                if (!visible.length) return null;
                return (
                  <div key={group.label} className="mb-3">
                    <p className="cx-eyebrow px-2 pb-1">{group.label}</p>
                    <ul>
                      {visible.map((item) => {
                        const active = isActive(item);
                        const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                        return (
                          <li key={item.href}>
                            <Link href={item.href} aria-current={active ? 'page' : undefined}
                              className={cn('flex min-h-11 items-center gap-3 rounded-md px-2 text-[length:var(--fs-14)] font-medium cx-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                active ? 'bg-[var(--cx-accent-soft)] text-foreground' : 'text-muted-foreground hover:bg-[var(--cx-hover)] hover:text-foreground')}>
                              <item.icon className={cn('size-4', active ? 'text-[var(--cx-accent)]' : '')} />
                              <span className="flex-1 truncate">{item.label}</span>
                              {badge !== undefined && badge > 0 && <span className="min-w-[20px] rounded-full px-1.5 text-center text-[length:var(--fs-11)] tabular-nums ring-1 ring-inset ring-border">{badge > 99 ? '99+' : badge}</span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
            <div className="flex shrink-0 items-center gap-2.5 border-t border-sidebar-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[length:var(--fs-13)] font-medium text-foreground">{user.name ?? user.email ?? 'User'}</p>
                <p className="truncate text-[length:var(--fs-11)] uppercase tracking-wide text-muted-foreground">{roleName.toLowerCase()}</p>
              </div>
              <Link href="/api/auth/signout" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[length:var(--fs-13)] font-medium text-muted-foreground hover:bg-[var(--cx-hover)] hover:text-foreground">
                <FiLogOut className="size-4" /> Αποσύνδεση
              </Link>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
