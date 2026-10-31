import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { useMessages } from "@/lib/use-messages";
import { cn } from "@/lib/utils";

// The classic header shows a green dot at 0 and red (alarms) or yellow (service messages) above 0.
function Indicator({ href, labelKey, count, active, icon }: { href: string; labelKey: MessageKey; count: number; active: string; icon: React.ReactNode }) {
  const { t } = useI18n();
  const label = t("messageCount", { label: t(labelKey), count });
  return (
    <a href={href} title={label} aria-label={label} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", count > 0 ? active : "bg-green-400")} />
      <span aria-hidden="true">{icon}</span>
      <span aria-hidden="true" className="min-w-4 text-center font-semibold tabular-nums">
        {count}
      </span>
    </a>
  );
}

const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Bell = () => (
  <svg {...svg}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const Wrench = () => (
  <svg {...svg}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

/** The alarm and service message counters of the app bar, each a link to its list. Nothing for guests. */
export function StatusIndicators() {
  const { t } = useI18n();
  const m = useMessages();
  if (!m.enabled) return null;
  return (
    <div className="flex items-center" role="group" aria-label={t("messageCount", { label: t("alarmMessages"), count: m.alarmCount }) + ", " + t("messageCount", { label: t("serviceMessages"), count: m.serviceCount })}>
      <Indicator href="#/alarms" labelKey="alarmMessages" count={m.alarmCount} active="bg-red-500" icon={<Bell />} />
      <Indicator href="#/services" labelKey="serviceMessages" count={m.serviceCount} active="bg-amber-400" icon={<Wrench />} />
      {/* A screen reader hears a change of the counts without having to look for it. */}
      <span role="status" className="sr-only">
        {m.loaded ? `${t("messageCount", { label: t("alarmMessages"), count: m.alarmCount })}. ${t("messageCount", { label: t("serviceMessages"), count: m.serviceCount })}` : ""}
      </span>
    </div>
  );
}
