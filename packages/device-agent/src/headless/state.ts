import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** What the headless agent remembers between runs. Lives in the state dir, mode 0600. */
export interface HeadlessState {
  apiUrl: string;
  deviceId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  sessionToken: string;
  enrolledAt: string;
  lastCheckIn?: string;
  lastCompliant?: boolean;
}

export function defaultStateDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.COMP_AGENT_STATE_DIR) return env.COMP_AGENT_STATE_DIR;
  if (process.platform === 'win32') {
    return path.join(env.ProgramData ?? 'C:\\ProgramData', 'Comp AI Device Agent', 'headless');
  }
  return '/var/lib/comp-ai-agent';
}

export function stateFile(stateDir: string): string {
  return path.join(stateDir, 'state.json');
}

export function readState(stateDir: string): HeadlessState | null {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(stateDir), 'utf-8')) as Partial<HeadlessState>;
    if (!parsed.apiUrl || !parsed.deviceId || !parsed.sessionToken || !parsed.organizationId)
      return null;
    return parsed as HeadlessState;
  } catch {
    return null;
  }
}

/** Atomic write (temp file + rename) so a crash mid-write never leaves a half state. */
export function writeState(stateDir: string, state: HeadlessState): void {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const target = stateFile(stateDir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // Windows ignores POSIX modes; the directory ACL does the work there
  }
  renameSync(tmp, target);
}

export function clearState(stateDir: string): boolean {
  try {
    unlinkSync(stateFile(stateDir));
    return true;
  } catch {
    return false;
  }
}

/** The state with the secret removed, for `status` output and logs. */
export function redactState(
  state: HeadlessState,
): Omit<HeadlessState, 'sessionToken'> & { sessionToken: string } {
  return { ...state, sessionToken: `${state.sessionToken.slice(0, 6)}…` };
}
