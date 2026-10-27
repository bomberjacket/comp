import net from 'node:net';
import { HELPER_HOST, HELPER_PORT, type HelperCommand, type HelperResponse } from './protocol';

export interface AskHelperOptions {
  port?: number;
  timeoutMs?: number;
}

/**
 * Ask the privileged helper one question. Resolves null when no helper is
 * running (connection refused), when it does not answer in time, or on any
 * transport error, so callers fall back to the unprivileged path.
 * Windows only unless a port is given explicitly (tests).
 */
export function askHelper(
  command: HelperCommand,
  options: AskHelperOptions = {},
): Promise<HelperResponse | null> {
  if (process.platform !== 'win32' && options.port === undefined) return Promise.resolve(null);
  const port = options.port ?? HELPER_PORT;
  const timeoutMs = options.timeoutMs ?? 20000;

  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    const finish = (value: HelperResponse | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const socket = net.connect({ host: HELPER_HOST, port });
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.setEncoding('utf-8');
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ command })}\n`);
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      try {
        finish(JSON.parse(buffer.slice(0, newline)) as HelperResponse);
      } catch {
        finish(null);
      }
    });
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });
}
