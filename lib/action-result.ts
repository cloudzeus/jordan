// Τύπος αποτελέσματος των Server Actions — ασφαλής και για client components (χωρίς server-only).
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

/** Για ροές με try/catch στο UI: τα δεδομένα του action ή Error με το μήνυμά του. */
export async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.message || 'Η ενέργεια απέτυχε');
  return r.data;
}
