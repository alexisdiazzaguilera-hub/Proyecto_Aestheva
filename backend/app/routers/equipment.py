from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_with_role, require_admin
from app.models.equipment import Equipment

router = APIRouter(prefix="/equipment", tags=["equipment"], dependencies=[Depends(require_admin)])


class EquipmentOut(BaseModel):
    id: UUID
    name: str
    internal_key: str | None
    acquisition_cost: Decimal
    useful_life_months: int
    monthly_sessions_default: int
    is_active: bool

    class Config:
        from_attributes = True


class EquipmentCreate(BaseModel):
    name: str
    internal_key: str | None = None
    acquisition_cost: Decimal = Decimal("0")
    useful_life_months: int = 24
    monthly_sessions_default: int = 30


@router.get("/", response_model=list[EquipmentOut])
async def list_equipment(db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Equipment).where(Equipment.is_active == True).order_by(Equipment.name))
    return result.scalars().all()


@router.post("/", response_model=EquipmentOut)
async def create_equipment(body: EquipmentCreate, db: AsyncSession = Depends(get_db_with_role)):
    eq = Equipment(**body.model_dump())
    db.add(eq)
    await db.commit()
    await db.refresh(eq)
    return eq
