import { requireStaff } from '@/lib/rbac';
import { AdminSidebar, AdminBottomNav } from '@/components/admin/sidebar';
import { DEFAULT_LOCALE, isValidLocale, type LocaleCode } from '@/i18n/locales';
import { SoftoneConnectionBar } from '@/components/admin/softone-connection-bar';
import { countPendingOrderRequests } from '@/lib/order-requests';
import { countPendingAppointments } from '@/lib/appointments';
import { countContractInbox } from '@/lib/contracts/inbox';
import { countPendingCustomerChanges } from '@/lib/customer-changes';
import { AirJordanLauncher } from '@/components/assistant/air-jordan-launcher';
import { assistantAllowed } from '@/lib/assistant/access-rules';
import { textAssistAllowed } from '@/lib/text-assist/core';
import { TextAssistLayer } from '@/components/admin/text-assist/text-assist-layer';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Πελάτες/συνεργάτες ΔΕΝ μπαίνουν στη διαχείριση — πάνε στο portal τους.
  const user = await requireStaff();
  const permissionKeys = Array.from(user.permissionKeys);
  const locale: LocaleCode = isValidLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const canSeeRequests = user.role.key === 'SUPER_ADMIN' || user.permissionKeys.has('order_requests.read');
  const canSeeAppointments = user.role.key === 'SUPER_ADMIN' || user.permissionKeys.has('appointments.read');
  // Air Jordan: μόνο ADMIN / SUPER_ADMIN (το ίδιο ελέγχεται σε κάθε API του).
  const canAssistant = assistantAllowed(user.role.key, user.permissionKeys, 'assistant.use');
  const canAssistantMemory = assistantAllowed(user.role.key, user.permissionKeys, 'assistant.memory');
  // Υπαγόρευση + AI μορφοποίηση σε κάθε πεδίο κειμένου: μόνο ADMIN / SUPER_ADMIN.
  const canTextAssist = textAssistAllowed(user.role.key);
  const canSeeContracts = user.role.key === 'SUPER_ADMIN' || user.permissionKeys.has('projects.read');
  const canSeeMeta = user.role.key === 'SUPER_ADMIN' || user.permissionKeys.has('metadata.read');
  const [orderRequests, appointments, inbox, customerChanges] = await Promise.all([
    canSeeRequests ? countPendingOrderRequests().catch(() => 0) : 0,
    canSeeAppointments ? countPendingAppointments().catch(() => 0) : 0,
    canSeeContracts ? countContractInbox().catch(() => null) : null,
    canSeeMeta ? countPendingCustomerChanges().catch(() => 0) : 0,
  ]);
  const contractQuestions = inbox?.questions ?? 0;
  const offerRequests = inbox?.requests ?? 0;

  return (
    <div className="admin-root flex min-h-dvh bg-background">
      <AdminSidebar
        user={{ name: user.name, email: user.email }}
        roleName={user.role.name}
        roleKey={user.role.key ?? null}
        locale={locale}
        permissionKeys={permissionKeys}
        badges={{ orderRequests, appointments, contractInbox: contractQuestions, offerRequests, customerChanges }}
      />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Η κατάσταση της σύνδεσης με το ERP αφορά ΚΑΘΕ σελίδα, όχι μόνο την ουρά: η πτώση
            και η αλλαγή εγκατάστασης αλλοιώνουν ό,τι βλέπει ο χρήστης οπουδήποτε. Όταν δεν
            υπάρχει πρόβλημα, η λωρίδα δεν αποδίδει τίποτα — ούτε κενό. */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in">
          <SoftoneConnectionBar />
          {children}
        </main>
      </div>
      <AdminBottomNav user={{ name: user.name, email: user.email }} roleName={user.role.name} roleKey={user.role.key ?? null} permissionKeys={permissionKeys} badges={{ orderRequests, appointments, contractInbox: contractQuestions, offerRequests, customerChanges }} />
      {canAssistant && <AirJordanLauncher canMemory={canAssistantMemory} />}
      {canTextAssist && <TextAssistLayer />}
    </div>
  );
}
