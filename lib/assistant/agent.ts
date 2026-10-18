// lib/assistant/agent.ts — SERVER. Ο βρόχος του Air Jordan: ερώτημα → μνήμη (pgvector) → εργαλεία →
// απάντηση με παραπομπές. Το μοντέλο το διαλέγει το OpenRouter (`openrouter/auto`) ανά ερώτημα.
import 'server-only';
import { prisma } from '@/lib/db';
import { chat, type ChatMessage, type ToolCall } from './openrouter';
import { embedQuery, searchKnowledge, searchMemories, type MemoryHit } from './search';
import { detectIntent } from './text';
import { parsePeriod } from './period';
import { runTool, stepLabel, TOOL_DEFS, type AppointmentCard, type Ref, type ToolContext } from './tools';
import { pickCitations } from './citations';
import { reindexIfStale } from './indexer';

export type AgentEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'step'; label: string }
  | { type: 'answer'; messageId: string; text: string; citations: Ref[]; model: string; cards?: AppointmentCard[] }
  | { type: 'error'; message: string };

const MAX_ROUNDS = 6;
const MAX_TOOL_CHARS = 14_000;
const HISTORY = 10;

function systemPrompt(opts: { name: string | null; canFinancials: boolean; memories: MemoryHit[]; today: string }): string {
  const mem = opts.memories.length
    ? opts.memories.map((m) => `- [${m.kind}] ${m.text}${m.refKey ? ` (${m.refKey})` : ''}`).join('\n')
    : '- (τίποτα σχετικό ακόμη)';
  return `Είσαι ο «Air Jordan», ο βοηθός AI της εφαρμογής ATELIER (κατασκευές, μελέτες, διακόσμηση, εμπόριο υλικών) για τους διαχειριστές.
Σήμερα: ${opts.today}. Χρήστης: ${opts.name ?? 'διαχειριστής'}.

ΚΑΝΟΝΕΣ
1. Απαντάς ΠΑΝΤΑ στα Ελληνικά, σύντομα και ουσιαστικά. Ο χρήστης μιλά Ελληνικά με αγγλικούς όρους, συχνά από φωνή: περίμενε λάθη μεταγραφής, greeklish, χωρίς τόνους, κομμάτια κωδικών, παρατσούκλια. Κατάλαβε τι εννοεί.
2. ΠΟΤΕ δεν μαντεύεις. Κάθε αριθμό, όνομα, κωδικό τον παίρνεις από εργαλείο. Ψάξε πρώτα με search_knowledge για να βρεις την οντότητα, μετά ζήτα λεπτομέρειες (get_project / get_trader / get_item / get_project_materials / list_projects).
3. Αν βρεις πολλές πιθανές οντότητες: όταν η ερώτηση ζητά ΠΟΣΑ (υπόλοιπο, τζίρο, χρέος) και δύο ή περισσότερες ταιριάζουν εξίσου (π.χ. δύο «Παπαδόπουλος»), ΜΗΝ διαλέξεις — ρώτα ποια εννοεί, με κωδικό και επωνυμία της καθεμιάς. Αλλιώς διάλεξε την πιο πιθανή και ανέφερε τις άλλες σε μία γραμμή («Εννοείτε μήπως…;»). Αν δεν βρεις τίποτα, πες το καθαρά.
4. Αν λείπουν δεδομένα (π.χ. δεν έχουν υπολογιστεί οικονομικά, το SoftOne δεν απάντησε, δεν υπάρχει αγορά), ΠΕΣ ΤΟ ρητά — μην το καλύπτεις με γενικότητες.
5. Παραπομπές: ανέφερε πάντα τους κωδικούς στους οποίους βασίζεσαι (κωδικός έργου, αριθμός παραστατικού, κωδικός είδους/συναλλασσομένου) μέσα στο κείμενο, π.χ. «(έργο 2026-015, τιμ. ΤΔΑ0000123)».
6. Μόνο ΑΝΑΓΝΩΣΗ: δεν δημιουργείς, δεν αλλάζεις, δεν διαγράφεις τίποτα στο SoftOne ή στην εφαρμογή — η ΜΟΝΗ εξαίρεση είναι η πρόταση ραντεβού (κανόνας 10), που ολοκληρώνει ο ίδιος ο χρήστης με «Επιβεβαίωση». Για οτιδήποτε άλλο εξήγησε σε ποια σελίδα της εφαρμογής γίνεται.
7. ${opts.canFinancials ? 'Τα οικονομικά έργων (κέρδος, περιθώριο) είναι ΕΣΩΤΕΡΙΚΗ πληροφορία — δίνονται μόνο σε αυτόν τον χρήστη.' : 'Ο χρήστης ΔΕΝ έχει δικαίωμα στα οικονομικά έργων — μην τα αναφέρεις.'}
8. ΟΙΚΟΝΟΜΙΚΑ: πες ΠΑΝΤΑ την περίοδο (με ημερομηνίες) και αν τα ποσά είναι καθαρά (χωρίς ΦΠΑ) ή μικτά (με ΦΠΑ). Τζίρος/αγορές περιόδου → get_turnover (μετρά τιμολόγια μείον πιστωτικά — ανέφερε πόσα παραστατικά και τα μεγαλύτερα). Υπόλοιπο προμηθευτή/πελάτη → get_trader (η καρτέλα του SoftOne). Υπόλοιπο πελάτη ΣΕ ΕΡΓΟ → get_customer_project_balance (ανέφερε τα «Δεδομένα που λείπουν» αν υπάρχουν). Αν η περίοδος δεν είναι σαφής, ρώτα.
9. Μορφή: ποσά σε € με ελληνική μορφή (1.234,56 €), ημερομηνίες ηη/μμ/εεεε. Markdown με λίστες ή μικρό πίνακα μόνο όταν βοηθά. Χωρίς εισαγωγές τύπου «Φυσικά!». ΜΗΝ δείχνεις εσωτερικά κλειδιά (trader:104, project:12) — μόνο κωδικούς/ονόματα.
10. ΗΜΕΡΟΛΟΓΙΟ: «τι ραντεβού έχω σήμερα/αύριο/αυτή την εβδομάδα» → get_appointments (ώρα Αθήνας, με ποιον, πού). «Κλείσε μου ραντεβού…» → κάλεσε ΚΑΤΕΥΘΕΙΑΝ propose_appointment (with = το όνομα όπως το είπε, when = η φράση για το πότε) — ΟΧΙ search_knowledge πρώτα· το εργαλείο βρίσκει μόνο του τον πελάτη (και με πτώσεις: «Κουνά» = ΚΟΥΝΑΣ) και επιστρέφει υποψηφίους μόνο αν υπάρχει πραγματική αμφιβολία. ΕΣΥ ΔΕΝ ΚΛΕΙΝΕΙΣ ΡΑΝΤΕΒΟΥ: εμφανίζεται κάρτα επιβεβαίωσης και κλείνεται ΜΟΝΟ όταν ο χρήστης πατήσει «Επιβεβαίωση» — πες το με μία πρόταση, ανέφερε τυχόν προειδοποιήσεις/υποθέσεις (π.χ. «στις 4» ⇒ 16:00) και ΜΗΝ γράψεις ότι κλείστηκε. Αν υπάρχουν πολλοί υποψήφιοι ή λείπει η ώρα, ρώτα. Νέος πελάτης που δεν υπάρχει: παρέπεμψε στο Ημερολόγιο → Νέο ραντεβού.
11. ΜΑΘΗΣΗ: όταν ο χρήστης σε διορθώνει ή σου εξηγεί τι εννοεί («όταν λέω Χ εννοώ Υ», «ο Γιώργος είναι ο προμηθευτής Ζ», «θέλω τα ποσά χωρίς ΦΠΑ»), κάλεσε remember με μία αυτοτελή πρόταση, και συνέχισε την απάντηση. Μην αποθηκεύεις μεταβλητά νούμερα.

ΤΙ ΕΧΕΙΣ ΜΑΘΕΙ (από προηγούμενες συνομιλίες — ισχύουν, αλλά τα νούμερα τα ξαναελέγχεις):
${mem}`;
}

function parseArgs(tc: ToolCall): Record<string, unknown> {
  try {
    const v = JSON.parse(tc.function.arguments || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export interface AgentInput {
  userId: string;
  userName: string | null;
  canFinancials: boolean;
  canSchedule?: boolean;
  conversationId?: string | null;
  question: string;
  signal?: AbortSignal;
}

export async function runAgent(input: AgentInput, emit: (e: AgentEvent) => void): Promise<void> {
  const question = input.question.trim().slice(0, 4000);
  void reindexIfStale();

  // Συνομιλία: μόνο του ίδιου χρήστη.
  let conv = input.conversationId
    ? await prisma.assistantConversation.findFirst({ where: { id: input.conversationId, userId: input.userId } })
    : null;
  conv ??= await prisma.assistantConversation.create({ data: { userId: input.userId, title: question.slice(0, 80) } });
  emit({ type: 'conversation', id: conv.id, title: conv.title });

  const history = await prisma.assistantMessage.findMany({
    where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' }, take: HISTORY, select: { role: true, content: true },
  });
  const userMsg = await prisma.assistantMessage.create({ data: { conversationId: conv.id, role: 'user', content: question } });

  emit({ type: 'step', label: 'Θυμάμαι τι ξέρω' });
  // Το ερώτημα μαζί με την προηγούμενη ερώτηση: «και η τελευταία τιμή;» χρειάζεται συμφραζόμενα.
  const prevUser = history.find((h) => h.role === 'user')?.content;
  const recallText = prevUser && question.length < 60 ? `${prevUser}\n${question}` : question;
  const vec = await embedQuery(recallText, input.userId);
  const [memories, hints] = await Promise.all([
    searchMemories(recallText, vec),
    searchKnowledge(recallText, { vector: vec, limit: 6, userId: input.userId }),
  ]);
  const intent = detectIntent(question);
  const period = parsePeriod(question);

  const ctx: ToolContext = { userId: input.userId, canFinancials: input.canFinancials, canSchedule: !!input.canSchedule, messageId: userMsg.id, vector: vec };
  const visibleHints = input.canFinancials ? hints : hints.map((h) => ({ ...h, body: h.body.replace(/^Οικονομικά.*$/gm, '') }));
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt({ name: input.userName, canFinancials: input.canFinancials, memories, today: new Date().toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' }) }) },
    ...history.reverse().map((h) => ({ role: h.role === 'assistant' ? 'assistant' as const : 'user' as const, content: h.content })),
    {
      role: 'user',
      content: `${question}\n\n---\n(Αυτόματο πλαίσιο — όχι από τον χρήστη)\nΠιθανή πρόθεση: ${JSON.stringify({ entities: intent.entities, side: intent.traderSide, turnover: intent.wantsTurnover, period: period ?? undefined, financials: intent.wantsFinancials, balance: intent.wantsBalance, documents: intent.wantsDocuments, stock: intent.wantsStock, price: intent.wantsPrice, contacts: intent.wantsContacts, location: intent.wantsLocation, codes: intent.codes })}\nΣχετικά από τη μνήμη (ref · τίτλος):\n${visibleHints.map((h) => `- ${h.refKey} · ${h.title}`).join('\n') || '- κανένα'}`,
    },
  ];

  const hintRefs: Ref[] = visibleHints.map((h) => ({ refKey: h.refKey, label: h.title, url: h.url }));
  const refs: Ref[] = [];
  const cards: AppointmentCard[] = [];
  const toolLog: { name: string; args: Record<string, unknown>; ms: number; ok: boolean }[] = [];
  let cost = 0;
  let model = '';
  let answer: string | null = null;

  for (let round = 0; round < MAX_ROUNDS && answer == null; round++) {
    const last = round === MAX_ROUNDS - 1;
    const res = await chat(messages, { tools: last ? undefined : TOOL_DEFS, userId: input.userId, conversationId: conv.id, signal: input.signal });
    cost += res.costUsd;
    model = res.model;
    if (!res.toolCalls.length) {
      answer = res.content?.trim() || null;
      if (!answer) messages.push({ role: 'user', content: 'Δώσε τώρα την τελική απάντηση στα Ελληνικά με βάση όσα βρήκες.' });
      continue;
    }
    messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
    const outputs = await Promise.all(res.toolCalls.map(async (tc) => {
      const args = parseArgs(tc);
      emit({ type: 'step', label: stepLabel(tc.function.name, args) });
      const t = Date.now();
      try {
        const r = await runTool(tc.function.name, args, ctx);
        // Αποτελέσματα αναζήτησης = υποψήφιοι, όχι πηγές: μετρούν μόνο αν η απάντηση τα ονομάζει.
        (tc.function.name === 'search_knowledge' ? hintRefs : refs).push(...r.refs);
        if (r.card) cards.push(r.card);
        toolLog.push({ name: tc.function.name, args, ms: Date.now() - t, ok: true });
        return { id: tc.id, content: JSON.stringify(r.data).slice(0, MAX_TOOL_CHARS) };
      } catch (e) {
        toolLog.push({ name: tc.function.name, args, ms: Date.now() - t, ok: false });
        return { id: tc.id, content: JSON.stringify({ error: (e as Error).message?.slice(0, 200) ?? 'σφάλμα' }) };
      }
    }));
    for (const o of outputs) messages.push({ role: 'tool', tool_call_id: o.id, content: o.content });
  }

  const text = answer ?? 'Δεν κατάφερα να ολοκληρώσω την απάντηση — δοκιμάστε να το διατυπώσετε πιο συγκεκριμένα.';
  const citations = pickCitations(text, refs, hintRefs);
  const saved = await prisma.assistantMessage.create({
    data: { conversationId: conv.id, role: 'assistant', content: text, citations: citations as never, toolCalls: toolLog as never, model, costUsd: cost },
  });
  await prisma.assistantConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
  // Μόνο η τελευταία πρόταση ραντεβού (αν ο βοηθός ξαναπρότεινε μετά από διόρθωση).
  emit({ type: 'answer', messageId: saved.id, text, citations, model, cards: cards.slice(-1) });
}
