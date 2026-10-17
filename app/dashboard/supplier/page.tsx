import { requireUser } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Προμηθευτές: το portal τους δεν υπάρχει ακόμη — ευγενικό μήνυμα αντί για 404.
export default async function SupplierHome() {
  const u = await requireUser();
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl border border-border bg-white p-6 text-center shadow-sm">
        <h1 className="text-[length:var(--fs-20)] font-bold">Καλώς ήρθατε{u.name ? `, ${u.name}` : ''}</h1>
        <p className="mt-2 text-[length:var(--fs-14)] text-muted-foreground">Η περιοχή προμηθευτών ετοιμάζεται. Θα σας ενημερώσουμε μόλις είναι διαθέσιμη.</p>
        <form action="/api/auth/logout" method="post" className="mt-4"><button className="cursor-pointer text-[length:var(--fs-13)] text-sisyphus-700 underline">Αποσύνδεση</button></form>
      </div>
    </main>
  );
}
