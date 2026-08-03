from __future__ import annotations

from pydantic import BaseModel


class QuestionnaireRequest(BaseModel):
    language: str = "uz"
    project_title: str = ""
    summary: str = ""
    full_description: str = ""
    structured_context_note: str = ""


class TwentyCriteriaRequest(BaseModel):
    language: str = "uz"
    project_title: str = ""
    summary: str = ""
    full_description: str = ""
    structured_context_note: str = ""
    questionnaire_qa_block: str = ""


class InnovationPackRequest(BaseModel):
    language: str = "uz"
    project_domain: str = "startup"
    project_title: str = ""
    summary: str = ""
    full_description: str = ""
    profile_note: str = ""
    workspace_extra_note: str = ""


class CoachMessage(BaseModel):
    role: str
    content: str = ""


class CoachReplyRequest(BaseModel):
    language: str = "uz"
    messages: list[CoachMessage]
    ctx: dict = {}


class CoachReplyResponse(BaseModel):
    reply: str
