# Shared planning context (plan-assess)
Repo: /home/standard/dev/OpenCCU-Base (monorepo, tier large, 9,793 files). Docs: .migration/docs/{modules,cross-cutting,overview,external-context}. Templates: /home/standard/.claude/local-marketplace/one-modernizer/skills/plan-migration/references/{plan-adr-template.md,adr-workflow.md ("Draft Complete ADR")}.

## Engagement goal
Renovate the web UI ("nextGen UI", branch feature/nextgen-ui). UI features (webui-*, www) are the primary migration targets: propose target options, recommend one, phase it (strangler approach via the existing shell is the working hypothesis; not decided). Native/back-end features (src-feature--*, bin-feature, firmware, opt, usr) are assessed for coupling/risk to the UI and get a retain / wrap / minimal-change / replace recommendation.

## Source stack
Tcl 72% (658,860 LOC), JavaScript 16%, C++ 8%, C/C++ 3%; CMake/Make; GitHub Actions CI. No database. Closed-source prebuilt bin/ReGaHss (script engine + web server for ReGa pages).

## Integration
XML-RPC: hs485d TCP 2000 (25 methods), rfd TCP 2001 (~50). JSON-RPC /api/homematic.cgi (180 methods; levels NONE/GUEST/USER/ADMIN = 0/1/2/8; sid in JSON body; HTTP 200 always; no CORS/CSRF; errorInfo leaked at homematic.cgi:155; Event.poll only init/delete; no endpoints for program/room editing). /dev/eq3loop ioctls (hand-copied numbers), hss_led AF_UNIX /run/hss_led/control + UDP 8182, Tcl extensions tclrpc.so/tclrega.so. cp_*/ic_* CGIs return HTML fragments loaded by the SPA shell.

## Security
Request-driven exec cp_software.cgi:493 (admin); default admin creds www/tcl/eq3_old/user.tcl:8-9 (plaintext compare); hard-coded key "Markus is awesome" (crypttool.cpp:26, eq3configd main.cpp:50); predictable IV (UnifiedLanCommController.cpp:464-483); unauthenticated eq3configd UDP unless CRYPT=1; ccu/setsshpassword.tcl:11-13, ccu/createfile.tcl:15, backup CGIs read caller paths; config-tool mode skips privilege checks (homematic.cgi:147-148).

## Testing
Only tests/test-components.py (CMake install closure; CI x86_64 only), tests/build-tools devicetype-strip test, src/hss_led LedControllerTest. No UI, API, daemon or Tcl tests.

## Tech debt
www/ is a drifted committed copy of src/webui/www (source of truth; 52+49 files differ; dangling absolute symlinks); easymodes 2,561 files (390 duplicate tcl, 611 duplicate txt); dead assets; Windows leftovers; dead config keys; docs partial for rfd/multimacd/hs485d/libs.

## External constraint
Sibling repo /home/standard/dev/OpenCCU (Buildroot packaging) pins this repo by SHA; its 64 rootfs patches (41 on webui.js) depend on exact webui.js structure (first-10-line template-string splitting) and CRLF in www/tcl/eq3/rega.tcl; overlay WebUI-openccu adds branding (www/ise/img), CodeMirror 6. Port contract hs485d 32000 / rfd 32001 / ReGa 8183,1998 hand-synchronised across OCI/HA/Helm. See .migration/docs/external-context/summary.md.
