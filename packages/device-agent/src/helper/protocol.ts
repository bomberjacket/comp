/**
 * Wire protocol between the user-mode agent and the privileged helper.
 * One JSON request line in, one JSON response line out, connection closed.
 * The helper answers only the commands listed here; it never runs caller
 * supplied scripts, so a local user who reaches it can learn nothing the
 * agent would not upload anyway.
 *
 * Transport is a loopback TCP port, not a named pipe: a pipe created by
 * LocalSystem carries a default permission set that refuses connections from
 * a normal user (EPERM), and Node cannot set pipe permissions. Loopback is
 * reachable by every local session and never leaves the machine.
 */
export const HELPER_HOST = '127.0.0.1';
export const HELPER_PORT = 47621;

/** Bump when a request or response field changes shape. */
export const HELPER_PROTOCOL_VERSION = 1;

export const HELPER_COMMANDS = ['ping', 'auditpol', 'smb1-feature'] as const;
export type HelperCommand = (typeof HELPER_COMMANDS)[number];

export interface HelperRequest {
  command: HelperCommand;
}

export interface HelperResponse {
  ok: boolean;
  command: string;
  /** Raw command output when ok. */
  output?: string;
  /** Why the command failed when not ok. */
  error?: string;
  /** Agent version the helper was built from. */
  version: string;
  /** True when the helper runs with administrator rights (LocalSystem). */
  elevated: boolean;
  protocol: number;
}

export function isHelperCommand(value: unknown): value is HelperCommand {
  return typeof value === 'string' && (HELPER_COMMANDS as readonly string[]).includes(value);
}
