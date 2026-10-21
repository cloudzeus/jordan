import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const prisma = vi.hoisted(() => ({
  contractParty: { findMany: vi.fn() },
  contractDocument: { findFirst: vi.fn() },
  contract: { findMany: vi.fn(), findFirst: vi.fn() },
  softoneTrader: { findUnique: vi.fn() },
  entityFile: { findUnique: vi.fn() },
  softoneProject: { findMany: vi.fn() },
  projectTaskFile: { findFirst: vi.fn() },
  projectTaskParty: { findMany: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/project-tasks', () => ({ listTasks: vi.fn() }));
const transition = vi.hoisted(() => vi.fn());
vi.mock('@/lib/contracts/service', () => ({ transition, ContractError: class extends Error {} }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => null) }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(async () => 'off') }));
vi.mock('@/lib/mailgun', () => ({ mailgunConfig: () => ({ address: 'x@y' }), sendTransactionalEmail: vi.fn() }));
vi.mock('@/lib/email/brand', () => ({ emailBrand: vi.fn(async () => ({})) }));

import { partyAssignments, partyContractDocFile, partyTaskFile, paymentSummary, type PartyAssignment } from '../portal-party';
import { AcceptError, customerAcceptContract, customerContractDocFile, customerContracts } from '../portal-customer';

const crew = { partnerId: null, supplierTrdr: 501 } as const;
const partner = { partnerId: 'p1', supplierTrdr: null } as const;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.contractParty.findMany.mockResolvedValue([]);
  prisma.softoneProject.findMany.mockResolvedValue([]);
});

describe('portal συνεργείων — μόνο ό,τι τους ανατέθηκε', () => {
  it('συνεργείο: φίλτρο ΠΡΟΜΗΘΕΥΤΗ με το δικό του TRDR και μόνο συμβάσεις που τρέχουν', async () => {
    await partyAssignments(crew);
    const where = prisma.contractParty.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: 'SUPPLIER', trdr: 501 });
    expect(where.contract.status.in).toEqual(['ACCEPTED', 'ACTIVE', 'COMPLETED']);
    expect(where).not.toHaveProperty('partnerId');
  });

  it('συνεργάτης: φίλτρο με partnerId', async () => {
    await partyAssignments(partner);
    expect(prisma.contractParty.findMany.mock.calls[0][0].where).toMatchObject({ partnerId: 'p1' });
  });

  it('η αμοιβή = άθροισμα crewFee ΜΟΝΟ των γραμμών του· η τιμή πώλησης δεν βγαίνει', async () => {
    prisma.contractParty.findMany.mockResolvedValue([{
      id: 'party1', specialty: 'Πλακάς', scope: null,
      contract: { id: 'c1', number: 7, title: 'Μπάνιο', status: 'ACTIVE', startDate: null, endDate: null, prjc: null, customerName: 'Χ', siteFormatted: null, siteAddress: null, siteCity: null, siteLat: null, siteLng: null },
      lines: [
        { id: 'l1', name: 'Τοποθέτηση', qty: 10, unit: 'm²', crewFee: 150, notes: null, partyId: 'party1', unitPrice: 40 },
        { id: 'l2', name: 'Αρμολόγημα', qty: 10, unit: 'm²', crewFee: 50, notes: null, partyId: 'party1', unitPrice: 12 },
      ],
      milestones: [], documents: [],
    }]);
    const [a] = await partyAssignments(crew);
    expect(a.feeTotal).toBe(200);
    expect(a.ref).toBe('ΣΥΜ-000007');
    expect(JSON.stringify(a)).not.toContain('unitPrice');
  });

  it('έγγραφο: μόνο ανάθεσης (PARTY) του ίδιου, σε σύμβαση που τρέχει', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue(null);
    expect(await partyContractDocFile(crew, 'd1')).toBeNull();
    const where = prisma.contractDocument.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'd1', audience: 'PARTY', party: { kind: 'SUPPLIER', trdr: 501 } });
    expect(where.contract.status.in).not.toContain('DRAFT');
  });

  it('αρχείο εργασίας: μόνο εργασίας όπου είναι εμπλεκόμενος', async () => {
    prisma.projectTaskFile.findFirst.mockResolvedValue(null);
    await partyTaskFile(partner, 'f1');
    expect(prisma.projectTaskFile.findFirst.mock.calls[0][0].where).toEqual({ fileId: 'f1', task: { parties: { some: { kind: 'PARTNER', partnerId: 'p1' } } } });
  });
});

describe('πληρωμές από ορόσημα', () => {
  const a = (ms: [string, number, string | null][]): PartyAssignment => ({
    contractId: 'c', ref: 'ΣΥΜ-1', title: 'Τ', status: 'ACTIVE', statusLabel: '', startDate: null, endDate: null,
    site: { line: null, lat: null, lng: null }, prjc: null, projectName: null, customerName: null, specialty: null, scope: null,
    lines: [], feeTotal: 0, documents: [],
    milestones: ms.map(([status, amount, dueDate], i) => ({ id: `m${i}`, title: `Μ${i}`, deliverables: null, dueDate, amount, status, paidAt: status === 'PAID' ? '2026-10-01T00:00:00Z' : null })),
  });
  it('πληρώθηκαν / οφείλονται / έρχονται, και η επόμενη πρώτα κατά ημερομηνία', () => {
    const s = paymentSummary([a([['PAID', 100, '2026-09-01'], ['DONE', 300, '2026-10-30'], ['PENDING', 500, '2026-10-25'], ['PENDING', 50, null]])]);
    expect([s.paid, s.due, s.upcoming]).toEqual([100, 300, 550]);
    expect(s.next.map((m) => m.amount)).toEqual([500, 300, 50]);
    expect(s.history).toHaveLength(1);
  });
});

describe('portal πελάτη — προσφορές & συμβάσεις', () => {
  it('μόνο δικές του, όχι πρόχειρα· ορόσημα χωρίς συνεργείο· μόνο έγγραφα πελάτη', async () => {
    prisma.contract.findMany.mockResolvedValue([]);
    await customerContracts(42);
    const q = prisma.contract.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ trdr: 42 });
    expect(q.where.status.in).not.toContain('DRAFT');
    expect(q.include.milestones.where).toEqual({ partyId: null });
    expect(q.include.documents.where).toEqual({ audience: 'CUSTOMER' });
    expect(q.include.lines.select).not.toHaveProperty('crewFee');
    expect(q.include.lines.select).not.toHaveProperty('partyId');
  });

  it('PDF: μόνο έγγραφο CUSTOMER δικής του σύμβασης', async () => {
    prisma.contractDocument.findFirst.mockResolvedValue({ fileId: 'f9' });
    prisma.entityFile.findUnique.mockResolvedValue({ id: 'f9' });
    expect(await customerContractDocFile(42, 'd1')).toEqual({ id: 'f9' });
    expect(prisma.contractDocument.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'd1', audience: 'CUSTOMER', contract: { trdr: 42 } });
  });
});

describe('αποδοχή προσφοράς από τον πελάτη', () => {
  const by = { id: 'u1', email: 'c@x.gr', name: 'Ν' };
  const offer = (o: object = {}) => ({ id: 'k1', number: 2, title: 'Δάπεδο', status: 'SENT', validUntil: null, vatRate: 24, lines: [{ qty: 1, unitPrice: 100, discount: 0 }], ...o });

  it('μόνο δική του: αναζήτηση με το TRDR του χρήστη', async () => {
    prisma.contract.findFirst.mockResolvedValue(null);
    await expect(customerAcceptContract(42, 'k1', by)).rejects.toBeInstanceOf(AcceptError);
    expect(prisma.contract.findFirst.mock.calls[0][0].where).toEqual({ id: 'k1', trdr: 42 });
    expect(transition).not.toHaveBeenCalled();
  });

  it('όχι αν δεν είναι «Στάλθηκε» ή αν έληξε', async () => {
    prisma.contract.findFirst.mockResolvedValue(offer({ status: 'ACTIVE' }));
    await expect(customerAcceptContract(42, 'k1', by)).rejects.toThrow(/ήδη/);
    prisma.contract.findFirst.mockResolvedValue(offer({ validUntil: new Date('2020-01-01') }));
    await expect(customerAcceptContract(42, 'k1', by)).rejects.toThrow(/έληξε/);
    expect(transition).not.toHaveBeenCalled();
  });

  it('έγκυρη προσφορά → ίδια μετάβαση με το admin (accept) από τον χρήστη της πύλης', async () => {
    prisma.contract.findFirst.mockResolvedValue(offer({ validUntil: new Date('2099-01-01') }));
    await customerAcceptContract(42, 'k1', by);
    expect(transition).toHaveBeenCalledWith('k1', 'accept', 'u1');
  });
});
