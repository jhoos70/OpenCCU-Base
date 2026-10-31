# OpenCCU nextGen WebUI

React 19, TypeScript, Vite and Tailwind, with shadcn/ui-style components (Radix primitives) that live in
`src/components/ui` and are maintained here. It runs **next to** the classic UI, which stays untouched.
Decisions: `.migration/plan/decisions-ui.md` (D1 to D5).

Status: login, an app shell (app bar, sidebar or drawer, user menu, alarm and service indicators) and read-only
pages: Overview (the landing page), Devices (filter, channels per device), Rooms, Programs (status **and control**), System variables
(status **and control**) and the two message lists. It signs in with `Session.login` on the v2 API, keeps the session
id in `sessionStorage`, and links to the classic UI with the same session, so both can be used at once. The pages
read the v2 bulk model (`GET /model`); routes are hash based (`#/devices`, `#/rooms`, `#/sysvars`), so no server
route is needed and a reload keeps the page. An expired session returns to the form.

## Shell and navigation

The classic header mixes identity, a breadcrumb, alarm and service counters, logout, a save button and a two-level
menu. Here each has its own place: the slim app bar holds the name and the **user menu** (name, level, simple or
expert mode as information, language, the classic UI, sign out); the **navigation** is a sidebar on wide screens and
a drawer on narrow ones; a page has a title instead of a breadcrumb. There is no global "Save changes" button: dialogs that save have their own buttons.

## Alarm and service messages

The app bar shows the two counters of the classic header, each a link to its list (`#/alarms`, `#/services`): a
green dot at 0, red (alarms) or amber (service messages) above 0, shown to users and admins, not to guests. The
data is the `alarms` and `services` sections of `GET /model` (one request, every 10 seconds, paused while the tab
is hidden, last known numbers kept if an update fails; the classic UI asks every 3 seconds). The alarm count is
the alarm system variables that are oncoming and true; the service count is the open service messages, minus the
sticky-unreach ones while the CCU hides them (`CCU.getStickyUnreachState`; a user who may not ask is treated as
"hide", as the classic UI does). Message texts that contain `${key}` references are resolved from the classic
language files. Acknowledging a message is not built (the classic UI does it with `ReceiptAlarm`).

## Programs: status and control

The classic status list of the programs and its action: name, description, last run and a **Run** button, with a name
filter, refreshed every 10 seconds. It lists what the classic page lists: programs that users may operate, not the copies
of the editor and not the system's own; an inactive program can be run by hand, as in the classic UI. A click runs the
program through `POST /api/v2/programs {id, execute: true}` and shows the result in a status line that a screen reader
announces ("... was started", or why not); the last run in the row is the time ReGa reports. A user or administrator may
run programs, a guest only looks. Not built: the classic "Activity" text (what a program does; it is produced by a ReGa
page function that a script cannot call), activating and deactivating a program, and editing (the classic "Programs and
connections" pages). The server runs only a program of the program collection, refuses an internal program (403), and a
non-admin needs the program's full access right; the v1 `Program.execute` checks none of this.

## System variables: status and control

The first page that **writes**. The list is the classic one: name, description, last modified and status, with a name
filter, refreshed every 10 seconds. A user or administrator gets a **Change** button next to every logic, list, number
or string variable; it opens a dialog like the classic "Change system variable value": a choice between the value names
for a logic variable, the entries for a list, a number field with the variable's limits and unit, a text field (at most
1000 characters) for a string. OK stays disabled until the value is valid and different; a refusal of the server is shown
in the dialog, which stays open; Escape and Cancel send nothing; the focus goes back to the Change button. Alarm
variables, the system's own (internal) variables and hidden ones cannot be changed. A guest only looks.

It calls the new `POST /api/v2/sysvars {id, value}` (a boolean for a logic variable, else the text as typed, so a number is
not rounded by a float round trip). The server decides: it looks the id up among the system variables only, validates by
type and limits, needs the variable's full access right for a non-admin, and logs each change. The server's answer (value
and time as ReGa has them) updates the row at once. The classic UI changes a variable with a ReGa page script
(`saveSysVar`) and has no JSON method for a string or a list value (`SysVar.setEnum` redefines the value list), which is
why the route exists. Checked on the test CCU against the v1 API and the classic list.

## Overview

The landing page, as the classic start page is: a **System** card (the time of the CCU, date, sunrise, sunset, the
firmware version), the **duty cycle** card, and a **Favourites** card that points to the classic UI (favourites are
not built). A hint appears if the account has no password. The system values come from the new `GET /api/v2/system`
(any session; time, sunrise and sunset from one ReGa script, the version from `/VERSION`); a value that cannot be read
is shown as a dash. The time is asked again every minute and runs with the browser's clock in between.

The **duty cycle** card shows the load of each radio interface (CCU radio module, HmIP access points, LAN gateways): a
bar for the duty cycle and, where the interface reports it, one for carrier sense, each with the value and a word
(normal, warning, critical), so colour is not the only signal. The thresholds are those of the classic start page: duty
cycle warning from 70 % and critical from 90 %, carrier sense from 11 % and 20 %. An interface is named as there: "CCU",
"HAP (name)" or "LGW (name)", or by address if it has no name; -1 is shown as not available.

The duty cycle data is `Interface.getDutyCycle`, which reads `/tmp/dutycycle.json`, written by OpenCCU's
`updateDCVars.tcl`. **Both the method and the classic display are an OpenCCU addition (rootfs patch 0057), not part of
this repository's API**: on a system without the method the card says that the duty cycle is not available. It
refreshes every minute. The classic header's hidden test panel (duty cycle, interfaces, restart ReGa, API tools) is not
carried over. Not carried over from the classic start page either: the user's own start-page system variables, the
rows about available firmware (they need an internet check) and the favourites themselves.

The navigation is **object-centric**: one entry per object (devices, rooms, system variables, ...) where the classic
menu has a status page under "Status and control" and an editor under "Settings". `src/lib/nav.ts` maps every
classic menu entry to an entry here, with the user level it needs. The menu depends on the user level, which comes
from `GET /profile` (`level`: ADMIN, USER, GUEST). Guests and unknown levels get no navigation, as in the classic UI.
Entries that are not built yet stay in the config and are not shown; a link points to the classic UI for them.

`src/lib/nav.test.ts` reads the real `www/webui/js/mainmenu/{admin,user}.js`: every classic entry must be mapped or
deliberately dropped, nothing may be mapped that does not exist, and each entry needs the level the classic menu
gives it. It is the checklist of the migration; it fails when the classic menu changes.

Not changeable here: the expert mode. The CCU has no API for it (the classic UI uses its account dialog), so the
user menu shows it only.

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
- `src/webui/tests/e2e/next_shell.py`: sidebar, user menu, drawer on a narrow screen, user levels (mocked `/profile`:
  user, guest, unknown level, failing and expired), at most two logins.
- `src/webui/tests/e2e/next_messages.py`: the indicators against the classic header (real), the alarm page against
  the indicator, and mocked service messages (the test CCU has none): sticky handling, German, live update, a failing
  update, an expired session, guest and user.
- `src/webui/tests/e2e/next_programs.py`: **real runs on the test CCU, run it on a test CCU only.** A bare test program is
  created by a ReGa script and always deleted; it is compared with the classic list, run through the page and checked
  through the v1 API (its last run moves); mocks cover programs the classic list leaves out, the server's refusals, an
  expired session, German and the user level.
- `src/webui/tests/e2e/next_sysvars.py`: **real changes on the test CCU, run it on a test CCU only.** The list against
  the classic list; Anwesenheit flipped and put back (checked through the v1 API); a temporary number with limits and a
  temporary list created and always deleted; a string and the server's refusals (422, 403, 404, 500), an expired
  session, German and the user level with mocked answers; cancel, Escape, focus, filter and a change made elsewhere.
- `src/webui/tests/e2e/next_overview.py`: the real date, sunrise, sunset and firmware version against the classic start
  page (the time within a minute), a ticking clock (the browser clock is controlled), an unreadable time, a failing
  call (the other cards stay), the password hint, German and the narrow layout.
- `src/webui/tests/e2e/next_dutycycle.py` (`--data mock|real|empty`): the card with mocked answers (severity colours and
  words, -1, carrier sense, live update, unknown method, failure, German, narrow, expired session), through the real API
  path with a hand-written `/tmp/dutycycle.json` in OpenCCU's format (`real`), and the real empty answer (`empty`). The
  test CCU has no radio hardware.
- `src/webui/tests/e2e/next_i18n_devices.py`: German by browser language, the language switch, `${key}` value names
  resolved from the classic strings, and the Devices page. The test CCU has no devices, so the real answer is the
  empty state; the rest uses a mocked model answer with realistic devices (shape of `v2/model.tcl`).

## Login limit

The v2 API limits logins to 10 per minute and IP (and requests per session), always on. A test or script that signs
in more often gets "Too many attempts". The classic API (v1) is not limited unless `rate_limit` is set.

## Not yet

acknowledging messages, pages beyond devices, rooms and system variables (programs, the device inbox), editing, push events,
device pages checked against real hardware (there is none in the test CCU), and the clean
`/next/` and `/api/v2` URLs (they need a change in the OpenCCU packaging repository, "Route A").

## Licences

Only OSI-approved open-source dependencies. The 50 shipped packages are MIT (48), Apache-2.0 (1) and 0BSD (1);
re-check with every dependency change.
