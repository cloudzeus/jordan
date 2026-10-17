'use client';

// Εικόνα της προσφοράς (στιγμιότυπο 3D) — με «Δείτε σε 3D» γίνεται διαδραστική σκηνή (φορτώνει
// το three.js μόνο όταν το ζητήσει ο χρήστης).
import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiBox } from 'react-icons/fi';

const ContainerScene = dynamic(() => import('@/components/admin/container-scene'), {
  ssr: false, loading: () => <div className="h-full min-h-72 animate-pulse bg-slate-200 motion-reduce:animate-none" />,
});

const strip = (s: string) => s.toLocaleLowerCase('el').normalize('NFD').replace(/[̀-ͯ]/g, '');
const loadOf = (name: string): 'stones' | 'boxes' | 'sacks' => {
  const n = strip(name);
  if (/κολλ|τσιμεντ|κονιαμ|στοκ|αρμο|σοβα|glue|cement|mortar|grout/.test(n)) return 'sacks';
  if (/πετρ|stone|τραβερτ|travert/.test(n) && !/πλακακι|gres|porcel/.test(n)) return 'stones';
  return 'boxes';
};

export function Offer3D({ snapshotUrl, pallets, perPallet, filled, name, unit }: {
  snapshotUrl: string | null; pallets: number; perPallet: number; filled: number; name: string; unit: string;
}) {
  const [live, setLive] = React.useState(!snapshotUrl);
  if (live) {
    return (
      <div className="min-h-72 bg-slate-100 p-2 dark:bg-slate-800">
        <ContainerScene pallets={pallets} perPallet={perPallet} filled={filled} load={loadOf(name)} labels={{ container: 'Container', pallet: 'ΠΑΛ', base: unit }} heightClass="h-72 lg:h-[26rem]" />
      </div>
    );
  }
  return (
    <div className="relative min-h-60 bg-slate-100 dark:bg-slate-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={snapshotUrl!} alt={`3D: ${name} σε παλέτες μέσα στο container`} className="h-full w-full object-cover" />
      <button
        type="button" onClick={() => setLive(true)}
        className="absolute bottom-3 right-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-white/90 px-3 text-[length:var(--fs-13)] font-semibold text-slate-900 shadow-md backdrop-blur-sm transition-colors hover:bg-white"
      >
        <FiBox className="size-4" aria-hidden /> Δείτε σε 3D
      </button>
    </div>
  );
}
