-- CreateEnum
CREATE TYPE "refund_method" AS ENUM ('STORE_CREDIT', 'ORIGINAL_PAYMENT');

-- CreateTable
CREATE TABLE "booking_refunds" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "refund_method" "refund_method" NOT NULL,
    "store_credit_code" TEXT,
    "points_restored" INTEGER NOT NULL DEFAULT 0,
    "gift_card_restored" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_refunds_booking_id_key" ON "booking_refunds"("booking_id");

-- CreateIndex
CREATE INDEX "booking_refunds_user_id_idx" ON "booking_refunds"("user_id");

-- CreateIndex
CREATE INDEX "booking_refunds_created_at_idx" ON "booking_refunds"("created_at");

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_refunds" ADD CONSTRAINT "booking_refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
