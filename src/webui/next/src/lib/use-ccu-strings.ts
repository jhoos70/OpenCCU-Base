import * as React from "react";
import { loadCatalog, loadDeviceIcons, type Catalog, type Strings } from "./ccu-strings";
import { useI18n } from "./i18n";

/** The CCU's own texts (see ccu-strings.ts) in the language of the app; empty until loaded, empty if unreadable. */
export function useCcuStrings(...catalogs: Catalog[]): Strings {
  const { lang } = useI18n();
  const [strings, setStrings] = React.useState<Strings>({});
  const names = catalogs.join(",");
  React.useEffect(() => {
    let live = true;
    Promise.all(names.split(",").map((c) => loadCatalog(lang, c as Catalog))).then((all) => live && setStrings(Object.assign({}, ...all)));
    return () => {
      live = false;
    };
  }, [lang, names]);
  return strings;
}

/** The CCU's 50 px device thumbnails by device type (from /tools/js/jsDevDescr.cgi); empty until loaded. */
export function useDeviceIcons(): Strings {
  const [icons, setIcons] = React.useState<Strings>({});
  React.useEffect(() => {
    let live = true;
    loadDeviceIcons().then((map) => live && setIcons(map));
    return () => {
      live = false;
    };
  }, []);
  return icons;
}
