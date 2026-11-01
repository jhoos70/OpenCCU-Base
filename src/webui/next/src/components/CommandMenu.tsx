import * as React from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  DoorOpen,
  ExternalLink,
  Languages,
  Laptop,
  LogOut,
  Moon,
  PlayCircle,
  Radio,
  Sun,
  Variable,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { NAV_ICONS } from "@/components/NavList";
import { getModel, type Device, type Program, type Room, type SysVar } from "@/lib/api";
import { formatSysVarValue, isUserVar, text } from "@/lib/format";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useI18n, type Lang } from "@/lib/i18n";
import type { NavView } from "@/lib/nav";
import { useTheme, type Theme } from "@/lib/theme";

export function CommandMenu({
  open,
  onOpenChange,
  nav,
  current,
  sid,
  classicHref,
  onSignOut,
  indicators = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavView;
  current: string;
  sid?: string;
  classicHref: string;
  onSignOut: () => void;
  indicators?: boolean;
}) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const strings = useCcuStrings("extension", "stringtable");
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [functions, setFunctions] = React.useState<Room[]>([]);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [sysvars, setSysvars] = React.useState<SysVar[]>([]);

  // Load items lazily when palette opens or session is provided
  React.useEffect(() => {
    if (!sid || !open) return;
    let live = true;
    getModel("devices", sid)
      .then((res) => {
        if (live && res?.items) {
          setDevices(res.items);
        }
      })
      .catch(() => {});
    getModel("rooms", sid)
      .then((res) => {
        if (live && res?.items) {
          setRooms(res.items);
        }
      })
      .catch(() => {});
    getModel("functions", sid)
      .then((res) => {
        if (live && res?.items) {
          setFunctions(res.items);
        }
      })
      .catch(() => {});
    getModel("programs", sid)
      .then((res) => {
        if (live && res?.items) {
          setPrograms(res.items);
        }
      })
      .catch(() => {});
    getModel("sysvars", sid)
      .then((res) => {
        if (live && res?.items) {
          setSysvars(res.items);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sid, open]);

  const runCommand = React.useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("noResults")}</CommandEmpty>

        {/* Navigation Group */}
        {nav.groups.length > 0 && (
          <CommandGroup heading={t("navigation")}>
            {nav.groups
              .flatMap((g) => g.items)
              .map((item) => {
                const Icon: LucideIcon = NAV_ICONS[item.id] ?? Radio;
                const isCurrent = current === item.id;
                const label = t(item.labelKey);
                return (
                  <CommandItem
                    key={item.id}
                    value={`${label} ${item.id}`}
                    onSelect={() =>
                      runCommand(() => {
                        window.location.hash = `#/${item.id}`;
                      })
                    }
                  >
                    <Icon className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
                    <span className="flex-1 truncate">{label}</span>
                    {isCurrent && <span className="text-xs text-[var(--muted-foreground)]">●</span>}
                  </CommandItem>
                );
              })}
            {indicators && (
              <>
                <CommandItem
                  value={`${t("alarmMessages")} alarms`}
                  onSelect={() =>
                    runCommand(() => {
                      window.location.hash = "#/alarms";
                    })
                  }
                >
                  <Bell className="size-4 shrink-0 text-[var(--destructive)]" aria-hidden="true" />
                  <span className="flex-1 truncate">{t("alarmMessages")}</span>
                  {current === "alarms" && <span className="text-xs text-[var(--muted-foreground)]">●</span>}
                </CommandItem>
                <CommandItem
                  value={`${t("serviceMessages")} services`}
                  onSelect={() =>
                    runCommand(() => {
                      window.location.hash = "#/services";
                    })
                  }
                >
                  <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
                  <span className="flex-1 truncate">{t("serviceMessages")}</span>
                  {current === "services" && <span className="text-xs text-[var(--muted-foreground)]">●</span>}
                </CommandItem>
              </>
            )}
          </CommandGroup>
        )}

        {/* Rooms Group */}
        {rooms.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("rooms")}>
              {rooms.map((room) => {
                const roomName = text(room.name, strings);
                return (
                  <CommandItem
                    key={room.id}
                    value={`${roomName} ${room.name} ${room.description ?? ""}`}
                    onSelect={() =>
                      runCommand(() => {
                        window.location.hash = `#/rooms/${room.id}`;
                      })
                    }
                  >
                    <DoorOpen className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                    <span className="flex-1 truncate font-medium">{roomName}</span>
                    <CommandShortcut>
                      {room.channelIds.length} {t(room.channelIds.length === 1 ? "channel" : "channels").toLowerCase()}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {/* Functions Group */}
        {functions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("functions")}>
              {functions.map((func) => {
                const funcName = text(func.name, strings);
                return (
                  <CommandItem
                    key={func.id}
                    value={`${funcName} ${func.name} ${func.description ?? ""}`}
                    onSelect={() =>
                      runCommand(() => {
                        window.location.hash = `#/functions/${func.id}`;
                      })
                    }
                  >
                    <Wrench className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                    <span className="flex-1 truncate font-medium">{funcName}</span>
                    <CommandShortcut>
                      {func.channelIds.length} {t(func.channelIds.length === 1 ? "channel" : "channels").toLowerCase()}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {/* Devices Group */}
        {devices.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("devices")}>
              {devices.map((device) => {
                const devName = text(device.name, strings);
                return (
                  <CommandItem
                    key={device.id}
                    value={`${devName} ${device.name} ${device.address} ${device.type}`}
                    onSelect={() =>
                      runCommand(() => {
                        window.location.hash = `#/devices/${device.id}`;
                      })
                    }
                  >
                    <Radio className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                    <span className="flex-1 truncate font-medium">{devName}</span>
                    <CommandShortcut>{device.address}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {/* Programs Group */}
        {programs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("programs")}>
              {programs
                .filter((p) => p.isOperable && !p.isCopy && !p.isInternal)
                .map((program) => {
                  const progName = text(program.name, strings);
                  return (
                    <CommandItem
                      key={program.id}
                      value={`${progName} ${program.name} ${program.description ?? ""}`}
                      onSelect={() =>
                        runCommand(() => {
                          window.location.hash = `#/programs?q=${encodeURIComponent(program.name)}`;
                        })
                      }
                    >
                      <PlayCircle className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                      <span className="flex-1 truncate font-medium">{progName}</span>
                      {program.description ? (
                        <CommandShortcut className="hidden sm:inline-block max-w-[140px] truncate text-xs text-[var(--muted-foreground)]">
                          {text(program.description, strings)}
                        </CommandShortcut>
                      ) : null}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </>
        )}

        {/* System Variables Group */}
        {sysvars.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("sysvars")}>
              {sysvars
                .filter(isUserVar)
                .map((sv) => {
                  const svName = text(sv.name, strings);
                  const formattedVal = formatSysVarValue(sv, t, strings, lang);
                  return (
                    <CommandItem
                      key={sv.id}
                      value={`${svName} ${sv.name} ${formattedVal} ${sv.description ?? ""}`}
                      onSelect={() =>
                        runCommand(() => {
                          window.location.hash = `#/sysvars?q=${encodeURIComponent(sv.name)}`;
                        })
                      }
                    >
                      <Variable className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                      <span className="flex-1 truncate font-medium">{svName}</span>
                      {formattedVal ? (
                        <CommandShortcut className="font-semibold text-[var(--foreground)]">
                          {formattedVal}
                        </CommandShortcut>
                      ) : null}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        {/* Theme Group */}
        <CommandGroup heading={t("theme")}>
          <CommandItem
            value={`${t("themeLight")} light`}
            onSelect={() =>
              runCommand(() => {
                setTheme("light");
              })
            }
          >
            <Sun className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">{t("themeLight")}</span>
            {theme === "light" && <Check className="size-4 text-[var(--primary)]" aria-hidden="true" />}
          </CommandItem>
          <CommandItem
            value={`${t("themeDark")} dark`}
            onSelect={() =>
              runCommand(() => {
                setTheme("dark");
              })
            }
          >
            <Moon className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">{t("themeDark")}</span>
            {theme === "dark" && <Check className="size-4 text-[var(--primary)]" aria-hidden="true" />}
          </CommandItem>
          <CommandItem
            value={`${t("themeSystem")} system`}
            onSelect={() =>
              runCommand(() => {
                setTheme("system");
              })
            }
          >
            <Laptop className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">{t("themeSystem")}</span>
            {theme === "system" && <Check className="size-4 text-[var(--primary)]" aria-hidden="true" />}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Language Group */}
        <CommandGroup heading={t("language")}>
          <CommandItem
            value="Deutsch de german"
            onSelect={() =>
              runCommand(() => {
                setLang("de" as Lang);
              })
            }
          >
            <Languages className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">Deutsch</span>
            {lang === "de" && <Check className="size-4 text-[var(--primary)]" aria-hidden="true" />}
          </CommandItem>
          <CommandItem
            value="English en english"
            onSelect={() =>
              runCommand(() => {
                setLang("en" as Lang);
              })
            }
          >
            <Languages className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">English</span>
            {lang === "en" && <Check className="size-4 text-[var(--primary)]" aria-hidden="true" />}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Actions Group */}
        <CommandGroup heading={t("actions")}>
          <CommandItem
            value={`${t("openClassic")} classic`}
            onSelect={() =>
              runCommand(() => {
                window.location.href = classicHref;
              })
            }
          >
            <ExternalLink className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="flex-1">{t("openClassic")}</span>
          </CommandItem>
          <CommandItem
            value={`${t("signOut")} logout`}
            onSelect={() =>
              runCommand(() => {
                onSignOut();
              })
            }
          >
            <LogOut className="size-4 shrink-0 text-[var(--destructive)]" aria-hidden="true" />
            <span className="flex-1 text-[var(--destructive)]">{t("signOut")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
