import * as React from "react";
import { describeError, login, logout, renew } from "@/lib/api";
import { clearSession, loadSession, saveSession, type Stored } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function Home({ session, onLogout }: { session: Stored; onLogout: () => void }) {
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
  return (
    <Card className="w-full max-w-sm space-y-4">
      <div>
        <CardTitle>Signed in</CardTitle>
        <CardDescription>
          as <strong>{session.user}</strong>
        </CardDescription>
      </div>
      {/* The classic UI takes the same session id, so both UIs run side by side. */}
      <Button asChild variant="outline" className="w-full">
        <a href={`/pages/index.htm?sid=@${session.sid}@`}>Open the classic UI</a>
      </Button>
      <Button className="w-full" onClick={signOut} disabled={busy}>
        Sign out
      </Button>
    </Card>
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

  if (checking) return null;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {session ? (
        <Home session={session} onLogout={() => (clearSession(), setSession(null))} />
      ) : (
        <LoginForm onLogin={(s) => (saveSession(s), setSession(s))} />
      )}
    </main>
  );
}
