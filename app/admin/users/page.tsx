import { FiUsers } from 'react-icons/fi';
import { prisma } from '@/lib/db';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/admin/page-header';
import { UsersTable } from './users-table';
import { NewUserButton } from './new-user-button';

export default async function AdminUsersPage() {
  await requirePermission('users.read');
  const [users, roles, canLinkSoftone, canViewAs] = await Promise.all([
    prisma.user.findMany({ include: { role: true }, orderBy: { createdAt: 'desc' } }),
    prisma.role.findMany({ orderBy: { order: 'asc' } }),
    hasPermission('users.softone_link'),
    hasPermission('portal.view_as'),
  ]);

  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name ?? '',
    roleId: u.roleId,
    roleName: u.role.name,
    isActive: u.isActive,
    preferredLocales: u.preferredLocales,
    emailVerified: u.emailVerified?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    // Προσωπικό = όχι πελάτης/προμηθευτής/συνεργάτης του portal· μόνο αυτοί συνδέονται με χρήστη SoftOne.
    isStaff: !['CUSTOMER', 'SUPPLIER', 'COLLABORATOR'].includes(u.role.key ?? ''),
    softoneUserId: u.softoneUserId,
    softoneUserName: u.softoneUserName,
  }));

  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiUsers />}
        title="Χρήστες"
        description="Διαχείριση χρηστών, ανάθεση ρόλων και κατάσταση λογαριασμού."
        helpAnchor="users"
        actions={<NewUserButton roles={roleOptions} />}
      />
      <UsersTable rows={rows} roles={roleOptions} canLinkSoftone={canLinkSoftone} canViewAs={canViewAs} />
    </div>
  );
}
