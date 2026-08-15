"""CourseSyllabus: OnlineTest yo'nalish kodi (DI, TPI, PI, …)

Revision ID: d4e8a91c6b20
Revises: c8d5f21b3a44
Create Date: 2026-08-15

Fan katalogi: Kafedra → Yo'nalish → Fan. Yo'nalishlar OnlineTestda
yashaydi; iMentor faqat kodni (Direction.name) fanga yozadi.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e8a91c6b20"
down_revision: Union[str, None] = "c8d5f21b3a44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "core_coursesyllabus",
        sa.Column(
            "direction_code",
            sa.String(length=32),
            nullable=False,
            server_default="",
        ),
    )
    op.create_index(
        "core_coursesyllabus_dept_direction_idx",
        "core_coursesyllabus",
        ["department_id", "direction_code"],
    )


def downgrade() -> None:
    op.drop_index("core_coursesyllabus_dept_direction_idx", table_name="core_coursesyllabus")
    op.drop_column("core_coursesyllabus", "direction_code")
