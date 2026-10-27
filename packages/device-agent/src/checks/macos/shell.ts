import { execSync } from 'node:child_process';

/** Run a command and return trimmed stdout; throws on a non-zero exit. */
export function runCommand(command: string, timeoutMs = 15000): string {
  return execSync(command, { encoding: 'utf-8', timeout: timeoutMs }).trim();
}

export interface CapturedCommand {
  output: string;
  exitCode: number | null;
  error: string | null;
}

/**
 * Run a command and keep stdout even when it exits non-zero. Some Apple tools
 * (spctl among them) report a state through the exit code and still print the
 * answer, so a throw is not the same thing as "could not read".
 */
export function runCommandCapture(command: string, timeoutMs = 15000): CapturedCommand {
  try {
    return { output: runCommand(command, timeoutMs), exitCode: 0, error: null };
  } catch (error) {
    const e = error as { stdout?: unknown; status?: unknown; message?: unknown };
    const stdout =
      typeof e.stdout === 'string'
        ? e.stdout
        : Buffer.isBuffer(e.stdout)
          ? e.stdout.toString('utf-8')
          : '';
    return {
      output: stdout.trim(),
      exitCode: typeof e.status === 'number' ? e.status : null,
      error: errorMessage(error),
    };
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse the text `defaults read <domain>` prints for a whole domain:
 * `{ Key = value; Other = "quoted value"; }`. Nested containers are skipped.
 */
export function parseDefaultsDomain(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*"?([A-Za-z0-9_.-]+)"?\s*=\s*(.*?);?\s*$/.exec(line);
    if (!m) continue;
    const raw = m[2].trim();
    if (raw === '(' || raw === '{' || raw === '') continue;
    values[m[1]] = raw.replace(/^"(.*)"$/, '$1');
  }
  return values;
}

/** `defaults` prints booleans as 1/0; profiles sometimes write true/false or YES/NO. */
export function defaultsBool(v: string | undefined): boolean | null {
  if (v === undefined) return null;
  if (/^(1|true|yes)$/i.test(v)) return true;
  if (/^(0|false|no)$/i.test(v)) return false;
  return null;
}
