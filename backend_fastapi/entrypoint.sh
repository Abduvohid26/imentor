#!/usr/bin/env sh
set -e

MEDIA_DIR="${DJANGO_MEDIA_ROOT:-/app/media}"
mkdir -p "$MEDIA_DIR"

# docker compose run backend_fastapi alembic ... — bir martalik buyruqlar
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  alembic upgrade head
fi

# unoserver — doimiy LibreOffice demoni (PPTX/PPT/ODP → PDF).
# Fon rejimida ishga tushiriladi; ishga tushmasa ilova eski `soffice --convert-to`
# usuliga avtomatik qaytadi, shuning uchun bu yerda xatolik butun konteynerni
# yiqitmasligi kerak.
if [ "${UNOSERVER_ENABLED:-1}" = "1" ]; then
  UNOSERVER_PORT="${UNOSERVER_PORT:-2003}"
  export HOME="${HOME:-/tmp}"
  mkdir -p /tmp/unoserver-home
  HOME=/tmp/unoserver-home \
    /usr/bin/python3 -m unoserver.server \
      --port "$UNOSERVER_PORT" \
      --interface 127.0.0.1 \
      >/tmp/unoserver.log 2>&1 &
  echo "unoserver ishga tushirildi (port $UNOSERVER_PORT, log: /tmp/unoserver.log)"
fi

WORKERS="${GUNICORN_WORKERS:-3}"
TIMEOUT="${GUNICORN_TIMEOUT:-300}"

exec gunicorn app.main:app \
  --bind 0.0.0.0:8000 \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "$WORKERS" \
  --timeout "$TIMEOUT" \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --graceful-timeout 30
