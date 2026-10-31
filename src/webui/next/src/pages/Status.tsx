import type * as React from "react";
import type { Model, ModelSection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ModelState } from "@/lib/use-model";

/** Renders loading and error states of a model section; the children render the data. */
export function Status<S extends ModelSection>({ state, children }: { state: ModelState<S>; children: (data: Model[S]) => React.ReactNode }) {
  const { t } = useI18n();
  if (state.status === "loading") return <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="text-sm text-[var(--destructive)]">
        {state.message}
      </p>
    );
  return <>{children(state.data)}</>;
}
