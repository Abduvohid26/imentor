#!/usr/bin/env sh
# Birinchi marta yangi serverda: Docker, nginx, git, repo klon, .env.production, SSL.
# Ishlatish (serverda root sifatida):
#   OPENAI_API_KEY='sk-...' sh deploy/server-bootstrap.sh
#
# Yoki lokal mashinadan:
#   python deploy/remote_deploy.py --bootstrap

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== System packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl nginx certbot python3-certbot-nginx docker.io docker-compose-v2 2>/dev/null \
  || apt-get install -y -qq git curl nginx certbot python3-certbot-nginx docker.io 2>/dev/null \
  || true

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker o'rnatilmoqda (get.docker.com)..."
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker 2>/dev/null || true
systemctl enable --now nginx 2>/dev/null || true

echo "== Docker compose =="
if ! docker compose version >/dev/null 2>&1; then
  echo "Xato: docker compose v2 topilmadi." >&2
  exit 1
fi

echo "== Repo =="
REMOTE_PATH="${REMOTE_REPO_PATH:-/opt/imentor}"
GIT_URL="${GIT_REPO_URL:-https://github.com/aiziyrak-coder/imentor.git}"
GIT_REF="${GIT_REF:-main}"

if [ ! -d "$REMOTE_PATH/.git" ]; then
  mkdir -p "$(dirname "$REMOTE_PATH")"
  git clone "$GIT_URL" "$REMOTE_PATH"
fi
cd "$REMOTE_PATH"
git config --global --add safe.directory "$REMOTE_PATH" 2>/dev/null || true
git fetch origin
git checkout "$GIT_REF" 2>/dev/null || git checkout -b "$GIT_REF"
git pull --ff-only origin "$GIT_REF" 2>/dev/null || true

echo "== deploy/.env.production =="
ENV_FILE="deploy/.env.production"
if [ ! -f "$ENV_FILE" ]; then
  cp deploy/.env.production.example "$ENV_FILE"
  sh deploy/set-django-secret.sh
fi

AI_KEY="${OPENAI_API_KEY:-${DEEPSEEK_API_KEY:-}}"
if [ -n "$AI_KEY" ]; then
  if grep -q '^OPENAI_API_KEY=' "$ENV_FILE"; then
    sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${AI_KEY}|" "$ENV_FILE"
  else
    printf '\nOPENAI_API_KEY=%s\n' "$AI_KEY" >> "$ENV_FILE"
  fi
fi

chmod 600 "$ENV_FILE" 2>/dev/null || true

echo "== nginx (HTTP) =="
cp deploy/nginx/imentor.conf.example /etc/nginx/sites-available/imentor
ln -sf /etc/nginx/sites-available/imentor /etc/nginx/sites-enabled/imentor
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t
systemctl reload nginx

echo "== Docker stack =="
sh deploy/server-pull.sh

echo "== SSL (certbot) =="
if [ ! -d /etc/letsencrypt/live/imentor.uz ]; then
  certbot --nginx -d imentor.uz -d www.imentor.uz -d api.imentor.uz \
    --non-interactive --agree-tos --email admin@imentor.uz --redirect 2>/dev/null \
    || echo "Eslatma: certbot muvaffaqiyatsiz — DNS A yozuvlari 164.90.186.193 ga yo'naltirilganligini tekshiring."
else
  cp deploy/nginx/imentor-ssl.conf.example /etc/nginx/sites-available/imentor
  ln -sf /etc/nginx/sites-available/imentor /etc/nginx/sites-enabled/imentor
  nginx -t && systemctl reload nginx
fi

echo "== Tayyor =="
curl -sfS --max-time 10 "http://127.0.0.1:${IMENTOR_HTTP_PORT:-31001}/api/health/" && echo " Gateway OK" || echo " Gateway kutish kerak"
echo "imentor.uz va api.imentor.uz DNS → 164.90.186.193"
