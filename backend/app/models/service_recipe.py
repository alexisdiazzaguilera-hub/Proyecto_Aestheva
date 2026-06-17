import uuid

from sqlalchemy import ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ServiceRecipe(Base):
    __tablename__ = "service_recipes"
    __table_args__ = (UniqueConstraint("service_id", "product_id", name="uq_service_product"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 4), default=1)

    product: Mapped["Product"] = relationship("Product", back_populates="recipe_lines")
    service: Mapped["Service"] = relationship("Service", back_populates="recipe_lines")
