// Client of the v2 JSON-RPC API (src/webui/www/api/v2). v2 uses real HTTP status codes, the header
// X-Requested-With, and X-Session-Id for the session returned by Session.login.

// Route B (.migration/plan/decisions-ui.md D5): the router answers below homematic.cgi until lighttpd
// routes /api/v2 itself. Override with VITE_API_BASE=/api/v2 once it does.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api/homematic.cgi/v2";

export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Rpc = <T>(method: string, params?: Record<string, unknown>, sid?: string) => Promise<T>;

export function makeRpc(doFetch: typeof fetch = (...a) => fetch(...a)): Rpc {
  return async function rpc<T>(method: string, params: Record<string, unknown> = {}, sid?: string): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
    if (sid) headers["X-Session-Id"] = sid;
    let res: Response;
    try {
      res = await doFetch(`${API_BASE}/rpc`, { method: "POST", headers, body: JSON.stringify({ version: "1.1", method, params, id: 1 }) });
    } catch {
      throw new ApiError(0, "network error", 0);
    }
    let doc: { result?: T; error?: { code?: number; message?: string } | null } | null = null;
    try {
      doc = await res.json();
    } catch {
      // not JSON: lighttpd's 404 page, i.e. the v2 router is not answering
      throw new ApiError(0, `unexpected response (HTTP ${res.status})`, res.status);
    }
    if (doc?.error) throw new ApiError(doc.error.code ?? 0, doc.error.message ?? "error", res.status);
    return doc?.result as T;
  };
}

const rpc = makeRpc();

export const login = (username: string, password: string, call: Rpc = rpc) => call<string>("Session.login", { username, password });
export const logout = (sid: string, call: Rpc = rpc) => call<boolean>("Session.logout", {}, sid);
export const renew = (sid: string, call: Rpc = rpc) => call<unknown>("Session.renew", {}, sid);

/** A message for the user; never shows internals. */
export function describeError(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong.";
  if (e.status === 429 || e.code === 429) return "Too many attempts. Wait a moment and try again.";
  if (e.code === 501) return "Invalid user name or password, or too many open sessions.";
  if (e.code === 0 && e.status === 0) return "The CCU cannot be reached.";
  if (e.code === 0) return "The v2 API does not answer. It must be enabled on the CCU (v2_enabled).";
  return `The CCU refused the request (${e.code}).`;
}
