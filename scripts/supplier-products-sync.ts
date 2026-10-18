import 'dotenv/config';
import { syncSupplierProducts } from '@/lib/softone-sync/supplier-products';

// Προϊόντα ανά προμηθευτή από τα παραστατικά αγορών (μόνο ανάγνωση στο SoftOne → πίνακας SupplierProduct).
//   npx tsx --import ./scripts/templates/register.mjs scripts/supplier-products-sync.ts
(async () => {
  console.log(await syncSupplierProducts());
  process.exit(0);
})();
