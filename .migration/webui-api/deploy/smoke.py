#!/usr/bin/env python3
"""smoke.py - read-only smoke test of the webui-api changes against a TEST CCU / OpenCCU.

    CCU_PASS=secret python3 -I smoke.py --host http://192.168.1.50 --user Admin
    python3 -I smoke.py --host https://ccu.local --user Admin --insecure --strict

What it does: logs in (Session.login), calls a few read-only methods, sends malformed requests and a
few negative security probes, then logs out. It never creates, deletes or changes anything on the
CCU. The probes only read: CCU.existsFile with /etc/passwd and the backup CGI textfile.cgi with
/etc/passwd; the file content is never printed, only whether it came back.

Each check reports PASS, FAIL or INFO. PASS means the hardened behaviour; FAIL means the legacy
behaviour (or something broken); INFO is a fact to read (for example the session key format, which
answers EG-8). Exit status 1 if any check FAILs.

Options
  --strict   additionally check the strict mode (needs strict_mode true in www/api/apiconfig.conf
             on the CCU): a request without X-Requested-With must be refused
  --v2       additionally try /api/v2/rpc (needs a lighttpd route; reported as INFO when absent)
"""
import argparse
import getpass
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

results = []


def report(status, name, detail=""):
    results.append(status)
    print("%-5s %s%s" % (status, name, (" - " + detail) if detail else ""))


class Client:
    def __init__(self, base, insecure, timeout):
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.xrw = False
        self.ctx = None
        if insecure:
            self.ctx = ssl.create_default_context()
            self.ctx.check_hostname = False
            self.ctx.verify_mode = ssl.CERT_NONE

    def raw(self, path, data=None, headers=None, method=None):
        req = urllib.request.Request(self.base + path, data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def rpc(self, method, params=None, sid=None, headers=None, path="/api/homematic.cgi", body=None, xrw=None):
        p = dict(params or {})
        if sid:
            p["_session_id_"] = sid
        payload = body if body is not None else json.dumps({"version": "1.1", "method": method, "params": p}).encode()
        h = {"Content-Type": "application/json"}
        if self.xrw if xrw is None else xrw:
            h["X-Requested-With"] = "XMLHttpRequest"
        h.update(headers or {})
        status, hdrs, data = self.raw(path, data=payload, headers=h, method="POST")
        try:
            doc = json.loads(data.decode("utf-8", "replace"))
        except ValueError:
            doc = None
        return status, doc, data.decode("utf-8", "replace")


def err_of(doc):
    if isinstance(doc, dict) and isinstance(doc.get("error"), dict):
        return doc["error"].get("code"), str(doc["error"].get("message", ""))
    return None, ""


def result_of(doc):
    return doc.get("result") if isinstance(doc, dict) else None


def classify_sid(sid):
    if re.fullmatch(r"[A-Za-z0-9]{10}", sid):
        return "10 alphanumeric characters (inner id, no @)"
    if re.fullmatch(r"@[A-Za-z0-9]{10}@", sid):
        return "@ + 10 alphanumeric characters + @ (wrapped, 12 characters)"
    return "other shape"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", required=True, help="base URL of the CCU, e.g. http://192.168.1.50")
    ap.add_argument("--user", default="Admin")
    ap.add_argument("--insecure", action="store_true", help="do not verify the TLS certificate")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--v2", action="store_true")
    ap.add_argument("--timeout", type=float, default=20)
    a = ap.parse_args()
    pw = os.environ["CCU_PASS"] if "CCU_PASS" in os.environ else getpass.getpass("password for %s: " % a.user)
    c = Client(a.host, a.insecure, a.timeout)
    c.xrw = a.strict  # strict_mode on the CCU refuses every request without this header

    # ---- connectivity and registry
    try:
        st, doc, text = c.rpc("system.listMethods")
    except Exception as e:  # noqa: BLE001
        report("FAIL", "reach /api/homematic.cgi", str(e))
        return 1
    methods = result_of(doc) if st == 200 else None
    if isinstance(methods, list):
        report("INFO", "registry size", "%d methods (179 expected with the new methods.conf)" % len(methods))
        report("PASS" if "RecoveryMode.enter" in methods else "INFO", "RecoveryMode.enter registered")
    else:
        report("INFO", "system.listMethods", "HTTP %s, no method list (unauthenticated listing may be restricted)" % st)
    st, doc, text = c.rpc("ReGa.isPresent")
    report("PASS" if result_of(doc) is True else "FAIL", "ReGa.isPresent", "HTTP %s result %r" % (st, result_of(doc)))

    # ---- login
    st, doc, text = c.rpc("Session.login", {"username": a.user, "password": pw})
    sid = result_of(doc)
    if not isinstance(sid, str) or not sid:
        report("FAIL", "Session.login", "no session id (HTTP %s, error %r)" % (st, err_of(doc)))
        return 1
    report("PASS", "Session.login", "HTTP %s" % st)
    report("INFO", "session key format (EG-8)", "%d characters: %s" % (len(sid), classify_sid(sid)))

    # ---- authenticated reads (shape only)
    for method in ("Room.listAll", "Subsection.listAll", "Device.listAll", "SysVar.getAll", "Interface.listInterfaces", "Program.getAll"):
        st, doc, text = c.rpc(method, sid=sid)
        r = result_of(doc)
        code, msg = err_of(doc)
        if code is None and r is not None:
            report("PASS", method, "%s item(s)" % (len(r) if hasattr(r, "__len__") else r))
        else:
            report("FAIL", method, "error %s %s" % (code, msg[:80]))
    st, doc, text = c.rpc("CCU.getSerial", sid=sid)
    report("PASS" if err_of(doc)[0] is None and result_of(doc) else "INFO", "CCU.getSerial (ADMIN)", "error %s" % (err_of(doc),) if err_of(doc)[0] else "ok")

    # ---- envelope and error handling
    st, doc, text = c.rpc("No.suchMethod", sid=sid)
    report("PASS" if (st == 200 and err_of(doc)[0] == 401) else "FAIL", "unknown method gives error 401 over HTTP 200", "HTTP %s error %s" % (st, err_of(doc)[0]))
    st, doc, text = c.rpc("Device.get", sid=sid)
    report("PASS" if err_of(doc)[0] == 402 else "FAIL", "missing argument gives error 402", "error %s" % (err_of(doc),))
    for label, body in (("truncated JSON", b'{"version":"1.1","method":'), ("not an object", b"[1,2,3]"), ("empty body", b"")):
        st, doc, text = c.rpc("", body=body, sid=None)
        leak = re.search(r"while executing|invoked from within|\bproc\b.*\bline\b|/www/|errorInfo", text)
        report("FAIL" if leak else "INFO", "answer to %s has no Tcl stack trace or path" % label, ("leak: %r" % leak.group(0)) if leak else "HTTP %s (weak probe: the parser rejects this before any script runs, so legacy code passes too)" % st)

    # ---- hardening probes (read-only)
    st, doc, text = c.rpc("CCU.existsFile", {"file": "/etc/passwd"}, sid=sid)
    code, msg = err_of(doc)
    if code == 500 and "not allowed" in msg:
        report("PASS", "CCU.existsFile refuses /etc/passwd", "error 500 %s" % msg)
    elif result_of(doc) is True:
        report("FAIL", "CCU.existsFile answers for /etc/passwd", "legacy behaviour: a filesystem oracle")
    else:
        report("INFO", "CCU.existsFile /etc/passwd", "error %s result %r" % (err_of(doc), result_of(doc)))
    st, doc, text = c.rpc("CCU.existsFile", {"file": "/etc/config/fieldTestActive"}, sid=sid)
    report("PASS" if isinstance(result_of(doc), bool) else "FAIL", "CCU.existsFile on an allowed flag file stays usable", "result %r" % (result_of(doc),))
    # the backup CGIs only accept the @-wrapped 12-character session id (session_isValid), so the
    # probe must send that form; the plain id is refused for that reason alone and proves nothing
    wrapped = sid if sid.startswith("@") else "@%s@" % sid
    st, hdrs, data = c.raw("/api/backup/textfile.cgi?sid=%s&file=/etc/passwd" % wrapped)
    body = data.decode("utf-8", "replace")
    st0, _h, data0 = c.raw("/api/backup/textfile.cgi?sid=%s&file=/etc/passwd" % sid)
    if "root:" in body:
        report("FAIL", "backup CGI textfile.cgi returns /etc/passwd", "legacy behaviour: arbitrary file read by any session (HTTP %s)" % st)
    elif st == 404:
        report("PASS", "backup CGI textfile.cgi is not served", "HTTP 404")
    else:
        report("PASS", "backup CGI textfile.cgi refuses /etc/passwd with a valid @sid@", "HTTP %s, no file content" % st)
    report("INFO", "backup CGI with the plain 10-character sid", "HTTP %s (the CGIs expect @sid@)" % st0)
    # the unauthenticated help page of homematic.cgi lists every method in the legacy code
    st, hdrs, data = c.raw("/api/homematic.cgi")
    page = data.decode("utf-8", "replace")
    listed = sum(1 for m in ("Session.login", "CCU.getSerial", "Device.listAll", "SysVar.getAll") if m in page)
    if listed >= 3:
        report("FAIL", "GET /api/homematic.cgi lists the methods without a session", "legacy behaviour (HTTP %s, %d of 4 probe names found)" % (st, listed))
    else:
        report("PASS", "GET /api/homematic.cgi does not list the methods", "HTTP %s" % st)
    st, doc, text = c.rpc("Session.logout", sid="Zz9Zz9Zz9Z")
    report("PASS" if err_of(doc)[0] is not None else "FAIL", "Session.logout with an unknown session is refused", "error %s" % (err_of(doc),))

    # ---- strict mode (opt-in)
    if a.strict:
        st, doc, text = c.rpc("ReGa.isPresent", xrw=False)
        report("PASS" if err_of(doc)[0] is not None else "FAIL", "strict mode: request without X-Requested-With is refused", "error %s" % (err_of(doc),))
        st, doc, text = c.rpc("ReGa.isPresent", headers={"X-Requested-With": "XMLHttpRequest"})
        report("PASS" if result_of(doc) is True else "FAIL", "strict mode: request with X-Requested-With works", "result %r" % (result_of(doc),))

    # ---- v2 (needs a lighttpd route)
    if a.v2:
        # /api/v2/rpc needs a lighttpd route (not in this repository); /api/homematic.cgi/v2/rpc reaches
        # the CGI through PATH_INFO. Both need v2_enabled true in apiconfig.conf.
        for base in ("/api/v2", "/api/homematic.cgi/v2"):
            hdr = {"X-Requested-With": "XMLHttpRequest", "X-Session-Id": sid}
            # v1 answers every request with HTTP 200, v2 uses real status codes: an unknown route is the
            # JSON 404 only when the v2 router is active (a lighttpd 404 page is not JSON)
            st, doc, text = c.rpc("No.such", path=base + "/no-such-route", headers=hdr)
            if not (st == 404 and doc is not None):
                report("INFO", "v2 " + base, "HTTP %s: not served by the v2 router (no lighttpd route, or v2_enabled is false)" % st)
                continue
            st, doc, text = c.rpc("ReGa.isPresent", path=base + "/rpc", headers=hdr)
            report("PASS" if result_of(doc) is True else "FAIL", "v2 %s/rpc ReGa.isPresent" % base, "HTTP %s result %r error %s" % (st, result_of(doc), err_of(doc)))

    # ---- logout
    st, doc, text = c.rpc("Session.logout", sid=sid)
    report("PASS" if err_of(doc)[0] is None else "FAIL", "Session.logout", "HTTP %s" % st)

    print("\n%d PASS, %d FAIL, %d INFO" % (results.count("PASS"), results.count("FAIL"), results.count("INFO")))
    return 1 if "FAIL" in results else 0


if __name__ == "__main__":
    sys.exit(main())
