import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderRfpPdf } from '../pdf';

describe('PDF αιτήματος προσφοράς', () => {
  it('αποδίδεται με εργασίες και κάτοψη — χωρίς τιμές', async () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4//8/AxIAAG7+A/2NRvwqAAAAAElFTkSuQmCC', 'base64'));
    const buf = await renderRfpPdf({
      ref: 'ΑΠΡ-000007', title: 'Πλακάκια μπάνιου και κουζίνας', issuedOn: new Date('2026-10-23'), dueDate: '2026-10-30',
      area: 'Κηφισιά, Αθήνα', kindLabel: 'Προϊόν + τοποθέτηση', scope: 'Τοποθέτηση πλακιδίων σε δάπεδο και τοίχους.\n\nΑυτοψία κατόπιν ραντεβού.',
      company: { name: 'Atelier', legalName: 'ΝΤΑΜΑΣΚ ΜΙΚΕ', address: 'Λεωφ. Βουλιαγμένης 39', phones: ['210 2162310'], email: 'sales@example.com' },
      lines: Array.from({ length: 25 }, (_, i) => ({ kind: i % 3 ? 'MATERIAL' : 'SERVICE', name: `Γραμμή εργασίας ${i + 1}`, qty: 12.5 + i, unit: 'm²', notes: 'Χώρος: Μπάνιο · 6,00 m²' })),
      floorPlan: { title: 'Ισόγειο', png, floorM2: 40, wallsM2: 22, rows: [{ name: 'Μπάνιο', floorM2: 6, perimeterM: 10, walls: { heightM: 2.4, netM2: 22, openings: '1× πόρτα' }, material: 'Πλακάκι' }] },
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(buf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(pdf.getTitle()).toContain('ΑΠΡ-000007');
  });
});
