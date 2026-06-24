import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    status: Mapped[str] = mapped_column(String, default="agendada")
    notes: Mapped[str | None] = mapped_column(Text)

    # Bloque financiero — todos nullable hasta que recepción/admin los complete
    final_price: Mapped[float | None] = mapped_column(Numeric(14, 2))
    payment_method: Mapped[str | None] = mapped_column(String)
    commission_override_pct: Mapped[float | None] = mapped_column(Numeric(5, 4))
    commission_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    supply_cost_est: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    financial_complete: Mapped[bool] = mapped_column(Boolean, default=False)

    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    client: Mapped["Client"] = relationship("Client", back_populates="appointments")
    services: Mapped[list["AppointmentService"]] = relationship("AppointmentService", back_populates="appointment", cascade="all, delete-orphan", order_by="AppointmentService.sort_order")
    approver: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by])
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])


class AppointmentService(Base):
    __tablename__ = "appointment_services"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id", ondelete="SET NULL"))
    service_name_snapshot: Mapped[str] = mapped_column(String, nullable=False)
    staff_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("staff.id", ondelete="SET NULL"))
    staff_name_snapshot: Mapped[str | None] = mapped_column(String)
    unit_price: Mapped[float | None] = mapped_column(Numeric(14, 2))
    commission_pct: Mapped[float | None] = mapped_column(Numeric(5, 4))
    commission_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    supply_cost_est: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="services")
    service: Mapped["Service | None"] = relationship("Service")
    staff: Mapped["Staff | None"] = relationship("Staff")
