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
 * Run a command and keep stdout even when it exits non-zero. Several tools
 * (spctl, dnf check-update, systemctl is-active) report a state through the
 * exit code and still print the answer, so a throw is not "could not read".
 */
export function runCommandCapture(command: string, timeoutMs = 15000): CapturedCommand {
  try {
    return { output: runCommand(command, timeoutMs), exitCode: 0, error: null };
  } catch (error) {
    const e = error as { stdout?: unknown; status?: unknown };
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

/** True when a failure reads like "you need root for that". */
export function needsRoot(message: string | null | undefined): boolean {
  return /permission denied|operation not permitted|must be root|only root|EACCES|EPERM|not authorized|requires superuser|you need to be root/i.test(
    message ?? '',
  );
}
