import type {
  CheckContext,
  CheckFindingResult,
  CheckPassingResult,
  CheckVariableValues,
} from '../../../types';

export const DAY = 86_400_000;

export const denied = Object.assign(new Error('HTTP 403: Authorization_RequestDenied'), {
  status: 403,
});
export const notFound = Object.assign(new Error('HTTP 404: ResourceNotFound'), { status: 404 });

/**
 * A route value is a collection (served as `{ value }` by `fetch` and as the
 * flat array by `fetchWithCursor`), a single object, or an error to throw.
 * The longest matching key wins, so `/x` and `/x/y` can coexist.
 */
export type Routes = Record<string, unknown[] | Record<string, unknown> | Error>;

export function makeCtx(routes: Routes, variables: CheckVariableValues = {}) {
  const passed: CheckPassingResult[] = [];
  const failed: CheckFindingResult[] = [];
  const calls: string[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const lookup = (path: string): unknown => {
    calls.push(path);
    const key = keys.find((k) => path === k || path.startsWith(k));
    if (!key) throw Object.assign(new Error(`HTTP 404: no route for ${path}`), { status: 404 });
    const value = routes[key];
    if (value instanceof Error) throw value;
    return value;
  };
  const ctx = {
    accessToken: 'tok',
    credentials: {},
    variables,
    connectionId: 'conn_1',
    organizationId: 'org_1',
    metadata: {},
    log: () => {},
    warn: () => {},
    error: () => {},
    pass: (r: CheckPassingResult) => passed.push(r),
    fail: (r: CheckFindingResult) => failed.push(r),
    fetch: async (path: string) => {
      const v = lookup(path);
      return Array.isArray(v) ? { value: v } : v;
    },
    fetchWithCursor: async (path: string) => {
      const v = lookup(path);
      if (!Array.isArray(v)) throw new Error(`route ${path} is not a collection`);
      return v;
    },
  } as unknown as CheckContext;
  return { ctx, passed, failed, calls };
}
