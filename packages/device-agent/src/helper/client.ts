import net from 'node:net';
import { HELPER_PIPE, type HelperCommand, type HelperResponse } from './protocol';

export interface AskHelperOptions {
  pipe?: string;
  timeoutMs?: number;
}

/**
 * Ask the privileged helper one question. Resolves null when no helper is
 * running (the pipe does not exist), when it does not answer in time, or on
 * any transport error, so callers fall back to the unprivileged path.
 * Windows only; other platforms resolve null immediately.
 */
export function askHelper(
  command: HelperCommand,
  options: AskHelperOptions = {},
): Promise<HelperResponse | null> {
  if (process.platform !== 'win32' && !options.pipe) return Promise.resolve(null);
  const pipe = options.pipe ?? HELPER_PIPE;
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
    const socket = net.connect({ path: pipe });
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
