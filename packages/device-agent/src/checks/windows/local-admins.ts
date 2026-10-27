import type { CheckResult } from '../../shared/types';
import type { ComplianceCheck } from '../types';
import { asArray, errorMessage, parseJsonObject, runPowerShellScript } from './powershell';

/** More local administrators than this is flagged even when the daily user is not one. */
export const MAX_LOCAL_ADMINS = 3;

const SCRIPT = `
$r = @{}
$r.currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
try {
  $m = Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop
  $r.members = @($m | ForEach-Object { @{ name = $_.Name; objectClass = [string]$_.ObjectClass; principalSource = [string]$_.PrincipalSource } })
} catch {
  $r.error = $_.Exception.Message
  $r.netOutput = (net localgroup administrators 2>&1 | Out-String)
}
$r | ConvertTo-Json -Depth 3 -Compress
`;

export interface LocalAdminMember {
  name?: string;
  objectClass?: string;
  principalSource?: string;
}

export interface LocalAdminsSnapshot {
  currentUser?: string | null;
  members?: LocalAdminMember | LocalAdminMember[] | null;
  error?: string | null;
  netOutput?: string | null;
}

/** `net localgroup administrators` prints members between a dashed rule and "The command completed". */
export function parseNetLocalGroup(output: string): LocalAdminMember[] {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((l) => /^-{10,}/.test(l.trim()));
  if (start < 0) return [];
  const members: LocalAdminMember[] = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (!t) continue;
    if (/^The command completed/i.test(t)) break;
    members.push({ name: t });
  }
  return members;
}

export function evaluateLocalAdmins(s: LocalAdminsSnapshot): {
  passed: boolean;
  members: string[];
  currentUserIsAdmin: boolean;
  message: string;
} {
  const fromApi = asArray(s.members).filter((m) => m && m.name);
  const members = (fromApi.length > 0 ? fromApi : parseNetLocalGroup(s.netOutput ?? ''))
    .map((m) => m.name!)
    .sort((a, b) => a.localeCompare(b));
  const current = (s.currentUser ?? '').toLowerCase();
  const currentUserIsAdmin = current.length > 0 && members.some((m) => m.toLowerCase() === current);

  if (members.length === 0) {
    return {
      passed: false,
      members,
      currentUserIsAdmin,
      message: 'Local Administrators group membership could not be read',
    };
  }
  const problems: string[] = [];
  if (currentUserIsAdmin)
    problems.push(`the signed-in user ${s.currentUser} is a local administrator`);
  if (members.length > MAX_LOCAL_ADMINS)
    problems.push(`${members.length} local administrators (limit ${MAX_LOCAL_ADMINS})`);
  const passed = problems.length === 0;
  return {
    passed,
    members,
    currentUserIsAdmin,
    message: passed
      ? `${members.length} local administrator(s): ${members.join(', ')}; the signed-in user is not one`
      : `Least privilege not met: ${problems.join('; ')}. Members: ${members.join(', ')}`,
  };
}

/**
 * NIST SP 800-171 3.1.6: users use non-privileged accounts for daily work.
 * Lists the local Administrators group and checks that the signed-in user is
 * not a member and that the group stays small.
 */
export class WindowsLocalAdminsCheck implements ComplianceCheck {
  checkType = 'local_admins' as const;
  displayName = 'Local Administrators';

  async run(): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const method = 'Get-LocalGroupMember Administrators (net localgroup fallback)';
    try {
      const output = runPowerShellScript(SCRIPT);
      const snapshot = parseJsonObject<LocalAdminsSnapshot>(output);
      const result = evaluateLocalAdmins(snapshot);
      return {
        checkType: this.checkType,
        passed: result.passed,
        details: {
          method,
          raw: JSON.stringify({
            currentUser: snapshot.currentUser ?? null,
            members: result.members,
            error: snapshot.error ?? null,
          }).substring(0, 1800),
          message: result.message,
        },
        checkedAt,
      };
    } catch (error) {
      return {
        checkType: this.checkType,
        passed: false,
        details: {
          method,
          raw: errorMessage(error).substring(0, 500),
          message: 'Unable to read the local Administrators group',
        },
        checkedAt,
      };
    }
  }
}
