# OpenCCU nextGen WebUI

React 19, TypeScript, Vite and Tailwind, with shadcn/ui-style components (Radix primitives) that live in
`src/components/ui` and are maintained here. It runs **next to** the classic UI, which stays untouched.
Decisions: `.migration/plan/decisions-ui.md` (D1 to D5).

Status: login, and three read-only pages: Devices (filter, channels per device), Rooms and System variables.
It signs in with `Session.login` on the v2 API, keeps the session id in `sessionStorage`, and links to the
classic UI with the same session, so both can be used at once. The pages read the v2 bulk model (`GET /model`);
routes are hash based (`#/devices`, `#/rooms`, `#/sysvars`), so no server route is needed and a reload keeps the
page. An expired session returns to the form.

## Languages

English and German. The browser language decides, a DE/EN switch in the header overrides it and is remembered
(`localStorage`). The texts of the app are in `src/lib/messages.ts`; the German catalog must have exactly the
English keys (the compiler checks it, and a test checks the placeholders).

Texts that belong to the CCU itself, namely the `${key}` value names of system variables and the descriptions of
device types, are read from the classic UI's language files (`/webui/js/lang/<lang>/translate.lang.*.js`,
`src/lib/ccu-strings.ts`), so both UIs show the same translations and nothing is translated twice. If a file
cannot be read the app falls back to plain text. A unit test parses the real files of this repository, so a
change of their format is noticed. Dialog texts that the files build by JavaScript concatenation are not
supported (and not needed here).

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

Both drive a real browser against a CCU that has the app installed and `v2_enabled true`
(`python3 -I <file> --base http://127.0.0.1:18080 --password ...`, in the Playwright container of `tests/e2e`):

- `src/webui/tests/e2e/next_login.py`: wrong password, login, reload, the same session in the classic UI, sign out.
- `src/webui/tests/e2e/next_pages.py`: rooms and system variables compared with the classic v1 API, tabs, reload,
  umlauts, internal variables hidden, an expired session returns to the form.
- `src/webui/tests/e2e/next_i18n_devices.py`: German by browser language, the language switch, `${key}` value names
  resolved from the classic strings, and the Devices page. The test CCU has no devices, so the real answer is the
  empty state; the rest uses a mocked model answer with realistic devices (shape of `v2/model.tcl`).

## Not yet

pages beyond devices, rooms and system variables (programs, the device inbox), editing, push events,
device pages checked against real hardware (there is none in the test CCU), and the clean
`/next/` and `/api/v2` URLs (they need a change in the OpenCCU packaging repository, "Route A").

## Licences

Only OSI-approved open-source dependencies. The 13 shipped packages are MIT (12) and Apache-2.0 (1);
re-check with every dependency change.
