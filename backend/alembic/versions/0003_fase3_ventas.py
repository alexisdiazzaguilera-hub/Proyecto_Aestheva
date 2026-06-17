"""Fase 3: clients, client_tokens, periods, sales

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── clients (PII — acceso solo admin) ─────────────────────────────────────
    op.create_table(
        "clients",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("full_name", sa.String, nullable=False),
        sa.Column("phone_hash", sa.String),           # SHA-256(phone) para dedup sin exponer número
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.execute("ALTER TABLE clients ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY admin_only ON clients
        USING (current_setting('app.current_role', true) = 'administrador')
    """)

    # ── client_tokens (pseudónimos seguros para marketing) ────────────────────
    op.create_table(
        "client_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String, nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── periods (meses de operación) ──────────────────────────────────────────
    op.create_table(
        "periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_month", sa.Date, nullable=False, unique=True),  # primer día del mes
        sa.Column("is_closed", sa.Boolean, server_default="false"),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("closed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # ── sales ─────────────────────────────────────────────────────────────────
    op.create_table(
        "sales",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("period_id", UUID(as_uuid=True), sa.ForeignKey("periods.id"), nullable=False),
        sa.Column("service_id", UUID(as_uuid=True), sa.ForeignKey("services.id", ondelete="SET NULL"), nullable=True),
        sa.Column("service_name_snapshot", sa.String, nullable=False),  # nombre en el momento de la venta
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_token_id", UUID(as_uuid=True), sa.ForeignKey("client_tokens.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sale_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("payment_method", sa.String, nullable=False),  # efectivo | tarjeta | msi
        sa.Column("promo_tag", sa.String),
        sa.Column("supply_cost_est", sa.Numeric(14, 2), server_default="0"),
        sa.Column("sale_date", sa.Date),
        sa.Column("notes", sa.Text),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("payment_method IN ('efectivo','tarjeta','msi')", name="sales_payment_check"),
    )

    # RLS en sales: ambos roles pueden leer, pero supply_cost_est solo lo ve admin (via endpoint)
    op.execute("ALTER TABLE sales ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY all_roles_read_write ON sales
        USING (true)
        WITH CHECK (true)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS all_roles_read_write ON sales")
    op.execute("ALTER TABLE sales DISABLE ROW LEVEL SECURITY")
    op.drop_table("sales")
    op.drop_table("periods")
    op.drop_table("client_tokens")
    op.execute("DROP POLICY IF EXISTS admin_only ON clients")
    op.execute("ALTER TABLE clients DISABLE ROW LEVEL SECURITY")
    op.drop_table("clients")
