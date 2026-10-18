import { NextResponse } from 'next/server';
import { EntityFileError, type EntityType } from '@/lib/entity-files/core';

/** `/api/admin/entity-files/traders/256` · `/projects/25` → (TRADER, 256) · (PROJECT, 25). */
export async function entityOf(params: Promise<{ type: string; id: string }>): Promise<{ type: EntityType; id: number } | null> {
  const p = await params;
  const type = p.type === 'traders' ? 'TRADER' : p.type === 'projects' ? 'PROJECT' : null;
  const id = Number(p.id);
  return type && Number.isInteger(id) && id > 0 ? { type, id } : null;
}

export const badEntity = () => NextResponse.json({ error: 'invalid_entity', message: 'Άκυρος πελάτης/προμηθευτής ή έργο.' }, { status: 400 });

export function filesError(e: unknown) {
  if (e instanceof EntityFileError) return NextResponse.json({ error: 'file_error', message: e.message }, { status: e.status });
  console.error('[entity-files]', e);
  return NextResponse.json({ error: 'internal_error', message: 'Κάτι πήγε στραβά με την αποθήκευση — δοκιμάστε ξανά.' }, { status: 500 });
}
