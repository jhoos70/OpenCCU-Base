##
# User.restartLighttpd
# Restarts the web server with monit (staged SP034, ADMIN only).
#
# The command line is fixed (no request data). One syslog line records the correlation id,
# the method and the user id before the restart (the restart may end the CGI request itself).
# v1 behaviour kept: synchronous exec, a failing monit is an uncaught error (internal error).
#
# Return value: [bool] true
##

# admin_audit is defined once in eq3/admin_audit.tcl (sourced by the dispatcher)

admin_audit "restart lighttpd"

exec /usr/bin/monit restart lighttpd

jsonrpc_response true
