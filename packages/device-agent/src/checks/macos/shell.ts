export { errorMessage, runCommand, runCommandCapture } from '../shell';
export type { CapturedCommand } from '../shell';

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
