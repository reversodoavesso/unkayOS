#!/bin/sh
set -eu
case "${UNKAYOS_BRANDING:-neutral}" in
  rda) branding=rda ;;
  *) branding=neutral ;;
esac
oidc_client="${UNKAYOS_OIDC_CLIENT_ID:-}"
oidc_project="${UNKAYOS_OIDC_PROJECT_ID:-}"
case "$oidc_client" in *[!a-zA-Z0-9_.@-]*) echo 'Invalid UnkayOS OIDC client ID' >&2; exit 1 ;; esac
case "$oidc_project" in *[!a-zA-Z0-9_-]*) echo 'Invalid UnkayOS OIDC project ID' >&2; exit 1 ;; esac
printf 'globalThis.__UNKAYOS_DEPLOYMENT__ = { branding: "%s", oidc: { clientId: "%s", projectId: "%s" } };\n' "$branding" "$oidc_client" "$oidc_project" > /usr/share/nginx/html/deployment.js
