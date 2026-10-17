import { describe, expect, it, vi } from 'vitest';

// Η αναγνώριση δεν χρειάζεται WebGL — απομονώνουμε τα βαριά imports.
vi.mock('three', () => ({}));
vi.mock('three/examples/jsm/environments/RoomEnvironment.js', () => ({}));
vi.mock('@/components/admin/container-scene', () => ({ buildScene: () => null }));
vi.mock('@/components/admin/scene3d/models', () => ({}));

import { inferUnitVisual } from '@/components/admin/unit-visual';

describe('inferUnitVisual — οι πραγματικές μονάδες της εγκατάστασης', () => {
  it.each([
    [{ shortcut: 'Τεμ.', name: 'Τεμάχια' }, 'piece'],
    [{ shortcut: 'Κιβ.', name: 'Κιβώτια' }, 'box'],
    [{ shortcut: 'Μέτρα', name: 'Μέτρα' }, 'meter'],
    [{ shortcut: 'Μετ²', name: 'Τετραγωνικά μέτρα', interCode: 'm²' }, 'sqm'],
    [{ shortcut: 'ΠΑΡ', name: 'ΥΠΗΡΕΣΙΕΣ' }, 'service'],
    [{ shortcut: 'Λτρ', name: 'Λίτρα' }, 'liter'],
    [{ shortcut: 'Κιλά', name: 'Κιλά' }, 'sack'],
    [{ shortcut: 'Ώρα', name: 'Ώρες' }, 'hour'],
    [{ shortcut: 'ΠΑΛ', name: 'Παλέτα' }, 'pallet'],
    [{ shortcut: 'CONT', name: 'Container' }, 'container'],
    [{ shortcut: 'ΣΑΚ', name: 'Σακί 25kg' }, 'sack'],
  ])('%o → %s', (u, kind) => {
    expect(inferUnitVisual(u)).toBe(kind);
  });
});
