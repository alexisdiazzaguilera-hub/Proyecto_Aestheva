from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class RecipeLineOut(BaseModel):
    id: UUID
    product_id: UUID
    product_name: str
    quantity: Decimal
    unit_of_measure: str
    unit_cost: Decimal
    yield_per_unit: int
    cost_per_application: Decimal
    line_cost: Decimal

    class Config:
        from_attributes = True


class RecipeLineIn(BaseModel):
    product_id: UUID
    quantity: Decimal


class RecipeUpdate(BaseModel):
    lines: list[RecipeLineIn]
