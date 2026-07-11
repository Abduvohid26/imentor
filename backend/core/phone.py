from __future__ import annotations


def normalize_uz_phone_digits(value: str) -> str:
    """Normalize Uzbekistan phone input to 12-digit form (998XXXXXXXXX)."""
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 9:
        digits = "998" + digits
    if len(digits) == 10 and digits.startswith("0"):
        digits = "998" + digits[1:]
    if len(digits) != 12 or not digits.startswith("998"):
        raise ValueError("O'zbekiston telefon raqamini kiriting (+998 XX XXX XX XX).")
    return digits
