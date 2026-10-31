// The session id lives in sessionStorage: it is gone when the tab closes. Storage can be blocked, so
// every access is guarded and the app works without it.
const KEY = "openccu.next.session";

export interface Stored {
  sid: string;
  user: string;
}

export function loadSession(): Stored | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return v && typeof v.sid === "string" && typeof v.user === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Stored): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the session lasts until reload */
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
