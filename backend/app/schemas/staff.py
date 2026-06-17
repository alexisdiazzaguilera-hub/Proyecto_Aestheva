from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class StaffOut(BaseModel):
    id: UUID
    name: str
    area: str | None
    commission_type: str | None
    commission_value: Decimal | None
    is_active: bool

    class Config:
        from_attributes = True


class StaffCreate(BaseModel):
    name: str
    area: str | None = None
    commission_type: str | None = None
    commission_value: Decimal | None = None


class StaffUpdate(BaseModel):
    name: str | None = None
    area: str | None = None
    commission_type: str | None = None
    commission_value: Decimal | None = None
    is_active: bool | None = None
