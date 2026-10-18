// lib/install-guide/service.ts — SERVER. Οδηγίες εγκατάστασης ενός είδους: ηχογραφήσεις →
// απομαγνητοφώνηση, δείγματα (ItemMedia με isInstallSample), δημιουργία οδηγού με AI και PDF που
// αποθηκεύεται στα «Αρχεία» του είδους (ItemMedia DOCUMENT, Bunny CDN).
import 'server-only';
import sharp from 'sharp';
import { customAlphabet } from 'nanoid';
import { prisma } from '@/lib/db';
import { bunnyDelete, bunnyUpload } from '@/lib/bunny';
import { listAttributes } from '@/lib/item-attributes';
import { classificationOptions } from '@/lib/item-classifications';
import { readSoftoneItem } from '@/lib/softone-sync/item-edit';
import { ItemMediaError, toDTO, uploadItemMedia, type ItemMediaDTO } from '@/lib/item-media/service';
import { audioFormatOf, composeGuide, transcribeInstallAudio } from './ai';
import { buildGuidePrompt, parseGuide, sampleImages, type InstallGuide } from './guide';
import { renderGuidePdf } from './pdf';
import { guideProfile, profileLabel, type GuideProfile } from './profile';

export class InstallGuideError extends ItemMediaError {}

const id8 = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // ~25 λεπτά opus — αρκετά για μια περιγραφή

export type InstallNoteDTO = {
  id: string; audioUrl: string | null; durationSec: number | null; transcript: string; createdAt: string;
};
export type InstallGuideDTO = {
  id: string; content: InstallGuide; profile: string; profileLabel: string; category: string | null;
  model: string; pdfUrl: string | null; pdfMediaId: string | null; createdAt: string;
};

const noteDTO = (n: { id: string; audioUrl: string | null; durationSec: number | null; transcript: string; createdAt: Date }): InstallNoteDTO => ({
  id: n.id, audioUrl: n.audioUrl, durationSec: n.durationSec, transcript: n.transcript, createdAt: n.createdAt.toISOString(),
});
const guideDTO = (g: { id: string; content: unknown; profile: string; category: string | null; model: string; pdfUrl: string | null; pdfMediaId: string | null; createdAt: Date }): InstallGuideDTO => ({
  id: g.id, content: g.content as InstallGuide, profile: g.profile, profileLabel: profileLabel(g.profile), category: g.category,
  model: g.model, pdfUrl: g.pdfUrl, pdfMediaId: g.pdfMediaId, createdAt: g.createdAt.toISOString(),
});

/** Το είδος + ταξινόμηση. Η κατηγορία/ομάδα διαβάζεται ζωντανά από το SoftOne (μόνο ανάγνωση)· αν
 *  δεν απαντήσει, ο οδηγός γίνεται με την περιγραφή του καθρέφτη. */
async function itemContext(mtrl: number) {
  const item = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { mtrl: true, code: true, name: true, isService: true } });
  if (!item) throw new InstallGuideError('Το είδος δεν βρέθηκε στο μητρώο', 404);
  let category: string | null = null;
  let group: string | null = null;
  try {
    const rec = await readSoftoneItem(mtrl);
    const cls = await classificationOptions(item.isService ? 52 : 51);
    category = rec.category ? cls.categories.find((c) => c.id === rec.category)?.name ?? null : null;
    group = rec.group ? cls.groups.find((g) => g.id === rec.group)?.name ?? null : null;
  } catch (e) {
    console.warn('[install-guide] ταξινόμηση από SoftOne:', (e as Error).message);
  }
  const profile = guideProfile({ category, group, name: item.name, isService: item.isService });
  return { ...item, category, group, profile };
}

export type InstallGuideState = {
  item: { mtrl: number; code: string; name: string; isService: boolean; category: string | null; group: string | null };
  profile: Pick<GuideProfile, 'key' | 'label' | 'focus'>;
  notes: InstallNoteDTO[];
  media: ItemMediaDTO[];
  guides: InstallGuideDTO[];
};

/** Όλα όσα χρειάζεται το modal: είδος/προφίλ, ηχογραφήσεις, φωτογραφίες/βίντεο (για σήμανση), οδηγοί. */
export async function installGuideState(mtrl: number): Promise<InstallGuideState> {
  const [ctx, notes, media, guides] = await Promise.all([
    itemContext(mtrl),
    prisma.itemInstallNote.findMany({ where: { mtrl }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.itemMedia.findMany({ where: { mtrl, kind: { in: ['IMAGE', 'VIDEO'] } }, orderBy: [{ kind: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.itemInstallGuide.findMany({ where: { mtrl }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  const docs = new Set((await prisma.itemMedia.findMany({ where: { mtrl, kind: 'DOCUMENT' }, select: { id: true } })).map((d) => d.id));
  return {
    item: { mtrl, code: ctx.code, name: ctx.name, isService: ctx.isService, category: ctx.category, group: ctx.group },
    profile: { key: ctx.profile.key, label: ctx.profile.label, focus: ctx.profile.focus },
    notes: notes.map(noteDTO),
    media: media.map(toDTO),
    // Ένα PDF που σβήστηκε από τα «Αρχεία» δεν προσφέρεται πια για άνοιγμα.
    guides: guides.map(guideDTO).map((g) => (g.pdfMediaId && !docs.has(g.pdfMediaId) ? { ...g, pdfUrl: null } : g)),
  };
}

async function ownedNote(mtrl: number, id: string) {
  const n = await prisma.itemInstallNote.findUnique({ where: { id } });
  if (!n || n.mtrl !== mtrl) throw new InstallGuideError('Η ηχογράφηση δεν βρέθηκε', 404);
  return n;
}

/** Όροι που ίσως ακουστούν: το όνομα του είδους και τα χαρακτηριστικά του. */
async function vocabularyFor(mtrl: number, name: string) {
  const attrs = await listAttributes(mtrl).catch(() => []);
  return [name, ...attrs.map((a) => `${a.name} ${a.value}${a.unit ? ` ${a.unit}` : ''}`)];
}

/**
 * Νέα ηχογράφηση: ο ήχος αποθηκεύεται στο Bunny και απομαγνητοφωνείται. Αν η απομαγνητοφώνηση
 * αποτύχει, η ηχογράφηση ΜΕΝΕΙ (με κενό κείμενο) και ο χρήστης ξαναδοκιμάζει — δεν χάνεται τίποτα.
 */
export async function addAudioNote(input: { mtrl: number; audio: Buffer; mimeType: string; durationSec: number | null; userId: string | null }) {
  const { mtrl, audio, userId } = input;
  const format = audioFormatOf(input.mimeType || '');
  if (!format) throw new InstallGuideError(`Μη υποστηριζόμενη μορφή ήχου (${input.mimeType || 'άγνωστη'})`, 415);
  if (!audio.byteLength) throw new InstallGuideError('Η ηχογράφηση είναι κενή');
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new InstallGuideError('Η ηχογράφηση είναι πολύ μεγάλη — χώρισέ τη σε μικρότερες', 413);
  const item = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { name: true } });
  if (!item) throw new InstallGuideError('Το είδος δεν βρέθηκε στο μητρώο', 404);

  const key = `items/${mtrl}/install-audio/${Date.now()}-${id8()}.${format}`;
  const contentType = input.mimeType.split(';')[0] || `audio/${format}`;
  const up = await bunnyUpload({ key, body: audio, contentType });
  const last = await prisma.itemInstallNote.aggregate({ where: { mtrl }, _max: { order: true } });
  const note = await prisma.itemInstallNote.create({
    data: {
      mtrl, audioKey: key, audioUrl: up.publicUrl, order: (last._max.order ?? -1) + 1, createdById: userId,
      durationSec: input.durationSec != null && Number.isFinite(input.durationSec) ? Math.round(input.durationSec * 10) / 10 : null,
    },
  });
  let error: string | null = null;
  try {
    const transcript = await transcribeInstallAudio(audio, format, { mtrl, userId, vocabulary: await vocabularyFor(mtrl, item.name) });
    const updated = await prisma.itemInstallNote.update({ where: { id: note.id }, data: { transcript } });
    return { note: noteDTO(updated), error };
  } catch (e) {
    console.error('[install-guide] απομαγνητοφώνηση', e);
    error = 'Η απομαγνητοφώνηση απέτυχε — η ηχογράφηση κρατήθηκε, δοκίμασε «Νέα απομαγνητοφώνηση».';
    return { note: noteDTO(note), error };
  }
}

/** Σημείωση γραμμένη με το χέρι (χωρίς ήχο). */
export async function addTextNote(mtrl: number, transcript: string, userId: string | null) {
  const exists = await prisma.softoneItem.count({ where: { mtrl } });
  if (!exists) throw new InstallGuideError('Το είδος δεν βρέθηκε στο μητρώο', 404);
  const last = await prisma.itemInstallNote.aggregate({ where: { mtrl }, _max: { order: true } });
  const n = await prisma.itemInstallNote.create({ data: { mtrl, transcript: transcript.trim(), order: (last._max.order ?? -1) + 1, createdById: userId } });
  return noteDTO(n);
}

export async function updateNoteText(mtrl: number, id: string, transcript: string) {
  await ownedNote(mtrl, id);
  return noteDTO(await prisma.itemInstallNote.update({ where: { id }, data: { transcript: transcript.trim() } }));
}

/** Ξανά απομαγνητοφώνηση από τον αποθηκευμένο ήχο (π.χ. μετά από αποτυχία ή για καλύτερο κείμενο). */
export async function retranscribeNote(mtrl: number, id: string, userId: string | null) {
  const n = await ownedNote(mtrl, id);
  if (!n.audioUrl || !n.audioKey) throw new InstallGuideError('Η σημείωση δεν έχει ήχο');
  const format = audioFormatOf(n.audioKey.split('.').pop() ?? '');
  if (!format) throw new InstallGuideError('Άγνωστη μορφή ήχου');
  const res = await fetch(n.audioUrl, { cache: 'no-store' });
  if (!res.ok) throw new InstallGuideError(`Ο ήχος δεν διαβάζεται από το CDN (${res.status})`, 502);
  const item = await prisma.softoneItem.findUnique({ where: { mtrl }, select: { name: true } });
  const transcript = await transcribeInstallAudio(Buffer.from(await res.arrayBuffer()), format, { mtrl, userId, vocabulary: await vocabularyFor(mtrl, item?.name ?? '') });
  return noteDTO(await prisma.itemInstallNote.update({ where: { id }, data: { transcript } }));
}

export async function deleteNote(mtrl: number, id: string) {
  const n = await ownedNote(mtrl, id);
  await prisma.itemInstallNote.delete({ where: { id } });
  if (n.audioKey) await bunnyDelete([n.audioKey]).catch((e) => console.warn('[install-guide]', (e as Error).message));
}

async function toJpeg(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CDN ${res.status}`);
  return sharp(Buffer.from(await res.arrayBuffer())).rotate().flatten({ background: '#ffffff' })
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

const fileName = (code: string, name: string, d: Date) => {
  const base = `Οδηγός εγκατάστασης ${code} ${name}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  // Ημερομηνία + ώρα Ελλάδας: δύο οδηγοί της ίδιας μέρας ξεχωρίζουν στα «Αρχεία».
  const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Athens', dateStyle: 'short', timeStyle: 'short' }).format(d).replace(':', '.');
  return `${base} ${stamp}.pdf`;
};

/**
 * Δημιουργία οδηγού: κείμενα ηχογραφήσεων + ΜΟΝΟ τα δείγματα εγκατάστασης + κατηγορία → AI → PDF
 * στα «Αρχεία» του είδους. Επιστρέφει τον νέο οδηγό.
 */
export async function generateInstallGuide(mtrl: number, user: { id: string | null; name?: string | null }): Promise<InstallGuideDTO> {
  const [ctx, notes, sampleRows, attributes] = await Promise.all([
    itemContext(mtrl),
    prisma.itemInstallNote.findMany({ where: { mtrl }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    prisma.itemMedia.findMany({ where: { mtrl, isInstallSample: true, kind: { in: ['IMAGE', 'VIDEO'] } }, orderBy: [{ kind: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] }),
    listAttributes(mtrl).catch(() => []),
  ]);
  const texts = notes.map((n) => n.transcript.trim()).filter(Boolean);
  if (!texts.length) throw new InstallGuideError('Ηχογράφησε (ή γράψε) πρώτα τις οδηγίες εγκατάστασης.');

  // Λήψη + κανονικοποίηση σε JPEG· ένα δείγμα που δεν κατεβαίνει παραλείπεται (δεν ακυρώνει τον οδηγό).
  const candidates = sampleImages(sampleRows.map(toDTO));
  const fetched = await Promise.all(candidates.map(async (c) => ({ ...c, data: await toJpeg(c.url).catch((e) => { console.warn('[install-guide] δείγμα', c.url, (e as Error).message); return null; }) })));
  const samples = fetched.filter((s): s is typeof s & { data: Buffer } => !!s.data);

  const prompt = buildGuidePrompt({
    item: { code: ctx.code, name: ctx.name, isService: ctx.isService, category: ctx.category, group: ctx.group },
    profile: ctx.profile, attributes, notes: texts, samples: samples.map((s) => ({ label: s.label })),
  });
  const ai = await composeGuide(prompt, samples.map((s) => `data:image/jpeg;base64,${s.data.toString('base64')}`), { mtrl, userId: user.id });
  const content = parseGuide(ai.text, samples.length);

  const now = new Date();
  const pdf = await renderGuidePdf(content, {
    code: ctx.code, name: ctx.name, profileLabel: ctx.profile.label, category: ctx.group ?? ctx.category, createdAt: now, author: user.name ?? null,
  }, samples.map((s) => ({ data: s.data, caption: s.label })));
  const doc = await uploadItemMedia({ mtrl, kind: 'DOCUMENT', buffer: pdf, name: fileName(ctx.code, ctx.name, now), mimeType: 'application/pdf', userId: user.id });

  const row = await prisma.itemInstallGuide.create({
    data: {
      mtrl, content, profile: ctx.profile.key, category: [ctx.category, ctx.group].filter(Boolean).join(' · ') || null,
      model: ai.model, provider: ai.provider, pdfMediaId: doc.id, pdfUrl: doc.url, createdById: user.id,
    },
  });
  return guideDTO(row);
}
