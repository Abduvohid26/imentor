#!/usr/bin/env sh
# =============================================================================
# Serverda: git pull + Docker stack qayta yig‘ish / “restart”
# =============================================================================
#
# Kompyuteringizdan (SSH + deploy/.env.deploy.local): push + serverda pull:
#   python deploy/remote_deploy.py --push-then-server
#
# Odatiy oqim (kompyuteringizda):
#   git add … && git commit … && git push origin main
#
# Serverda (loyiha ildizi, masalan /opt/imentor):
#   cd /opt/imentor && sh deploy/server-pull.sh
#
# Boshqa branch:
#   cd /opt/imentor && GIT_REF=develop sh deploy/server-pull.sh
#
# Talab: git, docker, docker compose v2, deploy/.env.production
#
# Kalitni ham yangilab, pull + rebuild — bitta qator:
#   cd /opt/imentor && GAK='sk-...' sh deploy/imentor-one-liner.sh
#
# To‘liq qayta Docker build (keshni e’tiborsiz qoldirish — “eski frontend” bo‘lsa):
#   cd /opt/imentor && sh deploy/server-pull.sh --no-cache
#
# =============================================================================

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NO_CACHE=0
for _arg in "$@"; do
  if [ "$_arg" = "--no-cache" ]; then
    NO_CACHE=1
  fi
done

GIT_REF="${GIT_REF:-main}"
ENV_FILE="deploy/.env.production"

dc() {
  docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"
}

# Gateway health port (docker-compose.prod.yml)
HEALTH_PORT="${IMENTOR_HTTP_PORT:-31001}"
case "$HEALTH_PORT" in
  ''|*[!0-9]*) HEALTH_PORT=31001 ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "Xato: $ENV_FILE topilmadi. deploy/.env.production.example dan nusxa oling." >&2
  exit 1
fi

# Backend ImproperlyConfigured oldini olish
_sk="$(grep -E '^DJANGO_SECRET_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
_sk_len="$(printf '%s' "$_sk" | wc -c | tr -d ' ')"
case "$_sk" in
  ''|change-me*|CHANGE_ME*|changeme*|django-insecure*|please_replace*|replace_with*)
    echo "Xato: deploy/.env.production da haqiqiy DJANGO_SECRET_KEY yo‘q (hozir placeholder yoki bo‘sh)." >&2
    echo "  sh deploy/set-django-secret.sh" >&2
    echo "  yoki: nano deploy/.env.production" >&2
    exit 1
    ;;
esac
if [ "$_sk_len" -lt 40 ] 2>/dev/null; then
  echo "Xato: DJANGO_SECRET_KEY juda qisqa (${_sk_len} belgi, min 40). sh deploy/set-django-secret.sh" >&2
  exit 1
fi

git config --global --add safe.directory "$ROOT" 2>/dev/null || true
git fetch origin
git checkout "$GIT_REF" 2>/dev/null || git checkout -b "$GIT_REF"
git pull --ff-only origin "$GIT_REF"

echo "== Git HEAD (serverda deploy qilinadigan commit) =="
git log -1 --oneline

if [ "$NO_CACHE" = "1" ]; then
  echo "== Docker: build --no-cache (bir necha daqiqa) =="
  dc build --no-cache
fi

echo "== Docker: up -d --build =="
dc up -d --build
dc ps

if command -v curl >/dev/null 2>&1; then
  echo "== Backend health (127.0.0.1:${HEALTH_PORT}/api/health/) =="
  ok=0
  i=0
  while [ "$i" -lt 10 ]; do
    i=$((i + 1))
    if curl -sfS --max-time 12 "http://127.0.0.1:${HEALTH_PORT}/api/health/" >/dev/null; then
      echo "OK"
      ok=1
      break
    fi
    echo "  kutish ($i/10)..."
    sleep 4
  done
  if [ "$ok" != "1" ]; then
    echo "Xato: health javob bermadi. Log:" >&2
    dc logs backend --tail 40 2>&1 || true
    echo "Tekshiring: deploy/.env.production ichida DJANGO_SECRET_KEY (>=40 belgi) va 'docker compose ps'." >&2
    exit 1
  fi
else
  echo "Eslatma: curl yo‘q — health tekshiruvi o‘tkazib yuborildi." >&2
fi

echo "Tayyor: pull ($GIT_REF) + stack yangilandi."
