"""Fase 5: appointments, service_staff_commissions, CRM fields, floor_price

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── clients: campos CRM y contacto en texto plano ─────────────────────────
    op.add_column("clients", sa.Column("email", sa.String, nullable=True))
    op.add_column("clients", sa.Column("phone", sa.String, nullable=True))
    op.add_column("clients", sa.Column("lead_source", sa.String, nullable=True))
    op.add_column("clients", sa.Column("initial_inquiry", sa.Text, nullable=True))
    op.add_column("clients", sa.Column("first_visit_date", sa.Date, nullable=True))
    op.create_check_constraint(
        "clients_lead_source_check",
        "clients",
        "lead_source IN ('instagram','facebook','google','referido','walk_in','otro')",
    )

    # ── services: precio piso para calculadora ────────────────────────────────
    op.add_column("services", sa.Column("floor_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("services", sa.Column("floor_price_notes", sa.Text, nullable=True))

    # ── service_staff_commissions: comisiones dinámicas por servicio+staff ────
    op.create_table(
        "service_staff_commissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("service_id", UUID(as_uuid=True), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False),
        sa.Column("commission_type", sa.String, nullable=False),
        sa.Column("commission_value", sa.Numeric(10, 4), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint("commission_type IN ('pct','fixed')", name="ssc_commission_type_check"),
        sa.UniqueConstraint("service_id", "staff_id", name="uq_service_staff"),
    )

    # ── appointments ──────────────────────────────────────────────────────────
    op.create_table(
        "appointments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_min", sa.Integer, server_default="60"),
        sa.Column("status", sa.String, nullable=False, server_default="agendada"),
        sa.Column("notes", sa.Text, nullable=True),
        # Bloque financiero (puede estar vacío al crear)
        sa.Column("final_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("payment_method", sa.String, nullable=True),
        sa.Column("commission_override_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("commission_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("supply_cost_est", sa.Numeric(14, 2), server_default="0"),
        sa.Column("financial_complete", sa.Boolean, server_default="false"),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('agendada','confirmada','en_proceso','completada','cancelada')",
            name="appointments_status_check",
        ),
        sa.CheckConstraint(
            "payment_method IN ('efectivo','tarjeta','msi') OR payment_method IS NULL",
            name="appointments_payment_method_check",
        ),
    )

    # ── appointment_services: N servicios por cita ───────────────────────────
    op.create_table(
        "appointment_services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("appointment_id", UUID(as_uuid=True), sa.ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_id", UUID(as_uuid=True), sa.ForeignKey("services.id", ondelete="SET NULL"), nullable=True),
        sa.Column("service_name_snapshot", sa.String, nullable=False),
        sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="SET NULL"), nullable=True),
        sa.Column("staff_name_snapshot", sa.String, nullable=True),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("commission_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("commission_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("supply_cost_est", sa.Numeric(14, 2), server_default="0"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("appointment_services")
    op.drop_table("appointments")
    op.drop_table("service_staff_commissions")
    op.drop_column("services", "floor_price_notes")
    op.drop_column("services", "floor_price")
    op.drop_constraint("clients_lead_source_check", "clients", type_="check")
    op.drop_column("clients", "first_visit_date")
    op.drop_column("clients", "initial_inquiry")
    op.drop_column("clients", "lead_source")
    op.drop_column("clients", "phone")
    op.drop_column("clients", "email")
