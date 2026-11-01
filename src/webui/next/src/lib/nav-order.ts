import * as React from "react";
import { READY_IDS } from "./nav";

export interface NavCustomConfig {
  order: string[];
  hidden: string[];
}

const STORAGE_KEY = "openccu.next.nav.custom";

export function loadNavCustomConfig(): NavCustomConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.order)) {
      return {
        order: parsed.order.filter((id: unknown) => typeof id === "string"),
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id: unknown) => typeof id === "string") : [],
      };
    }
  } catch {
    /* ignore parsing errors */
  }
  return null;
}

export function saveNavCustomConfig(config: NavCustomConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore storage errors */
  }
}

export function resetNavCustomConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore storage errors */
  }
}

export function useNavOrder() {
  const [custom, setCustom] = React.useState<NavCustomConfig | null>(() => loadNavCustomConfig());

  const updateConfig = React.useCallback((next: NavCustomConfig | null) => {
    setCustom(next);
    if (next) {
      saveNavCustomConfig(next);
    } else {
      resetNavCustomConfig();
    }
  }, []);

  const moveItem = React.useCallback((availableIds: string[], id: string, delta: -1 | 1) => {
    setCustom((prev) => {
      const baseOrder = prev ? [...prev.order] : [...availableIds];
      for (const item of availableIds) {
        if (!baseOrder.includes(item)) baseOrder.push(item);
      }
      const activeOrder = baseOrder.filter((item) => availableIds.includes(item));
      const index = activeOrder.indexOf(id);
      if (index === -1) return prev;
      const target = index + delta;
      if (target < 0 || target >= activeOrder.length) return prev;
      const [moved] = activeOrder.splice(index, 1);
      activeOrder.splice(target, 0, moved);

      const updated: NavCustomConfig = {
        order: activeOrder,
        hidden: prev?.hidden ?? [],
      };
      saveNavCustomConfig(updated);
      return updated;
    });
  }, []);

  const toggleHide = React.useCallback((id: string, availableIds: string[]) => {
    if (id === "overview") return;
    setCustom((prev) => {
      const hidden = new Set(prev?.hidden ?? []);
      if (hidden.has(id)) {
        hidden.delete(id);
      } else {
        hidden.add(id);
      }
      const baseOrder = prev ? [...prev.order] : [...availableIds];
      for (const item of availableIds) {
        if (!baseOrder.includes(item)) baseOrder.push(item);
      }
      const updated: NavCustomConfig = {
        order: baseOrder.filter((item) => availableIds.includes(item)),
        hidden: Array.from(hidden),
      };
      saveNavCustomConfig(updated);
      return updated;
    });
  }, []);

  const reset = React.useCallback(() => {
    updateConfig(null);
  }, [updateConfig]);

  return {
    custom,
    moveItem,
    toggleHide,
    reset,
    isCustomized: custom !== null,
  };
}
