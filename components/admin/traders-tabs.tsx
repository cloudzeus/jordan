'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { FiList, FiMap, FiPackage } from 'react-icons/fi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TradersMap = dynamic(() => import('./traders-map').then((m) => m.TradersMap), { ssr: false, loading: () => <p className="py-10 text-center text-[length:var(--fs-12)] text-muted-foreground">Φόρτωση χάρτη…</p> });

/**
 * Συναλλασσόμενοι: «Λίστα» (ο πίνακας), «Χάρτης» και «Προϊόντα προμηθευτών». Ο χάρτης φορτώνει μόνο όταν
 * ανοίξει η καρτέλα· τα προϊόντα έρχονται ως server component (σε Suspense, δεν καθυστερούν τη λίστα).
 */
export function TradersTabs({ list, products, initialTab = 'list' }: { list: React.ReactNode; products?: React.ReactNode; initialTab?: string }) {
  const [tab, setTab] = React.useState(initialTab);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="list" className="gap-1.5"><FiList className="size-3.5" aria-hidden />Λίστα</TabsTrigger>
        <TabsTrigger value="map" className="gap-1.5"><FiMap className="size-3.5" aria-hidden />Χάρτης</TabsTrigger>
        {products && <TabsTrigger value="products" className="gap-1.5"><FiPackage className="size-3.5" aria-hidden />Προϊόντα προμηθευτών</TabsTrigger>}
      </TabsList>
      <TabsContent value="list">{list}</TabsContent>
      <TabsContent value="map">{tab === 'map' ? <TradersMap /> : null}</TabsContent>
      {products && <TabsContent value="products" forceMount hidden={tab !== 'products'}>{products}</TabsContent>}
    </Tabs>
  );
}
