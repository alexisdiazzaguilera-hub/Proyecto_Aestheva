from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_with_role, require_admin
from app.models.staff import Staff
from app.models.user import User
from app.schemas.staff import StaffCreate, StaffOut, StaffUpdate

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("/", response_model=list[StaffOut])
async def list_staff(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(select(Staff).where(Staff.is_active == True).order_by(Staff.name))
    return result.scalars().all()


@router.post("/", response_model=StaffOut, dependencies=[Depends(require_admin)])
async def create_staff(body: StaffCreate, db: AsyncSession = Depends(get_db_with_role)):
    member = Staff(**body.model_dump())
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.put("/{staff_id}", response_model=StaffOut, dependencies=[Depends(require_admin)])
async def update_staff(staff_id: str, body: StaffUpdate, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Colaborador no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{staff_id}", dependencies=[Depends(require_admin)])
async def deactivate_staff(staff_id: str, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Colaborador no encontrado")
    member.is_active = False
    await db.commit()
    return {"ok": True}
