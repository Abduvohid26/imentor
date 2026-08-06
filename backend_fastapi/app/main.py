from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.admin import register_admin
from app.api.routes import (
    auth,
    clinic_admin,
    clinical_group,
    content_catalog,
    device_pairing,
    education_ai,
    external_api,
    health,
    legacy,
    live_test,
    prepared_content,
    staff_admin,
    staff_location,
    subject_book,
    syllabus_catalog,
    topic_content,
)
from app.core.config import get_settings
from app.services.file_storage import media_root

settings = get_settings()

app = FastAPI(title="iMentor API (FastAPI)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.django_secret_key)

register_admin(app)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(syllabus_catalog.router, prefix="/api/v1", tags=["syllabus"])
app.include_router(live_test.router, prefix="/api/v1", tags=["live-test"])
app.include_router(staff_location.router, prefix="/api/v1", tags=["staff-location"])
app.include_router(clinical_group.router, prefix="/api/v1", tags=["clinical-group"])
app.include_router(clinic_admin.router, prefix="/api/v1", tags=["clinic-admin"])
app.include_router(subject_book.router, prefix="/api/v1", tags=["subject-book"])
app.include_router(device_pairing.router, prefix="/api/v1", tags=["device-pairing"])
app.include_router(staff_admin.router, prefix="/api/v1", tags=["staff-admin"])
app.include_router(content_catalog.router, prefix="/api/v1", tags=["content-catalog"])
app.include_router(topic_content.router, prefix="/api/v1", tags=["topic-content"])
app.include_router(education_ai.router, prefix="/api/v1", tags=["education-ai"])
app.include_router(external_api.router, prefix="/api/v1", tags=["external-api"])
app.include_router(prepared_content.router, prefix="/api/v1", tags=["prepared-content"])
app.include_router(legacy.router, prefix="/api/v1", tags=["legacy"])
app.include_router(legacy.root_router, prefix="/api", tags=["legacy"])

_media_mount_path = "/" + settings.django_media_url.strip("/")
os.makedirs(media_root(), exist_ok=True)
app.mount(_media_mount_path, StaticFiles(directory=media_root()), name="media")
