"""Mavjud testlarga darslik manbasini biriktirish (sof mantiq — test qilinadi).

NEGA: eski testlar darslik konteksti YO'Q holda yaratilgan (CourseSyllabus'da
kafedra biriktirilmagan edi), shu sabab AI'ga "darslikni ko'rsat" deyilgan,
lekin darslik berilmagan — natijada izohlarda "(Manba: kitob nomi, sahifa-bet)"
degan TO'LDIRILMAGAN shablon qolgan va `references` bo'sh bo'lgan.

YONDASHUV — halollik birinchi o'rinda:
  * Savol, variantlar va to'g'ri javob TEGILMAYDI. Ular yaroqli; buzilgani —
    izoh va manba. Savolni qayta yozish imtihon qiyinligini o'zgartirib
    yuborardi va allaqachon o'tkazilgan imtihonlar bilan mos kelmasdi.
  * Izoh FAQAT haqiqatan olib kelingan darslik parchalari asosida qayta
    yoziladi. Darslik topilmasa — test CHETLAB O'TILADI. Manbani "shunchaki
    biriktirish" qilinmaydi: kontent u manbadan olinmagan bo'lsa, unga
    havola qilish soxta atribut bo'ladi.
  * `references` server bilgan aniq ma'lumotdan quriladi (qaysi kitobning
    qaysi betlari modelga berilgan), AI'dan emas.
"""

from __future__ import annotations

import json
import re
from typing import Any

#: To'ldirilmagan manba shabloni — talabaga foydasiz, olib tashlanadi.
_UNFILLED_SOURCE_RE = re.compile(
    r"\s*\((?:Manba|Источник|Source)\s*:\s*"
    r"(?:kitob nomi|nomi|\{[^)]*\}|название книги|book name)[^)]*\)",
    re.IGNORECASE,
)


def strip_unfilled_source(text: Any) -> str:
    """To'ldirilmagan shablonni olib tashlaydi; haqiqiy manbani saqlaydi."""
    s = str(text or "")
    s = _UNFILLED_SOURCE_RE.sub("", s)
    s = re.sub(r"\s{2,}", " ", s)
    s = re.sub(r"\s+([.,;:])", r"\1", s)
    return s.strip()


def payload_questions(payload: Any) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    qs = payload.get("questions")
    return [q for q in qs if isinstance(q, dict)] if isinstance(qs, list) else []


def payload_has_references(payload: Any) -> bool:
    """Kamida bitta savolda manba bormi (idempotentlik tekshiruvi)."""
    for q in payload_questions(payload):
        refs = q.get("references")
        if isinstance(refs, list) and refs:
            return True
    return False


def _iter_references(payload: Any):
    for q in payload_questions(payload):
        refs = q.get("references")
        if isinstance(refs, list):
            for r in refs:
                if isinstance(r, dict):
                    yield r


def has_book_references(payload: Any) -> bool:
    """Manba DARSLIKdan olinganmi (`pages` bor, tashqi havola yo'q).

    Bunday manba server bilgan aniq ma'lumotdan qurilgan — tekshiriladigan
    va ishonchli, shuning uchun uni almashtirish shart emas.
    """
    return any(r.get("pages") and not r.get("url") for r in _iter_references(payload))


def external_reference_titles(payload: Any, limit: int = 3) -> list[str]:
    """AI yaratgan TASHQI havolalar (DOI/PubMed va h.k.) sarlavhalari.

    Bunday havolalar model tomonidan o'ylab topilgan bo'lishi mumkin va
    haqiqiy maqolaga bog'lanmasligi ehtimoli bor — shu sabab ular darslik
    manbasiga almashtirilishi tavsiya etiladi.
    """
    out: list[str] = []
    for r in _iter_references(payload):
        if not r.get("url"):
            continue
        title = str(r.get("title") or r.get("url") or "").strip()
        if title and title not in out:
            out.append(title)
        if len(out) >= limit:
            break
    return out


def retrieval_query(payload: Any, max_questions: int = 4) -> str:
    """Qidiruv so'rovi: mavzu + bir nechta savol matni (mavzu yolg'iz kam)."""
    if not isinstance(payload, dict):
        return ""
    parts = [str(payload.get("topic") or "").strip()]
    for q in payload_questions(payload)[:max_questions]:
        parts.append(str(q.get("question") or "").strip()[:300])
    return " ".join(p for p in parts if p)[:4000]


def build_rewrite_prompt(questions: list[dict], language_name: str) -> str:
    """Izohlarni darslik parchalari asosida qayta yozish so'rovi (batafsil, fakt doirasida)."""
    items = []
    for i, q in enumerate(questions):
        opts = [str(o) for o in (q.get("options") or [])]
        try:
            ci = int(q.get("correctOptionIndex", 0))
        except (TypeError, ValueError):
            ci = 0
        items.append(
            {
                "i": i,
                "question": str(q.get("question") or "")[:1200],
                "options": opts,
                "correctIndex": ci if 0 <= ci < len(opts) else 0,
            }
        )
    return (
        "Quyidagi test savollari uchun IZOHLARNI qayta yoz. Savol matni, "
        "variantlar va to'g'ri javob O'ZGARMAYDI — faqat izohlar.\n"
        f"Til: {language_name}.\n"
        "MAJBURIY — fakt chegarasi: faqat yuqorida berilgan darslik parchalaridagi "
        "ma'lumotga tayan. Parchalarda YO'Q fakt, raqam, dori doza, statistikani "
        "O'ZINGDAN QO'SHMA. Agar parcha yetarli bo'lmasa — bor faktlar bilan "
        "chuqurroq tushuntir; yo'q narsani uydirma. Parchalar savolni umuman "
        "qamramasa, o'sha savol uchun izohni bo'sh qoldir (\"\").\n"
        "MAJBURIY — hajm (hozirgi qisqa 1 gapdan ~4–5 marta uzunroq):\n"
        "- explanation: 8–12 to'liq gap (yoki ~600–1200 belgi). Klinik asos, "
        "nega aynan shu javob, boshqa yondashuvlar nega mos emas (faqat "
        "parchalardagi faktlar bilan), qisqa xulosa.\n"
        "- optionExplanations: options bilan bir xil tartibda; HAR variant uchun "
        "2–3 to'liq gap (to'g'ri — nega to'g'ri; xato — aynan shu variant nega "
        "noto'g'ri / qachon ishlatiladi, lekin bu yerda emas).\n"
        "Matn ichida \"(Manba: ...)\" YOZMA — manbani tizim o'zi biriktiradi.\n"
        f"Kirish: {json.dumps(items, ensure_ascii=False)}\n"
        'Chiqish: JSON massiv, har elementi: {"i":<raqam>,"explanation":"...",'
        '"optionExplanations":["...","..."]}'
    )


def parse_rewrite_response(text: str, expected: int) -> dict[int, dict]:
    """Model javobini {indeks: {explanation, optionExplanations}} ga aylantiradi."""
    raw = str(text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        arr = json.loads(raw[start : end + 1])
    except (ValueError, TypeError):
        return {}
    out: dict[int, dict] = {}
    if not isinstance(arr, list):
        return out
    for pos, row in enumerate(arr):
        if not isinstance(row, dict):
            continue
        try:
            idx = int(row.get("i", pos))
        except (TypeError, ValueError):
            idx = pos
        if not 0 <= idx < expected:
            continue
        expl = strip_unfilled_source(row.get("explanation"))
        opt_raw = row.get("optionExplanations")
        opts = (
            [strip_unfilled_source(x) for x in opt_raw] if isinstance(opt_raw, list) else []
        )
        out[idx] = {"explanation": expl, "optionExplanations": opts}
    return out


def apply_sources_to_payload(
    payload: dict,
    references: list[dict],
    rewrites: dict[int, dict] | None = None,
) -> tuple[dict, int]:
    """
    Payload'ga manba (va bo'lsa yangi izohlarni) biriktiradi.

    Savol/variant/to'g'ri javob TEGILMAYDI. Tarjima bloklariga ham manba
    biriktiriladi (manba tilga bog'liq emas), lekin ularning izohlari
    o'zgartirilmaydi — faqat shablon qoldiqlari tozalanadi.

    Qaytaradi: (yangi_payload, manba_biriktirilgan_savollar_soni)
    """
    refs = [dict(r) for r in references if isinstance(r, dict) and r.get("title")]
    per_q = [refs] * len(payload_questions(payload)) if refs else []
    return apply_per_question_sources_to_payload(payload, per_q, rewrites)


def apply_per_question_sources_to_payload(
    payload: dict,
    per_question_refs: list[list[dict]],
    rewrites: dict[int, dict] | None = None,
) -> tuple[dict, int]:
    """
    Har savolga O'Z references ro'yxatini biriktiradi.
    Session-level `references` = barcha savollardagi unique union.
    """
    rewrites = rewrites or {}
    new_payload = dict(payload) if isinstance(payload, dict) else {}
    questions = payload_questions(new_payload)

    def _clean_refs(raw: list | None) -> list[dict]:
        out: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for r in raw or []:
            if not isinstance(r, dict):
                continue
            title = str(r.get("title") or "").strip()
            if not title:
                continue
            pages = str(r.get("pages") or "").strip()
            key = (title.lower(), pages)
            if key in seen:
                continue
            seen.add(key)
            ref = {"title": title[:300]}
            if pages:
                ref["pages"] = pages[:200]
            for field in ("url", "authors", "publisher", "year"):
                val = str(r.get(field) or "").strip()
                if val:
                    ref[field] = val[:300]
            out.append(ref)
        return out[:8]

    def fix_questions(qs: list, use_rewrites: bool, attach: bool) -> tuple[list, int]:
        out, touched = [], 0
        for i, q in enumerate(qs):
            if not isinstance(q, dict):
                out.append(q)
                continue
            row = dict(q)
            rw = rewrites.get(i) if use_rewrites else None
            if rw and rw.get("explanation"):
                row["explanation"] = rw["explanation"]
            else:
                row["explanation"] = strip_unfilled_source(row.get("explanation"))
            opts_len = len(row.get("options") or [])
            if rw and rw.get("optionExplanations"):
                oe = [str(x) for x in rw["optionExplanations"]][:opts_len]
                while len(oe) < opts_len:
                    oe.append("")
                if any(x.strip() for x in oe):
                    row["optionExplanations"] = oe
            elif isinstance(row.get("optionExplanations"), list):
                row["optionExplanations"] = [
                    strip_unfilled_source(x) for x in row["optionExplanations"]
                ]
            if attach:
                refs_i = _clean_refs(
                    per_question_refs[i] if i < len(per_question_refs) else None
                )
                if refs_i:
                    row["references"] = refs_i
                    touched += 1
            out.append(row)
        return out, touched

    fixed, touched = fix_questions(questions, True, True)
    new_payload["questions"] = fixed

    union: list[dict] = []
    seen_u: set[tuple[str, str]] = set()
    for q in fixed:
        if not isinstance(q, dict):
            continue
        for r in _clean_refs(q.get("references") if isinstance(q.get("references"), list) else []):
            key = (r["title"].lower(), str(r.get("pages") or ""))
            if key in seen_u:
                continue
            seen_u.add(key)
            union.append(r)
    if union:
        new_payload["references"] = union[:12]

    translations = new_payload.get("translations")
    if isinstance(translations, dict):
        new_tr = {}
        for lang, block in translations.items():
            if not isinstance(block, dict):
                new_tr[lang] = block
                continue
            nb = dict(block)
            tq = [q for q in (nb.get("questions") or []) if isinstance(q, dict)]
            nb["questions"], _ = fix_questions(tq, False, True)
            if union:
                nb["references"] = [dict(r) for r in union[:12]]
            new_tr[lang] = nb
        new_payload["translations"] = new_tr

    return new_payload, touched
