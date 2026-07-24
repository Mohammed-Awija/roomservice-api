-- CreateEnum
CREATE TYPE "ServiceComponentType" AS ENUM ('SINGLE_SELECT', 'MULTI_SELECT', 'IMAGE', 'INFO_DISPLAY', 'TIME_RANGE', 'DATE', 'TEXT_FIELD', 'NUMBER', 'GUEST_INFO', 'QUANTITY_PRICED', 'PRICE', 'LINK', 'WIFI_QR');

-- CreateEnum
CREATE TYPE "ComponentSetBy" AS ENUM ('GUEST', 'ADMIN', 'NONE');

-- DropForeignKey
ALTER TABLE "ModifierGroup" DROP CONSTRAINT "ModifierGroup_offeringNodeId_fkey";

-- DropForeignKey
ALTER TABLE "ModifierGroup" DROP CONSTRAINT "ModifierGroup_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ModifierOption" DROP CONSTRAINT "ModifierOption_modifierGroupId_fkey";

-- DropForeignKey
ALTER TABLE "ModifierOption" DROP CONSTRAINT "ModifierOption_organizationId_fkey";

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "componentValues" JSONB;

-- DropTable
DROP TABLE "ModifierGroup";

-- DropTable
DROP TABLE "ModifierOption";

-- DropEnum
DROP TYPE "ModifierSelectionType";

-- CreateTable
CREATE TABLE "ServiceComponent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "offeringNodeId" TEXT NOT NULL,
    "type" "ServiceComponentType" NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "setBy" "ComponentSetBy" NOT NULL DEFAULT 'GUEST',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceComponent_organizationId_idx" ON "ServiceComponent"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceComponent_offeringNodeId_idx" ON "ServiceComponent"("offeringNodeId");

-- AddForeignKey
ALTER TABLE "ServiceComponent" ADD CONSTRAINT "ServiceComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceComponent" ADD CONSTRAINT "ServiceComponent_offeringNodeId_fkey" FOREIGN KEY ("offeringNodeId") REFERENCES "OfferingNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

