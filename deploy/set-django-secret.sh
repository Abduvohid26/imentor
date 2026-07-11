#!/usr/bin/env sh
# deploy/.env.production ichiga DJANGO_SECRET_KEY yozadi (>=40 belgi).
# Ishlatish:
#   sh deploy/set-django-secret.sh
#   sh deploy/set-django-secret.sh 'sizning-tokeningiz'

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "Xato: $ENV_FILE yo‘q. deploy/.env.production.example dan nusxa oling." >&2
  exit 1
fi

NEW="${1:-}"
if [ -z "$NEW" ]; then
  if command -v python3 >/dev/null 2>&1; then
    NEW="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  else
    echo "Xato: python3 kerak yoki kalitni argument sifatida bering." >&2
    exit 1
  fi
fi

if [ "${#NEW}" -lt 40 ]; then
  echo "Xato: kalit kamida 40 belgidan iborat bo‘lishi kerak." >&2
  exit 1
fi

tmp="${ENV_FILE}.tmp.$$"
if grep -q '^DJANGO_SECRET_KEY=' "$ENV_FILE"; then
  sed "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=${NEW}|" "$ENV_FILE" >"$tmp"
else
  cat "$ENV_FILE" >"$tmp"
  printf '\nDJANGO_SECRET_KEY=%s\n' "$NEW" >>"$tmp"
fi
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo "OK: DJANGO_SECRET_KEY yangilandi ($ENV_FILE)."
echo "Keyin: cd $ROOT && sh deploy/server-pull.sh"
