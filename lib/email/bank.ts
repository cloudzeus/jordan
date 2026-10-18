/** «Alpha Bank: GR12 0140 …; Eurobank — GR34 …» → λογαριασμοί. Γραμμές χωρίς IBAN αγνοούνται. */
export function parseBankAccounts(raw: string | null | undefined): { bank: string; iban: string }[] {
  return (raw ?? '')
    .split(/[;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((x) => {
      const m = /^(.*?)\s*(?::|—|–|-)\s*([A-Z]{2}\s?\d{2}[\dA-Z ]{8,})$/i.exec(x) ?? /^()([A-Z]{2}\s?\d{2}[\dA-Z ]{8,})$/i.exec(x);
      if (!m) return [];
      const iban = m[2].replace(/\s+/g, '').toUpperCase();
      return [{ bank: m[1].trim() || 'Τράπεζα', iban: iban.replace(/(.{4})/g, '$1 ').trim() }];
    });
}
