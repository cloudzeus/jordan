import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/admin/page-header';
import { AirJordanIcon } from '@/components/assistant/air-jordan-icon';
import { getAssistantUser } from '@/lib/assistant/access';
import { lastIndexAt } from '@/lib/assistant/indexer';
import { AssistantWorkspace, type MemoryRow, type KnowledgeStat } from './assistant-workspace';
import type { ChatMsg, Citation } from '@/components/assistant/air-jordan-chat';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  project: 'Έργα', document: 'Παραστατικά έργων', trader: 'Πελάτες & προμηθευτές', item: 'Είδη', service: 'Υπηρεσίες',
  lookup: 'Μητρώα', classification: 'Κατηγορίες & ομάδες', unit: 'Μονάδες μέτρησης', partner: 'Συνεργάτες', offer: 'Δυναμικές προσφορές',
  order_request: 'Αιτήματα παραγγελίας', appointment: 'Ραντεβού', lead: 'Leads', wiki: 'Οδηγός χρήσης', glossary: 'Γλωσσάρι SoftOne',
};

// Air Jordan — βοηθός AI (μόνο ADMIN / SUPER_ADMIN). Συνομιλία με ιστορικό + η μνήμη του.
export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; tab?: string }> }) {
  const u = await getAssistantUser();
  if (!u) redirect('/admin?error=forbidden');
  const sp = await searchParams;

  const [conversations, selected, memories, stats, indexedAt] = await Promise.all([
    prisma.assistantConversation.findMany({ where: { userId: u.id }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, updatedAt: true } }),
    sp.c
      ? prisma.assistantConversation.findFirst({
        where: { id: sp.c, userId: u.id },
        include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, citations: true, feedback: true } } },
      })
      : null,
    u.canMemory
      ? prisma.assistantMemory.findMany({ orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, kind: true, text: true, refKey: true, uses: true, updatedAt: true } })
      : Promise.resolve([]),
    u.canMemory ? prisma.assistantChunk.groupBy({ by: ['source'], _count: true }) : Promise.resolve([]),
    lastIndexAt(),
  ]);

  const initialMessages: ChatMsg[] = (selected?.messages ?? []).map((m) => ({
    id: m.id, role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content,
    citations: (m.citations ?? []) as unknown as Citation[], feedback: m.feedback,
  }));
  const memoryRows: MemoryRow[] = memories.map((m) => ({ ...m, updatedAt: m.updatedAt.toISOString() }));
  const knowledge: KnowledgeStat[] = stats
    .map((s) => ({ source: s.source, label: SOURCE_LABEL[s.source] ?? s.source, count: s._count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="w-full">
      <PageHeader
        icon={<AirJordanIcon />}
        title="Air Jordan"
        description="Ο βοηθός AI της εφαρμογής: ρωτήστε με φωνή ή κείμενο για έργα, συναλλασσόμενους και υλικά."
        helpAnchor="air-jordan"
      />
      <AssistantWorkspace
        tab={sp.tab === 'memory' && u.canMemory ? 'memory' : 'chat'}
        canMemory={u.canMemory}
        conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }))}
        selectedId={selected?.id ?? null}
        initialMessages={initialMessages}
        memories={memoryRows}
        knowledge={knowledge}
        indexedAt={indexedAt}
      />
    </div>
  );
}
