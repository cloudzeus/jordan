import { requireStaff } from '@/lib/rbac';
import { AdminSidebar, AdminBottomNav } from '@/components/admin/sidebar';
import { DEFAULT_LOCALE, isValidLocale, type LocaleCode } from '@/i18n/locales';
import { SoftoneConnectionBar } from '@/components/admin/softone-connection-bar';
import { countPendingOrderRequests } from '@/lib/order-requests';
import { countPendingAppointments } from '@/lib/appointments';
import { AirJordanLauncher } from '@/components/assistant/air-jordan-launcher';
import { assistantAllowed } from '@/lib/assistant/access-rules';

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
  const [orderRequests, appointments] = await Promise.all([
    canSeeRequests ? countPendingOrderRequests().catch(() => 0) : 0,
    canSeeAppointments ? countPendingAppointments().catch(() => 0) : 0,
  ]);

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar
        user={{ name: user.name, email: user.email }}
        roleName={user.role.name}
        roleKey={user.role.key ?? null}
        locale={locale}
        permissionKeys={permissionKeys}
        badges={{ orderRequests, appointments }}
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
      <AdminBottomNav user={{ name: user.name, email: user.email }} roleName={user.role.name} roleKey={user.role.key ?? null} permissionKeys={permissionKeys} badges={{ orderRequests, appointments }} />
      {canAssistant && <AirJordanLauncher canMemory={canAssistantMemory} />}
    </div>
  );
}
