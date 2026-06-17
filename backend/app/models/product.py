import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    sale_price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    unit_of_measure: Mapped[str] = mapped_column(String, default="pieza")
    stock_quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    stock_min: Mapped[float] = mapped_column(Numeric(12, 3), default=0)
    yield_per_unit: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    recipe_lines: Mapped[list["ServiceRecipe"]] = relationship("ServiceRecipe", back_populates="product")
