import { AGENT_VERSION, API_ROUTES } from '../shared/constants';
import type { CheckInResponse, CheckResult, DeviceInfo } from '../shared/types';

export interface EnrollResponse {
  sessionToken: string;
  sessionExpiresAt: string;
  deviceId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    return msg ?? text ?? response.statusText;
  } catch {
    return text || response.statusText;
  }
}

/** Trade an enrollment token for a device-agent session and a device id. */
export async function enroll(
  apiUrl: string,
  token: string,
  device: DeviceInfo,
  fetchImpl: typeof fetch = fetch,
): Promise<EnrollResponse> {
  const response = await fetchImpl(`${apiUrl}${API_ROUTES.ENROLL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...device, agentVersion: AGENT_VERSION }),
  });
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  return (await response.json()) as EnrollResponse;
}

/** Same check-in the tray agent sends: Bearer session token, one device. */
export async function checkIn(
  apiUrl: string,
  sessionToken: string,
  body: { deviceId: string; checks: CheckResult[]; osVersion?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CheckInResponse> {
  const response = await fetchImpl(`${apiUrl}${API_ROUTES.CHECK_IN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ ...body, agentVersion: AGENT_VERSION }),
  });
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  return (await response.json()) as CheckInResponse;
}
