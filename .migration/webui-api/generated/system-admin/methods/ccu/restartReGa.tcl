##
# CCU.restartReGa
# Restarts the ReGa logic layer with monit (staged SP034, ADMIN only).
#
# The command line is fixed (no request data); one syslog line records correlation id, method
# and user id. v1 behaviour kept: a failing monit is swallowed, the result is always null.
##

# admin_audit is defined once in eq3/admin_audit.tcl (sourced by the dispatcher)

admin_audit "restart ReGaHss"

catch {exec /usr/bin/monit restart ReGaHss}

jsonrpc_response ""
