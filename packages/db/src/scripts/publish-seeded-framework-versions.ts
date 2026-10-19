import { Prisma } from '@prisma/client';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../client';
import { buildManifestFromFramework } from './backfill-framework-versions';

export interface PublishResult {
  created: number;
  skipped: number;
}

interface VersionEntry {
  frameworkId: string;
  version: string;
  releaseNotes?: string;
}

function isVersionEntry(value: unknown): value is VersionEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.frameworkId === 'string' &&
    typeof v.version === 'string' &&
    (v.releaseNotes === undefined || typeof v.releaseNotes === 'string')
  );
}

function readEntries(versionsDir: string): VersionEntry[] {
  if (!existsSync(versionsDir)) return [];
  const entries: VersionEntry[] = [];
  for (const file of readdirSync(versionsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const parsed: unknown = JSON.parse(readFileSync(path.join(versionsDir, file), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error(`${file}: expected an array of version entries`);
    for (const item of parsed) {
      if (!isVersionEntry(item))
        throw new Error(`${file}: invalid version entry ${JSON.stringify(item)}`);
      entries.push(item);
    }
  }
  return entries;
}

/**
 * Creates FrameworkVersion rows declared by generated seed data sets
 * (`prisma/seed/versions/*.json`). Each entry names a framework and a semver;
 * pairs that already exist are skipped, so the seed stays idempotent. The manifest
 * is a snapshot of the framework's current editor templates, built the same way
 * as the 1.0.0 backfill, so later entries (1.0.1, ...) publish corrections that
 * organizations pick up through FrameworkSyncOperation.
 */
export async function publishSeededFrameworkVersions(versionsDir: string): Promise<PublishResult> {
  const result: PublishResult = { created: 0, skipped: 0 };
  for (const entry of readEntries(versionsDir)) {
    const existing = await db.frameworkVersion.findUnique({
      where: { frameworkId_version: { frameworkId: entry.frameworkId, version: entry.version } },
      select: { id: true },
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }
    const framework = await db.frameworkEditorFramework.findUnique({
      where: { id: entry.frameworkId },
      include: {
        requirements: {
          include: {
            controlTemplates: {
              include: { requirements: true, policyTemplates: true, taskTemplates: true },
            },
          },
        },
      },
    });
    if (!framework) {
      throw new Error(`Version ${entry.version} references unknown framework ${entry.frameworkId}`);
    }
    const manifest = buildManifestFromFramework(framework);
    await db.frameworkVersion.create({
      data: {
        frameworkId: entry.frameworkId,
        version: entry.version,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        releaseNotes: entry.releaseNotes ?? null,
      },
    });
    result.created += 1;
  }
  return result;
}
