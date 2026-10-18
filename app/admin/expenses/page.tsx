import { FiBookOpen } from 'react-icons/fi';
import { prisma } from '@/lib/db';
import { requirePermission, hasPermission } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { PageHeader } from '@/components/admin/page-header';
import { cachedClassificationLabeller } from '@/lib/ocr/mydata-labels';
import { checkAccounts } from '@/lib/ocr/account-check';
import { vatLabeller } from '@/lib/vat-label';
import { ExpensesTabs } from './expenses-tabs';
import { EXPENSE_TABS } from './tabs';

export const dynamic = 'force-dynamic';

// Λογιστικά μητρώα SoftOne (μόνο ανάγνωση/συγχρονισμός): έξοδα, χρεοπιστώσεις, κατηγορίες δαπανών,
// χαρακτηρισμοί myDATA και αναλυτική (κέντρα κόστους, έργα, δραστηριότητες). Ο ΦΠΑ εμφανίζεται ως
// ποσοστό, όχι ως κωδικός SoftOne (lib/vat-label.ts).
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission('metadata.read');
  const sp = await searchParams;
  const initialTab = (EXPENSE_TABS as readonly string[]).includes(sp.tab ?? '') ? sp.tab! : 'expenses';
  const [
    expenses, lineItems, lineCategories, classTypes, classCategories, costCenters, projects, projectStages, vatRows,
    canManage, expensesLastSync, lineItemsLastSync, lineCategoriesLastSync, myDataClassesLastSync,
    costCentersLastSync, projectsLastSync, projectStagesLastSync, chartRows,
  ] = await Promise.all([
    prisma.softoneExpense.findMany({ orderBy: { name: 'asc' } }),
    prisma.softoneLineItem.findMany({ orderBy: { name: 'asc' } }),
    prisma.softoneLineCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.softoneMyDataClassType.findMany({ orderBy: [{ sotype: 'asc' }, { code: 'asc' }] }),
    prisma.softoneMyDataClassCategory.findMany({ orderBy: [{ sotype: 'asc' }, { code: 'asc' }] }),
    prisma.softoneCostCenter.findMany({ orderBy: { name: 'asc' } }),
    prisma.softoneProject.findMany({ orderBy: { name: 'asc' } }),
    prisma.softoneProjectStage.findMany({ orderBy: { name: 'asc' } }),
    prisma.vatCategory.findMany({ select: { code: true, descr: true, rate: true } }),
    hasPermission('metadata.manage'),
    getSetting<string>('integrations.softoneExpensesLastSync'),
    getSetting<string>('integrations.softoneLineItemsLastSync'),
    getSetting<string>('integrations.softoneLineCategoriesLastSync'),
    getSetting<string>('integrations.softoneMyDataClassesLastSync'),
    getSetting<string>('integrations.softoneCostCentersLastSync'),
    getSetting<string>('integrations.softoneProjectsLastSync'),
    getSetting<string>('integrations.softoneProjectStagesLastSync'),
    // Ο έλεγχος λογαριασμού για ΟΛΕΣ τις χρεοπιστώσεις — ο ίδιος που τρέχει πριν την καταχώριση.
    // Ολόκληρο το σχέδιο (~4.700 σύντομες γραμμές), μαζί με τα υπόλοιπα. Δεν φεύγει προς τον browser.
    prisma.softoneAccount.findMany({ select: { code: true, name: true, isActive: true, postable: true } }),
  ]);
  const accountCheck = checkAccounts(
    lineItems.map((l, i) => ({
      rowIndex: i, path: 'LINLINES' as const, article: `${l.code} — ${l.name}`,
      acnmsk: l.acnmsk, acnmskKnown: l.acnmskSyncedAt != null,
    })),
    { synced: chartRows.length > 0, accounts: chartRows },
  );
  const vat = vatLabeller(vatRows);
  const vatOf = (code: string | null) => { const v = vat(code); return { vat: v?.label ?? null, vatTitle: v?.title ?? null }; };

  // Ο χαρακτηρισμός myDATA μεταφράζεται ΕΔΩ (server): το UI δείχνει ελληνικά, όχι κωδικούς. Είναι
  // ιδιότητα του μητρώου — η εφαρμογή δεν τον γράφει ποτέ.
  const label = await cachedClassificationLabeller();
  const categoryName = new Map(lineCategories.map((c) => [c.mtrCategory, c.name || c.code]));
  const lineItemsPerCategory = new Map<number, number>();
  for (const l of lineItems) {
    if (l.mtrCategory == null) continue;
    lineItemsPerCategory.set(l.mtrCategory, (lineItemsPerCategory.get(l.mtrCategory) ?? 0) + 1);
  }
  const n = (x: number) => x.toLocaleString('el-GR');

  return (
    <div className="w-full">
      <PageHeader
        icon={<FiBookOpen />}
        title="Έξοδα & λογιστικά"
        description={`Μητρώα SoftOne: ${n(expenses.length)} έξοδα, ${n(lineItems.length)} χρεοπιστώσεις, ${n(lineCategories.length)} κατηγορίες δαπανών, χαρακτηρισμοί myDATA και αναλυτική.`}
        helpAnchor="expenses"
      />
      <ExpensesTabs
        initialTab={initialTab}
        expenses={expenses.map((e) => ({ expn: e.expn, code: e.code, name: e.name, ...vatOf(e.vat), isActive: e.isActive }))}
        lineItems={lineItems.map((l, i) => ({
          mtrl: l.mtrl, code: l.code, name: l.name, ...vatOf(l.vat),
          account: accountCheck.lines[i] ?? null,
          accountText: [l.acnmsk, accountCheck.lines[i]?.accountName].filter(Boolean).join(' '),
          category: l.mtrCategory != null ? categoryName.get(l.mtrCategory) ?? null : null,
          myData: label({ classType: l.classType, classCategory: l.classCategory, myDataCode: l.myDataCode }).label,
          isActive: l.isActive,
        }))}
        lineCategories={lineCategories.map((c) => ({
          mtrCategory: c.mtrCategory, code: c.code, name: c.name, ...vatOf(c.vat), acnmsk: c.acnmsk,
          sodtypeFiltered: c.sodtypeFiltered,
          lineItems: lineItemsPerCategory.get(c.mtrCategory) ?? 0,
          isActive: c.isActive,
        }))}
        myDataClasses={[
          ...classTypes.map((t) => ({ kind: 'type' as const, sotype: t.sotype, code: t.code, myDataCode: t.myDataCode, name: t.name })),
          ...classCategories.map((c) => ({ kind: 'category' as const, sotype: c.sotype, code: c.code, myDataCode: c.myDataCode, name: c.name })),
        ]}
        costCenters={costCenters.map((c) => ({
          id: c.costcntr, code: c.code, name: c.name,
          sub: [c.sohCode, c.acnmsk].filter(Boolean).join(' · ') || null,
        }))}
        projects={projects.map((c) => ({
          id: c.prjc, code: c.code, name: c.name, sub: c.trdr ? `TRDR ${c.trdr}` : null,
        }))}
        projectStages={projectStages.map((c) => ({ id: c.prjcStage, code: c.code, name: c.name, sub: null }))}
        canManage={canManage}
        expensesLastSync={expensesLastSync ?? null}
        lineItemsLastSync={lineItemsLastSync ?? null}
        lineCategoriesLastSync={lineCategoriesLastSync ?? null}
        myDataClassesLastSync={myDataClassesLastSync ?? null}
        costCentersLastSync={costCentersLastSync ?? null}
        projectsLastSync={projectsLastSync ?? null}
        projectStagesLastSync={projectStagesLastSync ?? null}
      />
    </div>
  );
}
