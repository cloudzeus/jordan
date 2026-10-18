// Επανευρετηρίαση της μνήμης του Air Jordan (AssistantChunk + embeddings). `npm run assistant:reindex`
import 'dotenv/config';
import { reindexKnowledge } from '@/lib/assistant/indexer';
import { prisma } from '@/lib/db';

const run = await reindexKnowledge();
console.log(JSON.stringify(run));
const bySource = await prisma.assistantChunk.groupBy({ by: ['source'], _count: true });
console.log(bySource.map((r) => `${r.source}: ${r._count}`).join(' · '));
await prisma.$disconnect();
