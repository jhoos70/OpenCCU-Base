import * as React from "react";
import { describeError, login, logout, renew } from "@/lib/api";
import { clearSession, loadSession, saveSession, type Stored } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { INDICATOR_ROUTES, navFor, showsIndicators } from "@/lib/nav";
import { useNavOrder } from "@/lib/nav-order";
import { ProfileContext } from "@/lib/profile-context";
import { MessagesProvider } from "@/lib/use-messages";
import { useProfile } from "@/lib/use-profile";
import { useRoute } from "@/lib/use-route";
import { AppBar } from "@/components/AppBar";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandMenu } from "@/components/CommandMenu";
import { NavCustomizeDialog } from "@/components/NavCustomizeDialog";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavList } from "@/components/NavList";
import { OpenCCULogo } from "@/components/OpenCCULogo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Alarms from "@/pages/Alarms";
import Devices from "@/pages/Devices";
import Log from "@/pages/Log";
import Overview from "@/pages/Overview";
import Programs from "@/pages/Programs";
import Rooms from "@/pages/Rooms";
import Services from "@/pages/Services";
import Favourites from "@/pages/Favourites";
import Functions from "@/pages/Functions";
import Groups from "@/pages/Groups";
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
        <div className="flex items-center gap-3 pb-1">
          <OpenCCULogo className="size-10" />
          <div>
            <CardTitle>{t("signIn")}</CardTitle>
            <CardDescription>{t("preview")}</CardDescription>
          </div>
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

const PAGES: Record<string, React.ComponentType<{ sid: string; onExpired: () => void }>> = { overview: Overview, devices: Devices, rooms: Rooms, functions: Functions, programs: Programs, sysvars: SysVars, favourites: Favourites, groups: Groups, log: Log, alarms: () => <Alarms />, services: () => <Services /> };

function Shell({ session, onLogout }: { session: Stored; onLogout: () => void }) {
  const { t } = useI18n();
  const state = useProfile(session.sid, onLogout);
  const profile = state.status === "ready" ? state.profile : null;
  const { custom, moveItem, toggleHide, reset: resetNavOrder } = useNavOrder();
  const [customizeNavOpen, setCustomizeNavOpen] = React.useState(false);

  // No profile (yet), no level, no menu: rights are never assumed.
  const nav = React.useMemo(() => navFor(profile?.level ?? "NONE", custom), [profile?.level, custom]);
  const indicators = profile !== null && showsIndicators(profile.level);
  const route = useRoute([...nav.groups.flatMap((g) => g.items.map((i) => i.id)), ...(indicators ? INDICATOR_ROUTES : [])]);
  const [busy, setBusy] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // The classic UI takes the same session id, so both UIs run side by side.
  const classicHref = `/pages/index.htm?sid=@${session.sid}@`;

  async function signOut() {
    setBusy(true);
    try {
      await logout(session.sid);
    } catch {
      /* the session may have expired already: leave anyway */
    }
    onLogout();
  }

  const Page = PAGES[route];
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("openccu.next.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("openccu.next.sidebar.collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <ProfileContext.Provider value={profile}>
      <MessagesProvider sid={session.sid} enabled={indicators} onExpired={onLogout}>
        <div className="flex min-h-screen bg-[var(--background)]">
          {nav.groups.length > 0 && (
            <AppSidebar
              nav={nav}
              current={route}
              classicHref={classicHref}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapsed}
              onOpenCustomize={() => setCustomizeNavOpen(true)}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <AppBar
              profile={profile}
              nav={nav}
              current={route}
              classicHref={classicHref}
              onSignOut={signOut}
              busy={busy}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapsed}
              onOpenCommand={() => setCommandOpen(true)}
              onOpenCustomize={() => setCustomizeNavOpen(true)}
            />
            <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
              <div className="mx-auto max-w-7xl">
                {state.status === "loading" && <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>}
                {state.status === "error" && (
                  <p role="alert" className="text-sm text-[var(--destructive)]">
                    {state.message}
                  </p>
                )}
                {state.status === "ready" &&
                  (Page ? <Page sid={session.sid} onExpired={onLogout} /> : <p className="text-sm text-[var(--muted-foreground)]">{t("noAccess")}</p>)}
              </div>
            </main>
          </div>
          <CommandMenu
            open={commandOpen}
            onOpenChange={setCommandOpen}
            nav={nav}
            current={route}
            sid={session.sid}
            classicHref={classicHref}
            onSignOut={signOut}
            indicators={indicators}
          />
          {profile && (
            <NavCustomizeDialog
              open={customizeNavOpen}
              onClose={() => setCustomizeNavOpen(false)}
              level={profile.level}
              custom={custom}
              onMoveItem={moveItem}
              onToggleHide={toggleHide}
              onReset={resetNavOrder}
            />
          )}
        </div>
      </MessagesProvider>
    </ProfileContext.Provider>
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
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle className="text-[var(--foreground)]" />
        <LanguageSwitch className="text-[var(--primary)]" />
      </div>
      <LoginForm onLogin={(s) => (saveSession(s), setSession(s))} />
    </main>
  );
}
