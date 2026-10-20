import Link from 'next/link';
import { FiLayers, FiPlus } from 'react-icons/fi';
import { hasPermission, requirePermission } from '@/lib/rbac';
import { listRecipes } from '@/lib/install-recipes';
import { PageHeader } from '@/components/admin/page-header';
import { RecipesList } from './recipes-list';

export const dynamic = 'force-dynamic';

// Συνταγές τοποθέτησης (Operations): υλικό + υλικά/m² με φύρα + εργατικά/m². Δικά μας δεδομένα — όχι SoftOne.
export default async function RecipesPage() {
  await requirePermission('recipes.read');
  const [recipes, canManage] = await Promise.all([listRecipes(), hasPermission('recipes.manage')]);
  return (
    <div className="w-full">
      <PageHeader
        icon={<FiLayers />}
        title="Συνταγές τοποθέτησης"
        description={`${recipes.length.toLocaleString('el-GR')} συνταγές · υλικά ανά m², φύρα και εργατικό κόστος για πλακάκια, πέτρες και τσιμεντοκονίες`}
        helpAnchor="recipes"
        actions={canManage ? (
          <Link href="/admin/recipes/new" className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-(length:--fs-13) font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <FiPlus className="size-4" aria-hidden /> Νέα συνταγή
          </Link>
        ) : null}
      />
      <RecipesList recipes={recipes} canManage={canManage} />
    </div>
  );
}
