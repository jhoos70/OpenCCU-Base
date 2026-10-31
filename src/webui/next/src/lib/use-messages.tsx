import * as React from "react";
import { getHideSticky, getMessages, isSessionExpired, type AlarmMsg, type ServiceMsg } from "./api";
import { countServices } from "./service-messages";

/** The classic UI asks every 3 seconds; this is slower on purpose (a request runs a script on the CCU) and stops while the tab is hidden. */
export const POLL_MS = 10_000;

export interface MessagesState {
  /** False for guests: the classic header shows no counters to them. */
  enabled: boolean;
  loaded: boolean;
  /** The last update failed; the numbers shown are the last known ones. */
  failed: boolean;
  alarms: AlarmMsg[];
  services: ServiceMsg[];
  hideSticky: boolean;
  alarmCount: number;
  serviceCount: number;
}

const idle: MessagesState = { enabled: false, loaded: false, failed: false, alarms: [], services: [], hideSticky: false, alarmCount: 0, serviceCount: 0 };
const Ctx = React.createContext<MessagesState>(idle);
export const useMessages = (): MessagesState => React.useContext(Ctx);

export function MessagesProvider({ sid, enabled, onExpired, children }: { sid: string; enabled: boolean; onExpired: () => void; children: React.ReactNode }) {
  const [data, setData] = React.useState<{ alarms: AlarmMsg[]; services: ServiceMsg[]; hideSticky: boolean; loaded: boolean; failed: boolean }>({
    alarms: [],
    services: [],
    hideSticky: false,
    loaded: false,
    failed: false,
  });

  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    let busy = false;
    let hideSticky: boolean | null = null; // asked once: it changes only when an admin changes the setting

    async function tick() {
      if (busy || !live) return;
      busy = true;
      try {
        if (hideSticky === null) hideSticky = await getHideSticky(sid);
        const m = await getMessages(sid);
        if (live) setData({ alarms: m.alarms, services: m.services, hideSticky, loaded: true, failed: false });
      } catch (e) {
        if (!live) return;
        if (isSessionExpired(e)) return onExpired();
        setData((d) => ({ ...d, failed: true }));
      } finally {
        busy = false;
      }
    }

    const visible = () => document.visibilityState === "visible";
    void tick();
    const timer = window.setInterval(() => visible() && void tick(), POLL_MS);
    const onVisible = () => visible() && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sid, enabled, onExpired]);

  const value = React.useMemo<MessagesState>(
    () => (enabled ? { enabled, ...data, alarmCount: data.alarms.length, serviceCount: countServices(data.services, data.hideSticky) } : idle),
    [enabled, data],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
