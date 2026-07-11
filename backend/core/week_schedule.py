"""ISO hafta raqami bo'yicha yuqori/pastki hafta (juft / toq)."""

from __future__ import annotations

import datetime


def current_week_phase_code(now_local: datetime.datetime) -> str:
    """
    ISO hafta raqami toq bo'lsa 'upper', juft bo'lsa 'lower'.
    Eslatma: yangi yilda ISO hafta 1 dan boshlanadi — juftlik kalendarga bog'liq.
    """
    wn = now_local.isocalendar().week
    return "upper" if (wn % 2 == 1) else "lower"


def week_phase_label_uz(code: str) -> str:
    if code == "every":
        return "Har hafta"
    if code == "upper":
        return "Yuqori hafta"
    if code == "lower":
        return "Pastki hafta"
    return code


def iso_week_number(local_dt: datetime.datetime) -> int:
    return local_dt.isocalendar().week
