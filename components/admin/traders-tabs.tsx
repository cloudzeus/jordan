'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiList, FiMap } from 'react-icons/fi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TradersMap = dynamic(() => import('./traders-map').then((m) => m.TradersMap), { ssr: false, loading: () => <p className="py-10 text-center text-[length:var(--fs-12)] text-muted-foreground">Φόρτωση χάρτη…</p> });

/** Συναλλασσόμενοι: «Λίστα» (ο πίνακας) και «Χάρτης». Ο χάρτης φορτώνει μόνο όταν ανοίξει η καρτέλα. */
export function TradersTabs({ list }: { list: React.ReactNode }) {
  const [tab, setTab] = React.useState('list');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="list" className="gap-1.5"><FiList className="size-3.5" aria-hidden />Λίστα</TabsTrigger>
        <TabsTrigger value="map" className="gap-1.5"><FiMap className="size-3.5" aria-hidden />Χάρτης</TabsTrigger>
      </TabsList>
      <TabsContent value="list">{list}</TabsContent>
      <TabsContent value="map">{tab === 'map' ? <TradersMap /> : null}</TabsContent>
    </Tabs>
  );
}
