"""RAG retrieval: subject_code bo'yicha eng mos kitob chunk'larini topish."""

from __future__ import annotations

import os

from pgvector.django import CosineDistance

from core.models import BookChunk, CourseSyllabus
from core.openai_client import OpenAiClientError, create_embeddings


def retrieve_book_context(subject_code: str, query_text: str, *, top_k: int = 6) -> list[dict]:
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
    parts = [
        f"[Manba: {c['book_title']}, {c['page']}-bet]\n{c['text']}"
        for c in chunks
    ]
    joined = "\n\n---\n\n".join(parts)
    return (
        "Quyida shu fanga tegishli darslik parchalari berilgan. Javobingizni shu manbalarga "
        "tayangan holda tayyorlang va foydalangan manbangizni ko'rsating: "
        "\"(Manba: {kitob nomi}, {sahifa}-bet)\" formatida.\n\n"
        "MAJBURIY QOIDA — format bo'yicha:\n"
        "- Agar sizdan FAQAT JSON qaytarish so'ralgan bo'lsa: \"Manba: ...\" ni JSON'dan "
        "TASHQARIGA chiqarmang (JSON'dan tashqaridagi matn butunlay tashlab yuboriladi va yo'qoladi). "
        "Buning o'rniga manba ma'lumotini JSON ichidagi tegishli matn maydoniga "
        "(masalan explanation, optionExplanations, answer va h.k.) o'sha gapning oxiriga qo'shib yozing, "
        "masalan: \"...bosim ortadi (Manba: Guyton, 114-bet).\"\n"
        "- Agar erkin matn (JSON emas) so'ralgan bo'lsa: javobingiz OXIRIDA alohida qatorda "
        "\"Manba: {kitob nomi}, {sahifa}-bet\" deb ko'rsating (bir nechta manba — har biri alohida qatorda).\n"
        "Har ikki holatda ham: agar parchalar savolga umuman aloqador bo'lmasa, o'z bilimingizga "
        "tayaning va manba ko'rsatmang.\n\n"
        f"{joined}"
    )
