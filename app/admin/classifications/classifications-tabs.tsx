'use client';

import * as React from 'react';
import { FiDatabase, FiPackage, FiUsers } from 'react-icons/fi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * «Κατηγορίες & ομάδες»: η ιεραρχία ομάδων ειδών/υπηρεσιών, οι εμπορικές κατηγορίες συναλλασσομένων και
 * το μητρώο του SoftOne. Οι καρτέλες έρχονται έτοιμες από τον server· εδώ μόνο η εναλλαγή.
 */
export function ClassificationsTabs({ items, traders, registry, initialTab = 'items' }: {
  items: React.ReactNode; traders: React.ReactNode; registry: React.ReactNode; initialTab?: string;
}) {
  const [tab, setTab] = React.useState(initialTab);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="items" className="gap-1.5"><FiPackage className="size-3.5" aria-hidden />Ομάδες ειδών & υπηρεσιών</TabsTrigger>
        <TabsTrigger value="traders" className="gap-1.5"><FiUsers className="size-3.5" aria-hidden />Κατηγορίες συναλλασσομένων</TabsTrigger>
        <TabsTrigger value="registry" className="gap-1.5"><FiDatabase className="size-3.5" aria-hidden />Μητρώο SoftOne</TabsTrigger>
      </TabsList>
      <TabsContent value="items">{items}</TabsContent>
      <TabsContent value="traders">{traders}</TabsContent>
      <TabsContent value="registry">{registry}</TabsContent>
    </Tabs>
  );
}
