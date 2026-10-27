/**
 * Entry point. The same executable runs in two modes:
 *
 * - default: the tray agent in the signed-in user's session (agent.ts);
 * - `--helper`: the privileged helper, started by the Windows Task Scheduler
 *   as LocalSystem, which answers a fixed set of read-only questions over a
 *   loopback TCP port for the checks that need administrator rights
 *   (helper-main.ts). No tray, no sign-in, no network.
 */
if (process.argv.includes('--helper')) {
  void import('./helper-main');
} else {
  void import('./agent');
}
