from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


# Lo que ve la recepcionista
class ServicePublic(BaseModel):
    id: UUID
    sku: str
    name: str
    area: str
    duration_min: int
    floor_price: Decimal | None = None  # precio piso visible como referencia

    class Config:
        from_attributes = True


# Lo que ve el administrador
class ServiceAdmin(BaseModel):
    id: UUID
    sku: str
    name: str
    area: str
    sale_price: Decimal
    duration_min: int
    variable_cost: Decimal
    equipment_id: UUID | None
    floor_price: Decimal | None = None
    floor_price_notes: str | None = None
    is_active: bool

    class Config:
        from_attributes = True


class ServiceCreate(BaseModel):
    name: str
    area: str
    sale_price: Decimal = Decimal("0")
    duration_min: int = 60
    equipment_id: UUID | None = None
    variable_cost: Decimal = Decimal("0")


class ServiceUpdate(BaseModel):
    name: str | None = None
    area: str | None = None
    sale_price: Decimal | None = None
    duration_min: int | None = None
    equipment_id: UUID | None = None
    variable_cost: Decimal | None = None
    floor_price: Decimal | None = None
    floor_price_notes: str | None = None
    is_active: bool | None = None
