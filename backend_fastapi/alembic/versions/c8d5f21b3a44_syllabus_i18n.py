"""CourseSyllabus: nom va mavzular tarjimasi (name_i18n, topics_i18n)

Revision ID: c8d5f21b3a44
Revises: a1c2e3f4b5d6
Create Date: 2026-08-09

Mavzu va fan nomlari interfeys tiliga moslashi uchun tarjimalar shu yerda
saqlanadi. ASL nom `subject_name` / `variants[].topics[].title` da
o'zgarishsiz qoladi — u kalit sifatida va AI promptlarida ishlatiladi.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c8d5f21b3a44"
down_revision: Union[str, None] = "a1c2e3f4b5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "core_coursesyllabus",
        sa.Column(
            "name_i18n",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "core_coursesyllabus",
        sa.Column(
            "topics_i18n",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("core_coursesyllabus", "topics_i18n")
    op.drop_column("core_coursesyllabus", "name_i18n")
