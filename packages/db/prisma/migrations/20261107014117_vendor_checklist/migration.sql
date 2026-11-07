-- CreateEnum
CREATE TYPE "VendorChecklistKind" AS ENUM ('epa_supplier', 'epa_integrator_msp');

-- CreateTable
CREATE TABLE "VendorChecklistAssessment" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('vca'::text),
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "VendorChecklistKind" NOT NULL,
    "contractReference" TEXT,
    "evaluationFrequency" TEXT,
    "notes" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "assessedAt" TIMESTAMP(3),
    "assessedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorChecklistAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorChecklistAssessment_organizationId_idx" ON "VendorChecklistAssessment"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorChecklistAssessment_vendorId_kind_key" ON "VendorChecklistAssessment"("vendorId", "kind");

-- AddForeignKey
ALTER TABLE "VendorChecklistAssessment" ADD CONSTRAINT "VendorChecklistAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorChecklistAssessment" ADD CONSTRAINT "VendorChecklistAssessment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorChecklistAssessment" ADD CONSTRAINT "VendorChecklistAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
