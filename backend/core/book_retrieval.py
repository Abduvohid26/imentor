"""RAG retrieval: subject_code bo'yicha eng mos kitob chunk'larini topish."""

from __future__ import annotations

import os
import re

from pgvector.django import CosineDistance

from core.models import BookChunk, CourseSyllabus
from core.openai_client import OpenAiClientError, create_embeddings


def retrieve_book_context(subject_code: str, query_text: str, *, top_k: int = 10) -> list[dict]:
    """
    subject_code -> CourseSyllabus -> department -> shu kafedraga tegishli BookChunk'lar
    orasidan query_text'ga eng yaqin top_k tasini qaytaradi.

    Natija: [{"book_title": str, "page": "245-250", "text": str}, ...]
    Hech narsa topilmasa yoki xato bo'lsa — bo'sh ro'yxat (chaqiruvchi tomon buni
    "manba yo'q" sifatida talqin qiladi, xato ko'tarmaydi).
    """
    subject_code = (subject_code or "").strip()
    query_text = (query_text or "").strip()
    if not subject_code or not query_text:
        return []

    syllabus = CourseSyllabus.objects.filter(subject_code=subject_code).select_related("department").first()
    if not syllabus or not syllabus.department_id:
        return []

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return []

    try:
        [query_vec] = create_embeddings(api_key, [query_text])
    except OpenAiClientError:
        return []

    chunks = (
        BookChunk.objects.filter(department_id=syllabus.department_id)
        .select_related("book")
        .annotate(distance=CosineDistance("embedding", query_vec))
        .order_by("distance")[:top_k]
    )

    return [
        {
            "book_title": chunk.book.title,
            "page": (
                str(chunk.page_start)
                if chunk.page_start == chunk.page_end
                else f"{chunk.page_start}-{chunk.page_end}"
            ),
            "text": chunk.text,
        }
        for chunk in chunks
    ]


def format_book_context_message(chunks: list[dict]) -> str | None:
    """Chunk ro'yxatidan system xabar matnini quradi. Bo'sh bo'lsa — None."""
    if not chunks:
        return None
    # Nuqsonli chunk butun paketni yiqitmasin (backfill buyrug'i yuzlab
    # testni ketma-ket ishlaydi) — yetishmagan maydon o'tkazib yuboriladi.
    parts = []
    for c in chunks:
        if not isinstance(c, dict):
            continue
        text = str(c.get("text") or "").strip()
        if not text:
            continue
        title = str(c.get("book_title") or "").strip() or "Darslik"
        page = str(c.get("page") or "").strip()
        head = f"[Manba: {title}, {page}-bet]" if page else f"[Manba: {title}]"
        parts.append(f"{head}\n{text}")
    if not parts:
        return None
    joined = "\n\n---\n\n".join(parts)
    return (
        "Quyida shu fanga tegishli RASMIY DARSLIK parchalari berilgan. "
        "MAJBURIY QOIDA — manba: javobingizni FAQAT shu quyidagi parchalardagi ma'lumotlarga "
        "asoslab tuzing. O'zingizning umumiy (tashqi, darslikdan tashqari) bilimingizdan "
        "fakt/raqam/tafsilot QO'SHMANG — faqat shu matnlarda bor narsani tushuntiring, "
        "qayta tuzing, savol/izoh shakliga soling. Agar berilgan parchalar savol uchun "
        "yetarli bo'lmasa, faqat ular yetarli darajada qamrab olgan qismini ishlating "
        "(kengaytirib, o'zingizdan tafsilot qo'shmang). Foydalangan manbangizni ko'rsating: "
        "\"(Manba: {kitob nomi}, {sahifa}-bet)\" formatida.\n\n"
        "MAJBURIY QOIDA — format bo'yicha:\n"
        "- Agar sizdan FAQAT JSON qaytarish so'ralgan bo'lsa: \"Manba: ...\" ni JSON'dan "
        "TASHQARIGA chiqarmang (JSON'dan tashqaridagi matn butunlay tashlab yuboriladi va yo'qoladi). "
        "Buning o'rniga manba ma'lumotini JSON ichidagi tegishli matn maydoniga "
        "(masalan explanation, optionExplanations, answer va h.k.) o'sha gapning oxiriga qo'shib yozing, "
        "masalan: \"...bosim ortadi (Manba: Guyton, 114-bet).\"\n"
        "- Agar erkin matn (JSON emas) so'ralgan bo'lsa: shu parchadan foydalangan gapning oxiriga "
        "\"(Manba: {kitob nomi}, {sahifa}-bet)\" deb qo'shib qo'ying (qavs bilan, gap ichida). "
        "Agar sizga boshqacha joylashtirish ko'rsatmasi berilgan bo'lsa (masalan alohida qator), "
        "o'sha ko'rsatmaga amal qiling — lekin manba so'zini hech qachon qavssiz, bo'sh holda qoldirmang.\n\n"
        f"{joined}"
    )

#: Fayl nomidagi texnik shovqin — sarlavhadan olib tashlanadi.
_TITLE_NOISE = frozenset({
    "pdf", "epub", "djvu", "doc", "docx", "txt", "scan", "scanned", "ocr",
    "final", "copy", "pca", "dr", "notes", "note", "book", "ebook", "free",
    "download", "compressed", "merged", "org", "com", "net", "www",
    "konkur", "in",
})

#: Qavs ichidagi sayt manzili — qaroqchi saytlarning vatermarki.
_BRACKET_URL_RE = re.compile(r"[\[\(]\s*(?:https?://|www\.)[^\]\)]*[\]\)]", re.I)
#: Markdown havola: [matn](url) -> matn
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\((?:[^)]*)\)")
_BARE_URL_RE = re.compile(r"(?:https?://\S+|www\.[^\s\]\)]+)", re.I)
#: "Medicine2021" -> "Medicine 2021"
_LETTER_YEAR_RE = re.compile(r"([A-Za-z\u0400-\u04ff])((?:19|20)\d{2})\b")


def clean_book_title(raw: str) -> str:
    """Fayl nomidan talabaga ko'rsatiladigan kitob sarlavhasi.

    `SubjectBook.title` odatda yuklangan fayl nomi bo'ladi va ichida turli
    shovqin uchraydi: kengaytma, boshdagi tartib raqami, qaroqchi saytlarning
    vatermarki ("[www.konkur.in]"), hatto markdown havola. Manba talabaning
    natija sahifasida ko'rinadi, shuning uchun tozalanadi:

        "Oral Medicine2021 [www.konkur.in]"  -> "Oral Medicine 2021"
        "1. Williams-obstetrics-26th-pdf"    -> "Williams obstetrics 26th"

    Konservativ: natija juda qisqa chiqsa xom nom qaytariladi — sarlavhani
    buzib ko'rsatgandan ko'ra tushunarsiz nom afzal.
    """
    s = str(raw or "").strip()
    if not s:
        return ""
    s = _MD_LINK_RE.sub(r"\1", s)
    s = _BRACKET_URL_RE.sub(" ", s)
    s = _BARE_URL_RE.sub(" ", s)
    s = re.sub(r"\.(pdf|epub|djvu|docx?|txt)\b", " ", s, flags=re.I)
    s = re.sub(r"^\s*\d+[\s.)\-_]+", "", s)
    s = s.replace("_", " ").replace("-", " ")
    s = _LETTER_YEAR_RE.sub(r"\1 \2", s)

    kept: list[str] = []
    for i, part in enumerate(p for p in s.split() if p):
        low = re.sub(r"[^a-z0-9]", "", part.lower())
        if low in _TITLE_NOISE and i >= 1:
            continue
        if kept and kept[-1].lower() == part.lower():
            continue  # ketma-ket takror: "4th 4th" -> "4th"
        kept.append(part)

    out = re.sub(r"\s{2,}", " ", " ".join(kept)).strip(" .,-\u2013\u2014")
    # Muvozanatsiz qavslarni olib tashlash — haqiqiy "(2018)" buzilmasin.
    for op, cl in (("(", ")"), ("[", "]"), ("{", "}")):
        extra = out.count(op) - out.count(cl)
        if extra > 0:
            out = out.replace(op, "", extra)
        elif extra < 0:
            out = out.replace(cl, "", -extra)
    out = re.sub(r"\s{2,}", " ", out).strip(" .,-\u2013\u2014")

    if len(out) < 3:
        return str(raw).strip()
    return out[0].upper() + out[1:] if out.islower() else out


def book_references_from_chunks(chunks: list[dict]) -> list[dict]:
    """
    Ishlatilgan chunk'lardan STRUKTURALI manba ro'yxatini quradi.

    Nega kerak: AI'dan manba yozishni so'rash ikki xil yo'l bilan yiqilardi —
    yo o'ylab topilgan DOI/PubMed havolalar (shu sabab `references` umuman
    o'chirib qo'yilgan edi), yo "(Manba: kitob nomi, sahifa-bet)" degan
    TO'LDIRILMAGAN shablon matn izoh ichida qolib ketardi.

    Bu funksiya AI'ga umuman tayanmaydi: qaysi kitobning qaysi betlari
    modelga berilgani bizga aniq ma'lum — o'shani qaytaramiz. Ya'ni manba
    haqiqiy va tekshiriladigan.
    """
    by_title: dict[str, list[str]] = {}
    for c in chunks or []:
        title = str((c or {}).get("book_title") or "").strip()
        page = str((c or {}).get("page") or "").strip()
        if not title:
            continue
        pages = by_title.setdefault(title, [])
        if page and page not in pages:
            pages.append(page)

    out: list[dict] = []
    for title, pages in by_title.items():
        ref: dict = {"title": clean_book_title(title)[:300]}
        if pages:
            # Sahifalarni raqam bo'yicha tartiblaymiz ("12", "40-45" -> 12, 40).
            def _first_page(p: str) -> int:
                head = p.split("-", 1)[0].strip()
                return int(head) if head.isdigit() else 0

            ordered = sorted(pages, key=_first_page)[:12]
            ref["pages"] = ", ".join(ordered)
        out.append(ref)
    # Eng ko'p ishlatilgan (ko'p sahifali) kitob birinchi bo'lsin.
    out.sort(key=lambda r: -len(str(r.get("pages") or "")))
    return out[:8]


def retrieve_references_for_queries(
    subject_code: str,
    queries: list[str],
    *,
    top_k: int = 3,
) -> list[list[dict]]:
    """
    Har bir so'rov (odatda savol matni) uchun alohida RAG — alohida references.
    Bir xil umumiy manba ro'yxatini barcha savollarga yopishtirmaslik uchun.
    """
    out: list[list[dict]] = []
    for raw in queries:
        q = str(raw or "").strip()
        if not q:
            out.append([])
            continue
        chunks = retrieve_book_context(subject_code, q[:2000], top_k=top_k)
        out.append(book_references_from_chunks(chunks))
    return out
