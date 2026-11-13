import * as React from 'react';
import { Suspense } from 'react';
import {
  FiActivity, FiTrendingUp, FiBarChart2, FiAlertOctagon, FiClock, FiCalendar, FiCheckSquare, FiLayers, FiShoppingCart,
  FiPackage, FiFileText, FiInbox, FiBookOpen, FiUsers, FiList,
} from 'react-icons/fi';
import { requireStaff } from '@/lib/rbac';
import { PageHeader } from '@/components/admin/page-header';
import { AirJordanIcon } from '@/components/assistant/air-jordan-icon';
import { DashboardGrid, WidgetSkeleton, type WidgetMeta } from '@/components/admin/home/dashboard-grid';
import * as W from '@/components/admin/home/widgets';
import { loadLayout, accessOf } from '@/lib/dashboard/layout-store';
import { WIDGETS, canSeeWidget } from '@/lib/dashboard/widgets';

export const dynamic = 'force-dynamic';

// Η αρχική του προσωπικού: widgets ανάλογα με τα δικαιώματα, σε διάταξη που ο χρήστης αλλάζει με
// drag & drop (αποθηκεύεται ανά χρήστη). Η σελίδα ΔΕΝ περιμένει κανένα widget ούτε το SoftOne: κάθε
// widget έχει δικό του Suspense και διαβάζει μόνο τη βάση της εφαρμογής.

const HREF: Record<string, string> = {
  'finance-kpis': '/admin/projects', 'revenue-chart': '/admin/projects', 'projects-risk': '/admin/projects', ageing: '/admin/projects',
  appointments: '/admin/appointments', 'my-tasks': '/admin/projects', 'tasks-pipeline': '/admin/projects',
  'order-requests': '/admin/order-requests', offers: '/admin/dynamic-offers', 'ocr-activity': '/admin/ocr', 'ocr-attention': '/admin/ocr/pending',
  accounting: '/admin/accounting/questions', leads: '/admin/leads', assistant: '/admin/assistant', activity: '/admin/audit',
};

const ICON: Record<string, React.ReactNode> = {
  'finance-kpis': <FiTrendingUp />, 'revenue-chart': <FiBarChart2 />, 'projects-risk': <FiAlertOctagon />, ageing: <FiClock />,
  appointments: <FiCalendar />, 'my-tasks': <FiCheckSquare />, 'tasks-pipeline': <FiLayers />, 'order-requests': <FiShoppingCart />,
  offers: <FiPackage />, 'ocr-activity': <FiFileText />, 'ocr-attention': <FiInbox />, accounting: <FiBookOpen />, leads: <FiUsers />,
  assistant: <AirJordanIcon />, activity: <FiList />,
};

export default async function AdminHomePage() {
  const user = await requireStaff();
  const { layout, custom } = await loadLayout(user);
  const access = accessOf(user);
  const uid = user.id;

  const RENDER: Record<string, () => React.ReactNode> = {
    'finance-kpis': () => <W.FinanceKpisWidget />,
    'revenue-chart': () => <W.RevenueChartWidget />,
    'projects-risk': () => <W.ProjectsRiskWidget />,
    ageing: () => <W.AgeingWidget />,
    appointments: () => <W.AppointmentsWidget userId={uid} />,
    'my-tasks': () => <W.TasksWidget userId={uid} />,
    'tasks-pipeline': () => <W.TasksPipelineWidget userId={uid} />,
    'order-requests': () => <W.OrderRequestsWidget />,
    offers: () => <W.OffersWidget />,
    'ocr-activity': () => <W.OcrActivityWidget />,
    'ocr-attention': () => <W.OcrAttentionWidget />,
    accounting: () => <W.AccountingWidget />,
    leads: () => <W.LeadsWidget />,
    assistant: () => <W.AssistantWidget userId={uid} />,
    activity: () => <W.ActivityWidget />,
  };

  const allowed = WIDGETS.filter((w) => canSeeWidget(w, access));
  const meta: WidgetMeta[] = allowed.map((w) => ({ id: w.id, title: w.title, description: w.description, href: HREF[w.id] }));
  const hidden = new Set(layout.hidden);
  // Μόνο τα ορατά φορτώνουν δεδομένα· όταν ο χρήστης εμφανίσει ένα κρυμμένο, η σελίδα ανανεώνεται.
  const nodes: Record<string, React.ReactNode> = {};
  for (const id of layout.order) {
    if (hidden.has(id) || !RENDER[id]) continue;
    nodes[id] = <Suspense fallback={<WidgetSkeleton />}>{RENDER[id]()}</Suspense>;
  }
  const icons = Object.fromEntries(allowed.map((w) => [w.id, ICON[w.id]]));

  const first = user.name?.split(' ')[0] ?? user.email;
  const today = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Athens' }).format(new Date());

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiActivity />}
        title={`Καλώς ήρθες, ${first}`}
        description={`${today.charAt(0).toUpperCase()}${today.slice(1)} — η μέρα σου με μια ματιά`}
        helpAnchor="admin-home"
      />
      <DashboardGrid initial={layout} custom={custom} meta={meta} icons={icons} nodes={nodes} />
    </div>
  );
}
