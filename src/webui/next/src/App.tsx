import * as React from "react";
import { describeError, login, logout, renew } from "@/lib/api";
import { clearSession, loadSession, saveSession, type Stored } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { useRoute, type Route } from "@/lib/use-route";
import { cn } from "@/lib/utils";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Devices from "@/pages/Devices";
import Rooms from "@/pages/Rooms";
import SysVars from "@/pages/SysVars";

function LoginForm({ onLogin }: { onLogin: (s: Stored) => void }) {
  const { t } = useI18n();
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
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <CardTitle>{t("signIn")}</CardTitle>
          <CardDescription>{t("preview")}</CardDescription>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user">{t("userName")}</Label>
          <Input id="user" name="user" autoComplete="username" required value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !user}>
          {busy ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </Card>
  );
}

const TABS: readonly Route[] = ["devices", "rooms", "sysvars"];

function Shell({ session, onLogout }: { session: Stored; onLogout: () => void }) {
  const { t } = useI18n();
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
  const page = { sid: session.sid, onExpired: onLogout };
  return (
    <div className="min-h-screen">
      <header className="bg-[var(--primary)] text-[var(--primary-foreground)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <strong className="mr-2">{t("appName")}</strong>
          <nav className="flex gap-1" aria-label={t("navMain")}>
            {TABS.map((name) => (
              <a
                key={name}
                href={`#/${name}`}
                aria-current={route === name ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", route === name ? "bg-white/20" : "hover:bg-white/10")}
              >
                {t(name)}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <LanguageSwitch />
            <span>{session.user}</span>
            {/* The classic UI takes the same session id, so both UIs run side by side. */}
            <a className="underline" href={`/pages/index.htm?sid=@${session.sid}@`}>
              {t("openClassic")}
            </a>
            <Button variant="outline" className="h-8 text-[var(--foreground)]" onClick={signOut} disabled={busy}>
              {t("signOut")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4">
        {route === "devices" ? <Devices {...page} /> : route === "rooms" ? <Rooms {...page} /> : <SysVars {...page} />}
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
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <LanguageSwitch className="absolute right-4 top-4 text-[var(--primary)]" />
      <LoginForm onLogin={(s) => (saveSession(s), setSession(s))} />
    </main>
  );
}
