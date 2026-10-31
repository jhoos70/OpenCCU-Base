add_subdirectory(www_source)
add_subdirectory(scripts)

add_custom_target(webui-assets
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${ROOTFS_DIR}/www"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory "${CMAKE_CURRENT_SOURCE_DIR}/www" "${ROOTFS_DIR}/www"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory "${CMAKE_CURRENT_SOURCE_DIR}/rega/www" "${ROOTFS_DIR}/www/rega"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink /tmp/EULA.de "${ROOTFS_DIR}/www/rega/EULA.de"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink /tmp/EULA.en "${ROOTFS_DIR}/www/rega/EULA.en"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink /etc/config/addons/www "${ROOTFS_DIR}/www/addons"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink tcl/extern/cgi.tcl "${ROOTFS_DIR}/www/cgi.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink tcl/eq3_old/common.tcl "${ROOTFS_DIR}/www/common.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink tcl/eq3_old/once.tcl "${ROOTFS_DIR}/www/once.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink tcl/eq3_old/session.tcl "${ROOTFS_DIR}/www/session.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink tcl/eq3_old/user.tcl "${ROOTFS_DIR}/www/user.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/eq3/rega.tcl "${ROOTFS_DIR}/www/api/eq3/rega.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/eq3/session.tcl "${ROOTFS_DIR}/www/api/eq3/session.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/eq3/rega.tcl "${ROOTFS_DIR}/www/pda/eq3/rega.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/eq3/session.tcl "${ROOTFS_DIR}/www/pda/eq3/session.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/extern/cgi.tcl "${ROOTFS_DIR}/www/config/cgi.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/common.tcl "${ROOTFS_DIR}/www/config/common.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/once.tcl "${ROOTFS_DIR}/www/config/once.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/session.tcl "${ROOTFS_DIR}/www/config/session.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/extern/cgi.tcl "${ROOTFS_DIR}/www/config/display/cgi.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/eq3_old/common.tcl "${ROOTFS_DIR}/www/config/display/common.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../../tcl/eq3_old/once.tcl "${ROOTFS_DIR}/www/config/display/once.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/user.tcl "${ROOTFS_DIR}/www/config/user.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/extern/cgi.tcl "${ROOTFS_DIR}/www/tools/cgi.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/common.tcl "${ROOTFS_DIR}/www/tools/common.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/once.tcl "${ROOTFS_DIR}/www/tools/once.tcl"
  COMMAND "${CMAKE_COMMAND}" -E create_symlink ../tcl/eq3_old/session.tcl "${ROOTFS_DIR}/www/tools/session.tcl"
  DEPENDS webui-www-source-assets webui-scripts-assets
  VERBATIM
)

# nextGen WebUI (React/TypeScript/Vite, src/webui/next), served next to the classic UI under /webui/next/.
# Optional because it needs Node.js and npm; without it the web root is exactly the classic one.
option(OPENCCU_BUILD_NEXT_UI "Build the nextGen WebUI (needs Node.js and npm)" OFF)
if(OPENCCU_BUILD_NEXT_UI)
  find_program(OPENCCU_NPM_EXECUTABLE npm REQUIRED)
  set(OPENCCU_NEXT_UI_DIST "${CMAKE_CURRENT_BINARY_DIR}/next-dist")
  add_custom_target(webui-next-assets
    COMMAND "${OPENCCU_NPM_EXECUTABLE}" ci --ignore-scripts --no-audit --no-fund
    COMMAND "${OPENCCU_NPM_EXECUTABLE}" run build -- --outDir "${OPENCCU_NEXT_UI_DIST}" --emptyOutDir
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${ROOTFS_DIR}/www/webui/next"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${OPENCCU_NEXT_UI_DIST}" "${ROOTFS_DIR}/www/webui/next"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/next"
    VERBATIM
  )
  add_dependencies(webui-assets webui-next-assets)
endif()
