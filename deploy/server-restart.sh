#!/usr/bin/env sh
# Serverda: git yo‘q — faqat Docker stackni qayta tiklash.
# Misol: .env o‘zgardi yoki konteyner “osilib” qoldi.
#
#   cd /opt/imentor && sh deploy/server-restart.sh
#   cd /opt/imentor && sh deploy/server-restart.sh --build
#
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="deploy/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  echo "Xato: $ENV_FILE topilmadi." >&2
  exit 1
fi

dc() {
  docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"
}

if [ "${1:-}" = "--build" ]; then
  echo "== Docker: up -d --build =="
  dc up -d --build
else
  echo "== Docker: up -d (image qayta yig‘ilmaydi) =="
  dc up -d
fi
dc ps
echo "Tayyor."
