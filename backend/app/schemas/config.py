from decimal import Decimal

from pydantic import BaseModel


class ConfigParamOut(BaseModel):
    key: str
    value: Decimal | None
    description: str | None

    class Config:
        from_attributes = True


class ConfigParamUpdate(BaseModel):
    value: Decimal | None
