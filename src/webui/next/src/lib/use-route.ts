import * as React from "react";

export const ROUTES = ["devices", "rooms", "sysvars"] as const;
export type Route = (typeof ROUTES)[number];

// Hash routing: the app is served from a static prefix, so no server route is needed and a reload keeps the page.
const parse = (): Route => {
  const name = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "devices";
};

export function useRoute(): Route {
  const [route, setRoute] = React.useState<Route>(parse);
  React.useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
