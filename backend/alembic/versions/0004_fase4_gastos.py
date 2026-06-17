"""Fase 4: expenses

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_id", UUID(as_uuid=True), sa.ForeignKey("periods.id"), nullable=False),
        sa.Column("expense_date", sa.Date, nullable=False),
        sa.Column("concept", sa.String, nullable=False),
        sa.Column("category", sa.String, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint(
            "category IN ('renta','nomina','marketing','prestamo','insumos','contabilidad','equipo','servicios','otros')",
            name="expenses_category_check",
        ),
    )
    op.execute("ALTER TABLE expenses ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY admin_only ON expenses
        USING (current_setting('app.current_role', true) = 'administrador')
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS admin_only ON expenses")
    op.execute("ALTER TABLE expenses DISABLE ROW LEVEL SECURITY")
    op.drop_table("expenses")
