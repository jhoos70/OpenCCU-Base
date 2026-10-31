import * as React from "react";
import { describeError, login, logout, renew } from "@/lib/api";
import { clearSession, loadSession, saveSession, type Stored } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useRoute, type Route } from "@/lib/use-route";
import Rooms from "@/pages/Rooms";
import SysVars from "@/pages/SysVars";

function LoginForm({ onLogin }: { onLogin: (s: Stored) => void }) {
  const [user, setUser] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const sid = await login(user, password);
      onLogin({ sid, user });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>OpenCCU nextGen preview</CardDescription>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user">User name</Label>
          <Input id="user" name="user" autoComplete="username" required value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !user}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}

function Shell({ session, onLogout }: { session: Stored; onLogout: () => void }) {
  const route = useRoute();
  const [busy, setBusy] = React.useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await logout(session.sid);
    } catch {
      /* the session may have expired already: leave anyway */
    }
    onLogout();
  }
  const tab = (name: Route, label: string) => (
    <a
      href={`#/${name}`}
      aria-current={route === name ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", route === name ? "bg-white/20" : "hover:bg-white/10")}
    >
      {label}
    </a>
  );
  return (
    <div className="min-h-screen">
      <header className="bg-[var(--primary)] text-[var(--primary-foreground)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <strong className="mr-2">OpenCCU</strong>
          <nav className="flex gap-1" aria-label="Main">
            {tab("rooms", "Rooms")}
            {tab("sysvars", "System variables")}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span>{session.user}</span>
            {/* The classic UI takes the same session id, so both UIs run side by side. */}
            <a className="underline" href={`/pages/index.htm?sid=@${session.sid}@`}>
              Open the classic UI
            </a>
            <Button variant="outline" className="h-8 text-[var(--foreground)]" onClick={signOut} disabled={busy}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4">
        {route === "rooms" ? <Rooms sid={session.sid} onExpired={onLogout} /> : <SysVars sid={session.sid} onExpired={onLogout} />}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = React.useState<Stored | null>(null);
  const [checking, setChecking] = React.useState(true);

  // A stored session is checked once; an expired one sends the user back to the form.
  React.useEffect(() => {
    const stored = loadSession();
    if (!stored) return setChecking(false);
    renew(stored.sid)
      .then(() => setSession(stored))
      .catch(() => clearSession())
      .finally(() => setChecking(false));
  }, []);

  const leave = React.useCallback(() => (clearSession(), setSession(null)), []);

  if (checking) return null;
  if (session) return <Shell session={session} onLogout={leave} />;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm onLogin={(s) => (saveSession(s), setSession(s))} />
    </main>
  );
}
