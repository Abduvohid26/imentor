"""baseline: existing django-managed schema (no-op, stamp-only)

Revision ID: 853f673227d8
Revises: 
Create Date: 2026-08-03 05:30:00.231574

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '853f673227d8'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ataylab bo'sh: bu sxema Django migratsiyalari orqali allaqachon
    # mavjud. `alembic stamp head` bilan belgilanadi (real DDL ishlatilmaydi) —
    # `--autogenerate` Django'ning BigAutoField/indekslarini SQLAlchemy
    # modellari bilan solishtirib, ularni noto'g'ri "olib tashlash/o'zgartirish"
    # sifatida ko'rsatgani uchun (BIGINT->Integer, yo'q indekslar va h.k.).
    # Shu sababli bu fayl faqat "boshlang'ich nuqta" belgisi, DDL bajarmaydi.
    pass


def downgrade() -> None:
    pass
