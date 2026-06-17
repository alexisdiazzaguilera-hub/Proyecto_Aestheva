from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class ProductOut(BaseModel):
    id: UUID
    name: str
    category: str
    unit_cost: Decimal
    sale_price: Decimal
    unit_of_measure: str
    stock_quantity: Decimal
    stock_min: Decimal
    yield_per_unit: int
    notes: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str
    category: str
    unit_cost: Decimal = Decimal("0")
    sale_price: Decimal = Decimal("0")
    unit_of_measure: str = "pieza"
    stock_quantity: Decimal = Decimal("0")
    stock_min: Decimal = Decimal("0")
    yield_per_unit: int = 1
    notes: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    unit_cost: Decimal | None = None
    sale_price: Decimal | None = None
    unit_of_measure: str | None = None
    stock_quantity: Decimal | None = None
    stock_min: Decimal | None = None
    yield_per_unit: int | None = None
    notes: str | None = None
    is_active: bool | None = None
