# OpenCCU-Base audit repo facts

- Tier large, ~9.8k files; Tcl 72% / JS 16% / C++ 8% of source LOC.
- `www/` is a committed deployed copy of `src/webui/www` (drifted); path refs may resolve in either tree.
- `www/api/methods.conf` SCRIPT_FILE/METHOD_FILE values are relative to `www/api/methods/`.
- Many Tcl/CGI files are ISO-8859-1; verify line refs with `sed -n`/`awk` (plain grep may print nothing).
- `bin/` (prebuilt executables) and `lib/` (prebuilt .so, 4 archs) contain no source.
- No database/DDL; ReGaHss (closed binary) holds the ReGa object store.
- Some backup CGIs (binfile/tarfile/textfile/version.cgi) use CR-only line terminators; count lines via tr '\r' '\n' (GP-PROJ-004).
