-- CreateTable
CREATE TABLE "DeviceEnrollmentToken" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('det'::text),
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 100,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceEnrollmentToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceEnrollmentToken_tokenHash_key" ON "DeviceEnrollmentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceEnrollmentToken_organizationId_idx" ON "DeviceEnrollmentToken"("organizationId");

-- CreateIndex
CREATE INDEX "DeviceEnrollmentToken_memberId_idx" ON "DeviceEnrollmentToken"("memberId");

-- AddForeignKey
ALTER TABLE "DeviceEnrollmentToken" ADD CONSTRAINT "DeviceEnrollmentToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEnrollmentToken" ADD CONSTRAINT "DeviceEnrollmentToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
