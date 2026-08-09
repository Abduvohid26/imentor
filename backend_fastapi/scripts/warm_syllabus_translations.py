"""Sillabus tarjimalarini OLDINDAN tayyorlab qo'yadi (kesh isitish).

Tarjima o'zi avtomatik ishlaydi: o'qituvchi interfeys tilini almashtirsa,
frontend `POST /api/v1/course-syllabuses/{id}/translate/` ni chaqiradi va
yetishmayotgan tarjimalar o'sha zahoti yaratiladi. Ya'ni ishlashi uchun
HECH QANDAY skript shart emas.

Muammo faqat KUTISHDA: kesh bo'sh sillabus birinchi marta ochilganda
o'qituvchi 30-60 soniya "Nomlar tarjima qilinmoqda..." yozuvini kutadi, va
dars boshida bir necha o'qituvchi bir vaqtda shunday qilsa — bir talay
sekin AI so'rovi bir zumda yig'iladi.

Shu skript o'sha ishni oldindan, tinch vaqtda bajaradi. Undan keyin
o'qituvchilar uchun til almashish bir zumda ishlaydi.

    docker compose -f docker-compose.prod.yml --env-file deploy/.env.production \\
      run --rm backend_fastapi python scripts/warm_syllabus_translations.py

Idempotent: mavjud tarjimalarga tegmaydi, faqat yetishmayotganini to'ldiradi.
Uzilib qolsa qaytadan ishga tushiravering — qolgan joyidan davom etadi.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import SessionLocal  # noqa: E402
from app.models.content import CourseSyllabus  # noqa: E402
from app.services.syllabus_i18n import SUPPORTED_LANGS, ensure_syllabus_translations  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="nechta sillabus (0 = hammasi)")
    parser.add_argument("--ids", default="", help="faqat shu id'lar, vergul bilan: 175,176")
    parser.add_argument(
        "--lang",
        default="",
        help=f"faqat bitta til ({'/'.join(SUPPORTED_LANGS)}); bo'sh = hammasi",
    )
    args = parser.parse_args()

    if not get_settings().openai_api_key.strip():
        print("XATO: OPENAI_API_KEY sozlanmagan — tarjima qilib bo'lmaydi.")
        return 1

    wanted = (args.lang or "").strip().lower()
    langs = (wanted,) if wanted in SUPPORTED_LANGS else SUPPORTED_LANGS

    only_ids: set[int] = set()
    if args.ids.strip():
        only_ids = {int(x) for x in args.ids.split(",") if x.strip().isdigit()}

    db = SessionLocal()
    started = time.time()
    done = translated = failed = 0
    try:
        rows = (
            db.execute(
                select(CourseSyllabus)
                .where(CourseSyllabus.is_active.is_(True))
                .order_by(CourseSyllabus.id)
            )
            .scalars()
            .all()
        )
        if only_ids:
            rows = [r for r in rows if r.id in only_ids]
        total = len(rows) if not args.limit else min(args.limit, len(rows))
        print(f"{total} ta sillabus, tillar: {', '.join(langs)}\n")

        for syllabus in rows:
            if args.limit and done >= args.limit:
                break
            done += 1
            label = f"[{done}/{total}] id={syllabus.id} {syllabus.subject_name[:45]}"
            try:
                t0 = time.time()
                changed = ensure_syllabus_translations(db, syllabus, langs)
                took = time.time() - t0
                if changed:
                    translated += 1
                    print(f"{label} — tarjima qilindi ({took:.0f}s)")
                else:
                    print(f"{label} — allaqachon tayyor")
            except Exception as exc:  # noqa: BLE001 — bittasi yiqilsa ham davom etsin
                failed += 1
                db.rollback()
                print(f"{label} — XATO: {str(exc)[:90]}")

        mins = (time.time() - started) / 60
        print(
            f"\nTayyor: {done} ta ko'rildi, {translated} tasi tarjima qilindi, "
            f"{failed} ta xato. Jami {mins:.1f} daqiqa."
        )
        if failed:
            print("Xatolar bo'lsa skriptni qayta ishga tushiring — qolganini to'ldiradi.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
