#!/bin/sh
set -eu
case "${UNKAYOS_BRANDING:-neutral}" in
  rda) branding=rda ;;
  *) branding=neutral ;;
esac
printf 'globalThis.__UNKAYOS_DEPLOYMENT__ = { branding: "%s" };\n' "$branding" > /usr/share/nginx/html/deployment.js
