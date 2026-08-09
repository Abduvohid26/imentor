"""`core_coursesyllabus.instruction_language` ustunini to'g'rilaydi.

Katalogdagi barcha yozuvlarda bu ustun `uz` bo'lib qolgan (ular ustun
qo'shilishidan oldin import qilingan). Natijada ruscha va inglizcha
sillabuslar interfeysda "UZ" belgisi bilan ko'rsatiladi va tarjima
mexanizmi ularni noto'g'ri manba til deb hisoblaydi: `syllabus_i18n`
manba til = interfeys tili bo'lsa tarjimani o'tkazib yuboradi, ya'ni
ruscha fan nomi o'zbek interfeysida tarjimasiz qoladi.

Til fan nomi va mavzu sarlavhalaridagi alifbo/kalit so'zlar bo'yicha
aniqlanadi.

    docker compose -f docker-compose.prod.yml --env-file deploy/.env.production \\
      run --rm backend_fastapi python scripts/backfill_instruction_language.py --dry-run
    docker compose -f docker-compose.prod.yml --env-file deploy/.env.production \\
      run --rm backend_fastapi python scripts/backfill_instruction_language.py --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models.content import CourseSyllabus  # noqa: E402

CYRILLIC = re.compile(r"[Ѐ-ӿ]")
LATIN = re.compile(r"[A-Za-z]")

# Faqat inglizchada uchraydigan, o'zbekchada bo'lmagan belgilar.
EN_WORDS = {
    "the", "of", "and", "for", "with", "nursing", "disease", "diseases",
    "human", "anatomy", "physiology", "histology", "cytology", "embriology",
    "embryology", "pathological", "psychology", "work", "introduction",
    "system", "clinical", "medical", "practice", "therapeutic", "surgery",
}
# O'zbekcha markerlar (lotin yozuvi, lekin ingliz emas).
UZ_WORDS = {
    "va", "bilan", "asoslari", "kasalliklari", "ishi", "mavzu", "fanidan",
    "tibbiy", "tibbiyot", "o'quv", "amaliy", "ma'ruza", "sog'liqni",
    "usullari", "tizimi", "haqida", "uchun", "hamshiralik", "boshqaruv",
}


def _sample_text(syllabus: CourseSyllabus) -> str:
    parts = [syllabus.subject_name or ""]
    seen = 0
    variants = syllabus.variants if isinstance(syllabus.variants, list) else []
    for variant in variants:
        if not isinstance(variant, dict):
            continue
        for topic in variant.get("topics") or []:
            if isinstance(topic, dict):
                parts.append(str(topic.get("title") or ""))
                seen += 1
                if seen >= 60:
                    return "\n".join(parts)
    for topic in syllabus.topics if isinstance(syllabus.topics, list) else []:
        if isinstance(topic, dict):
            parts.append(str(topic.get("title") or ""))
    return "\n".join(parts)


def detect_language(text: str) -> str:
    cyr = len(CYRILLIC.findall(text))
    lat = len(LATIN.findall(text))
    # Ruscha sillabuslarda lotin harflari ham uchraydi (atamalar, kodlar),
    # shuning uchun mutlaq ustunlik emas, sezilarli ulush yetarli.
    if cyr > 0 and cyr >= lat * 0.6:
        return "ru"

    words = Counter(re.findall(r"[A-Za-z'’]+", text.lower()))
    en_score = sum(words[w] for w in EN_WORDS)
    uz_score = sum(words[w] for w in UZ_WORDS)
    # O'zbekcha apostroflar (o', g') — kuchli o'zbek belgisi.
    uz_score += 2 * len(re.findall(r"[og]['’]", text.lower()))

    if en_score > uz_score:
        return "en"
    return "uz"


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    changed = 0
    try:
        rows = db.execute(select(CourseSyllabus).order_by(CourseSyllabus.id)).scalars().all()
        for syllabus in rows:
            detected = detect_language(_sample_text(syllabus))
            current = (syllabus.instruction_language or "uz").strip().lower()
            if detected == current:
                continue
            changed += 1
            print(f"  id={syllabus.id:>4}  {current} -> {detected}   {syllabus.subject_name[:60]}")
            if args.apply:
                syllabus.instruction_language = detected
                # Manba til o'zgardi — eski tarjimalar noto'g'ri yo'nalishda
                # qilingan, ular qayta hosil qilinsin.
                syllabus.name_i18n = {}
                syllabus.topics_i18n = {}

        if args.apply:
            db.commit()
            print(f"\nYOZILDI: {changed} ta fanning o'qitish tili to'g'rilandi.")
        else:
            db.rollback()
            print(f"\nDRY-RUN: {changed} ta fan o'zgarardi ({len(rows)} tadan).")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
