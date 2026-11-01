import * as React from "react";
import { Bell, Wrench } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { useMessages } from "@/lib/use-messages";
import { cn } from "@/lib/utils";

// The classic header shows a green dot at 0 and red (alarms) or yellow (service messages) above 0.
function Indicator({
  href,
  labelKey,
  count,
  active,
  icon,
}: {
  href: string;
  labelKey: MessageKey;
  count: number;
  active: string;
  icon: React.ReactNode;
}) {
  const { t } = useI18n();
  const label = t("messageCount", { label: t(labelKey), count });
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", count > 0 ? active : "bg-emerald-500")} />
      <span aria-hidden="true" className="text-[var(--muted-foreground)]">
        {icon}
      </span>
      <span aria-hidden="true" className="min-w-3.5 text-center font-semibold tabular-nums">
        {count}
      </span>
    </a>
  );
}

/** The alarm and service message counters of the app bar, each a link to its list. Nothing for guests. */
export function StatusIndicators() {
  const { t } = useI18n();
  const m = useMessages();
  if (!m.enabled) return null;
  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={
        t("messageCount", { label: t("alarmMessages"), count: m.alarmCount }) +
        ", " +
        t("messageCount", { label: t("serviceMessages"), count: m.serviceCount })
      }
    >
      <Indicator href="#/alarms" labelKey="alarmMessages" count={m.alarmCount} active="bg-red-500 animate-pulse" icon={<Bell className="size-4" />} />
      <Indicator href="#/services" labelKey="serviceMessages" count={m.serviceCount} active="bg-amber-500" icon={<Wrench className="size-4" />} />
      {/* A screen reader hears a change of the counts without having to look for it. */}
      <span role="status" className="sr-only">
        {m.loaded
          ? `${t("messageCount", { label: t("alarmMessages"), count: m.alarmCount })}. ${t("messageCount", { label: t("serviceMessages"), count: m.serviceCount })}`
          : ""}
      </span>
    </div>
  );
}
