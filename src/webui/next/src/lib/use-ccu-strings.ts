import * as React from "react";
import { loadCatalog, type Catalog, type Strings } from "./ccu-strings";
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
