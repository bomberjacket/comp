import { app } from 'electron';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startHelperServer } from '../helper/server';
import { AGENT_VERSION } from '../shared/constants';

/**
 * Privileged helper mode. The Windows Task Scheduler starts this executable
 * with `--helper` as LocalSystem at boot (see assets/windows/install-helper.ps1).
 * It opens no windows, signs nothing in, talks to no network, and answers the
 * fixed command set in helper/protocol.ts over a local named pipe.
 */

// No GPU, no windows: this process may live in session 0 with no desktop.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

const LOG_DIR = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Comp AI Device Agent');
const LOG_FILE = path.join(LOG_DIR, 'helper.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function hlog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const size = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
    if (size > MAX_LOG_BYTES) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // logging must never take the helper down
  }
  process.stdout.write(line);
}

/** True when this process holds administrator rights (LocalSystem does). */
function isElevated(): boolean {
  try {
    const out = execSync(
      'powershell.exe -NoProfile -NonInteractive -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      { encoding: 'utf-8', timeout: 15000 },
    );
    return /true/i.test(out);
  } catch {
    return false;
  }
}

process.on('uncaughtException', (error) =>
  hlog(`uncaught exception: ${error.stack ?? error.message}`),
);
process.on('unhandledRejection', (reason) => hlog(`unhandled rejection: ${reason}`));

const elevated = isElevated();
hlog(
  `helper starting: version ${AGENT_VERSION}, user ${process.env.USERNAME ?? 'unknown'}, elevated ${elevated}`,
);
if (!elevated) {
  hlog('not elevated: privileged commands will fail; install the scheduled task as SYSTEM');
}

const server = startHelperServer({ version: AGENT_VERSION, elevated, log: hlog });

app.on('window-all-closed', () => {
  // keep running: the helper has no windows by design
});
app.on('before-quit', () => {
  hlog('helper stopping');
  server.close();
});
