'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FiCopy, FiTrash2 } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import type { RecipeView } from '@/lib/install-recipes';
import { CopyRecipeDialog } from '../copy-recipe-dialog';

export function RecipeActions({ recipe }: { recipe: RecipeView }) {
  const router = useRouter();
  const [copy, setCopy] = React.useState(false);

  const remove = async () => {
    if (!(await confirmAction({ message: `Διαγραφή της συνταγής «${recipe.name}»;\nΔεν αναιρείται. Τα αντίγραφά της δεν επηρεάζονται.`, destructive: true }))) return;
    const res = await fetch(`/api/admin/recipes/${recipe.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).message ?? 'Η διαγραφή απέτυχε'); return; }
    toast.success('Η συνταγή διαγράφηκε');
    router.push('/admin/recipes');
  };

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-9" onClick={() => setCopy(true)}><FiCopy className="size-3.5" aria-hidden /> Αντιγραφή</Button>
      <Button variant="outline" size="sm" className="min-h-9 text-destructive hover:text-destructive" onClick={() => void remove()} aria-label="Διαγραφή συνταγής"><FiTrash2 className="size-3.5" aria-hidden /></Button>
      <CopyRecipeDialog recipe={copy ? recipe : null} onClose={() => setCopy(false)} />
    </>
  );
}
