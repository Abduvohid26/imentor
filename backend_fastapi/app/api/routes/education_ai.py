from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_roles
from app.core.config import get_settings
from app.core.db import get_db
from app.schemas.education_ai import (
    EducationAiBookReferencesRequest,
    EducationAiBookReferencesResponse,
    EducationAiCompletionRequest,
    EducationAiCompletionResponse,
)
from app.services import book_retrieval as rag
from app.services import openai_client as oai
from app.services.education_ai_utils import clip_education_messages

router = APIRouter()

STAFF_ROLES = ("admin", "klinika_admin", "hodim")


@router.post("/education-ai/completion/", response_model=EducationAiCompletionResponse)
def education_ai_completion(
    payload: EducationAiCompletionRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> EducationAiCompletionResponse:
    settings = get_settings()
    api_key = settings.openai_api_key.strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API kaliti serverda sozlanmagan.",
        )

    messages = clip_education_messages(payload.messages)
    if not messages:
        raise HTTPException(status_code=400, detail="Xabarlar bo'sh.")

    subject_code = payload.subject_code.strip()
    topic_query = payload.topic_query.strip()
    book_references: list[dict] = []
    if subject_code and topic_query:
        chunks = rag.retrieve_book_context(db, subject_code, topic_query)
        context_message = rag.format_book_context_message(chunks)
        if context_message:
            messages = [{"role": "system", "content": context_message}] + messages
            book_references = rag.book_references_from_chunks(chunks)

    model = payload.model.strip() or settings.openai_chat_model
    try:
        content = oai.generate_openai_chat(
            api_key,
            messages=messages,
            model=model,
            max_tokens=payload.max_tokens,
            temperature=payload.temperature,
            timeout_sec=280,
        )
    except oai.OpenAiClientError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return EducationAiCompletionResponse(content=content, book_references=book_references)


@router.post("/education-ai/completion/stream/")
def education_ai_completion_stream(
    payload: EducationAiCompletionRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> StreamingResponse:
    """`/education-ai/completion/` bilan bir xil, lekin javobni SSE orqali
    oqim (stream) sifatida qaytaradi — frontend matnni generatsiya bo'lgan
    sari darhol ko'rsatishi mumkin (kutish tuyg'usini kamaytiradi)."""
    settings = get_settings()
    api_key = settings.openai_api_key.strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API kaliti serverda sozlanmagan.",
        )

    messages = clip_education_messages(payload.messages)
    if not messages:
        raise HTTPException(status_code=400, detail="Xabarlar bo'sh.")

    subject_code = payload.subject_code.strip()
    topic_query = payload.topic_query.strip()
    book_references: list[dict] = []
    if subject_code and topic_query:
        chunks = rag.retrieve_book_context(db, subject_code, topic_query)
        context_message = rag.format_book_context_message(chunks)
        if context_message:
            messages = [{"role": "system", "content": context_message}] + messages
            book_references = rag.book_references_from_chunks(chunks)

    model = payload.model.strip() or settings.openai_chat_model

    def _gen():
        try:
            for delta in oai.stream_openai_chat(
                api_key,
                messages=messages,
                model=model,
                max_tokens=payload.max_tokens,
                temperature=payload.temperature,
                timeout_sec=280,
            ):
                yield f"data: {json.dumps({'delta': delta})}\n\n"
        except oai.OpenAiClientError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return
        yield f"data: {json.dumps({'done': True, 'book_references': book_references})}\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream")


@router.post("/education-ai/book-references/", response_model=EducationAiBookReferencesResponse)
def education_ai_book_references(
    payload: EducationAiBookReferencesRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_roles(*STAFF_ROLES)),
) -> EducationAiBookReferencesResponse:
    subject_code = payload.subject_code.strip()
    queries = [str(q or "") for q in payload.queries][:40]
    results = rag.retrieve_references_for_queries(db, subject_code, queries, top_k=payload.top_k)
    return EducationAiBookReferencesResponse(subject_code=subject_code, results=results)
