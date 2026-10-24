import { describe, expect, it } from 'vitest';
import { requestWorkflow } from '../offer-requests-core';

const ev = (type: string, d: string) => ({ type, createdAt: `2026-10-${d}T10:00:00.000Z` });

describe('requestWorkflow', () => {
  it('νέο αίτημα: μόνο το πρώτο βήμα, επόμενο «το είδαμε»', () => {
    const f = requestWorkflow([ev('REQUESTED', '20')], 'DRAFT');
    expect(f.bucket).toBe('NEW');
    expect(f.steps.map((s) => s.done)).toEqual([true, false, false, false, false, false]);
    expect(f.steps[1].current).toBe(true);
    expect(f.next).toBe('Ανοίξτε το αίτημα');
  });

  it('ανοιγμένο και σταλμένο: ημερομηνίες από τα συμβάντα, περιμένει τον πελάτη', () => {
    const f = requestWorkflow([ev('REQUESTED', '20'), ev('OPENED', '21'), ev('SENT', '23'), ev('SENT', '25')], 'SENT');
    expect(f.bucket).toBe('OPEN');
    expect(f.steps[2]).toMatchObject({ done: true, at: '2026-10-23T10:00:00.000Z' });
    expect(f.steps[3].current).toBe(true);
    expect(f.next).toBe('Περιμένουμε την απάντηση του πελάτη');
  });

  it('η κατάσταση συμπληρώνει βήματα χωρίς καταγραφή (παλιές προσφορές)', () => {
    const f = requestWorkflow([ev('REQUESTED', '20')], 'ACTIVE');
    expect(f.steps.slice(0, 5).every((s) => s.done)).toBe(true);
    expect(f.steps[4].at).toBeNull();
    expect(f.bucket).toBe('OPEN');
  });

  it('ακυρωμένο: κλειστό, χωρίς τρέχον βήμα', () => {
    const f = requestWorkflow([ev('REQUESTED', '20'), ev('OPENED', '21'), ev('CANCELLED', '22')], 'CANCELLED');
    expect(f.bucket).toBe('CLOSED');
    expect(f.cancelledAt).toBe('2026-10-22T10:00:00.000Z');
    expect(f.steps.some((s) => s.current)).toBe(false);
  });

  it('ολοκληρωμένο: όλα τα βήματα', () => {
    const f = requestWorkflow([ev('REQUESTED', '01'), ev('COMPLETED', '30')], 'COMPLETED');
    expect(f.steps.every((s) => s.done)).toBe(true);
    expect(f.bucket).toBe('CLOSED');
  });
});
