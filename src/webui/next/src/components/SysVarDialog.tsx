import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeChangeError, isSessionExpired, setSysVar, type SysVar, type SysVarChange } from "@/lib/api";
import type { Strings } from "@/lib/ccu-strings";
import { useI18n } from "@/lib/i18n";
import { STRING_MAX, choices, initialInput, isChanged, numberRange, toRequestValue, validateInput } from "@/lib/sysvar-edit";
import { text } from "@/lib/format";

/** The dialog that changes the value of one system variable (the classic "Change system variable value"). */
export function SysVarDialog({ sv, sid, strings, onClose, onChanged, onExpired }: { sv: SysVar; sid: string; strings: Strings; onClose: () => void; onChanged: (c: SysVarChange) => void; onExpired: () => void }) {
  const { t } = useI18n();
  const [input, setInput] = React.useState(() => initialInput(sv));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const options = choices(sv, t, strings);
  const problem = validateInput(sv, input);
  const { min, max } = numberRange(sv);
  const inputId = "sysvar-value";
  const hintId = "sysvar-hint";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problem || !isChanged(sv, input) || busy) return;
    setBusy(true);
    setError("");
    try {
      onChanged(await setSysVar(sid, sv.id, toRequestValue(sv, input)));
      onClose();
    } catch (err) {
      if (isSessionExpired(err)) return onExpired();
      setError(describeChangeError(err, t));
      setBusy(false);
    }
  }

  const hint = sv.type === "NUMBER" ? (min !== null && max !== null ? t("rangeHint", { min, max }) : min !== null ? t("minHint", { min }) : max !== null ? t("maxHint", { max }) : "") : "";
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{t("changeTitle")}</Dialog.Title>
              <p className="text-sm text-[var(--muted-foreground)]">{text(sv.name, strings)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={inputId}>{t("newValue")}</Label>
              {sv.type === "LOGIC" || sv.type === "LIST" ? (
                <select id={inputId} value={input} onChange={(e) => setInput(e.target.value)} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm">
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : sv.type === "NUMBER" ? (
                <div className="flex items-center gap-2">
                  <Input id={inputId} type="number" step="any" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-describedby={hintId} aria-invalid={problem !== null} min={min ?? undefined} max={max ?? undefined} />
                  {sv.unit && <span className="text-sm text-[var(--muted-foreground)]">{sv.unit}</span>}
                </div>
              ) : (
                <Input id={inputId} type="text" value={input} maxLength={STRING_MAX} onChange={(e) => setInput(e.target.value)} />
              )}
              <p id={hintId} className="text-xs text-[var(--muted-foreground)]">
                {hint}
              </p>
              {problem && input !== initialInput(sv) && (
                <p role="alert" className="text-sm text-[var(--destructive)]">
                  {t(problem.key, problem.params)}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--destructive)]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy || problem !== null || !isChanged(sv, input)}>
                {busy ? t("saving") : t("ok")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
