/**
 * Headless agent runtime: the same checks as the tray agent, no Electron, no
 * window, no browser. Built with `bun build` (see scripts/build-headless.mjs)
 * into a single file or a standalone binary for servers.
 *
 *   comp-ai-agent enroll --token <token> [--api <url>] [--name <device name>]
 *   comp-ai-agent run [--once] [--interval-seconds N]
 *   comp-ai-agent check            # run the checks and print JSON, no upload
 *   comp-ai-agent status           # what is enrolled where
 *   comp-ai-agent unenroll         # forget the local enrollment
 *
 * Environment: COMP_AGENT_API_URL, COMP_AGENT_TOKEN, COMP_AGENT_STATE_DIR,
 * COMP_AGENT_NAME, COMP_AGENT_SERIAL (pins the serial on a VM without one).
 */
import { runAllChecks } from '../checks';
import { getCurrentOSVersion, getDeviceInfo } from '../main/device-info';
import { AGENT_VERSION, CHECK_INTERVAL_MS, DEFAULT_API_URL } from '../shared/constants';
import { ApiError, checkIn, enroll } from './client';
import { configureLog, log } from './log';
import { clearState, defaultStateDir, readState, redactState, writeState } from './state';

export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > 0) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (i + 1 < rest.length && !rest[i + 1].startsWith('--')) {
      flags[arg.slice(2)] = rest[++i];
    } else {
      flags[arg.slice(2)] = true;
    }
  }
  return { command, flags };
}

const flagString = (flags: ParsedArgs['flags'], name: string): string | undefined =>
  typeof flags[name] === 'string' ? (flags[name] as string) : undefined;

export const USAGE = `comp-ai-agent ${AGENT_VERSION} (headless)

  enroll --token <token> [--api <url>] [--name <device name>]
  run [--once] [--interval-seconds <n>]
  check
  status
  unenroll
  version

Environment: COMP_AGENT_API_URL COMP_AGENT_TOKEN COMP_AGENT_STATE_DIR COMP_AGENT_NAME COMP_AGENT_SERIAL`;

export async function runOnce(
  stateDir: string,
): Promise<{ ok: boolean; compliant?: boolean; fatal?: boolean }> {
  const state = readState(stateDir);
  if (!state) {
    log('Not enrolled: run `comp-ai-agent enroll --token <token>` first', 'ERROR');
    return { ok: false, fatal: true };
  }
  const checks = await runAllChecks(log);
  try {
    const result = await checkIn(state.apiUrl, state.sessionToken, {
      deviceId: state.deviceId,
      checks,
      osVersion: getCurrentOSVersion(),
    });
    const next: typeof state = {
      ...state,
      lastCheckIn: new Date().toISOString(),
      lastCompliant: result.isCompliant,
      ...(result.upgradedSessionToken ? { sessionToken: result.upgradedSessionToken } : {}),
    };
    writeState(stateDir, next);
    log(
      `Check-in accepted for ${state.organizationName}: ${result.isCompliant ? 'compliant' : 'NOT compliant'} (${checks.filter((c) => c.passed).length}/${checks.length} checks passed)`,
    );
    return { ok: true, compliant: result.isCompliant };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      log(
        'Session rejected (401): the device agent access was revoked. Re-enroll with a new token.',
        'ERROR',
      );
      return { ok: false, fatal: true };
    }
    if (error instanceof ApiError && error.status === 404) {
      log(
        'Device not found (404): it was deleted in the app. Re-enroll with a new token.',
        'ERROR',
      );
      return { ok: false, fatal: true };
    }
    log(`Check-in failed: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
    return { ok: false };
  }
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const { command, flags } = parseArgs(argv);
  const stateDir = flagString(flags, 'state-dir') ?? defaultStateDir(env);
  configureLog(stateDir);

  switch (command) {
    case 'version':
      process.stdout.write(`${AGENT_VERSION}\n`);
      return 0;

    case 'enroll': {
      const token = flagString(flags, 'token') ?? env.COMP_AGENT_TOKEN;
      if (!token) {
        log('enroll needs --token <token> or COMP_AGENT_TOKEN', 'ERROR');
        return 2;
      }
      const apiUrl = (
        flagString(flags, 'api') ??
        env.COMP_AGENT_API_URL ??
        DEFAULT_API_URL
      ).replace(/\/+$/, '');
      const device = getDeviceInfo();
      const name = flagString(flags, 'name') ?? env.COMP_AGENT_NAME;
      if (name) device.name = name;
      log(`Enrolling ${device.name} (${device.platform}, ${device.osVersion}) with ${apiUrl}`);
      try {
        const result = await enroll(apiUrl, token, device);
        writeState(stateDir, {
          apiUrl,
          deviceId: result.deviceId,
          organizationId: result.organizationId,
          organizationName: result.organizationName,
          userId: result.userId,
          sessionToken: result.sessionToken,
          enrolledAt: new Date().toISOString(),
        });
        log(
          `Enrolled as device ${result.deviceId} in ${result.organizationName}; state in ${stateDir}`,
        );
        return 0;
      } catch (error) {
        log(
          `Enrollment failed: ${error instanceof Error ? error.message : String(error)}`,
          'ERROR',
        );
        return 1;
      }
    }

    case 'check': {
      const results = await runAllChecks(log);
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
      return results.every((r) => r.passed) ? 0 : 3;
    }

    case 'status': {
      const state = readState(stateDir);
      if (!state) {
        process.stdout.write(`Not enrolled (state dir ${stateDir})\n`);
        return 3;
      }
      process.stdout.write(`${JSON.stringify(redactState(state), null, 2)}\n`);
      return 0;
    }

    case 'unenroll':
      process.stdout.write(
        clearState(stateDir) ? 'Local enrollment removed\n' : 'Nothing to remove\n',
      );
      return 0;

    case 'run': {
      const once = flags.once === true;
      const intervalSeconds = Number(
        flagString(flags, 'interval-seconds') ??
          env.COMP_AGENT_INTERVAL_SECONDS ??
          CHECK_INTERVAL_MS / 1000,
      );
      log(
        `comp-ai-agent ${AGENT_VERSION} starting (headless, ${once ? 'single run' : `every ${intervalSeconds}s`})`,
      );
      const first = await runOnce(stateDir);
      if (once || first.fatal) return first.ok ? 0 : 1;
      await new Promise<void>((resolve) => {
        const timer = setInterval(async () => {
          const r = await runOnce(stateDir);
          if (r.fatal) {
            clearInterval(timer);
            resolve();
          }
        }, intervalSeconds * 1000);
        const stop = () => {
          log('Stopping');
          clearInterval(timer);
          resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
      return 0;
    }

    default:
      process.stdout.write(`${USAGE}\n`);
      return command === 'help' ? 0 : 2;
  }
}

// Entry point when executed directly (bundled file or compiled binary).
if (process.env.COMP_AGENT_NO_AUTORUN !== '1') {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      log(
        `Fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        'ERROR',
      );
      process.exit(1);
    },
  );
}
