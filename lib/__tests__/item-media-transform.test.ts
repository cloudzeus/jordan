import { describe, expect, it } from 'vitest';
import { CANVAS, DEFAULT_TRANSFORM, fillZoom, normalizeTransform, placement } from '../item-media/transform';

describe('placement', () => {
  it('οριζόντια φωτογραφία, zoom 1: χωράει ολόκληρη με 5% περιθώριο σε κάθε πλευρά, κεντραρισμένη', () => {
    // 90% του 1920 = 1728 · περιθώριο 96px αριστερά/δεξιά.
    expect(placement(4000, 2000, DEFAULT_TRANSFORM)).toMatchObject({ width: 1728, height: 864, left: 96, top: 528 });
  });

  it('κάθετη φωτογραφία: το περιθώριο 5% πάνω/κάτω', () => {
    expect(placement(1000, 2000, DEFAULT_TRANSFORM)).toMatchObject({ height: 1728, top: 96 });
  });

  it('περιστροφή 90°: ανταλλάσσει πλάτος/ύψος πριν το «χωράει»', () => {
    expect(placement(4000, 2000, { ...DEFAULT_TRANSFORM, rotate: 90 })).toMatchObject({ width: 864, height: 1728, left: 528, top: 96 });
  });

  it('μετατόπιση: μετακινεί το κέντρο σε px του καμβά', () => {
    const p = placement(1000, 1000, { ...DEFAULT_TRANSFORM, zoom: 0.5, x: 100, y: -50 });
    expect(p).toMatchObject({ width: 864, height: 864, left: 528 + 100, top: 528 - 50 });
  });

  it('«Γέμισμα»: η μικρή πλευρά ισούται με τον καμβά', () => {
    const z = fillZoom(4000, 2000, 0);
    expect(placement(4000, 2000, { ...DEFAULT_TRANSFORM, zoom: z })).toMatchObject({ width: 3840, height: CANVAS });
  });
});

describe('normalizeTransform', () => {
  it('περιορίζει τις τιμές και απορρίπτει άκυρη περιστροφή/φόντο', () => {
    expect(normalizeTransform({ zoom: 99, x: 1e9, y: 'x', rotate: 45, background: 'red' }))
      .toEqual({ zoom: 6, x: CANVAS * 2, y: 0, rotate: 0, background: 'white' });
  });
});
