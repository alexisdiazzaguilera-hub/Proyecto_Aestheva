import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    internal_key: Mapped[str | None] = mapped_column(String, unique=True)  # hydra, radio, bio, preso
    acquisition_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    useful_life_months: Mapped[int] = mapped_column(Integer, default=24)
    monthly_sessions_default: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    services: Mapped[list["Service"]] = relationship("Service", back_populates="equipment")
