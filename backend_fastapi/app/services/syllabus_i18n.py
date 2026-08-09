"""Sillabus nomi va mavzu nomlarini interfeys tillariga tarjima qilish.

Qoidalar:
  * ASL nom hech qachon o'zgarmaydi — u saqlash kaliti va AI promptlari
    uchun ishlatiladi. Bu yerda faqat KO'RSATISH uchun tarjima saqlanadi.
  * Bitta sillabusning HAMMA mavzusi BITTA so'rovda tarjima qilinadi —
    shunda terminologiya izchil bo'ladi (mavzuma-mavzu tarjima qilinsa,
    bir atama har xil chiqishi mumkin).
  * Allaqachon tarjima qilingan sarlavhalar qayta tarjima qilinmaydi.
"""

from __future__ import annotations

import json
import logging
import re

from app.core.config import get_settings
from app.services import openai_client as oai

logger = logging.getLogger(__name__)

_NUM_PREFIX = re.compile(r"^\s*\d+[.)]\s*(.+)$", re.S)

SUPPORTED_LANGS = ("uz", "ru", "en")
LANG_NAMES = {"uz": "Uzbek (latin)", "ru": "Russian", "en": "English"}

# Bitta so'rovda tarjima qilinadigan maksimal sarlavha (juda katta sillabusda
# javob token chegarasiga urilmasin).
_BATCH = 30


def collect_topic_titles(syllabus) -> list[str]:
    """Sillabusdagi barcha noyob mavzu sarlavhalari (asl holida)."""
    titles: list[str] = []
    seen: set[str] = set()

    def _add(items) -> None:
        if not isinstance(items, list):
            return
        for t in items:
            if not isinstance(t, dict):
                continue
            title = str(t.get("title") or "").strip()
            if title and title not in seen:
                seen.add(title)
                titles.append(title)

    variants = syllabus.variants if isinstance(syllabus.variants, list) else []
    for v in variants:
        if isinstance(v, dict):
            _add(v.get("topics"))
    _add(syllabus.topics if isinstance(syllabus.topics, list) else [])
    return titles


def _translate_batch(api_key: str, model: str, items: list[str], target: str) -> dict[str, str]:
    """`items` ni `target` tiliga tarjima qiladi: {asl: tarjima}."""
    if not items:
        return {}
    payload = json.dumps(items, ensure_ascii=False)
    try:
        raw = oai.generate_openai_chat(
            api_key,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You translate MEDICAL CURRICULUM topic titles for a university. "
                        f"Translate into {LANG_NAMES.get(target, target)}. "
                        "Keep official medical terminology accurate and consistent across the whole list "
                        "(the same term must be translated the same way everywhere). "
                        "Keep topic codes, numbers, abbreviations and Latin anatomical terms as they are. "
                        "Do NOT add explanations. "
                        "Input is a JSON array of strings. Return ONLY a JSON array of strings, "
                        "same length and same order. Do not add numbering or any extra text."
                    ),
                },
                {"role": "user", "content": payload},
            ],
            model=model,
            max_tokens=8000,
            temperature=0.1,
            timeout_sec=180,
        )
        text = (raw or "").strip()
        start, end = text.find("["), text.rfind("]")
        if start < 0 or end <= start:
            logger.warning("Tarjima javobida JSON massiv topilmadi (%s)", target)
            return {}
        arr = json.loads(text[start : end + 1])
        if not isinstance(arr, list) or len(arr) != len(items):
            logger.warning(
                "Tarjima soni mos emas (%s): kutilgan %s, kelgan %s",
                target,
                len(items),
                len(arr) if isinstance(arr, list) else "?",
            )
            return {}
        out: dict[str, str] = {}
        for src, dst in zip(items, arr):
            dst = str(dst or "").strip()
            # Model ba'zan ro'yxat raqamini ham qaytaradi ("14. Gas exchange")
            # — asl sarlavhada bunday prefiks bo'lmasa, olib tashlaymiz.
            m = _NUM_PREFIX.match(dst)
            if m and not _NUM_PREFIX.match(src):
                dst = m.group(1).strip()
            if dst and dst != src:
                out[src] = dst[:512]
        return out
    except Exception:
        logger.warning("Tarjima xatosi (%s)", target, exc_info=True)
        return {}


def ensure_syllabus_translations(db, syllabus, langs: tuple[str, ...] = SUPPORTED_LANGS) -> bool:
    """Yetishmayotgan tarjimalarni to'ldiradi. O'zgarish bo'lsa True.

    Idempotent: mavjud tarjimalarga tegmaydi, faqat yangilarini qo'shadi.
    """
    settings = get_settings()
    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        logger.info("OPENAI_API_KEY yo'q — sillabus tarjimasi o'tkazib yuborildi")
        return False

    model = settings.openai_fast_model
    source_lang = (syllabus.instruction_language or "uz").strip().lower()
    titles = collect_topic_titles(syllabus)

    name_i18n = dict(syllabus.name_i18n or {})
    topics_i18n = {k: dict(v or {}) for k, v in (syllabus.topics_i18n or {}).items()}
    changed = False

    for lang in langs:
        if lang == source_lang:
            continue  # asl til — tarjima kerak emas

        # --- fan nomi ---
        if not str(name_i18n.get(lang) or "").strip() and syllabus.subject_name:
            got = _translate_batch(api_key, model, [syllabus.subject_name], lang)
            if got:
                name_i18n[lang] = list(got.values())[0]
                changed = True

        # --- mavzu sarlavhalari (faqat yetishmayotganlari) ---
        have = topics_i18n.get(lang) or {}
        missing = [t for t in titles if not str(have.get(t) or "").strip()]
        if missing:
            merged = dict(have)
            for i in range(0, len(missing), _BATCH):
                chunk = missing[i : i + _BATCH]
                got = _translate_batch(api_key, model, chunk, lang)
                if not got and len(chunk) > 1:
                    # To'plam yiqildi (javob kesilgan yoki soni mos emas) —
                    # ikkiga bo'lib qayta urinamiz, shunda hech bo'lmasa
                    # yarmi tarjima bo'ladi.
                    half = len(chunk) // 2
                    got = _translate_batch(api_key, model, chunk[:half], lang)
                    got.update(_translate_batch(api_key, model, chunk[half:], lang))
                merged.update(got)
            if merged != have:
                topics_i18n[lang] = merged
                changed = True

    if changed:
        syllabus.name_i18n = name_i18n
        syllabus.topics_i18n = topics_i18n
        db.commit()
        logger.info("Sillabus %s tarjimalari yangilandi", syllabus.id)
    return changed
