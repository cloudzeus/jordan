// lib/entity-files/core.ts — ISOMORPHIC, χωρίς db/bunny: τύποι αρχείων, έλεγχος υπογραφής και
// διαδρομές φακέλων για τα «Αρχεία» πελατών/προμηθευτών (TRDR) και έργων (PRJC).

export type EntityType = 'TRADER' | 'PROJECT';

/** 100 MB — τα DWG μεγάλων έργων ξεπερνούν άνετα τα 20–30 MB. */
export const MAX_ENTITY_FILE_BYTES = 100 * 1024 * 1024;

export type FileFamily = 'cad' | 'pdf' | 'excel' | 'word';

export interface FileTypeDef {
  ext: string;
  family: FileFamily;
  label: string;
  mime: string;
}

export const FILE_TYPES: FileTypeDef[] = [
  { ext: 'dwg', family: 'cad', label: 'AutoCAD DWG', mime: 'image/vnd.dwg' },
  { ext: 'dxf', family: 'cad', label: 'AutoCAD DXF', mime: 'image/vnd.dxf' },
  { ext: 'dwf', family: 'cad', label: 'AutoCAD DWF', mime: 'model/vnd.dwf' },
  { ext: 'dwfx', family: 'cad', label: 'AutoCAD DWFx', mime: 'model/vnd.dwfx+xps' },
  { ext: 'pdf', family: 'pdf', label: 'PDF', mime: 'application/pdf' },
  { ext: 'xls', family: 'excel', label: 'Excel 97–2003', mime: 'application/vnd.ms-excel' },
  { ext: 'xlsx', family: 'excel', label: 'Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { ext: 'csv', family: 'excel', label: 'CSV', mime: 'text/csv' },
  { ext: 'doc', family: 'word', label: 'Word 97–2003', mime: 'application/msword' },
  { ext: 'docx', family: 'word', label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
];

const BY_EXT = new Map(FILE_TYPES.map((t) => [t.ext, t]));

/** Για το `accept` του input/dropzone. */
export const ACCEPT_EXTENSIONS = FILE_TYPES.map((t) => `.${t.ext}`);
export const ALLOWED_HINT = 'AutoCAD (DWG, DXF, DWF), PDF, Excel (XLS, XLSX, CSV), Word (DOC, DOCX) · έως 100 MB';

/** Προτεινόμενοι υποφάκελοι — ο χρήστης φτιάχνει κι άλλους. */
export const DEFAULT_SUBFOLDERS = ['Σχέδια', 'Προσφορές', 'Συμβάσεις'];

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name ?? '').trim());
  return m ? m[1].toLowerCase() : '';
}

export function typeOfExt(ext: string): FileTypeDef | null {
  return BY_EXT.get(ext.toLowerCase()) ?? null;
}

export class EntityFileError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const startsWith = (b: Buffer, sig: Buffer | string) => {
  const s = typeof sig === 'string' ? Buffer.from(sig, 'latin1') : sig;
  return b.length >= s.length && b.subarray(0, s.length).equals(s);
};
/** Κείμενο: κανένα NUL στα πρώτα 8 KB (ένα δυαδικό αρχείο έχει σχεδόν πάντα). */
const looksText = (b: Buffer) => !b.subarray(0, 8192).includes(0);

/** Ταιριάζει το περιεχόμενο με την κατάληξη; (υπογραφή αρχείου, όχι ό,τι λέει ο browser) */
export function matchesSignature(ext: string, b: Buffer): boolean {
  switch (ext) {
    case 'pdf': return b.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    // DWG: «AC1015», «AC1018», «AC1032» … (και οι πολύ παλιές «AC1.50», «AC2.10»)
    case 'dwg': return /^AC[12][.0-9]{3}/.test(b.subarray(0, 6).toString('latin1'));
    case 'dxf': {
      if (startsWith(b, 'AutoCAD Binary DXF')) return true;
      if (!looksText(b)) return false;
      const head = b.subarray(0, 4096).toString('latin1').replace(/^\uFEFF/, '');
      // κείμενο DXF: ομάδα 0 → SECTION (προαιρετικά σχόλια 999 πριν)
      return /^(\s*999\r?\n[^\n]*\n)*\s*0\r?\n\s*SECTION\b/.test(head);
    }
    case 'dwf': return startsWith(b, '(DWF V');
    case 'dwfx': return startsWith(b, ZIP);
    case 'xls': case 'doc': return startsWith(b, OLE);
    case 'xlsx': return startsWith(b, ZIP) && b.includes(Buffer.from('xl/'));
    case 'docx': return startsWith(b, ZIP) && b.includes(Buffer.from('word/'));
    case 'csv': return looksText(b) && !startsWith(b, '%PDF') && !startsWith(b, ZIP);
    default: return false;
  }
}

/**
 * Έλεγχος ανεβάσματος: κατάληξη στη λευκή λίστα, μέγεθος, υπογραφή περιεχομένου.
 * Επιστρέφει τον τύπο — το MIME που θα αποθηκευτεί/σερβιριστεί είναι ΤΟ ΔΙΚΟ ΜΑΣ.
 */
export function validateUpload(name: string, buffer: Buffer, maxBytes = MAX_ENTITY_FILE_BYTES): FileTypeDef {
  const ext = extOf(name);
  const type = typeOfExt(ext);
  if (!type) throw new EntityFileError(`Ο τύπος «${ext ? `.${ext}` : 'χωρίς κατάληξη'}» δεν επιτρέπεται. Επιτρέπονται: ${ALLOWED_HINT}.`, 415);
  if (buffer.byteLength === 0) throw new EntityFileError('Το αρχείο είναι κενό.');
  if (buffer.byteLength > maxBytes) throw new EntityFileError(`Το αρχείο ξεπερνά το όριο των ${Math.round(maxBytes / 1048576)} MB.`, 413);
  if (!matchesSignature(type.ext, buffer)) {
    throw new EntityFileError(`Το περιεχόμενο του «${name}» δεν είναι έγκυρο ${type.label} — ίσως άλλαξε η κατάληξη ή είναι κατεστραμμένο.`, 415);
  }
  return type;
}

/** Λατινικό slug με παύλες: «Παπαδόπουλος Α.Ε.» → «papadopoulos-a-e». */
const GREEK: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n',
  ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

export function slugPart(s: string, max = 40): string {
  const raw = String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return '';
  const latin = raw.replace(/ου/g, 'ou').replace(/[α-ω]/g, (ch) => GREEK[ch] ?? '');
  const out = latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out.slice(0, max).replace(/-+$/g, '');
}

/**
 * Διαδρομή φακέλου στο Bunny, π.χ. `traders/30-0012-papadopoulos-ae` / `projects/prj-25-oikia-kifisia`.
 * Ο κωδικός ΚΑΙ το SoftOne id μπαίνουν ώστε να είναι μοναδική ακόμη κι αν δύο κωδικοί δίνουν ίδιο slug.
 */
export function buildBasePath(type: EntityType, id: number, code: string, name: string): string {
  const root = type === 'TRADER' ? 'traders' : 'projects';
  const parts = [slugPart(code, 24), slugPart(name, 40)].filter(Boolean);
  return `${root}/${id}${parts.length ? `-${parts.join('-')}` : ''}`;
}

/** Όνομα υποφακέλου όπως το έγραψε ο χρήστης — καθαρό, χωρίς `/`, έως 60 χαρακτήρες. */
export function cleanSubfolder(name: string): string {
  // eslint-disable-next-line no-control-regex -- σκόπιμα: αφαιρούνται χαρακτήρες ελέγχου από ονόματα φακέλων
  const s = String(name ?? '').replace(/[\\/]+/g, ' ').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 60) throw new EntityFileError('Το όνομα του φακέλου είναι πολύ μεγάλο (έως 60 χαρακτήρες).');
  if (s === '.' || s === '..') throw new EntityFileError('Μη έγκυρο όνομα φακέλου.');
  return s;
}

/** Πρόθεμα (με `/` στο τέλος) ενός υποφακέλου στο Bunny: «Σχέδια» → `<base>/schedia/`. */
export function subfolderPrefix(basePath: string, subfolder: string): string {
  return subfolder ? `${basePath}/${slugPart(subfolder, 40) || 'folder'}/` : `${basePath}/`;
}

/** Κλειδί αρχείου: `<base>/<υποφάκελος>/<όνομα>-<τυχαίο>.<ext>` — ΝΕΟ σε κάθε ανέβασμα. */
export function buildFileKey(basePath: string, subfolder: string, fileName: string, ext: string, unique: string): string {
  const stem = slugPart(fileName.replace(/\.[A-Za-z0-9]+$/, ''), 60) || 'file';
  return `${subfolderPrefix(basePath, subfolder)}${stem}-${unique}.${ext}`;
}

/** Μετονομασία: κρατά πάντα την κατάληξη του αρχείου (ο τύπος δεν αλλάζει με το όνομα). */
export function renameKeepingExt(newName: string, ext: string): string {
  // eslint-disable-next-line no-control-regex -- σκόπιμα: αφαιρούνται χαρακτήρες ελέγχου από ονόματα αρχείων
  const s = String(newName ?? '').replace(/[\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const stem = s.replace(new RegExp(`\\.${ext}$`, 'i'), '').trim();
  if (!stem) throw new EntityFileError('Δώστε όνομα αρχείου.');
  if (stem.length > 150) throw new EntityFileError('Το όνομα είναι πολύ μεγάλο (έως 150 χαρακτήρες).');
  return `${stem}.${ext}`;
}

/** `Content-Disposition` με ελληνικό όνομα: ASCII εφεδρεία + `filename*` (RFC 5987). */
export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const safe = name.replace(/[\r\n"\\]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_') || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
