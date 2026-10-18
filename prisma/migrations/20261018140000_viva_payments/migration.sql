-- CreateTable
CREATE TABLE "VivaPayment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "env" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pallets" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "level" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidCents" INTEGER,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "email" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "lastError" TEXT,
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VivaPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VivaOrder" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "transactionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VivaOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VivaRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VivaRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VivaWebhookEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventTypeId" INTEGER NOT NULL,
    "messageId" TEXT,
    "orderCode" TEXT,
    "transactionId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "result" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VivaWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VivaPayment_token_key" ON "VivaPayment"("token");

-- CreateIndex
CREATE INDEX "VivaPayment_reservationId_idx" ON "VivaPayment"("reservationId");

-- CreateIndex
CREATE INDEX "VivaPayment_status_idx" ON "VivaPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VivaOrder_orderCode_key" ON "VivaOrder"("orderCode");

-- CreateIndex
CREATE INDEX "VivaOrder_paymentId_idx" ON "VivaOrder"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "VivaRefund_key_key" ON "VivaRefund"("key");

-- CreateIndex
CREATE INDEX "VivaRefund_paymentId_idx" ON "VivaRefund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "VivaWebhookEvent_dedupeKey_key" ON "VivaWebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "VivaWebhookEvent_orderCode_idx" ON "VivaWebhookEvent"("orderCode");

-- AddForeignKey
ALTER TABLE "VivaPayment" ADD CONSTRAINT "VivaPayment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ContainerReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VivaOrder" ADD CONSTRAINT "VivaOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "VivaPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VivaRefund" ADD CONSTRAINT "VivaRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "VivaPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

