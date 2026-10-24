// lib/rfp-agent.ts — SERVER. Ένας γύρος του AI βοηθού «Ζητήστε προσφορά»: φορτώνει τι αναλαμβάνει η εταιρία
// (ρύθμιση `company.capabilities`, αλλιώς η προεπιλογή) και παραδείγματα από τις συνταγές τοποθέτησης.
import 'server-only';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { siteCompany } from '@/lib/site-company';
import { aiComplete } from '@/lib/contracts/ai';
import { AgentParseError, buildAgentPrompt, DEFAULT_CAPABILITIES, parseAgentTurn, type AgentTurn, type ChatMsg, type RfpDraft } from './rfp-agent-core';

export async function rfpAgentTurn(p: { history: ChatMsg[]; draft: RfpDraft; photos: number; customerName: string | null; userId: string }): Promise<AgentTurn> {
  const [caps, recipes, company] = await Promise.all([
    getSetting<string>('company.capabilities'),
    prisma.installRecipe.findMany({ select: { name: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
    siteCompany(),
  ]);
  // Τα ονόματα των συνταγών ως παραδείγματα (χωρίς τιμές ή κωδικούς).
  const catalog = [...new Set(recipes.map((r) => r.name.replace(/^(ΕΠΙΔΕΙΞΗ|ΔΟΚΙΜΗ[^—]*—)\s*·?\s*/i, '').split('—')[0].trim()).filter(Boolean))].slice(0, 20);
  const { system, user } = buildAgentPrompt({ capabilities: caps?.trim() || DEFAULT_CAPABILITIES, catalog, company: company.brand, history: p.history, draft: p.draft, photos: p.photos, customerName: p.customerName });
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await aiComplete(system, attempt ? `${user}\n\nΠΡΟΣΟΧΗ: απάντησε ΜΟΝΟ με το JSON της μορφής που ζητήθηκε.` : user, { userId: p.userId, contractId: null, operation: 'portal.rfpAgent' });
    try { return parseAgentTurn(text, p.draft); } catch (e) { if (!(e instanceof AgentParseError)) throw e; last = e; }
  }
  throw last instanceof Error ? last : new Error('Ο βοηθός δεν απάντησε');
}
