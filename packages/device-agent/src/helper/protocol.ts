/**
 * Wire protocol between the user-mode agent and the privileged helper.
 * One JSON request line in, one JSON response line out, connection closed.
 * The helper answers only the commands listed here; it never runs caller
 * supplied scripts, so a local user who reaches the pipe can learn nothing
 * the agent would not upload anyway.
 */
export const HELPER_PIPE = '\\\\.\\pipe\\compai-device-agent-helper';

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
