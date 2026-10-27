import { runCommandCapture } from '../shell';
import { fileExists } from './files';

export type UnitState = 'active' | 'inactive' | 'failed' | 'missing' | 'unknown';

/**
 * `systemctl is-active <unit>` prints the state and exits 0 only for active.
 * Works for any user. "inactive" with a non-zero exit also covers units that
 * are not installed, so is-enabled is consulted to tell "missing" apart.
 */
export function unitState(unit: string): UnitState {
  const r = runCommandCapture(`systemctl is-active ${unit} 2>/dev/null`, 10000);
  const word = r.output.split(/\r?\n/)[0]?.trim();
  if (word === 'active' || word === 'activating' || word === 'reloading') return 'active';
  if (word === 'failed') return 'failed';
  if (word === 'inactive' || word === 'deactivating') {
    const enabled = runCommandCapture(`systemctl is-enabled ${unit} 2>/dev/null`, 10000);
    if (enabled.output === '' || /not-found|No such file/i.test(enabled.output)) return 'missing';
    return 'inactive';
  }
  if (r.exitCode === null) return 'unknown';
  return word ? 'unknown' : 'missing';
}

export function unitEnabled(unit: string): boolean | null {
  const r = runCommandCapture(`systemctl is-enabled ${unit} 2>/dev/null`, 10000);
  const word = r.output.split(/\r?\n/)[0]?.trim();
  if (!word) return null;
  return /^(enabled|enabled-runtime|static|alias|indirect)$/.test(word);
}

export interface LinuxProfile {
  /** No desktop: no display, no display manager, boot target is not graphical. */
  headless: boolean;
  evidence: string[];
}

/**
 * Decide whether this host is a server without an interactive desktop. The
 * screen lock check is not applicable there; the other core checks still are.
 */
export function detectLinuxProfile(env: NodeJS.ProcessEnv = process.env): LinuxProfile {
  const evidence: string[] = [];
  const hasDisplay = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
  evidence.push(hasDisplay ? 'display variable set' : 'no DISPLAY or WAYLAND_DISPLAY');
  const dm = unitState('display-manager.service');
  evidence.push(`display-manager.service ${dm}`);
  const target = runCommandCapture('systemctl get-default 2>/dev/null', 10000).output;
  if (target) evidence.push(`default target ${target}`);
  const graphicalTarget = /graphical/.test(target);
  const sessionDir =
    fileExists('/usr/share/xsessions') || fileExists('/usr/share/wayland-sessions');
  evidence.push(sessionDir ? 'desktop sessions installed' : 'no desktop sessions installed');
  const headless = !hasDisplay && dm !== 'active' && !graphicalTarget && !sessionDir;
  return { headless, evidence };
}
