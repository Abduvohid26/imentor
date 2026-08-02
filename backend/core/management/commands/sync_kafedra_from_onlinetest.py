"""OnlineTest'dagi Kafedra ro'yxatini iMentor'ning AcademicDepartment (syllabus
katalogi kafedrasi) jadvaliga sinxronlaydi.

Nima uchun kerak: OnlineTest'da talaba/guruh ierarxiyasi uchun `Kafedra` bor,
iMentor'da esa fan/syllabus katalogi uchun mustaqil `AcademicDepartment` bor —
ikkalasi alohida ro'yxat edi. Bu buyruq OnlineTest'ni yagona manba (source of
truth) qilib, nomlarni (va kodlarni) moslashtiradi — endi syllabus yaratishda
tanlanadigan kafedra nomi bilan talaba/guruh tarafidagi kafedra nomi bir xil
bo'ladi.

Moslash qoidasi: `name` bo'yicha (katta-kichik harfga sezgir emas). OnlineTest
tomonida `code` bo'sh bo'lishi mumkin, lekin AcademicDepartment.code MAJBURIY
va unikal — shuning uchun kod bo'lmasa nomdan avtomatik generatsiya qilinadi
(so'zlarning bosh harflari, to'qnashsa raqam qo'shiladi).

  python manage.py sync_kafedra_from_onlinetest              # dry-run
  python manage.py sync_kafedra_from_onlinetest --apply       # haqiqatan yozadi
"""
from __future__ import annotations

import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import AcademicDepartment
from core.online_test_client import OnlineTestAuthError, fetch_academic_catalog


def slug_code_from_name(name: str, taken: set[str]) -> str:
    """'Bolalar va o'smir qizlar ginekologiyasi' -> 'BVOQG' (to'qnashsa +2, +3, ...)."""
    cleaned = re.sub(r"[^\w\s]", " ", name, flags=re.UNICODE)
    words = [w for w in cleaned.split() if w]
    initials = "".join(w[0] for w in words).upper()[:12] or "KAF"
    code = initials
    n = 2
    while code in taken:
        code = f"{initials}{n}"
        n += 1
    taken.add(code)
    return code


class Command(BaseCommand):
    help = "OnlineTest Kafedra ro'yxatini AcademicDepartment (syllabus kafedrasi) bilan sinxronlaydi."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Haqiqatan saqlash (default: dry-run)")

    def handle(self, *args, **opts):
        apply_changes = bool(opts["apply"])

        try:
            catalog = fetch_academic_catalog(use_cache=False)
        except OnlineTestAuthError as exc:
            raise CommandError(f"OnlineTest'dan katalog olinmadi: {exc.message}")

        kafedralar = catalog.get("kafedralar") or []
        if not kafedralar:
            self.stdout.write(self.style.WARNING("OnlineTest'da kafedra topilmadi — hech narsa qilinmadi."))
            return

        existing_codes = set(AcademicDepartment.objects.values_list("code", flat=True))
        existing_by_name = {
            d.name.strip().lower(): d for d in AcademicDepartment.objects.all()
        }

        created = 0
        updated = 0
        unchanged = 0

        with transaction.atomic():
            for row in kafedralar:
                name = str(row.get("name") or "").strip()
                if not name:
                    continue
                ot_code = str(row.get("code") or "").strip().upper() or None

                existing = existing_by_name.get(name.lower())
                if existing:
                    if ot_code and existing.code != ot_code and ot_code not in existing_codes:
                        self.stdout.write(f"  [YANGILASH] {name}: kod {existing.code!r} -> {ot_code!r}")
                        updated += 1
                        if apply_changes:
                            existing_codes.discard(existing.code)
                            existing.code = ot_code
                            existing_codes.add(ot_code)
                            existing.save(update_fields=["code"])
                    else:
                        unchanged += 1
                    continue

                code = ot_code if (ot_code and ot_code not in existing_codes) else slug_code_from_name(name, existing_codes)
                if ot_code and ot_code in existing_codes and code != ot_code:
                    self.stdout.write(
                        self.style.WARNING(f"  [OGOHLANTIRISH] {name}: kod {ot_code!r} band, avtomatik {code!r} berildi")
                    )
                existing_codes.add(code)
                self.stdout.write(f"  [YANGI] {name} (kod: {code})")
                created += 1
                if apply_changes:
                    AcademicDepartment.objects.create(name=name, code=code)

            if not apply_changes:
                transaction.set_rollback(True)

        self.stdout.write("")
        self.stdout.write(
            f"NATIJA: yangi={created}  yangilandi={updated}  o'zgarishsiz={unchanged}  "
            f"jami_OnlineTest_kafedra={len(kafedralar)}  APPLY={apply_changes}"
        )
        if not apply_changes:
            self.stdout.write(self.style.WARNING("Bu DRY-RUN — saqlash uchun --apply qo'shing"))
