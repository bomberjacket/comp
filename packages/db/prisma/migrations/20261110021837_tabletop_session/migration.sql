-- CreateEnum
CREATE TYPE "TabletopSessionStatus" AS ENUM ('planned', 'held');

-- CreateTable
CREATE TABLE "TabletopSession" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('tts'::text),
    "organizationId" TEXT NOT NULL,
    "frameworkInstanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scenario" TEXT,
    "status" "TabletopSessionStatus" NOT NULL DEFAULT 'planned',
    "scheduledFor" TIMESTAMP(3),
    "heldOn" TIMESTAMP(3),
    "facilitator" TEXT,
    "participants" TEXT,
    "cadenceMonths" INTEGER NOT NULL DEFAULT 12,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "afterAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TabletopSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TabletopSession_organizationId_idx" ON "TabletopSession"("organizationId");

-- CreateIndex
CREATE INDEX "TabletopSession_frameworkInstanceId_idx" ON "TabletopSession"("frameworkInstanceId");

-- AddForeignKey
ALTER TABLE "TabletopSession" ADD CONSTRAINT "TabletopSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabletopSession" ADD CONSTRAINT "TabletopSession_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
