import * as React from "react";
import { Button } from "@/components/ui/button";
import { describeChangeError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMessages } from "@/lib/use-messages";

/** What the Confirm buttons of a messages page share: one at a time, and the answer to show. */
export function useConfirm() {
  const { t } = useI18n();
  const m = useMessages();
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function one(id: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await m.acknowledge(id);
      setNotice({ ok: true, text: t("confirmed") });
    } catch (e) {
      setNotice({ ok: false, text: describeChangeError(e, t) });
    } finally {
      setBusy(false);
    }
  }
  async function all(ids: string[]) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setNotice(null);
    let done = 0;
    for (const id of ids) {
      try {
        await m.acknowledge(id);
        done++;
      } catch {
        // the rest are tried anyway; the answer says how many went through
      }
    }
    setNotice(done === ids.length ? { ok: true, text: t("confirmedCount", { count: done }) } : { ok: false, text: t("confirmSome", { done, total: ids.length }) });
    setBusy(false);
  }
  return { busy, notice, one, all };
}

/** The button of one message; a message the device reports by itself (read-only trigger) has no button, only the reason. */
export function ConfirmButton({ id, name, canAcknowledge, busy, onConfirm }: { id: string; name: string; canAcknowledge: boolean; busy: boolean; onConfirm: (id: string) => void }) {
  const { t } = useI18n();
  if (!canAcknowledge) return <span className="text-xs text-[var(--muted-foreground)]">{t("cannotConfirm")}</span>;
  return (
    <Button variant="outline" className="h-8 px-3" disabled={busy} aria-label={t("confirmWhat", { name })} onClick={() => onConfirm(id)}>
      {t("confirm")}
    </Button>
  );
}

/** "Confirm all" and the answer; polite for a success, an alert for a failure. */
export function ConfirmAll({ ids, busy, notice, onConfirmAll }: { ids: string[]; busy: boolean; notice: { ok: boolean; text: string } | null; onConfirmAll: (ids: string[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" className="h-9 px-3" disabled={busy || ids.length === 0} onClick={() => onConfirmAll(ids)}>
        {t("confirmAll")}
      </Button>
      <div aria-live="polite" className="text-sm">
        {notice?.ok && <span className="text-[var(--ok)]">{notice.text}</span>}
      </div>
      {notice && !notice.ok && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {notice.text}
        </p>
      )}
    </div>
  );
}
