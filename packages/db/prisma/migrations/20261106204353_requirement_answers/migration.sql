-- CreateEnum
CREATE TYPE "AnswerDomain" AS ENUM ('all', 'it', 'ot');

-- CreateEnum
CREATE TYPE "AnswerValue" AS ENUM ('yes', 'incomplete', 'scoped', 'no', 'not_applicable', 'alternate');

-- CreateEnum
CREATE TYPE "AnswerDomainMode" AS ENUM ('single', 'it_ot');

-- CreateEnum
CREATE TYPE "AnswerScoringModel" AS ENUM ('cpg', 'mil', 'tier', 'standard');

-- CreateTable
CREATE TABLE "RequirementAnswer" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('rqa'::text),
    "organizationId" TEXT NOT NULL,
    "frameworkInstanceId" TEXT NOT NULL,
    "requirementId" TEXT,
    "customRequirementId" TEXT,
    "domain" "AnswerDomain" NOT NULL DEFAULT 'all',
    "answer" "AnswerValue" NOT NULL,
    "justification" TEXT,
    "comment" TEXT,
    "markForReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkAnswerProfile" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('fap'::text),
    "frameworkId" TEXT NOT NULL,
    "answerOptions" TEXT[],
    "domainMode" "AnswerDomainMode" NOT NULL DEFAULT 'single',
    "scoring" "AnswerScoringModel" NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameworkAnswerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkInstanceAnswerSetting" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('fias'::text),
    "frameworkInstanceId" TEXT NOT NULL,
    "domains" "AnswerDomain"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrameworkInstanceAnswerSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequirementAnswer_organizationId_idx" ON "RequirementAnswer"("organizationId");

-- CreateIndex
CREATE INDEX "RequirementAnswer_frameworkInstanceId_idx" ON "RequirementAnswer"("frameworkInstanceId");

-- CreateIndex
CREATE INDEX "RequirementAnswer_requirementId_idx" ON "RequirementAnswer"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementAnswer_frameworkInstanceId_requirementId_domain_key" ON "RequirementAnswer"("frameworkInstanceId", "requirementId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementAnswer_frameworkInstanceId_customRequirementId_d_key" ON "RequirementAnswer"("frameworkInstanceId", "customRequirementId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkAnswerProfile_frameworkId_key" ON "FrameworkAnswerProfile"("frameworkId");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkInstanceAnswerSetting_frameworkInstanceId_key" ON "FrameworkInstanceAnswerSetting"("frameworkInstanceId");

-- AddForeignKey
ALTER TABLE "RequirementAnswer" ADD CONSTRAINT "RequirementAnswer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAnswer" ADD CONSTRAINT "RequirementAnswer_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAnswer" ADD CONSTRAINT "RequirementAnswer_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FrameworkEditorRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAnswer" ADD CONSTRAINT "RequirementAnswer_customRequirementId_fkey" FOREIGN KEY ("customRequirementId") REFERENCES "CustomRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAnswer" ADD CONSTRAINT "RequirementAnswer_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkAnswerProfile" ADD CONSTRAINT "FrameworkAnswerProfile_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "FrameworkEditorFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkInstanceAnswerSetting" ADD CONSTRAINT "FrameworkInstanceAnswerSetting_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
