"""manba/ PDF fayl nomlaridan fan va yo'nalish ajratish."""

from __future__ import annotations

import re

from django.utils.text import slugify

VARIANT_ALIASES = {
    "СТОМ": "STOM",
    "STOM": "STOM",
    "S": "STOM",
    "C": "STOM",
    "С": "STOM",
    "ПИ": "PI",
    "PI": "PI",
    "П": "PI",
    "ТПИ": "TPI",
    "TPI": "TPI",
    "DI": "DI",
    "OHI": "OHI",
    "BM": "BM",
    "FT": "FT",
    "XT": "XT",
    "TBI": "TBI",
    "FARMATSIYA": "FARMATSIYA",
    "FARM": "FARMATSIYA",
    "ФАРМАЦИЯ": "FARMATSIYA",
    "FARMATSIYA": "FARMATSIYA",
    "PED": "PED",
    "ПЕД": "PED",
    "PEDIATRIYA ISHI": "PI",
    "THERAPEUTIC WORK": "TPI",
    "LECH": "DI",
    "ПЕДИАТРИЯ": "PED",
}


def slug_code(name: str, *, max_len: int = 64) -> str:
    return (slugify(name, allow_unicode=False) or "item")[:max_len]


def normalize_variant_label(raw: str) -> str:
    cleaned = (raw or "").strip()
    if not cleaned:
        return "Asosiy"
    upper = cleaned.upper()
    if upper in VARIANT_ALIASES:
        return VARIANT_ALIASES[upper][:32]
    if len(upper) <= 16 and upper.isascii():
        return upper[:32]
    return cleaned[:32]


def parse_variant_label(file_name: str) -> str:
    base = re.sub(r"\.pdf$", "", file_name, flags=re.I).strip()
    paren = re.search(r"\(([^)]+)\)\s*$", base)
    if paren and paren.group(1).strip():
        return normalize_variant_label(paren.group(1))
    suffix = re.search(r"[-–_\s]+([A-Za-zА-Яа-яЁё]{2,16})\s*$", base)
    if suffix and re.match(r"^[A-ZА-ЯЁ]{2,8}$", suffix.group(1).strip(), re.I):
        return normalize_variant_label(suffix.group(1))
    if len(base) > 48:
        return "Asosiy"
    return base[:32] or "Asosiy"


def parse_fan_name(file_name: str) -> str:
    base = re.sub(r"\.pdf$", "", file_name, flags=re.I).strip()
    paren = re.search(r"\(([^)]+)\)\s*$", base)
    if paren:
        fan = base[: paren.start()].strip().rstrip(".- ")
        if fan:
            return fan
    without_suffix = re.sub(r"[-–_\s]+([A-ZА-ЯЁ]{2,16})\s*$", "", base, flags=re.I).strip()
    return without_suffix or base


def subject_code_for(dept_code: str, fan_name: str) -> str:
    fan_slug = slug_code(fan_name, max_len=40)
    return f"{dept_code}__{fan_slug}"[:64]
