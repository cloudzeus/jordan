import { beforeEach, describe, expect, it, vi } from 'vitest';

// Εικονίδια μονάδων: έλεγχος αρχείου, prompt, αποθήκευση στη βιβλιοθήκη, καθάρισμα παλιού αρχείου,
// και ανάγνωση εικόνας από τις απαντήσεις OpenRouter / Gemini. Καμία κλήση στο SoftOne.

const db = {
  softoneUnit: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  mediaFolder: { findFirst: vi.fn(), create: vi.fn() },
};
const media = { processAndUpload: vi.fn(), deleteMediaFile: vi.fn() };
const ai = { generateImage: vi.fn() };
const softone = { softoneCall: vi.fn(), softoneGetTable: vi.fn(), SoftoneError: class extends Error {} };

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/softone', () => softone);
vi.mock('@/lib/media', async () => ({
  ...media,
  isImageMime: (m: string) => ['image/png', 'image/jpeg', 'image/webp'].includes(m),
  isSvgMime: (m: string) => m === 'image/svg+xml',
}));
vi.mock('@/lib/ai/image-gen', () => ai);
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn() }));

const icons = await import('@/lib/unit-icons');
const { imageFromGemini, imageFromOpenRouter, parseDataUrl } = await vi.importActual<typeof import('@/lib/ai/image-gen')>('@/lib/ai/image-gen');

const UNIT = { code: 101, shortcut: 'ΠΑΛ', name: 'Παλέτα', interCode: null, iconMediaId: null, iconMedia: null };
const png = Buffer.from('fake-png');

beforeEach(() => {
  vi.clearAllMocks();
  db.mediaFolder.findFirst.mockResolvedValue({ id: 'folder-icons' });
  db.softoneUnit.findUnique.mockResolvedValue(UNIT);
  db.softoneUnit.count.mockResolvedValue(0);
  media.processAndUpload.mockResolvedValue({ id: 'media-new', publicUrl: 'https://cdn/x.webp' });
  media.deleteMediaFile.mockResolvedValue(true);
});

describe('iconFileProblem', () => {
  it('δέχεται εικόνες και SVG έως 5 MB', () => {
    expect(icons.iconFileProblem('image/png', 1000)).toBeNull();
    expect(icons.iconFileProblem('image/svg+xml', 1000)).toBeNull();
  });
  it('απορρίπτει μη-εικόνες, κενά και μεγάλα αρχεία', () => {
    expect(icons.iconFileProblem('application/pdf', 1000)).toMatch(/εικόνες/);
    expect(icons.iconFileProblem('image/png', 0)).toMatch(/κενό/);
    expect(icons.iconFileProblem('image/png', icons.MAX_ICON_BYTES + 1)).toMatch(/5 MB/);
  });
});

describe('buildUnitIconPrompt', () => {
  it('περιέχει μονάδα, διεθνή κωδικό, «χωρίς κείμενο» και την οδηγία (κομμένη)', () => {
    const p = icons.buildUnitIconPrompt({ shortcut: 'ΤΜ', name: 'Τετραγωνικό μέτρο', interCode: 'm²' }, `  μπλε ${'x'.repeat(400)}`);
    expect(p).toContain('"Τετραγωνικό μέτρο" (ΤΜ, international code m²)');
    expect(p).toMatch(/No text/);
    expect(p).toContain('Additional guidance: μπλε');
    expect(p.length).toBeLessThan(900);
  });
  it('χωρίς οδηγία δεν βάζει «Additional guidance»', () => {
    expect(icons.buildUnitIconPrompt({ shortcut: 'ΤΕΜ', name: 'Τεμάχιο' }, '   ')).not.toContain('Additional guidance');
  });
});

describe('setUnitIcon', () => {
  it('ανεβάζει στον φάκελο εικονιδίων και κρατά το mediaId στη μονάδα', async () => {
    const res = await icons.setUnitIcon(101, { buffer: png, name: 'p.png', mimeType: 'image/png' }, 'user-1');
    expect(media.processAndUpload).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder-icons', uploadedById: 'user-1', mimeType: 'image/png' }));
    expect(db.softoneUnit.update).toHaveBeenCalledWith({ where: { code: 101 }, data: { iconMediaId: 'media-new' } });
    expect(res).toEqual({ iconUrl: 'https://cdn/x.webp', mediaId: 'media-new' });
  });
  it('φτιάχνει τον φάκελο αν λείπει', async () => {
    db.mediaFolder.findFirst.mockResolvedValue(null);
    db.mediaFolder.create.mockResolvedValue({ id: 'folder-new' });
    await icons.setUnitIcon(101, { buffer: png, name: 'p.png', mimeType: 'image/png' });
    expect(db.mediaFolder.create).toHaveBeenCalledWith({ data: { name: icons.ICON_FOLDER_NAME }, select: { id: true } });
    expect(media.processAndUpload).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder-new' }));
  });
  it('σβήνει το παλιό εικονίδιο του φακέλου, όχι αρχεία άλλων φακέλων', async () => {
    db.softoneUnit.findUnique.mockResolvedValue({ ...UNIT, iconMedia: { id: 'media-old', folderId: 'folder-icons' } });
    await icons.setUnitIcon(101, { buffer: png, name: 'p.png', mimeType: 'image/png' });
    expect(media.deleteMediaFile).toHaveBeenCalledWith('media-old');

    media.deleteMediaFile.mockClear();
    db.softoneUnit.findUnique.mockResolvedValue({ ...UNIT, iconMedia: { id: 'media-lib', folderId: 'other' } });
    await icons.setUnitIcon(101, { buffer: png, name: 'p.png', mimeType: 'image/png' });
    expect(media.deleteMediaFile).not.toHaveBeenCalled();
  });
  it('δεν σβήνει αρχείο που χρησιμοποιεί ακόμη άλλη μονάδα', async () => {
    db.softoneUnit.findUnique.mockResolvedValue({ ...UNIT, iconMedia: { id: 'media-old', folderId: 'folder-icons' } });
    db.softoneUnit.count.mockResolvedValue(1);
    await icons.setUnitIcon(101, { buffer: png, name: 'p.png', mimeType: 'image/png' });
    expect(media.deleteMediaFile).not.toHaveBeenCalled();
  });
  it('άγνωστη μονάδα → 404, άκυρο αρχείο → 400, χωρίς ανέβασμα', async () => {
    db.softoneUnit.findUnique.mockResolvedValue(null);
    await expect(icons.setUnitIcon(999, { buffer: png, name: 'p.png', mimeType: 'image/png' })).rejects.toMatchObject({ status: 404 });
    await expect(icons.setUnitIcon(101, { buffer: png, name: 'a.pdf', mimeType: 'application/pdf' })).rejects.toMatchObject({ status: 400 });
    expect(media.processAndUpload).not.toHaveBeenCalled();
  });
});

describe('generateUnitIcon', () => {
  it('παράγει εικόνα με prompt της μονάδας και την αποθηκεύει', async () => {
    ai.generateImage.mockResolvedValue({ buffer: png, mimeType: 'image/png', model: 'm', provider: 'openrouter' });
    const res = await icons.generateUnitIcon(101, 'ξύλο', 'user-1');
    expect(ai.generateImage.mock.calls[0][0]).toContain('"Παλέτα" (ΠΑΛ)');
    expect(ai.generateImage.mock.calls[0][1]).toMatchObject({ operation: 'unit.icon', refType: 'unit', refId: '101' });
    expect(media.processAndUpload).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/png', originalName: 'unit-101-ai.png' }));
    expect(res.mediaId).toBe('media-new');
  });
  it('αποτυχία παρόχου → 502 με το μήνυμα', async () => {
    ai.generateImage.mockRejectedValue(new Error('OpenRouter 402: no credits'));
    await expect(icons.generateUnitIcon(101, null)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('402') });
    expect(media.processAndUpload).not.toHaveBeenCalled();
  });
});

describe('removeUnitIcon', () => {
  it('αδειάζει το πεδίο και σβήνει το αρχείο του φακέλου', async () => {
    db.softoneUnit.findUnique.mockResolvedValue({ ...UNIT, iconMedia: { id: 'media-old', folderId: 'folder-icons' } });
    await icons.removeUnitIcon(101);
    expect(db.softoneUnit.update).toHaveBeenCalledWith({ where: { code: 101 }, data: { iconMediaId: null } });
    expect(media.deleteMediaFile).toHaveBeenCalledWith('media-old');
  });
  it('χωρίς εικονίδιο δεν κάνει τίποτα', async () => {
    await icons.removeUnitIcon(101);
    expect(db.softoneUnit.update).not.toHaveBeenCalled();
  });
});

describe('ανάγνωση εικόνας από τους παρόχους', () => {
  const b64 = Buffer.from('img').toString('base64');
  it('data URL', () => {
    expect(parseDataUrl(`data:image/png;base64,${b64}`)).toEqual({ mimeType: 'image/png', buffer: Buffer.from('img') });
    expect(parseDataUrl('https://x/y.png')).toBeNull();
  });
  it('OpenRouter: message.images[].image_url.url + usage', () => {
    const out = imageFromOpenRouter({ choices: [{ message: { images: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }] } }], usage: { prompt_tokens: 10, completion_tokens: 1290, total_tokens: 1300 } });
    expect(out?.mimeType).toBe('image/png');
    expect(out?.usage).toEqual({ input: 10, output: 1290, total: 1300 });
    expect(imageFromOpenRouter({ choices: [{ message: { content: 'sorry' } }] })).toBeNull();
  });
  it('Gemini native: inlineData ή inline_data', () => {
    expect(imageFromGemini({ candidates: [{ content: { parts: [{ text: 'x' }, { inlineData: { mimeType: 'image/png', data: b64 } }] } }] })?.buffer.toString()).toBe('img');
    expect(imageFromGemini({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }] } }] })?.mimeType).toBe('image/jpeg');
    expect(imageFromGemini({ candidates: [] })).toBeNull();
  });
});

describe('κόστος εικόνας', () => {
  it('το μοντέλο εικόνας του OpenRouter χρεώνεται ως εικόνα, όχι ως gemini-2.5-flash', async () => {
    const { getPricing } = await import('@/lib/ai/pricing');
    expect(getPricing('google/gemini-2.5-flash-image')?.outputPerMTokens).toBe(30);
  });
});
