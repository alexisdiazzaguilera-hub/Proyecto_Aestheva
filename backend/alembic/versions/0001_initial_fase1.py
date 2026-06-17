"""Fase 1: users, equipment, services + RLS + vistas

Revision ID: 0001
Revises:
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("display_name", sa.String, nullable=False),
        sa.Column("password_hash", sa.String, nullable=False),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('administrador', 'recepcionista')", name="users_role_check"),
    )

    # ── equipment ──────────────────────────────────────────────────────────────
    op.create_table(
        "equipment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("internal_key", sa.String, unique=True),
        sa.Column("acquisition_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("useful_life_months", sa.Integer, server_default="24"),
        sa.Column("monthly_sessions_default", sa.Integer, server_default="30"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ── services ───────────────────────────────────────────────────────────────
    op.create_table(
        "services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sku", sa.String, nullable=False, unique=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("area", sa.String, nullable=False),
        sa.Column("sale_price", sa.Numeric(14, 2), server_default="0"),
        sa.Column("duration_min", sa.Integer, server_default="60"),
        sa.Column("equipment_id", UUID(as_uuid=True), sa.ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variable_cost", sa.Numeric(14, 2), server_default="0"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("area IN ('cosmiatra', 'estetico', 'nutricion')", name="services_area_check"),
    )

    # ── RLS ────────────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE services ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY admin_full_access ON services
        USING (current_setting('app.current_role', true) = 'administrador')
    """)

    # ── Vista pública (recepcionista) ──────────────────────────────────────────
    op.execute("""
        CREATE VIEW v_services_public AS
        SELECT id, sku, name, area, duration_min
        FROM services
        WHERE is_active = true
    """)

    # ── Vista admin (con precio y costo) ───────────────────────────────────────
    op.execute("""
        CREATE VIEW v_services_admin AS
        SELECT id, sku, name, area, sale_price, duration_min, variable_cost, equipment_id, is_active
        FROM services
        WHERE is_active = true
    """)

    # ── Usuario admin inicial (contraseña: cambiar_en_primer_login) ────────────
    # hash bcrypt de "aestheva_admin_2026"
    op.execute("""
        INSERT INTO users (email, display_name, password_hash, role)
        VALUES (
            'admin@aestheva.mx',
            'Administrador',
            '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewpyUr6HCQM5f7Aq',
            'administrador'
        )
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_services_admin")
    op.execute("DROP VIEW IF EXISTS v_services_public")
    op.execute("DROP POLICY IF EXISTS admin_full_access ON services")
    op.execute("ALTER TABLE services DISABLE ROW LEVEL SECURITY")
    op.drop_table("services")
    op.drop_table("equipment")
    op.drop_table("users")
