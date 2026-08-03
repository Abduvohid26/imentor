from __future__ import annotations

from pydantic import BaseModel, Field


class EducationAiCompletionRequest(BaseModel):
    model: str = ""
    messages: list[dict] = Field(min_length=1)
    max_tokens: int = Field(default=4096, ge=256, le=16384)
    temperature: float = Field(default=0.35, ge=0.0, le=1.5)
    subject_code: str = ""
    topic_query: str = ""


class EducationAiCompletionResponse(BaseModel):
    content: str
    book_references: list[dict] = []


class EducationAiBookReferencesRequest(BaseModel):
    subject_code: str = Field(min_length=1, max_length=200)
    queries: list[str] = Field(min_length=1, max_length=40)
    top_k: int = Field(default=3, ge=1, le=8)


class EducationAiBookReferencesResponse(BaseModel):
    subject_code: str
    results: list[list[dict]]
