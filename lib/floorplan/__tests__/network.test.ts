import { describe, expect, it } from 'vitest';
import { angleTo, cameraWedge, isNetworkKey, nearestDevice, networkLines, networkSummary, newDevice, planCable, poweredIds, type PlanCable } from '../network';
import { planData, scalePlanData } from '../saved';
import { eraseHit } from '../erase';

const cable = (id: string, kind: 'power' | 'network', from: string | null, to: string | null, pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }]): PlanCable =>
  planCable.parse({ id, kind, pts, from, to });

describe('ηλεκτρολογικά & δίκτυο', () => {
  const rack = newDevice('rack', 'rack', { x: 0, y: 0 }, 1);
  const cam = newDevice('cam', 'camera', { x: 100, y: 0 }, 1);
  const ap = newDevice('ap', 'ap', { x: 200, y: 0 }, 1);
  const panel = newDevice('pan', 'panel', { x: 0, y: 100 }, 1);
  const s1 = newDevice('s1', 'socket', { x: 50, y: 100 }, 1);
  const s2 = newDevice('s2', 'socket', { x: 90, y: 100 }, 2);
  const lamp = newDevice('l1', 'light', { x: 300, y: 300 }, 1);

  it('νέες συσκευές με προεπιλογές ανά είδος', () => {
    expect(cam).toMatchObject({ label: 'Κάμερα 1', rangeM: 10, fov: 90 });
    expect(ap.rangeM).toBe(12);
    expect(panel.ports).toBe(12);
    expect(rack.ports).toBe(24);
  });

  it('κούμπωμα στην πλησιέστερη συσκευή και γωνία κάμερας', () => {
    expect(nearestDevice({ x: 98, y: 3 }, [rack, cam], 10)?.id).toBe('cam');
    expect(nearestDevice({ x: 50, y: 50 }, [rack, cam], 10)).toBeNull();
    expect(angleTo({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    const w = cameraWedge({ x: 0, y: 0, angle: 0, fov: 90 }, 10, 2);
    expect(w[0]).toEqual({ x: 0, y: 0 });
    expect(w[2].x).toBeCloseTo(10);
  });

  it('ρεύμα: κύκλωμα πίνακας → πρίζα → πρίζα, το φωτιστικό χωρίς καλώδιο ξεχωρίζει', () => {
    const cs = [cable('p1', 'power', 'pan', 's1'), cable('p2', 'power', 's1', 's2')];
    expect([...poweredIds([panel, s1, s2, lamp], cs)].sort()).toEqual(['pan', 's1', 's2']);
    const sum = networkSummary([panel, s1, s2, lamp], cs, 0.01);
    expect(sum.panels[0]).toMatchObject({ circuits: 1, ports: 12 });
    expect(sum.warnings).toEqual(['Φως 1: δεν φτάνει στον πίνακα με καλώδιο ρεύματος.']);
    expect(sum.powerM).toBe(2.2); // 200 px × 0,01 m × 1,1
  });

  it('δίκτυο: κάθε συσκευή με δικό της καλώδιο ως το rack· θύρες', () => {
    const cs = [cable('n1', 'network', 'cam', 'rack'), cable('n2', 'network', 'ap', 'cam')];
    const sum = networkSummary([rack, cam, ap], cs, null);
    expect(sum.racks[0]).toMatchObject({ used: 1, ports: 24 });
    expect(sum.networkM).toBeNull();
    expect(sum.warnings).toEqual(['Καλώδιο δικτύου 2 δεν τερματίζει σε rack.', 'AP 1: χωρίς καλώδιο δικτύου ως το rack.']);
    expect(networkSummary([cam], [cable('n', 'network', 'cam', null)], null).warnings[0]).toMatch(/κανένα rack/);
  });

  it('αποθήκευση: παλιές κατόψεις χωρίς δίκτυο, κλιμάκωση συντεταγμένων', () => {
    const base = { v: 1, w: 100, h: 100, calib: null, rooms: [] };
    expect(planData.parse(base)).toMatchObject({ devices: [], cables: [] });
    const d = planData.parse({ ...base, devices: [cam], cables: [cable('n1', 'network', 'cam', 'rack')] });
    const s = scalePlanData(d, 200, 200);
    expect(s.devices[0]).toMatchObject({ x: 200, y: 0, brand: '' });
    expect(s.cables[0].pts[1]).toEqual({ x: 200, y: 0 });
  });

  it('η γόμα πιάνει συσκευή πριν από το καλώδιο', () => {
    const x = { pins: [], dims: [], rooms: [], dividers: [], walls: [], devices: [cam], cables: [cable('n1', 'network', 'cam', 'rack')] };
    expect(eraseHit({ x: 101, y: 1 }, x, 3)).toEqual({ kind: 'device', id: 'cam' });
    expect(eraseHit({ x: 50, y: 1 }, x, 3)).toEqual({ kind: 'cable', id: 'n1' });
  });
});

describe('γραμμές προσφοράς από ηλεκτρολογικά & δίκτυο', () => {
  it('ομαδοποίηση συσκευών και καλωδίων, εργασίες, σταθερά κλειδιά', () => {
    const c1 = { ...newDevice('c1', 'camera', { x: 0, y: 0 }, 1), brand: 'Hikvision', model: 'DS-2CD' };
    const c2 = { ...newDevice('c2', 'camera', { x: 10, y: 0 }, 2), brand: ' hikvision ', model: 'ds-2cd' };
    const s1 = newDevice('s1', 'socket', { x: 0, y: 50 }, 1);
    const rk = newDevice('rk', 'rack', { x: 0, y: 99 }, 1);
    const pn = newDevice('pn', 'panel', { x: 0, y: 98 }, 1);
    const cs = [cable('n1', 'network', 'c1', 'rk'), cable('n2', 'network', 'c2', 'rk'), cable('p1', 'power', 'pn', 's1')];
    const r = networkLines([c1, c2, s1, rk, pn], cs, 0.05);
    expect(r.lines.map((l) => `${l.name}|${l.qty}${l.unit}`)).toEqual([
      'Πρίζα ρεύματος|1τεμ.', 'Ηλεκτρικός πίνακας|1τεμ.', 'Κάμερα — Hikvision DS-2CD|2τεμ.', 'Rack|1τεμ.',
      'Καλώδιο δικτύου Cat6 UTP|11m', 'Καλώδιο ρεύματος NYM 3×2,5|5.5m',
      'Εγκατάσταση & σύνδεση σημείων ρεύματος|1σημεία', 'Όδευση, τερματισμός & έλεγχος σημείων δικτύου|2σημεία',
    ]);
    expect(r.lines.every((l) => isNetworkKey(l.key) && l.key.length <= 64)).toBe(true);
    expect(networkLines([c1, c2], [], null).lines[0].key).toBe(r.lines[2].key);
    expect(networkLines([], [cs[0]], null)).toMatchObject({ lines: [], noScale: true });
  });
});
