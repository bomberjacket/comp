import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CheckLogger } from '../checks';

let logFile: string | null = null;

/** Log lines go to stdout (journald picks them up under systemd) and to a file in the state dir. */
export function configureLog(stateDir: string): void {
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    logFile = path.join(stateDir, 'agent.log');
  } catch {
    logFile = null;
  }
}

export const log: CheckLogger = (message, level = 'INFO') => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  (level === 'ERROR' ? process.stderr : process.stdout).write(`${line}\n`);
  if (logFile) {
    try {
      appendFileSync(logFile, `${line}\n`);
    } catch {
      // never let logging take the agent down
    }
  }
};
