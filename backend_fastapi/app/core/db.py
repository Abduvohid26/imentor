from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# Pool o'lchami HAR BIR gunicorn worker uchun alohida hisoblanadi, shuning
# uchun jami ulanish = workers × (pool_size + max_overflow) bo'ladi va u
# Postgres `max_connections` (100) dan past qolishi SHART:
#
#     4 worker × (8 + 12) = 80  <  100   (admin/psql uchun zaxira qoladi)
#
# AI so'rovlari endi ulanishni ushlab turmaydi (education_ai.py da
# `_release_db`), shuning uchun bu zaxira yetarli. Worker sonini
# oshirsangiz, shu yerdagi qiymatlarni ham qayta hisoblang.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=int(os.environ.get("DB_POOL_SIZE", "8")),
    max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "12")),
    # Uzoq turgan ulanish (NAT/pgbouncer timeout) jimgina uzilib qolmasin
    pool_recycle=1800,
    # 30s kutish o'rniga tezroq xato — foydalanuvchi 30 soniya osilib
    # qolgandan ko'ra darhol "qayta urinib ko'ring" ni ko'rgani yaxshi.
    pool_timeout=15,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
