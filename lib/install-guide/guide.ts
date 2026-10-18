// lib/install-guide/guide.ts — ΚΑΘΑΡΟ. Η μορφή του οδηγού εγκατάστασης, το prompt προς το AI και
// η ανάγνωση/κανονικοποίηση της απάντησής του (το AI επιστρέφει JSON, όχι πάντα τέλειο).
import { z } from 'zod';
import type { GuideProfile } from './profile';

const str = (max: number) => z.preprocess((v) => (v == null ? '' : String(v)), z.string()).transform((s) => s.trim().slice(0, max));
const list = (max: number, len = 400) => z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []),
  z.array(z.unknown()),
).transform((a) => a.map((x) => String(x ?? '').trim().slice(0, len)).filter(Boolean).slice(0, max));

const Step = z.object({
  title: str(160),
  detail: str(1500),
  tip: str(500).optional(),
  warning: str(500).optional(),
  /** Αριθμοί δειγμάτων (1-based, όπως τα αριθμήσαμε στο prompt) που δείχνουν το βήμα. */
  images: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
    .transform((a) => [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4)),
});

export const InstallGuideSchema = z.object({
  title: str(200),
  summary: str(1200),
  difficulty: str(40),
  duration: str(120),
  crew: str(120),
  tools: list(40),
  materials: list(40),
  preparation: list(20, 800),
  steps: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
    .transform((a) => a.map((s) => Step.safeParse(s)).filter((r) => r.success).map((r) => r.data!).filter((s) => s.title || s.detail).slice(0, 40)),
  safety: list(20, 600),
  qualityChecks: list(20, 600),
  commonMistakes: list(20, 600),
  aftercare: list(20, 600),
});
export type InstallGuide = z.infer<typeof InstallGuideSchema>;
export type InstallStep = InstallGuide['steps'][number];

export class GuideParseError extends Error {}

/** Το JSON της απάντησης — ακόμη κι αν ήρθε μέσα σε ```json …``` ή με κείμενο γύρω του. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* συνέχεια */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* συνέχεια */ }
  }
  throw new GuideParseError('Το AI δεν επέστρεψε έγκυρο JSON οδηγού');
}

/** Κανονικοποίηση: κόβει υπερβολές, πετά άκυρες αναφορές σε εικόνες (> πλήθος δειγμάτων). */
export function parseGuide(text: string, sampleCount: number): InstallGuide {
  const parsed = InstallGuideSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new GuideParseError('Ο οδηγός που επέστρεψε το AI δεν έχει τη σωστή μορφή');
  const g = parsed.data;
  if (!g.steps.length) throw new GuideParseError('Ο οδηγός δεν έχει βήματα — πρόσθεσε περισσότερες οδηγίες');
  g.steps = g.steps.map((s) => ({ ...s, images: s.images.filter((n) => n <= sampleCount) }));
  return g;
}

export interface GuidePromptInput {
  item: { code: string; name: string; isService: boolean; category?: string | null; group?: string | null };
  profile: GuideProfile;
  attributes: { name: string; value: string; unit: string | null }[];
  /** Τα κείμενα των ηχογραφήσεων/σημειώσεων, με τη σειρά τους. */
  notes: string[];
  /** Περιγραφή κάθε δείγματος με τη σειρά που στέλνεται (1-based στο prompt). */
  samples: { label: string }[];
}

export function buildGuidePrompt(p: GuidePromptInput): { system: string; user: string } {
  const system = [
    'Είσαι έμπειρος εργοδηγός και γράφεις οδηγούς εγκατάστασης για μαστόρια (τεχνίτες εργοταξίου) στα Ελληνικά.',
    'Γράφεις απλά, πρακτικά, σε προστακτική («Καθάρισε…», «Άπλωσε…»), με συγκεκριμένους αριθμούς όπου δίνονται.',
    'ΠΗΓΗ ΑΛΗΘΕΙΑΣ είναι οι οδηγίες που εκφώνησε ο υπεύθυνος και οι φωτογραφίες-δείγματα. Μην αντικρούεις ποτέ όσα είπε.',
    'Μπορείς να συμπληρώσεις μόνο ΚΑΘΙΕΡΩΜΕΝΗ καλή πρακτική της κατηγορίας όπου οι οδηγίες σιωπούν — συντηρητικά, χωρίς να εφευρίσκεις',
    'μάρκες, κωδικούς ή αριθμούς που δεν δόθηκαν. Μην αναφέρεις ότι είσαι AI και μην αναφέρεις «ηχογραφήσεις».',
    'Απαντάς ΜΟΝΟ με ένα αντικείμενο JSON, χωρίς κείμενο γύρω του.',
  ].join('\n');

  const it = p.item;
  const attrs = p.attributes.map((a) => `- ${a.name}: ${a.value}${a.unit ? ` ${a.unit}` : ''}`).join('\n');
  const notes = p.notes.map((n, i) => `[${i + 1}] ${n}`).join('\n\n');
  const samples = p.samples.length
    ? p.samples.map((s, i) => `#${i + 1}: ${s.label}`).join('\n')
    : '(κανένα δείγμα)';

  const user = `ΕΙΔΟΣ: ${it.name} (κωδ. ${it.code}) — ${it.isService ? 'υπηρεσία' : 'υλικό/προϊόν'}
Κατηγορία: ${it.category || '—'} · Ομάδα: ${it.group || '—'} · Προφίλ οδηγού: ${p.profile.label}
${attrs ? `Χαρακτηριστικά:\n${attrs}\n` : ''}
ΤΙ ΠΡΕΠΕΙ ΝΑ ΚΑΛΥΠΤΕΙ Ο ΟΔΗΓΟΣ ΓΙΑ ΑΥΤΗ ΤΗΝ ΚΑΤΗΓΟΡΙΑ (όσα εφαρμόζονται):
${p.profile.focus.map((f) => `- ${f}`).join('\n')}
Ασφάλεια που συνήθως χρειάζεται: ${p.profile.safety.join('· ')}

ΟΔΗΓΙΕΣ ΤΟΥ ΥΠΕΥΘΥΝΟΥ (απομαγνητοφώνηση, με τη σειρά που ειπώθηκαν):
${notes || '(καμία)'}

ΔΕΙΓΜΑΤΑ ΕΓΚΑΤΑΣΤΑΣΗΣ (οι εικόνες που ακολουθούν, με αυτή τη σειρά):
${samples}

Γράψε τον οδηγό ως JSON με ΑΚΡΙΒΩΣ αυτά τα πεδία:
{
  "title": "Οδηγός εγκατάστασης — <σύντομο όνομα είδους>",
  "summary": "2-4 προτάσεις: τι εγκαθιστούμε, πού, το βασικό που πρέπει να προσέξει ο τεχνίτης",
  "difficulty": "Εύκολη | Μέτρια | Δύσκολη",
  "duration": "εκτίμηση χρόνου, μόνο αν προκύπτει — αλλιώς κενό",
  "crew": "πόσα άτομα / ειδικότητες, αν προκύπτει — αλλιώς κενό",
  "tools": ["εργαλεία"],
  "materials": ["υλικά & αναλώσιμα (με ποσότητες αν δόθηκαν)"],
  "preparation": ["προετοιμασία πριν ξεκινήσει"],
  "steps": [{ "title": "σύντομος τίτλος βήματος", "detail": "τι κάνει ακριβώς", "tip": "πρακτική συμβουλή ή κενό", "warning": "προσοχή ή κενό", "images": [αριθμοί δειγμάτων που δείχνουν ΑΥΤΟ το βήμα] }],
  "safety": ["μέτρα ασφαλείας"],
  "qualityChecks": ["τι ελέγχει στο τέλος"],
  "commonMistakes": ["συνηθισμένα λάθη να αποφύγει"],
  "aftercare": ["χρόνοι αναμονής, συντήρηση, οδηγίες προς τον πελάτη"]
}
Κάθε δείγμα να μπει σε ΕΝΑ βήμα (εκεί που ταιριάζει καλύτερα). Βήματα: όσα χρειάζονται, συνήθως 5-12.`;
  return { system, user };
}

/** Όριο εικόνων προς το AI/PDF: φωτογραφίες-δείγματα + καρέ βίντεο-δειγμάτων. */
export const MAX_SAMPLE_IMAGES = 16;

type SampleMedia = { kind: string; name: string; url: string; originalUrl: string | null; sampleFrames: string[] };

/**
 * Τα δείγματα με τη σειρά που πάνε στο AI και στο PDF: φωτογραφίες πρώτα, μετά καρέ βίντεο
 * μοιρασμένα κυκλικά (κάθε βίντεο παίρνει τουλάχιστον ένα πριν πάρει κάποιο δεύτερο).
 */
export function sampleImages(media: SampleMedia[], max = MAX_SAMPLE_IMAGES): { url: string; label: string }[] {
  const photos = media.filter((m) => m.kind === 'IMAGE').map((m) => ({ url: m.originalUrl ?? m.url, label: `φωτογραφία «${m.name}»` })).slice(0, max);
  const videos = media.filter((m) => m.kind === 'VIDEO' && m.sampleFrames.length);
  const frames: { url: string; label: string }[] = [];
  for (let round = 0; frames.length < max - photos.length; round++) {
    const batch = videos.filter((v) => round < v.sampleFrames.length);
    if (!batch.length) break;
    for (const v of batch) {
      if (frames.length >= max - photos.length) break;
      frames.push({ url: v.sampleFrames[round], label: `καρέ ${round + 1}/${v.sampleFrames.length} από βίντεο «${v.name}»` });
    }
  }
  return [...photos, ...frames];
}
