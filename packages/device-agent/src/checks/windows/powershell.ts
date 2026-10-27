import { execSync } from 'node:child_process';

/**
 * Run a multi-line PowerShell script as -EncodedCommand (UTF-16LE base64), so
 * quoting never meets cmd.exe. Returns trimmed stdout; throws on non-zero exit.
 */
export function runPowerShellScript(script: string, timeoutMs = 20000): string {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return execSync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
    encoding: 'utf-8',
    timeout: timeoutMs,
  }).trim();
}

/** Parse a ConvertTo-Json object; empty output is an empty object. */
export function parseJsonObject<T extends object>(output: string): T {
  return (output ? JSON.parse(output) : {}) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when a failure reads like "run me as Administrator". */
export function needsElevation(message: string): boolean {
  return /privilege|elevat|access is denied|0x00000522|requires administrator/i.test(message);
}

/** Registry values come back as numbers; MDM and GPO sometimes write them as strings. */
export function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
