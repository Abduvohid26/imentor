"""livetestsession.subject_code — fan kesimida natijalar/statistika

Revision ID: a1c2e3f4b5d6
Revises: b7c4e91a2f10
Create Date: 2026-08-07 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1c2e3f4b5d6"
down_revision: Union[str, None] = "b7c4e91a2f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "core_livetestsession",
        sa.Column("subject_code", sa.String(length=200), nullable=False, server_default=""),
    )
    op.create_index(
        "core_livetestsession_subject_code_idx",
        "core_livetestsession",
        ["subject_code"],
    )


def downgrade() -> None:
    op.drop_index("core_livetestsession_subject_code_idx", table_name="core_livetestsession")
    op.drop_column("core_livetestsession", "subject_code")
