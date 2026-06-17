"""Fase 2: products, staff, service_recipes, config_params

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── staff ──────────────────────────────────────────────────────────────────
    op.create_table(
        "staff",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("area", sa.String),
        sa.Column("commission_type", sa.String),   # pct | fixed
        sa.Column("commission_value", sa.Numeric(10, 4)),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("area IN ('estetico','cosmiatra','nutricion')", name="staff_area_check"),
        sa.CheckConstraint("commission_type IN ('pct','fixed')", name="staff_commission_type_check"),
    )

    # ── products ───────────────────────────────────────────────────────────────
    op.create_table(
        "products",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("category", sa.String, nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), server_default="0"),
        sa.Column("sale_price", sa.Numeric(14, 2), server_default="0"),
        sa.Column("unit_of_measure", sa.String, server_default="'pieza'"),
        sa.Column("stock_quantity", sa.Numeric(12, 3), server_default="0"),
        sa.Column("stock_min", sa.Numeric(12, 3), server_default="0"),
        sa.Column("yield_per_unit", sa.Integer, server_default="1"),
        sa.Column("notes", sa.Text),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint(
            "category IN ('cosmetico','mestetica','farmaco','suplemento','desechable','reventa')",
            name="products_category_check",
        ),
    )

    # RLS en products (admin only para ver costos)
    op.execute("ALTER TABLE products ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY admin_full_access ON products
        USING (current_setting('app.current_role', true) = 'administrador')
    """)

    # ── service_recipes ────────────────────────────────────────────────────────
    op.create_table(
        "service_recipes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("service_id", UUID(as_uuid=True), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 4), server_default="1"),
        sa.UniqueConstraint("service_id", "product_id", name="uq_service_product"),
    )

    # ── config_params ──────────────────────────────────────────────────────────
    op.create_table(
        "config_params",
        sa.Column("key", sa.String, primary_key=True),
        sa.Column("value", sa.Numeric(14, 4)),
        sa.Column("description", sa.Text),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # Parámetros iniciales (sin valores asumidos — el admin los configura)
    op.execute("""
        INSERT INTO config_params (key, value, description) VALUES
        ('fixed_monthly_cost',    NULL, 'Costo fijo mensual total de la clínica'),
        ('depreciation_life_months', 24, 'Vida útil de equipos en meses'),
        ('pct_bank_card',         0.03, 'Comisión bancaria tarjeta simple (3%)'),
        ('pct_bank_msi',          0.09, 'Comisión bancaria 3 MSI (9%)'),
        ('pct_alloc_estetico',    0.40, 'Porcentaje de costo fijo asignado a Estético'),
        ('pct_alloc_cosmiatra',   0.35, 'Porcentaje de costo fijo asignado a Cosmiatra'),
        ('pct_alloc_nutricion',   0.25, 'Porcentaje de costo fijo asignado a Nutrición'),
        ('hours_month_estetico',  180,  'Horas disponibles al mes en Estético'),
        ('hours_month_cosmiatra', 360,  'Horas disponibles al mes en Cosmiatra (2 cabinas)'),
        ('hours_month_nutricion', 180,  'Horas disponibles al mes en Nutrición')
    """)

    # ── Vista admin de servicios actualizada con costo de receta ───────────────
    op.execute("DROP VIEW IF EXISTS v_services_admin")
    op.execute("""
        CREATE VIEW v_services_admin AS
        SELECT
            s.id, s.sku, s.name, s.area, s.sale_price, s.duration_min,
            s.variable_cost, s.equipment_id, s.is_active,
            COALESCE((
                SELECT SUM(
                    CASE WHEN p.yield_per_unit > 1
                         THEN (p.unit_cost / p.yield_per_unit) * sr.quantity
                         ELSE p.unit_cost * sr.quantity
                    END)
                FROM service_recipes sr
                JOIN products p ON p.id = sr.product_id
                WHERE sr.service_id = s.id
            ), 0) + s.variable_cost AS recipe_cost_total
        FROM services s
        WHERE s.is_active = true
    """)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_services_admin")
    op.execute("""
        CREATE VIEW v_services_admin AS
        SELECT id, sku, name, area, sale_price, duration_min, variable_cost, equipment_id, is_active
        FROM services WHERE is_active = true
    """)
    op.drop_table("service_recipes")
    op.drop_table("config_params")
    op.execute("DROP POLICY IF EXISTS admin_full_access ON products")
    op.execute("ALTER TABLE products DISABLE ROW LEVEL SECURITY")
    op.drop_table("products")
    op.drop_table("staff")
