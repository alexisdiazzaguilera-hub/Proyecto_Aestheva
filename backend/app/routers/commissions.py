from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_with_role, require_admin
from app.models.service_staff_commission import ServiceStaffCommission
from app.models.service import Service
from app.models.staff import Staff
from app.models.user import User

router = APIRouter(prefix="/commissions", tags=["commissions"])


class CommissionIn(BaseModel):
    service_id: UUID
    staff_id: UUID
    commission_type: Literal["pct", "fixed"]
    commission_value: Decimal


class CommissionOut(BaseModel):
    id: UUID
    service_id: UUID
    service_name: str
    staff_id: UUID
    staff_name: str
    commission_type: str
    commission_value: Decimal
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/", response_model=list[CommissionOut], dependencies=[Depends(get_current_user)])
async def list_commissions(
    service_id: UUID | None = None,
    staff_id: UUID | None = None,
    db: AsyncSession = Depends(get_db_with_role),
):
    query = (
        select(ServiceStaffCommission)
        .where(ServiceStaffCommission.is_active == True)
        .order_by(ServiceStaffCommission.created_at)
    )
    if service_id:
        query = query.where(ServiceStaffCommission.service_id == service_id)
    if staff_id:
        query = query.where(ServiceStaffCommission.staff_id == staff_id)

    result = await db.execute(query)
    rows = result.scalars().all()

    out = []
    for row in rows:
        svc = await db.get(Service, row.service_id)
        staff = await db.get(Staff, row.staff_id)
        out.append(CommissionOut(
            id=row.id,
            service_id=row.service_id,
            service_name=svc.name if svc else "—",
            staff_id=row.staff_id,
            staff_name=staff.name if staff else "—",
            commission_type=row.commission_type,
            commission_value=Decimal(str(row.commission_value)),
            is_active=row.is_active,
        ))
    return out


@router.post("/", response_model=CommissionOut, dependencies=[Depends(require_admin)])
async def upsert_commission(body: CommissionIn, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(
        select(ServiceStaffCommission).where(
            ServiceStaffCommission.service_id == body.service_id,
            ServiceStaffCommission.staff_id == body.staff_id,
        )
    )
    row = result.scalar_one_or_none()

    if row:
        row.commission_type = body.commission_type
        row.commission_value = body.commission_value
        row.is_active = True
    else:
        row = ServiceStaffCommission(**body.model_dump())
        db.add(row)

    await db.commit()
    await db.refresh(row)

    svc = await db.get(Service, row.service_id)
    staff = await db.get(Staff, row.staff_id)

    return CommissionOut(
        id=row.id,
        service_id=row.service_id,
        service_name=svc.name if svc else "—",
        staff_id=row.staff_id,
        staff_name=staff.name if staff else "—",
        commission_type=row.commission_type,
        commission_value=Decimal(str(row.commission_value)),
        is_active=row.is_active,
    )


@router.delete("/{commission_id}", dependencies=[Depends(require_admin)])
async def deactivate_commission(commission_id: UUID, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(ServiceStaffCommission).where(ServiceStaffCommission.id == commission_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Comisión no encontrada")
    row.is_active = False
    await db.commit()
    return {"ok": True}
