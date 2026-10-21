import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => { jar.set(k, v); },
    delete: (k: string) => { jar.delete(k); },
  }),
}));

import { clearViewAs, readViewAs, setViewAs } from '../view-as';

describe('«Προβολή ως»', () => {
  it('ισχύει ΜΟΝΟ για τον διαχειριστή που την ξεκίνησε', async () => {
    await setViewAs('u_cust', 'admin1', '/admin/users');
    expect(await readViewAs('admin1')).toEqual({ sub: 'u_cust', by: 'admin1', back: '/admin/users' });
    expect(await readViewAs('admin2')).toBeNull();
  });

  it('πλαστό ή άλλο token δεν γίνεται δεκτό', async () => {
    jar.set('erp_view_as', 'not-a-jwt');
    expect(await readViewAs('admin1')).toBeNull();
  });

  it('η έξοδος σβήνει την προβολή', async () => {
    await setViewAs('u_cust', 'admin1', '/admin/users');
    await clearViewAs();
    expect(await readViewAs('admin1')).toBeNull();
  });
});
