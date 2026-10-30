##
# User.deleteCertificate
# Deletes /etc/config/server.pem (staged SP034, ADMIN only). v1 behaviour kept: the delete is
# inside catch and the answer is always true. One syslog line records correlation id, method
# and user id.
#
# Return value: [bool] true
##

# admin_audit is defined once in eq3/admin_audit.tcl (sourced by the dispatcher)

admin_audit "delete /etc/config/server.pem"

catch {file delete /etc/config/server.pem}

jsonrpc_response true