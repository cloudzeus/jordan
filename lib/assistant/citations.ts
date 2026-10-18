// lib/assistant/citations.ts — ΚΑΘΑΡΟ. Ποιες πηγές δείχνονται κάτω από την απάντηση.
//
// Προτεραιότητα στις πηγές που ΑΝΑΦΕΡΟΝΤΑΙ στην απάντηση (ο κωδικός ή το όνομά τους εμφανίζεται στο
// κείμενο)· αν καμία, οι πρώτες πηγές που διάβασαν τα εργαλεία. Οι «υποδείξεις» της αρχικής αναζήτησης
// μετρούν μόνο αν αναφέρονται — αλλιώς θα έδειχναν πηγές που δεν χρησιμοποιήθηκαν.
import { fold } from './text';

export interface CitationRef { refKey: string; label: string; url: string | null }

/** Κωδικός/όνομα από ετικέτα «Έργο 2026-015 · Όνομα» → ['2026-015', 'όνομα']. */
export function labelTokens(label: string): string[] {
  const [head, ...rest] = label.split(' · ');
  const code = head.split(' ').slice(1).join(' ').trim() || head.trim();
  const name = rest.join(' · ').trim();
  return [code, name].map(fold).filter((t) => t.length >= 3);
}

export function pickCitations(text: string, toolRefs: CitationRef[], hintRefs: CitationRef[] = [], max = 8): CitationRef[] {
  const t = fold(text);
  const uniq = (xs: CitationRef[]) => [...new Map(xs.map((r) => [r.refKey, r])).values()];
  const tools = uniq(toolRefs);
  const toolKeys = new Set(tools.map((r) => r.refKey));
  const hints = uniq(hintRefs).filter((r) => !toolKeys.has(r.refKey));
  // Πηγή εργαλείου: αρκεί ο κωδικός ή το όνομα. Υπόδειξη αναζήτησης: χρειάζεται το ΟΝΟΜΑ — ένας
  // κωδικός σκέτος («0062») μπορεί να ανήκει σε άλλον τύπο (πελάτης 0062 ≠ προμηθευτής 0062).
  const mentioned = [
    ...tools.filter((r) => labelTokens(r.label).some((tok) => t.includes(tok))),
    ...hints.filter((r) => { const name = labelTokens(r.label)[1]; return !!name && t.includes(name); }),
  ];
  if (mentioned.length) return mentioned.slice(0, max);
  return tools.slice(0, Math.min(4, max));
}
