import { execSync } from 'node:child_process';
import net from 'node:net';
import {
  HELPER_HOST,
  HELPER_PORT,
  HELPER_PROTOCOL_VERSION,
  type HelperCommand,
  type HelperResponse,
  isHelperCommand,
} from './protocol';

/** The privileged reads the helper performs. Injected so tests run without Windows tools. */
export interface HelperRunners {
  auditpol: () => string;
  smb1Feature: () => string;
}

export interface HelperServerOptions {
  /** Loopback port; tests pass 0 for an ephemeral port. */
  port?: number;
  version: string;
  elevated: boolean;
  runners?: Partial<HelperRunners>;
  log?: (message: string) => void;
  /** Milliseconds a single command may take before the request fails. */
  commandTimeoutMs?: number;
}

const MAX_REQUEST_BYTES = 4096;

export const defaultRunners: HelperRunners = {
  auditpol: () => execSync('auditpol /get /category:* /r', { encoding: 'utf-8', timeout: 15000 }),
  smb1Feature: () =>
    execSync(
      'powershell.exe -NoProfile -NonInteractive -Command "[string](Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop).State"',
      { encoding: 'utf-8', timeout: 30000 },
    ).trim(),
};

/** Answer one request. Pure apart from the injected runners. */
export function handleRequest(
  raw: string,
  opts: { version: string; elevated: boolean; runners: HelperRunners },
): HelperResponse {
  const base = {
    version: opts.version,
    elevated: opts.elevated,
    protocol: HELPER_PROTOCOL_VERSION,
  };
  let command: unknown;
  try {
    command = (JSON.parse(raw) as { command?: unknown }).command;
  } catch {
    return { ...base, ok: false, command: 'invalid', error: 'request is not JSON' };
  }
  if (!isHelperCommand(command)) {
    return { ...base, ok: false, command: String(command), error: 'unknown command' };
  }
  try {
    return { ...base, ok: true, command, output: runCommand(command, opts.runners) };
  } catch (error) {
    return {
      ...base,
      ok: false,
      command,
      error: (error instanceof Error ? error.message : String(error)).substring(0, 1000),
    };
  }
}

function runCommand(command: HelperCommand, runners: HelperRunners): string {
  switch (command) {
    case 'ping':
      return 'pong';
    case 'auditpol':
      return runners.auditpol();
    case 'smb1-feature':
      return runners.smb1Feature();
  }
}

/**
 * Listen on the loopback port. Each connection carries one newline-terminated
 * request and receives one newline-terminated response. Connections that do
 * not originate from the loopback interface are dropped unanswered.
 */
export function startHelperServer(options: HelperServerOptions): net.Server {
  const port = options.port ?? HELPER_PORT;
  const log = options.log ?? (() => {});
  const runners: HelperRunners = { ...defaultRunners, ...options.runners };
  const server = net.createServer((socket) => {
    if (socket.remoteAddress && !isLoopback(socket.remoteAddress)) {
      log(`refused connection from ${socket.remoteAddress}`);
      socket.destroy();
      return;
    }
    let buffer = '';
    let answered = false;
    const timer = setTimeout(() => {
      if (!answered) {
        answered = true;
        socket.end(
          `${JSON.stringify({
            ok: false,
            command: 'timeout',
            error: 'request timed out',
            version: options.version,
            elevated: options.elevated,
            protocol: HELPER_PROTOCOL_VERSION,
          } satisfies HelperResponse)}\n`,
        );
      }
    }, options.commandTimeoutMs ?? 45000);

    socket.setEncoding('utf-8');
    socket.on('data', (chunk: string) => {
      if (answered) return;
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_BYTES) {
        answered = true;
        clearTimeout(timer);
        socket.destroy();
        log('request too large; connection dropped');
        return;
      }
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      answered = true;
      clearTimeout(timer);
      const line = buffer.slice(0, newline);
      const response = handleRequest(line, {
        version: options.version,
        elevated: options.elevated,
        runners,
      });
      log(`${response.command}: ${response.ok ? 'ok' : `failed (${response.error})`}`);
      socket.end(`${JSON.stringify(response)}\n`);
    });
    socket.on('error', (err) => log(`socket error: ${err.message}`));
  });
  server.on('error', (err) => log(`server error: ${err.message}`));
  server.listen({ host: HELPER_HOST, port }, () => {
    const addr = server.address();
    log(`listening on ${HELPER_HOST}:${typeof addr === 'object' && addr ? addr.port : port}`);
  });
  return server;
}

function isLoopback(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
