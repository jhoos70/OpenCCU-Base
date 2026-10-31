#!/bin/sh
# Sorted "f path sha256" and "l path target" lines of a staged web root (the byte-equivalence check).
#   cmake --preset x86_64-linux-gnu -DDEPLOY_TO_REPO=OFF && cmake --build --preset x86_64-linux-gnu --target webui-assets
#   ./staged-manifest.sh build/x86_64-linux-gnu/rootfs/www > before.txt   # change something, rebuild, then > after.txt; diff the two
cd "${1:?usage: staged-manifest.sh <staged www dir>}" || exit 1
{ find . -type f -exec sha256sum {} + | awk '{h=$1; $1=""; sub(/^ /,""); print "f " $0 " " h}'
  find . -type l -printf 'l %p %l\n'; } | LC_ALL=C sort
