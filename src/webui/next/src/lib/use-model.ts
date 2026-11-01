import * as React from "react";
import { describeError, getModel, isSessionExpired, type Model, type ModelSection } from "./api";
import { useI18n } from "./i18n";

export type ModelState<S extends ModelSection> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Model[S] };

/** Loads one section of the bulk model. An expired session calls onExpired (back to the sign-in form). */
export function useModel<S extends ModelSection>(section: S, sid: string, onExpired: () => void, refreshSignal = 0): ModelState<S> {
  const { t } = useI18n();
  const [state, setState] = React.useState<ModelState<S>>({ status: "loading" });
  React.useEffect(() => {
    let live = true;
    getModel(section, sid)
      .then((data) => live && setState({ status: "ready", data }))
      .catch((e) => {
        if (!live) return;
        if (isSessionExpired(e)) return onExpired();
        setState({ status: "error", message: describeError(e, t) });
      });
    return () => {
      live = false;
    };
  }, [section, sid, onExpired, t, refreshSignal]);
  return state;
}
