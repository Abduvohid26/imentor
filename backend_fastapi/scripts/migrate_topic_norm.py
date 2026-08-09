"""Eski `topic_norm` kalitlarini tuzilmali kalitga ko'chiradi.

Muammo: `core_preparedcontent.topic_norm` ba'zi yozuvlarda MAVZU SARLAVHASI
edi. Mavzu nomlari interfeys tiliga tarjima qilinganda bunday yozuvlar
topilmay qolardi (o'qituvchi uchun "materialim yo'qoldi" degani).

Yechim: kalit sarlavhaga emas, barqaror uchlikka bog'lanadi —
    {syllabus_id}::{variant_label}::{topic_code}
(frontend'dagi `topicNormForStorage` bilan bir xil format: kichik harf,
variant 48, kod 16 belgigacha, variant bo'sh bo'lsa "asosiy").

Ishlash tartibi:
  * `--dry-run` (sukut bo'yicha) — hech nima o'zgartirmaydi, faqat hisobot;
  * `--apply` — o'zgartiradi, lekin AVVAL zaxira jadval yaratadi:
    `core_preparedcontent_topicnorm_backup`.

Kerakli ustunlari (syllabus_id / variant_label / topic_code) bo'sh bo'lgan
yozuvlar TEGILMAYDI — ular sarlavha bo'yicha sillabus mavzularidan qidirilib,
faqat YAGONA aniq moslik topilgandagina ko'chiriladi.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select, text

from app.core.db import SessionLocal
from app.models.content import CourseSyllabus
from app.models.prepared_content import PreparedContent

BACKUP_TABLE = "core_preparedcontent_topicnorm_backup"


def _seg(value: str, max_len: int) -> str:
    return (value or "").strip().lower()[:max_len]


def structured_key(syllabus_id: int, variant_label: str, topic_code: str) -> str | None:
    code = _seg((topic_code or "").replace(" ", ""), 16)
    if not syllabus_id or not code:
        return None
    variant = _seg(variant_label, 48) or "asosiy"
    return f"{syllabus_id}::{variant}::{code}"


def _title_lookup(db) -> dict[str, tuple[int, str, str]]:
    """sarlavha(kichik harf) -> (syllabus_id, variant_label, topic_code).

    Bir xil sarlavha bir nechta joyda uchrasa — noaniq, ishlatilmaydi.
    """
    found: dict[str, list[tuple[int, str, str]]] = {}
    for syl in db.execute(select(CourseSyllabus)).scalars():
        # Mavzular `variants[].topics[]` ichida yotadi, variant nomi esa
        # ota-elementda ("label"). Yuqori darajadagi `topics` — eski format.
        buckets: list[tuple[str, list]] = []
        variants = syl.variants if isinstance(syl.variants, list) else []
        for v in variants:
            if isinstance(v, dict) and isinstance(v.get("topics"), list):
                buckets.append((str(v.get("label") or ""), v["topics"]))
        # Yuqori darajadagi `topics` — eski, tekislangan nusxa. U variantlar
        # bilan ziddiyat tug'dirmasligi uchun FAQAT variantlar bo'lmaganda
        # ishlatiladi (aks holda bir sarlavha ikki xil kalit berardi).
        if not buckets and isinstance(syl.topics, list) and syl.topics:
            buckets.append(("", syl.topics))

        for variant_label, topics in buckets:
            for t in topics:
                if not isinstance(t, dict):
                    continue
                title = str(t.get("title") or "").strip().lower()
                code = str(t.get("id") or t.get("code") or "").strip()
                if not title or not code:
                    continue
                found.setdefault(title, []).append((int(syl.id), variant_label, code))

    # Bir xil sarlavha bir nechta variantda uchrasa ham, natija BIR XIL kalit
    # bersa (masalan faqat bitta variant bor) — ishlatsa bo'ladi.
    uniq: dict[str, tuple[int, str, str]] = {}
    for title, hits in found.items():
        keys = {structured_key(h[0], h[1], h[2]) for h in hits}
        if len(keys) == 1 and None not in keys:
            uniq[title] = hits[0]
    return uniq


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="haqiqatda o'zgartirish")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = (
            db.execute(select(PreparedContent).where(~PreparedContent.topic_norm.like("%::%")))
            .scalars()
            .all()
        )
        if not rows:
            print("Ko'chiriladigan yozuv yo'q — hammasi tuzilmali kalitda.")
            return 0

        by_title = _title_lookup(db)
        planned: list[tuple[PreparedContent, str, str]] = []
        skipped: list[tuple[PreparedContent, str]] = []

        for r in rows:
            key = structured_key(r.syllabus_id or 0, r.variant_label or "", r.topic_code or "")
            if key:
                planned.append((r, key, "ustunlardan"))
                continue
            guess = by_title.get((r.topic or "").strip().lower())
            if guess:
                key = structured_key(*guess)
                if key:
                    planned.append((r, key, "sarlavha bo'yicha topildi"))
                    continue
            skipped.append((r, "syllabus_id/variant/kod yo'q va sarlavha bo'yicha aniq moslik topilmadi"))

        print(f"Jami eski kalitli yozuv: {len(rows)}")
        print(f"  ko'chiriladi : {len(planned)}")
        print(f"  tegilmaydi   : {len(skipped)}\n")
        for r, key, why in planned:
            print(f"  [{r.kind:12}] id={r.id:<4} {r.topic_norm[:38]:38} -> {key}   ({why})")
        for r, why in skipped:
            print(f"  [SKIP {r.kind:8}] id={r.id:<4} {r.topic_norm[:38]:38}   ({why})")

        if not args.apply:
            print("\n(dry-run — hech nima o'zgartirilmadi. Qo'llash uchun: --apply)")
            return 0

        db.execute(text(f"DROP TABLE IF EXISTS {BACKUP_TABLE}"))
        db.execute(
            text(
                f"CREATE TABLE {BACKUP_TABLE} AS "
                "SELECT id, kind, topic, topic_norm FROM core_preparedcontent"
            )
        )
        for r, key, _ in planned:
            r.topic_norm = key[:255]
        db.commit()
        print(f"\nBajarildi. Zaxira jadval: {BACKUP_TABLE}")
        print(f"Qaytarish: UPDATE core_preparedcontent p SET topic_norm=b.topic_norm "
              f"FROM {BACKUP_TABLE} b WHERE b.id=p.id;")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
