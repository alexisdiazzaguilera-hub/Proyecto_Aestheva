from datetime import datetime, timezone

from sqlalchemy import DateTime, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConfigParam(Base):
    __tablename__ = "config_params"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[float | None] = mapped_column(Numeric(14, 4))
    description: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
