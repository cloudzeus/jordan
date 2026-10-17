import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_GRANTS, PERMISSIONS, RESOURCE_LABELS, ROLE_DEFAULTS } from '../permissions';

const keys = new Set(PERMISSIONS.map((p) => p.key));

describe('κατάλογος δικαιωμάτων', () => {
  it('μοναδικά κλειδιά, μορφή «ενότητα.ενέργεια»', () => {
    expect(keys.size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) expect(p.key).toBe(`${p.resource}.${p.action}`);
  });
  it('κάθε ενότητα έχει ελληνική ετικέτα', () => {
    for (const p of PERMISSIONS) expect(RESOURCE_LABELS[p.resource], p.resource).toBeTruthy();
  });
  it('προεπιλογές ρόλων και μετάβαση δείχνουν σε υπαρκτά δικαιώματα', () => {
    for (const list of Object.values(ROLE_DEFAULTS)) for (const k of list) expect(keys.has(k), k).toBe(true);
    for (const [legacy, grants] of Object.entries(LEGACY_GRANTS)) {
      expect(keys.has(legacy), legacy).toBe(true);
      for (const k of grants) expect(keys.has(k), k).toBe(true);
    }
  });
  it('η παράκαμψη Μ.Μ.2 ΔΕΝ δίνεται αυτόματα από το metadata.manage', () => {
    expect(Object.values(LEGACY_GRANTS).flat()).not.toContain('items.unit2_override');
    expect(ROLE_DEFAULTS.ADMIN).toContain('items.unit2_override');
    expect(ROLE_DEFAULTS.EMPLOYEE).not.toContain('items.unit2_override');
  });
  it('οι νέες ενότητες δεν ελέγχουν πια τα γενικά metadata.*', () => {
    const roots = ['app/admin/dynamic-offers', 'app/admin/partners', 'app/admin/units', 'app/admin/classifications', 'app/admin/projects',
      'app/api/admin/dynamic-offers', 'app/api/admin/partners', 'app/api/admin/units', 'app/api/admin/classifications', 'app/api/admin/projects'];
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.tsx?$/.test(e.name) && /Permission\('metadata\./.test(fs.readFileSync(f, 'utf8'))) offenders.push(f);
      }
    };
    for (const r of roots) if (fs.existsSync(r)) walk(r);
    expect(offenders).toEqual([]);
  });
  it('το seed.js περιέχει όλα τα νέα δικαιώματα', () => {
    const seed = fs.readFileSync('scripts/seed.js', 'utf8');
    for (const k of [...Object.values(LEGACY_GRANTS).flat(), 'items.unit2_override']) expect(seed.includes(`'${k}'`), k).toBe(true);
  });
});
