import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  describeChangeError,
  getModel,
  isSessionExpired,
  saveFavourite,
  type Device,
  type FavouriteItem,
  type FavouriteList,
  type Program,
  type SysVar,
} from "@/lib/api";
import type { Strings } from "@/lib/ccu-strings";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export interface EditableFavouriteList {
  id?: string;
  name: string;
  description: string;
  items: FavouriteItem[];
}

interface DraftItem {
  key: string;
  id: string;
  type: "CHANNEL" | "SYSVAR" | "PROGRAM" | "SEPARATOR";
  name: string;
}

type PickerKind = "CHANNEL" | "SYSVAR" | "PROGRAM";

export const FAVOURITE_NAME_MAX = 200;
export const FAVOURITE_INFO_MAX = 1000;
export const FAVOURITE_ITEMS_MAX = 200;

export function isValidFavouriteName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= FAVOURITE_NAME_MAX && !trimmed.startsWith("_USER") && !/[\u0000-\u001f\u007f]/.test(trimmed);
}

/** Dialog to create or edit a favourite list (name, description, ordered members and separators). */
export function FavouriteListDialog({
  initial,
  devices,
  sid,
  strings,
  onClose,
  onSaved,
  onExpired,
}: {
  initial: EditableFavouriteList;
  devices: Device[];
  sid: string;
  strings: Strings;
  onClose: () => void;
  onSaved: (list: FavouriteList) => void;
  onExpired: () => void;
}) {
  const { t } = useI18n();
  const nextKey = React.useRef(initial.items.length + 1);
  const [name, setName] = React.useState(initial.name);
  const [info, setInfo] = React.useState(initial.description);
  const [items, setItems] = React.useState<DraftItem[]>(() =>
    initial.items.map((it, idx) => ({ key: `init-${idx}`, id: it.id, type: it.type, name: it.name })),
  );
  const [pickerKind, setPickerKind] = React.useState<PickerKind>("CHANNEL");
  const [query, setQuery] = React.useState("");
  const [sysvars, setSysvars] = React.useState<SysVar[]>([]);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    Promise.all([getModel("sysvars", sid), getModel("programs", sid)])
      .then(([sv, pr]) => {
        if (!active) return;
        setSysvars(sv.items.filter((v) => v.isVisible && !v.isInternal));
        setPrograms(pr.items.filter((p) => !p.isInternal && !p.isCopy));
      })
      .catch((e) => {
        if (active && isSessionExpired(e)) onExpired();
      });
    return () => {
      active = false;
    };
  }, [sid, onExpired]);

  const validName = isValidFavouriteName(name);
  const usedIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.type !== "SEPARATOR") s.add(`${it.type}:${it.id}`);
    return s;
  }, [items]);

  const candidates = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { id: string; type: PickerKind; name: string; detail: string }[] = [];
    if (pickerKind === "CHANNEL") {
      for (const d of devices) {
        if (!d.isReady) continue;
        for (const c of d.channels) {
          if (usedIds.has(`CHANNEL:${c.id}`)) continue;
          const display = text(c.name, strings);
          if (q && !display.toLowerCase().includes(q) && !c.address.toLowerCase().includes(q) && !text(d.name, strings).toLowerCase().includes(q)) continue;
          out.push({ id: c.id, type: "CHANNEL", name: display, detail: c.address });
        }
      }
    } else if (pickerKind === "SYSVAR") {
      for (const sv of sysvars) {
        if (usedIds.has(`SYSVAR:${sv.id}`)) continue;
        const display = text(sv.name, strings);
        if (q && !display.toLowerCase().includes(q) && !text(sv.description, strings).toLowerCase().includes(q)) continue;
        out.push({ id: sv.id, type: "SYSVAR", name: display, detail: sv.type });
      }
    } else {
      for (const p of programs) {
        if (usedIds.has(`PROGRAM:${p.id}`)) continue;
        const display = text(p.name, strings);
        if (q && !display.toLowerCase().includes(q) && !text(p.description, strings).toLowerCase().includes(q)) continue;
        out.push({ id: p.id, type: "PROGRAM", name: display, detail: "" });
      }
    }
    return out.slice(0, 50);
  }, [pickerKind, query, devices, sysvars, programs, usedIds, strings]);

  function move(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }

  function removeAt(index: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addSeparator() {
    if (items.length >= FAVOURITE_ITEMS_MAX) return;
    const k = `sep-${nextKey.current++}`;
    setItems((prev) => [...prev, { key: k, id: "", type: "SEPARATOR", name: "" }]);
  }

  function addCandidate(c: { id: string; type: PickerKind; name: string }) {
    if (items.length >= FAVOURITE_ITEMS_MAX) return;
    const k = `add-${nextKey.current++}`;
    setItems((prev) => [...prev, { key: k, id: c.id, type: c.type, name: c.name }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validName || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveFavourite(sid, {
        ...(initial.id ? { id: initial.id } : {}),
        name: name.trim(),
        info,
        items: items.map((it) => (it.type === "SEPARATOR" ? { type: "SEPARATOR" } : { type: it.type, id: it.id })),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      if (isSessionExpired(err)) return onExpired();
      setError(describeChangeError(err, t));
      setBusy(false);
    }
  }

  function kindLabel(type: DraftItem["type"]): string {
    if (type === "CHANNEL") return t("channel");
    if (type === "SYSVAR") return t("systemVariable");
    if (type === "PROGRAM") return t("programs");
    return t("separator");
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
        >
          <form onSubmit={submit} className="space-y-4">
            <Dialog.Title className="text-lg font-semibold">{initial.id ? t("editListTitle") : t("newListTitle")}</Dialog.Title>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fav-list-name">{t("name")}</Label>
                <Input
                  id="fav-list-name"
                  value={name}
                  maxLength={FAVOURITE_NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fav-list-info">{t("description")}</Label>
                <Input
                  id="fav-list-info"
                  value={info}
                  maxLength={FAVOURITE_INFO_MAX}
                  onChange={(e) => setInfo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("listMembers")}</span>
                <Button type="button" variant="outline" className="h-8 px-2.5 text-xs" onClick={addSeparator} disabled={items.length >= FAVOURITE_ITEMS_MAX}>
                  {t("addSeparator")}
                </Button>
              </div>
              {items.length === 0 ? (
                <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">{t("emptyList")}</p>
              ) : (
                <ol aria-label={t("listMembers")} className="max-h-48 divide-y divide-[var(--border)] overflow-y-auto rounded-md border border-[var(--border)]">
                  {items.map((it, idx) => {
                    const label = it.type === "SEPARATOR" ? t("separator") : text(it.name, strings);
                    return (
                      <li key={it.key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                        <div className="min-w-0 flex-1 truncate">
                          <span className="mr-2 rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs text-[var(--muted-foreground)]">{kindLabel(it.type)}</span>
                          <span className={it.type === "SEPARATOR" ? "italic text-[var(--muted-foreground)]" : "font-medium"}>{label}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 w-7 p-0 text-xs"
                            aria-label={t("moveUp", { name: label })}
                            disabled={idx === 0}
                            onClick={() => move(idx, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 w-7 p-0 text-xs"
                            aria-label={t("moveDown", { name: label })}
                            disabled={idx === items.length - 1}
                            onClick={() => move(idx, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            aria-label={t("removeMember", { name: label })}
                            onClick={() => removeAt(idx)}
                          >
                            {t("remove")}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("addMembers")}</span>
                <div role="group" aria-label={t("addMembers")} className="flex gap-1">
                  {([
                    ["CHANNEL", t("channels")],
                    ["SYSVAR", t("sysvars")],
                    ["PROGRAM", t("programs")],
                  ] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={pickerKind === k}
                      onClick={() => setPickerKind(k)}
                      className={`h-7 rounded px-2.5 text-xs ${pickerKind === k ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] bg-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("filterMembers")}
                aria-label={t("filterMembers")}
                className="h-8 text-sm"
              />
              {candidates.length === 0 ? (
                <p className="py-2 text-xs text-[var(--muted-foreground)]">{t("noMatchingMembers")}</p>
              ) : (
                <ul className="max-h-36 divide-y divide-[var(--border)] overflow-y-auto text-sm">
                  {candidates.map((c) => (
                    <li key={`${c.type}:${c.id}`} className="flex items-center justify-between gap-2 py-1">
                      <span className="min-w-0 flex-1 truncate">
                        {c.name}
                        {c.detail && <span className="ml-2 text-xs text-[var(--muted-foreground)]">{c.detail}</span>}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 shrink-0 px-2 text-xs"
                        aria-label={t("addMember", { name: c.name })}
                        disabled={items.length >= FAVOURITE_ITEMS_MAX}
                        onClick={() => addCandidate(c)}
                      >
                        {t("add")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!validName && name.length > 0 && (
              <p role="alert" className="text-sm text-[var(--destructive)]">
                {t("errListName")}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-[var(--destructive)]">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy || !validName}>
                {busy ? t("saving") : t("ok")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
