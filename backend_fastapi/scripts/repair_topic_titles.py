"""Bazadagi harf-harf ajralib ketgan mavzu sarlavhalarini tiklaydi.

Bir martalik skript. Yangi yuklanadigan sillabuslar frontend'da tuzatiladi
(`undoLetterTracking`), bu skript esa allaqachon saqlangan yozuvlar uchun.

Ishga tushirish (prod):

    docker compose -f docker-compose.prod.yml --env-file deploy/.env.production \\
      run --rm backend_fastapi python scripts/repair_topic_titles.py --dry-run
    ... natijani ko'rib chiqib ...
    docker compose -f docker-compose.prod.yml --env-file deploy/.env.production \\
      run --rm backend_fastapi python scripts/repair_topic_titles.py --apply

Sarlavha o'zgarganda shu sillabusning `topics_i18n` tarjimalari ham
tozalanadi — ular buzuq matndan qilingan va kalitlari endi mos kelmaydi.
Tarjimalar keyingi murojaatda avtomatik qayta hosil bo'ladi.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import SessionLocal  # noqa: E402
from app.models.content import CourseSyllabus  # noqa: E402
from app.services import topic_text_repair as repair  # noqa: E402


def _iter_topic_lists(syllabus: CourseSyllabus):
    """Sarlavhalar saqlanadigan barcha joylar: `variants[].topics` va `topics`."""
    if isinstance(syllabus.variants, list):
        for variant in syllabus.variants:
            if isinstance(variant, dict) and isinstance(variant.get("topics"), list):
                yield variant["topics"]
    if isinstance(syllabus.topics, list):
        yield syllabus.topics


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="faqat ko'rsatadi, yozmaydi")
    group.add_argument("--apply", action="store_true", help="bazaga yozadi")
    parser.add_argument("--limit", type=int, default=0, help="nechta sillabus (0 = hammasi)")
    parser.add_argument(
        "--ai",
        action="store_true",
        help=(
            "yopishib qolgan so'zlarni AI bilan ajratishga urinish. "
            "TAVSIYA ETILMAYDI: natija ishonchsiz, sillabusni qayta yuklash yaxshiroq."
        ),
    )
    args = parser.parse_args()

    settings = get_settings()
    # Standart holatda faqat DETERMINISTIK tiklash: ajralgan harflarni
    # yopishtirish. Bu xavfsiz va natijasi oldindan aniq.
    #
    # So'zlar bir-biriga yopishib qolgan holat (PDF'da so'z chegarasi
    # saqlanmagan) uchun to'g'ri yechim — sillabusni admin panelidan QAYTA
    # YUKLASH: yangi parser PDF'dagi keng tanaffuslardan so'z chegarasini
    # to'g'ri tiklaydi. AI bilan taxmin qilish esa ba'zan matnni buzadi,
    # shuning uchun u faqat `--ai` bilan ixtiyoriy ravishda yoqiladi.
    api_key = settings.openai_api_key.strip() if args.ai else ""
    model = settings.openai_fast_model
    if args.ai and not api_key:
        print("DIQQAT: OPENAI_API_KEY yo'q — faqat deterministik tiklash qo'llanadi.")

    db = SessionLocal()
    total_syl = total_fixed = 0
    needs_reupload: list[tuple[int, str, int]] = []
    try:
        rows = db.execute(select(CourseSyllabus).order_by(CourseSyllabus.id)).scalars().all()
        for syllabus in rows:
            if args.limit and total_syl >= args.limit:
                break

            # Faqat aniq "harf-harf ajralgan" sarlavhalar tuzatiladi.
            #
            # Filtrsiz ishlatib ko'rilganda ma'lum bo'ldiki, qolgan buzuq
            # yozuvlarning aksariyati harf ajralishi emas — matn qatlami
            # butunlay buzilgan PDF'lar ("N J4 -v ? qt .iO lcg q L & t i;").
            # Ularni "tuzatish" mumkin emas; yagona yechim — manba PDF'ni
            # almashtirib qayta yuklash. Shuning uchun filtr saqlanadi.
            damaged = {
                str(t.get("title") or "")
                for topics in _iter_topic_lists(syllabus)
                for t in topics
                if isinstance(t, dict) and repair.looks_letter_tracked(str(t.get("title") or ""))
            }
            damaged.discard("")
            if not damaged:
                continue

            total_syl += 1
            mapping = repair.repair_titles(api_key, model, sorted(damaged))
            if not mapping:
                print(f"[{syllabus.id}] {syllabus.subject_name}: {len(damaged)} buzuq, tiklanmadi")
                continue

            changed = 0
            for topics in _iter_topic_lists(syllabus):
                for t in topics:
                    if not isinstance(t, dict):
                        continue
                    old = str(t.get("title") or "")
                    new = mapping.get(old)
                    if new and new != old:
                        t["title"] = new
                        changed += 1

            total_fixed += changed
            # So'zlar yopishib qolgan sarlavhalar — bu fanlarni admin
            # panelidan qayta yuklash kerak (yangi parser to'g'ri ajratadi).
            still_merged = sum(
                1
                for topics in _iter_topic_lists(syllabus)
                for t in topics
                if isinstance(t, dict)
                and any(len(w) > 24 for w in str(t.get("title") or "").split())
            )
            if still_merged:
                needs_reupload.append((syllabus.id, syllabus.subject_name, still_merged))

            print(f"\n[{syllabus.id}] {syllabus.subject_name}: {changed} ta sarlavha tuzatildi")
            for old, new in list(mapping.items())[:3]:
                print(f"    - {old[:80]}")
                print(f"    + {new[:80]}")

            if args.apply and changed:
                flag_modified(syllabus, "topics")
                flag_modified(syllabus, "variants")
                # Buzuq matndan qilingan tarjimalar endi yaroqsiz.
                syllabus.topics_i18n = {}
                flag_modified(syllabus, "topics_i18n")

        if args.apply:
            db.commit()
            print(f"\nYOZILDI: {total_syl} ta fanda {total_fixed} ta sarlavha tuzatildi.")
        else:
            db.rollback()
            print(f"\nDRY-RUN: {total_syl} ta fanda {total_fixed} ta sarlavha tuzatilardi.")

        if needs_reupload:
            print(
                f"\nQAYTA YUKLASH KERAK ({len(needs_reupload)} ta fan) — bu PDF'larda so'z\n"
                "chegarasi saqlanmagan, admin panelidan qayta yuklansa yangi parser\n"
                "ularni to'g'ri ajratadi:"
            )
            for sid, name, cnt in sorted(needs_reupload, key=lambda x: -x[2]):
                print(f"   id={sid:>4}  {cnt:>3} ta mavzu   {name[:60]}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
