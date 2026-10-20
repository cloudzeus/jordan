import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiLayers } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { getRecipe } from '@/lib/install-recipes';
import { RECIPE_KIND_META } from '@/lib/install-recipes-core';
import { PageHeader } from '@/components/admin/page-header';
import { RecipeEditor } from '../recipe-editor';
import { RecipeActions } from './recipe-actions';

export const dynamic = 'force-dynamic';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('recipes.read');
  const { id } = await params;
  const [r, canManage] = await Promise.all([getRecipe(id), hasPermission('recipes.manage')]);
  if (!r) notFound();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/admin/recipes" className="mb-2 inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground"><FiArrowLeft className="size-3.5" aria-hidden /> Συνταγές τοποθέτησης</Link>
      <PageHeader
        icon={<FiLayers />}
        title={r.name}
        description={`${RECIPE_KIND_META[r.kind].label} · ${r.lines.length} υλικά ανά m²${r.copiedFrom ? ` · αντίγραφο από «${r.copiedFrom.name}»` : ''}`}
        helpAnchor="recipes"
        actions={canManage ? <RecipeActions recipe={r} /> : null}
      />
      <RecipeEditor key={r.updatedAt} initial={r} readOnly={!canManage} />
    </div>
  );
}
