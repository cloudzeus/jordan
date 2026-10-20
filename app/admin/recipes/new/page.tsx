import Link from 'next/link';
import { FiArrowLeft, FiPlusCircle } from 'react-icons/fi';
import { requirePermission } from '@/lib/rbac';
import { listRecipes } from '@/lib/install-recipes';
import { PageHeader } from '@/components/admin/page-header';
import { RecipeEditor } from '../recipe-editor';

export const dynamic = 'force-dynamic';

export default async function NewRecipePage() {
  await requirePermission('recipes.manage');
  const templates = await listRecipes();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/admin/recipes" className="mb-2 inline-flex items-center gap-1 text-(length:--fs-12) text-muted-foreground hover:text-foreground"><FiArrowLeft className="size-3.5" aria-hidden /> Συνταγές τοποθέτησης</Link>
      <PageHeader icon={<FiPlusCircle />} title="Νέα συνταγή" description="Υλικό, υλικά ανά m² με φύρα και εργατικό κόστος ανά m²" helpAnchor="recipes" />
      <RecipeEditor initial={null} templates={templates} />
    </div>
  );
}
