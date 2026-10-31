# OpenCCU nextGen WebUI

React 19, TypeScript, Vite and Tailwind, with shadcn/ui-style components (Radix primitives) that live in
`src/components/ui` and are maintained here. It runs **next to** the classic UI, which stays untouched.
Decisions: `.migration/plan/decisions-ui.md` (D1 to D5).

Status: the login only. It signs in with `Session.login` on the v2 API, keeps the session id in
`sessionStorage`, and links to the classic UI with the same session, so both can be used at once.

## Where it runs

- Served by lighttpd under **`/webui/next/`** (a static prefix of the CCU web root; no lighttpd change).
- Talks to **`/api/homematic.cgi/v2/rpc`**. That needs `v2_enabled true` in `/www/api/apiconfig.conf`
  (default `false`). When lighttpd routes `/api/v2` itself, set `VITE_API_BASE=/api/v2` at build time.
- The API client sends `X-Requested-With` and `X-Session-Id`, and shows a message that never contains
  server internals (`src/lib/api.ts`).

## Develop

```sh
npm ci
CCU_URL=http://127.0.0.1:18080 npm run dev    # proxies /api and /pages to a CCU (a test instance!)
npm test                                       # unit tests of the API client
npm run build                                  # type check + production build into dist/
```

## Build into the web root

```sh
cmake --preset x86_64-linux-gnu -DDEPLOY_TO_REPO=OFF -DOPENCCU_BUILD_NEXT_UI=ON
cmake --build --preset x86_64-linux-gnu --target webui-assets
```

`OPENCCU_BUILD_NEXT_UI` is **off by default** (it needs Node.js and npm): without it the web root is exactly
the classic one. `package-lock.json` is committed and `npm ci` installs without running install scripts.
Built output is never committed.

## End-to-end test

`src/webui/tests/e2e/next_login.py` drives a real browser against a CCU that has the app installed and
`v2_enabled true`: wrong password, login, reload, the same session in the classic UI, sign out.

## Not yet

German text (the classic UI is multilingual), any page after the login, push events, and the clean
`/next/` and `/api/v2` URLs (they need a change in the OpenCCU packaging repository, "Route A").

## Licences

Only OSI-approved open-source dependencies. The 13 shipped packages are MIT (12) and Apache-2.0 (1);
re-check with every dependency change.
