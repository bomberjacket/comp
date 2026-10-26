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
export type RouteValue = unknown[] | Record<string, unknown> | Error;
/** A function route sees the query params, so one path can answer differently per filter. */
export type RouteFn = (params: Record<string, string>) => RouteValue;
export type Routes = Record<string, RouteValue | RouteFn>;

export function makeCtx(routes: Routes, variables: CheckVariableValues = {}) {
  const passed: CheckPassingResult[] = [];
  const failed: CheckFindingResult[] = [];
  const calls: string[] = [];
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  const lookup = (path: string, params: Record<string, string> = {}): unknown => {
    calls.push(path);
    const key = keys.find((k) => path === k || path.startsWith(k));
    if (!key) throw Object.assign(new Error(`HTTP 404: no route for ${path}`), { status: 404 });
    const route = routes[key];
    const value = typeof route === 'function' ? route(params) : route;
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
    fetch: async (path: string, opts?: { params?: Record<string, string> }) => {
      const v = lookup(path, opts?.params);
      return Array.isArray(v) ? { value: v } : v;
    },
    fetchWithCursor: async (path: string, opts?: { params?: Record<string, string> }) => {
      const v = lookup(path, opts?.params);
      if (!Array.isArray(v)) throw new Error(`route ${path} is not a collection`);
      return v;
    },
  } as unknown as CheckContext;
  return { ctx, passed, failed, calls };
}
