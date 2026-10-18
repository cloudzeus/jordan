// Canonical permission catalog. Add new entries here; the seed will sync them to DB.
// key = "<resource>.<action>".

export type PermissionDef = {
  key: string;
  resource: string;
  action: string;
  description: string;
};

export const PERMISSIONS: PermissionDef[] = [
  // Users
  { key: 'users.read', resource: 'users', action: 'read', description: 'View users' },
  { key: 'users.create', resource: 'users', action: 'create', description: 'Create users' },
  { key: 'users.update', resource: 'users', action: 'update', description: 'Update users' },
  { key: 'users.delete', resource: 'users', action: 'delete', description: 'Delete users' },
  { key: 'users.assign_role', resource: 'users', action: 'assign_role', description: 'Assign role to user' },
  { key: 'users.softone_link', resource: 'users', action: 'softone_link', description: 'Σύνδεση χρηστών του προσωπικού με χρήστες SoftOne' },

  // Roles
  { key: 'roles.read', resource: 'roles', action: 'read', description: 'View roles' },
  { key: 'roles.create', resource: 'roles', action: 'create', description: 'Create roles' },
  { key: 'roles.update', resource: 'roles', action: 'update', description: 'Update roles' },
  { key: 'roles.delete', resource: 'roles', action: 'delete', description: 'Delete roles' },
  { key: 'roles.reorder', resource: 'roles', action: 'reorder', description: 'Reorder roles' },

  // Permissions
  { key: 'permissions.read', resource: 'permissions', action: 'read', description: 'View permissions' },
  { key: 'permissions.assign', resource: 'permissions', action: 'assign', description: 'Grant/revoke permissions' },
  { key: 'permissions.reorder', resource: 'permissions', action: 'reorder', description: 'Reorder permissions' },

  // Imports

  // Media
  { key: 'media.read',   resource: 'media', action: 'read',   description: 'View media gallery' },
  { key: 'media.upload', resource: 'media', action: 'upload', description: 'Upload media files' },
  { key: 'media.delete', resource: 'media', action: 'delete', description: 'Delete media files/folders' },
  { key: 'media.manage_folders', resource: 'media', action: 'manage_folders', description: 'Create/rename folders' },

  // Companies
  { key: 'companies.read', resource: 'companies', action: 'read', description: 'View companies' },
  { key: 'companies.create', resource: 'companies', action: 'create', description: 'Create companies' },
  { key: 'companies.update', resource: 'companies', action: 'update', description: 'Update companies' },
  { key: 'companies.delete', resource: 'companies', action: 'delete', description: 'Delete companies' },
  { key: 'companies.manage_types', resource: 'companies', action: 'manage_types', description: 'Manage company types (sodtype)' },

  // ΚΑΔ master registry
  { key: 'kad.read', resource: 'kad', action: 'read', description: 'View ΚΑΔ registry' },
  { key: 'kad.manage', resource: 'kad', action: 'manage', description: 'Create/update ΚΑΔ master entries' },

  // Reference data (ΓΕΜΗ metadata: νομικές μορφές, νομοί, δήμοι, υπηρεσίες ΓΕΜΗ…)
  { key: 'metadata.read', resource: 'metadata', action: 'read', description: 'View reference lookup tables' },
  { key: 'metadata.manage', resource: 'metadata', action: 'manage', description: 'Refresh ΓΕΜΗ metadata + edit lookups' },

  // OCR / Intelligent document extraction
  { key: 'ocr.read',   resource: 'ocr', action: 'read',   description: 'View OCR documents' },
  { key: 'ocr.create', resource: 'ocr', action: 'create', description: 'Upload & extract documents' },
  { key: 'ocr.delete', resource: 'ocr', action: 'delete', description: 'Delete OCR documents' },
  { key: 'ocr.categorize', resource: 'ocr', action: 'categorize', description: 'Set category / notes on OCR documents' },
  { key: 'ocr.post', resource: 'ocr', action: 'post', description: 'Post OCR document to SoftOne' },

  // European funding programs (ΕΣΠΑ / EU calls)

  // ── Operations ──
  // Έργα (SoftOne PRJC: προϋπολογισμός, δραστηριότητα)
  { key: 'projects.read', resource: 'projects', action: 'read', description: 'Προβολή έργων' },
  { key: 'projects.manage', resource: 'projects', action: 'manage', description: 'Επεξεργασία έργων και προϋπολογισμού' },
  { key: 'projects.financials', resource: 'projects', action: 'financials', description: 'Οικονομικά έργων: τιμολογήσεις, εισπράξεις, κόστος, καθαρό κέρδος, ποσοστά γενικών εξόδων' },
  // Δυναμικές προσφορές (κοινό container, PRICEW01–08)
  { key: 'dynamic_offers.read', resource: 'dynamic_offers', action: 'read', description: 'Προβολή δυναμικών προσφορών' },
  { key: 'dynamic_offers.manage', resource: 'dynamic_offers', action: 'manage', description: 'Δημιουργία/επεξεργασία, δημοσίευση, παραλήπτες, email, τιμές στο SoftOne' },
  { key: 'dynamic_offers.reservations', resource: 'dynamic_offers', action: 'reservations', description: 'Κρατήσεις: νέα, ακύρωση, έγκριση/απόρριψη αιτημάτων του portal' },
  // Πληρωμές Viva για τις κρατήσεις (αίτημα πληρωμής, επιστροφές)
  { key: 'payments.read', resource: 'payments', action: 'read', description: 'Προβολή κατάστασης πληρωμών Viva στις κρατήσεις' },
  { key: 'payments.manage', resource: 'payments', action: 'manage', description: 'Αίτημα πληρωμής: αποστολή/επαναποστολή, έλεγχος στο Viva, ακύρωση' },
  { key: 'payments.refund', resource: 'payments', action: 'refund', description: 'Επιστροφή χρημάτων μέσω Viva (διαφορά τιμής στο κλείσιμο, ακυρωμένη κράτηση)' },
  // Αιτήματα παραγγελίας από το B2B portal (αποθηκεύονται στην εφαρμογή, όχι στο SoftOne)
  { key: 'order_requests.read', resource: 'order_requests', action: 'read', description: 'Προβολή αιτημάτων παραγγελίας πελατών από το portal' },
  { key: 'order_requests.manage', resource: 'order_requests', action: 'manage', description: 'Επεξεργασία/επιβεβαίωση/απόρριψη αιτημάτων παραγγελίας' },
  // Ραντεβού στο atelier (website) & leads/newsletter
  { key: 'appointments.read', resource: 'appointments', action: 'read', description: 'Προβολή ημερολογίου ραντεβού στο atelier' },
  { key: 'appointments.manage', resource: 'appointments', action: 'manage', description: 'Επιβεβαίωση/ακύρωση/μεταφορά ραντεβού, ωράριο και αποκλεισμοί' },
  { key: 'appointments.schedule', resource: 'appointments', action: 'schedule', description: 'Νέο ραντεβού με πελάτη/συνεργάτη σε όποια μέρα/ώρα — και νέα καρτέλα πελάτη στο SoftOne' },
  { key: 'leads.read', resource: 'leads', action: 'read', description: 'Προβολή leads και συνδρομητών newsletter του website' },
  { key: 'leads.manage', resource: 'leads', action: 'manage', description: 'Αποστολή leads στο SoftOne, διαγραφή συνδρομητών newsletter' },
  // Συνεργάτες
  { key: 'partners.read', resource: 'partners', action: 'read', description: 'Προβολή συνεργατών' },
  { key: 'partners.manage', resource: 'partners', action: 'manage', description: 'Επεξεργασία συνεργατών, επαφών, πελατών και έργων τους' },
  { key: 'partners.access', resource: 'partners', action: 'access', description: 'Πρόσβαση συνεργατών στο portal (χρήστης/κωδικός)' },
  // Κατηγορίες & ομάδες ειδών (SoftOne)
  { key: 'classifications.read', resource: 'classifications', action: 'read', description: 'Προβολή κατηγοριών & ομάδων' },
  { key: 'classifications.manage', resource: 'classifications', action: 'manage', description: 'Δημιουργία/μετονομασία κατηγοριών & υποομάδων στο SoftOne' },
  // Μονάδες μέτρησης (SoftOne MTRUNIT)
  { key: 'units.read', resource: 'units', action: 'read', description: 'Προβολή μονάδων μέτρησης' },
  { key: 'units.manage', resource: 'units', action: 'manage', description: 'Δημιουργία/επεξεργασία μονάδων μέτρησης στο SoftOne' },
  // Είδη — ευαίσθητες ενέργειες
  { key: 'items.unit2_override', resource: 'items', action: 'unit2_override', description: 'Αλλαγή Μ.Μ.2 μέσω script σε είδος με παραστατικά (παράκαμψη ελέγχου SoftOne)' },
  // Αρχεία πελατών/προμηθευτών & έργων (AutoCAD, PDF, Excel, Word στο Bunny — ιδιωτικά)
  { key: 'files.read', resource: 'files', action: 'read', description: 'Προβολή και λήψη αρχείων πελατών, προμηθευτών και έργων' },
  { key: 'files.manage', resource: 'files', action: 'manage', description: 'Ανέβασμα, μετονομασία, μετακίνηση, διαγραφή αρχείων και φακέλων' },
  // Air Jordan — βοηθός AI (μόνο ADMIN / SUPER_ADMIN: ο ρόλος ελέγχεται ΚΑΙ στον server, όποιος κι αν πάρει το δικαίωμα)
  { key: 'assistant.use', resource: 'assistant', action: 'use', description: 'Air Jordan: ερωτήσεις (κείμενο/φωνή) για έργα, συναλλασσόμενους, υλικά — μόνο ανάγνωση' },
  { key: 'assistant.memory', resource: 'assistant', action: 'memory', description: 'Air Jordan: διαχείριση μνήμης (ό,τι έμαθε) και επανευρετηρίαση' },

  // System
  { key: 'system.audit', resource: 'system', action: 'audit', description: 'View audit log' },
  { key: 'system.settings', resource: 'system', action: 'settings', description: 'Modify system settings' },
  { key: 'system.backups', resource: 'system', action: 'backups', description: 'Manage database backups' },
];

// Default permission keys per system role.
export const ROLE_DEFAULTS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.key), // all
  ADMIN: [
    'users.read', 'users.create', 'users.update', 'users.assign_role', 'users.softone_link',
    'roles.read',
    'permissions.read',
    'companies.read', 'companies.create', 'companies.update', 'companies.delete', 'companies.manage_types',
    'kad.read', 'kad.manage',
    'metadata.read', 'metadata.manage',
    'ocr.read', 'ocr.create', 'ocr.delete', 'ocr.categorize', 'ocr.post',
    'projects.read', 'projects.manage', 'projects.financials',
    'dynamic_offers.read', 'dynamic_offers.manage', 'dynamic_offers.reservations',
    'payments.read', 'payments.manage', 'payments.refund',
    'order_requests.read', 'order_requests.manage',
    'appointments.read', 'appointments.manage', 'appointments.schedule', 'leads.read', 'leads.manage',
    'partners.read', 'partners.manage', 'partners.access',
    'classifications.read', 'classifications.manage',
    'units.read', 'units.manage',
    'items.unit2_override',
    'files.read', 'files.manage',
    'assistant.use', 'assistant.memory',
  ],
  EMPLOYEE: ['users.read', 'appointments.read', 'appointments.manage', 'appointments.schedule', 'leads.read'],
  COLLABORATOR: ['users.read'],
  SUPPLIER: [],
  CUSTOMER: [],
};

/** Ελληνικές ετικέτες ομάδων για τη σελίδα «Δικαιώματα» (ό,τι λείπει εμφανίζεται με το κλειδί). */
export const RESOURCE_LABELS: Record<string, string> = {
  users: 'Χρήστες', roles: 'Ρόλοι', permissions: 'Δικαιώματα', media: 'Media', companies: 'Εταιρείες',
  kad: 'ΚΑΔ', metadata: 'Μητρώα αναφοράς', ocr: 'OCR / Έγγραφα', system: 'Σύστημα',
  projects: 'Έργα', dynamic_offers: 'Δυναμικές προσφορές', payments: 'Πληρωμές (Viva)', order_requests: 'Αιτήματα παραγγελίας', appointments: 'Ραντεβού', leads: 'Leads & newsletter', partners: 'Συνεργάτες',
  classifications: 'Κατηγορίες & ομάδες', units: 'Μονάδες μέτρησης', items: 'Είδη', files: 'Αρχεία πελατών & έργων', assistant: 'Air Jordan (βοηθός AI)',
};

/**
 * Μετάβαση από τα γενικά metadata.* στα δικαιώματα ανά ενότητα: όποιος ρόλος είχε το «παλιό» παίρνει
 * τα νέα, ώστε κανείς να μη χάσει πρόσβαση (scripts/sync-permissions.ts). ΔΕΝ περιλαμβάνει το
 * items.unit2_override — αυτό δίνεται μόνο ρητά (προεπιλογή: SUPER_ADMIN/ADMIN).
 */
export const LEGACY_GRANTS: Record<string, string[]> = {
  'metadata.read': ['projects.read', 'dynamic_offers.read', 'partners.read', 'classifications.read', 'units.read', 'files.read'],
  'metadata.manage': [
    'projects.manage', 'projects.financials', 'dynamic_offers.manage', 'dynamic_offers.reservations',
    'partners.manage', 'partners.access', 'classifications.manage', 'units.manage', 'files.manage',
  ],
};

export const SYSTEM_ROLES: Array<{ key: string; name: string; description: string; order: number }> = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Πλήρης πρόσβαση στο σύστημα', order: 0 },
  { key: 'ADMIN', name: 'Administrator', description: 'Διαχείριση χρηστών και ομάδων', order: 1 },
  { key: 'EMPLOYEE', name: 'Employee', description: 'Εσωτερικός χρήστης', order: 2 },
  { key: 'COLLABORATOR', name: 'Collaborator', description: 'Εξωτερικός συνεργάτης', order: 3 },
  { key: 'SUPPLIER', name: 'Supplier', description: 'Προμηθευτής', order: 4 },
  { key: 'CUSTOMER', name: 'Customer', description: 'Πελάτης', order: 5 },
];
