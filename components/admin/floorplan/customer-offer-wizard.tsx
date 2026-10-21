'use client';

// «Νέα προσφορά…» από το μενού του πελάτη: wizard που ξεκινά είτε από χαρτογράφηση κάτοψης (εργαλείο
// διαστασιολόγησης → υλικά/συνταγές → στοιχεία & προεπισκόπηση → καταχώριση) είτε από κενή προσφορά με
// τον πελάτη ήδη επιλεγμένο. Η προσφορά μένει στον πελάτη· το έργο δημιουργείται με την αποδοχή της.
import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FiArrowRight, FiCheckCircle, FiFileText, FiSquare } from 'react-icons/fi';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// three.js + pdfjs φορτώνονται μόνο όταν επιλεγεί η χαρτογράφηση.
const FloorPlanDialog = dynamic(() => import('./floor-plan-dialog').then((m) => m.FloorPlanDialog), { ssr: false });

const FLOW = [
  'Χαρτογράφηση κάτοψης — φωτογραφία/PDF του σχεδίου, αναγνώριση χώρων με AI, διόρθωση περιγραμμάτων',
  'Υλικό ή συνταγή τοποθέτησης σε κάθε χώρο',
  'Στοιχεία προσφοράς και προεπισκόπηση πριν από την καταχώριση',
  'Αποστολή στον πελάτη· με την αποδοχή δημιουργείται το έργο στον πελάτη (SoftOne)',
];

export function CustomerOfferWizard({ customer, open, onOpenChange, canFiles = false }: {
  customer: { trdr: number; code: string; name: string };
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** files.manage: και «Αποθήκευση στα αρχεία» μέσα στο εργαλείο. */
  canFiles?: boolean;
}) {
  const router = useRouter();
  // Το εργαλείο μένει mounted μετά το πρώτο άνοιγμα: κλείσιμο/άνοιγμα δεν χάνει την κάτοψη.
  const [plan, setPlan] = React.useState<'closed' | 'open' | 'hidden'>('closed');

  const choose = (how: 'floorplan' | 'blank') => {
    onOpenChange(false);
    if (how === 'blank') router.push(`/admin/projects/contracts/new?trdr=${customer.trdr}`);
    else setPlan('open');
  };

  const option = 'group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-(length:--fs-16)">Νέα προσφορά</DialogTitle>
            <DialogDescription className="text-(length:--fs-12)">{customer.code} · {customer.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <button type="button" className={option} onClick={() => choose('floorplan')}>
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ background: '#0B1220', color: '#22D3EE' }}><FiSquare className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-(length:--fs-14) font-semibold">Με χαρτογράφηση κάτοψης <FiArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></span>
                <span className="mt-0.5 block text-(length:--fs-12) text-muted-foreground">Οι χώροι και τα τετραγωνικά βγαίνουν από το σχέδιο· η κάτοψη μπαίνει στην προσφορά και στις οδηγίες των συνεργείων.</span>
                <ol className="mt-2 space-y-1">
                  {FLOW.map((t, i) => (
                    <li key={i} className="flex gap-2 text-(length:--fs-12)">
                      <span className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold">{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              </span>
            </button>
            <button type="button" className={option} onClick={() => choose('blank')}>
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><FiFileText className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-(length:--fs-14) font-semibold">Χωρίς κάτοψη</span>
                <span className="mt-0.5 block text-(length:--fs-12) text-muted-foreground">Νέα προσφορά με τον πελάτη ήδη επιλεγμένο — υλικά, υπηρεσίες, συνταγές και συνεργεία χειροκίνητα.</span>
              </span>
            </button>
            <p className="flex items-start gap-1.5 text-(length:--fs-11) text-muted-foreground">
              <FiCheckCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Η προσφορά καταχωρίζεται στον πελάτη χωρίς έργο. Όταν γίνει αποδεκτή, η εφαρμογή προτείνει τη δημιουργία του έργου στο SoftOne (με επιβεβαίωση).
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {plan !== 'closed' && (
        <FloorPlanDialog
          owner={{ trdr: customer.trdr }} projectLabel={`${customer.code} · ${customer.name}`} canSave={canFiles} canOffer
          open={plan === 'open'} onOpenChange={(o) => setPlan(o ? 'open' : 'hidden')}
        />
      )}
    </>
  );
}
