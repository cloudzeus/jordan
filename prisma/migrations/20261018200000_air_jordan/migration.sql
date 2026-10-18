-- Air Jordan: μνήμη RAG σε pgvector + pg_trgm.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TYPE "AiScope" ADD VALUE IF NOT EXISTS 'ASSISTANT';

CREATE TABLE "AssistantChunk" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "meta" JSONB,
    "searchText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1536),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantChunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssistantChunk_refKey_key" ON "AssistantChunk"("refKey");
CREATE INDEX "AssistantChunk_source_idx" ON "AssistantChunk"("source");
CREATE INDEX "AssistantChunk_searchText_trgm_idx" ON "AssistantChunk" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX "AssistantChunk_embedding_hnsw_idx" ON "AssistantChunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "AssistantMemory" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "refKey" TEXT,
    "searchText" TEXT NOT NULL,
    "embedding" vector(1536),
    "userId" TEXT,
    "messageId" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantMemory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantMemory_kind_idx" ON "AssistantMemory"("kind");
CREATE INDEX "AssistantMemory_userId_idx" ON "AssistantMemory"("userId");
CREATE INDEX "AssistantMemory_searchText_trgm_idx" ON "AssistantMemory" USING gin ("searchText" gin_trgm_ops);
CREATE INDEX "AssistantMemory_embedding_hnsw_idx" ON "AssistantMemory" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantConversation_userId_updatedAt_idx" ON "AssistantConversation"("userId", "updatedAt");

CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "toolCalls" JSONB,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION,
    "feedback" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
