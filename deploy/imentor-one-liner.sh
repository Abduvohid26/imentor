#!/usr/bin/env sh
# Serverda (Linux): kalitni yangilab, git pull va Docker qayta build.
#
# Agar "cannot open deploy/imentor-one-liner.sh" chiqsa — skript hali serverda yo‘q:
#   cd /opt/imentor && git fetch origin && git checkout main && git pull --ff-only origin main
# keyin yana shu faylni ishga tushiring.
#
# Bitta qator (loyiha yo‘lini moslang, masalan /opt/imentor):
#   cd /opt/imentor && GAK='sk-...' sh deploy/imentor-one-liner.sh
#
# Boshqa branch:
#   cd /opt/imentor && GIT_REF=develop GAK='...' sh deploy/imentor-one-liner.sh
#
# Eslatma: GAK shell tarixida qolishi mumkin — ish tugagach yangi kalit oling yoki history tozalang.

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${GAK:-}" ]; then
  echo "Xato: GAK o‘rnatilmagan. Misol: cd /opt/imentor && GAK='sk-...' sh deploy/imentor-one-liner.sh" >&2
  exit 1
fi

ENV_FILE="deploy/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  echo "Xato: $ENV_FILE topilmadi. Avval deploy/.env.production.example dan nusxa oling." >&2
  exit 1
fi

if grep -q '^OPENAI_API_KEY=' "$ENV_FILE" 2>/dev/null; then
  sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${GAK}|" "$ENV_FILE"
elif grep -q '^DEEPSEEK_API_KEY=' "$ENV_FILE" 2>/dev/null; then
  sed -i.bak "s|^DEEPSEEK_API_KEY=.*|OPENAI_API_KEY=${GAK}|" "$ENV_FILE"
else
  printf '\nOPENAI_API_KEY=%s\n' "$GAK" >> "$ENV_FILE"
fi

git config --global --add safe.directory "$ROOT" 2>/dev/null || true
GIT_REF="${GIT_REF:-main}"
git fetch origin
git checkout "$GIT_REF" 2>/dev/null || git checkout -b "$GIT_REF"
git pull --ff-only origin "$GIT_REF"

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up --scale backend=2 -d --build
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps

echo "Tayyor. OPENAI_API_KEY yangilandi va stack qayta yig‘ildi."
