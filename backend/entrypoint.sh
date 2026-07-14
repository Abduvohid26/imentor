#!/usr/bin/env sh
set -e

MEDIA_DIR="${DJANGO_MEDIA_ROOT:-/app/media}"
mkdir -p "$MEDIA_DIR"

# docker compose run backend python manage.py ... — bir martalik buyruqlar
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi
python manage.py compilemessages || true
python manage.py collectstatic --noinput
python manage.py ensure_phone_superuser || true
python manage.py ensure_demo_role_users || true

WORKERS="${GUNICORN_WORKERS:-3}"
THREADS="${GUNICORN_THREADS:-4}"
TIMEOUT="${GUNICORN_TIMEOUT:-300}"

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --worker-class gthread \
  --workers "$WORKERS" \
  --threads "$THREADS" \
  --timeout "$TIMEOUT" \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --graceful-timeout 30
