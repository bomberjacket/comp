-- CreateTable
CREATE TABLE "UtilityRoster" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('uro'::text),
    "organizationId" TEXT NOT NULL,
    "frameworkInstanceId" TEXT NOT NULL,
    "staff" JSONB NOT NULL DEFAULT '{}',
    "contacts" JSONB NOT NULL DEFAULT '{}',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilityRoster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UtilityRoster_frameworkInstanceId_key" ON "UtilityRoster"("frameworkInstanceId");

-- CreateIndex
CREATE INDEX "UtilityRoster_organizationId_idx" ON "UtilityRoster"("organizationId");

-- AddForeignKey
ALTER TABLE "UtilityRoster" ADD CONSTRAINT "UtilityRoster_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityRoster" ADD CONSTRAINT "UtilityRoster_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
