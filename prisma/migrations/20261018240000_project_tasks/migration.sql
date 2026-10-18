-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "prjc" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE,
    "durationValue" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "durationUnit" TEXT NOT NULL DEFAULT 'DAYS',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "inCalendar" BOOLEAN NOT NULL DEFAULT false,
    "icsSequence" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTaskDependency" (
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskDependency_pkey" PRIMARY KEY ("taskId","dependsOnId")
);

-- CreateTable
CREATE TABLE "ProjectTaskParty" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "partnerId" TEXT,
    "trdr" INTEGER,

    CONSTRAINT "ProjectTaskParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTaskFile" (
    "taskId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskFile_pkey" PRIMARY KEY ("taskId","fileId")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationValue" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "durationUnit" TEXT NOT NULL DEFAULT 'DAYS',
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "inCalendar" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "TaskTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTask_prjc_sortOrder_idx" ON "ProjectTask"("prjc", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectTask_inCalendar_startDate_idx" ON "ProjectTask"("inCalendar", "startDate");

-- CreateIndex
CREATE INDEX "ProjectTaskDependency_dependsOnId_idx" ON "ProjectTaskDependency"("dependsOnId");

-- CreateIndex
CREATE INDEX "ProjectTaskParty_taskId_idx" ON "ProjectTaskParty"("taskId");

-- CreateIndex
CREATE INDEX "ProjectTaskParty_userId_idx" ON "ProjectTaskParty"("userId");

-- CreateIndex
CREATE INDEX "ProjectTaskParty_partnerId_idx" ON "ProjectTaskParty"("partnerId");

-- CreateIndex
CREATE INDEX "ProjectTaskParty_trdr_idx" ON "ProjectTaskParty"("trdr");

-- CreateIndex
CREATE INDEX "ProjectTaskFile_fileId_idx" ON "ProjectTaskFile"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_name_key" ON "TaskTemplate"("name");

-- CreateIndex
CREATE INDEX "TaskTemplateItem_templateId_sortOrder_idx" ON "TaskTemplateItem"("templateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplateItem_templateId_key_key" ON "TaskTemplateItem"("templateId", "key");

-- AddForeignKey
ALTER TABLE "ProjectTaskDependency" ADD CONSTRAINT "ProjectTaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskDependency" ADD CONSTRAINT "ProjectTaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskParty" ADD CONSTRAINT "ProjectTaskParty_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskFile" ADD CONSTRAINT "ProjectTaskFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskFile" ADD CONSTRAINT "ProjectTaskFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "EntityFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateItem" ADD CONSTRAINT "TaskTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

