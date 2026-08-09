FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# LibreOffice — PPTX preview (bepul headless PDF konvertatsiya).
# python3-uno + unoserver: LibreOffice'ni har so'rovda noldan ochish o'rniga
# BITTA doimiy jarayon sifatida yuritamiz — tezroq va xotira barqaror
# (bir vaqtda ko'p konvert bo'lsa ham yangi soffice jarayonlari ko'paymaydi).
# Diqqat: uno bindinglari Debian'ning system python3'iga bog'langan, ilova esa
# python3.12 da ishlaydi — shuning uchun demon system python bilan yuritiladi,
# ilova esa `unoconvert` CLI orqali murojaat qiladi.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libreoffice-impress-nogui \
    fonts-dejavu-core \
    fonts-liberation \
    python3-uno \
    python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && /usr/bin/python3 -m pip install --no-cache-dir --break-system-packages unoserver

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

COPY . /app

RUN chmod +x /app/entrypoint.sh /app/migrate-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["sh", "/app/entrypoint.sh"]
