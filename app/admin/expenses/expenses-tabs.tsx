'use client';

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ExpensesTableClient, type ExpenseRecord } from '@/components/admin/expenses-table-client';
import { LineItemsTableClient, type LineItemRecord } from '@/components/admin/lineitems-table-client';
import { LineCategoriesTableClient, type LineCategoryRecord } from '@/components/admin/line-categories-table-client';
import { MyDataClassesTableClient, type MyDataClassRecord } from '@/components/admin/mydata-classes-table-client';
import { AnalyticsTableClient, type AnalyticsRecord } from '@/components/admin/analytics-tables-client';

/**
 * Λογιστικά μητρώα SoftOne που τροφοδοτούν την αντιστοίχιση γραμμών: έξοδα (EXPN), ΧΡΕΟΠΙΣΤΩΣΕΙΣ
 * (MTRL 53 — οι γραμμές «Ειδικών συναλλαγών») και οι κατηγορίες δαπανών τους (MTRCATEGORY 53), οι
 * λίστες χαρακτηρισμού myDATA και η αναλυτική (κέντρα κόστους, έργα, δραστηριότητες). Τα είδη και οι
 * υπηρεσίες έχουν δικές τους σελίδες. Κάθε tab έχει τον δικό του συγχρονισμό — όλοι μόνο ΑΝΑΓΝΩΣΗ.
 */
export function ExpensesTabs({
  initialTab = 'expenses',
  expenses,
  lineItems,
  lineCategories,
  myDataClasses,
  costCenters,
  projects,
  projectStages,
  canManage,
  expensesLastSync,
  lineItemsLastSync,
  lineCategoriesLastSync,
  myDataClassesLastSync,
  costCentersLastSync,
  projectsLastSync,
  projectStagesLastSync,
}: {
  /** Από το `?tab=` — ώστε να ανοίγει απευθείας π.χ. στις χρεοπιστώσεις. */
  initialTab?: string;
  expenses: ExpenseRecord[];
  lineItems: LineItemRecord[];
  lineCategories: LineCategoryRecord[];
  myDataClasses: MyDataClassRecord[];
  costCenters: AnalyticsRecord[];
  projects: AnalyticsRecord[];
  projectStages: AnalyticsRecord[];
  canManage: boolean;
  expensesLastSync: string | null;
  lineItemsLastSync: string | null;
  lineCategoriesLastSync: string | null;
  myDataClassesLastSync: string | null;
  costCentersLastSync: string | null;
  projectsLastSync: string | null;
  projectStagesLastSync: string | null;
}) {
  const [tab, setTab] = React.useState(initialTab);
  // Το tab στη διεύθυνση (χωρίς πλοήγηση): ανανέωση/κοινοποίηση συνδέσμου κρατά το ίδιο μητρώο.
  const choose = (v: string) => {
    setTab(v);
    const u = new URL(window.location.href);
    u.searchParams.set('tab', v);
    window.history.replaceState(null, '', u);
  };
  const count = (n: number) => n.toLocaleString('el-GR');
  const GROUPS = [
    { label: 'Λογιστικά', tabs: [
      { value: 'expenses', label: 'Έξοδα', n: expenses.length }, { value: 'lineitems', label: 'Χρεοπιστώσεις', n: lineItems.length },
      { value: 'linecategories', label: 'Κατηγορίες δαπανών', n: lineCategories.length }, { value: 'mydata', label: 'myDATA', n: myDataClasses.length },
    ] },
    { label: 'Αναλυτική', tabs: [
      { value: 'costcenters', label: 'Κέντρα κόστους', n: costCenters.length }, { value: 'projects', label: 'Έργα', n: projects.length },
      { value: 'projectstages', label: 'Δραστηριότητες', n: projectStages.length },
    ] },
  ];

  return (
    <Tabs value={tab} onValueChange={choose} className="w-full">
      {/* Τα 7 μητρώα σε δύο ομάδες, σε μία γραμμή που κυλά οριζόντια (όχι αναδίπλωση/κόψιμο). */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <TabsList className="h-auto w-max flex-nowrap gap-0.5">
          {GROUPS.map((g, gi) => (
            <React.Fragment key={g.label}>
              {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />}
              <span className="hidden px-1.5 text-[length:var(--fs-10)] font-semibold uppercase tracking-wide text-muted-foreground/70 lg:inline">{g.label}</span>
              {g.tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="flex-none cursor-pointer gap-1.5 px-2.5">
                  {t.label}
                  <span className="rounded bg-foreground/5 px-1 text-[length:var(--fs-10)] tabular-nums text-muted-foreground">{count(t.n)}</span>
                </TabsTrigger>
              ))}
            </React.Fragment>
          ))}
        </TabsList>
      </div>
      <TabsContent value="expenses">
        <ExpensesTableClient rows={expenses} canManage={canManage} lastSync={expensesLastSync} />
      </TabsContent>
      <TabsContent value="lineitems">
        <LineItemsTableClient rows={lineItems} canManage={canManage} lastSync={lineItemsLastSync} />
      </TabsContent>
      <TabsContent value="linecategories">
        <LineCategoriesTableClient rows={lineCategories} canManage={canManage} lastSync={lineCategoriesLastSync} />
      </TabsContent>
      <TabsContent value="mydata">
        <MyDataClassesTableClient rows={myDataClasses} canManage={canManage} lastSync={myDataClassesLastSync} />
      </TabsContent>
      <TabsContent value="costcenters">
        <AnalyticsTableClient
          rows={costCenters} canManage={canManage} lastSync={costCentersLastSync}
          endpoint="sync-costcenters-softone" title="Κέντρα κόστους" subHeader="Ιεραρχία / Λογ/σμός"
          hint="Μπαίνουν ανά γραμμή σε Είδη, Υπηρεσίες και Ειδικές συναλλαγές. Η «Ανάλυση εξόδων» δεν έχει κέντρο κόστους."
        />
      </TabsContent>
      <TabsContent value="projects">
        <AnalyticsTableClient
          rows={projects} canManage={canManage} lastSync={projectsLastSync}
          endpoint="sync-projects-softone" title="Έργα" subHeader="Συναλλασσόμενος"
          hint="Στην ουρά εμφανίζονται πρώτα τα έργα του εκδότη του παραστατικού· με ένα κλικ βλέπεις όλα."
        />
      </TabsContent>
      <TabsContent value="projectstages">
        <AnalyticsTableClient
          rows={projectStages} canManage={canManage} lastSync={projectStagesLastSync}
          endpoint="sync-projectstages-softone" title="Δραστηριότητες" subHeader="—"
          hint="Στη γραμμή παραστατικού λέγεται «Κατηγορία δραστηριότητας»."
        />
      </TabsContent>
    </Tabs>
  );
}
