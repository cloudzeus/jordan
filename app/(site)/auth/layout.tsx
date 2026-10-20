import Image from 'next/image';
import { DimLine, Grid, SectionMark } from '@/components/site/blueprint';

/**
 * Είσοδος / αίτημα πρόσβασης: διαιρεμένη οθόνη. Αριστερά το atelier (φωτογραφία, λογότυπο, μεγάλη serif
 * φράση, αρχιτεκτονικά σημάδια) — δεξιά μία ήσυχη στήλη φόρμας. Στο κινητό η εικόνα γίνεται λωρίδα.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] md:min-h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <aside className="relative isolate overflow-hidden bg-[#0B1620] text-white">
        <div className="absolute inset-0 -z-10">
          <Image src="/site/brand/floor.jpg" alt="" fill priority sizes="(min-width: 1024px) 55vw, 100vw" data-zoom className="object-cover opacity-70" />
          <div className="absolute inset-0 bg-linear-to-t from-[#0B1620] via-[#0B1620]/55 to-[#0B1620]/20" />
        </div>
        <Grid color="#ffffff" opacity={0.05} />
        <div className="relative flex h-full min-h-60 flex-col justify-end gap-6 px-5 py-8 sm:px-8 lg:min-h-0 lg:p-12 xl:p-16">
          <div className="absolute right-5 top-6 text-white/60 sm:right-8 lg:right-12 lg:top-12"><SectionMark letter="B2B" sheet="01" /></div>
          <Image src="/site/brand/logo-white.png" alt="Atelier by Damask" width={835} height={438} className="hidden h-auto w-[132px] lg:block" />
          <p className="s-rise font-display max-w-xl text-(length:--fs-40) lg:text-(length:--fs-56)">
            Υλικά, κοστολόγια, <em className="text-[#E8D5BF]">χρονοδιαγράμματα</em> — σε μία πύλη.
          </p>
          <DimLine label="ΔΥΝΑΜΙΚΕΣ ΠΡΟΣΦΟΡΕΣ · ΕΡΓΑ · ΠΑΡΑΓΓΕΛΙΕΣ" className="hidden max-w-xl text-white/50 sm:flex" />
        </div>
      </aside>
      <div className="relative flex items-center justify-center bg-white px-5 py-14 sm:px-8 lg:px-12">
        <div className="w-full max-w-[440px]">{children}</div>
      </div>
    </div>
  );
}
