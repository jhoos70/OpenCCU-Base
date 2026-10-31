import * as React from "react";

// Hash routing: the app is served from a static prefix, so no server route is needed and a reload keeps the page.
const wanted = (): string => window.location.hash.replace(/^#\/?/, "");

/** The page of the address if the user may see it, else the first allowed page ("" if there is none). */
export function useRoute(allowed: readonly string[]): string {
  const [hash, setHash] = React.useState(wanted);
  React.useEffect(() => {
    const on = () => setHash(wanted());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return allowed.includes(hash) ? hash : (allowed[0] ?? "");
}
