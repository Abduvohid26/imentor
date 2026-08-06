"""staffprofile.department_id → academic department

Revision ID: b7c4e91a2f10
Revises: 853f673227d8
Create Date: 2026-08-06 15:20:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c4e91a2f10"
down_revision: Union[str, None] = "853f673227d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "core_staffprofile",
        sa.Column("department_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "core_staffprofile_department_id_fkey",
        "core_staffprofile",
        "core_academicdepartment",
        ["department_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "core_staffprofile_department_id_idx",
        "core_staffprofile",
        ["department_id"],
    )


def downgrade() -> None:
    op.drop_index("core_staffprofile_department_id_idx", table_name="core_staffprofile")
    op.drop_constraint("core_staffprofile_department_id_fkey", "core_staffprofile", type_="foreignkey")
    op.drop_column("core_staffprofile", "department_id")
