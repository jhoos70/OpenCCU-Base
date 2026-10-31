import type { SysVar } from "./api";

/** Is this variable part of the user's own set (the classic list hides internal ones)? */
export const isUserVar = (v: SysVar): boolean => v.isVisible && !v.isInternal;

// ReGa stores the texts of a logic variable as value names; they may be i18n keys like ${sysVarX}, which
// the classic UI resolves with its string table. Show a plain yes/no instead of a raw key.
const plain = (name: string | undefined, fallback: string): string => (name && !name.startsWith("${") ? name : fallback);

export function formatSysVarValue(v: SysVar): string {
  switch (v.type) {
    case "LOGIC":
      return v.value === "true" ? plain(v.valueName1, "yes") : plain(v.valueName0, "no");
    case "ALARM":
      return v.value === "true" ? plain(v.valueName1, "triggered") : plain(v.valueName0, "not triggered");
    case "ENUM": {
      const list = (v.valueList ?? "").split(";");
      return list[Number(v.value)] ?? v.value;
    }
    case "NUMBER":
      return v.unit ? `${v.value} ${v.unit}` : v.value;
    default:
      return v.value;
  }
}
