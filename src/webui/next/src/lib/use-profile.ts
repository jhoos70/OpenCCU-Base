import * as React from "react";
import { describeError, getProfile, isSessionExpired, type Profile } from "./api";
import { useI18n } from "./i18n";

export type ProfileState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; profile: Profile };

/** The profile of the signed-in user (name, level, mode). An expired session calls onExpired. */
export function useProfile(sid: string, onExpired: () => void): ProfileState {
  const { t } = useI18n();
  const [state, setState] = React.useState<ProfileState>({ status: "loading" });
  React.useEffect(() => {
    let live = true;
    getProfile(sid)
      .then((profile) => live && setState({ status: "ready", profile }))
      .catch((e) => {
        if (!live) return;
        if (isSessionExpired(e)) return onExpired();
        setState({ status: "error", message: describeError(e, t) });
      });
    return () => {
      live = false;
    };
  }, [sid, onExpired, t]);
  return state;
}
