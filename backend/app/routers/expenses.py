from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_with_role, require_admin
from app.models.expense import Expense
from app.models.period import Period
from app.models.user import User

router = APIRouter(prefix="/expenses", tags=["expenses"], dependencies=[Depends(require_admin)])

CATEGORIAS = ("renta", "nomina", "marketing", "prestamo", "insumos", "contabilidad", "equipo", "servicios", "otros")


class ExpenseOut(BaseModel):
    id: UUID
    period_id: UUID
    expense_date: date
    concept: str
    category: str
    amount: Decimal

    class Config:
        from_attributes = True


class ExpenseCreate(BaseModel):
    period_id: UUID
    expense_date: date
    concept: str
    category: str
    amount: Decimal


class ExpenseUpdate(BaseModel):
    expense_date: date | None = None
    concept: str | None = None
    category: str | None = None
    amount: Decimal | None = None


@router.get("/", response_model=list[ExpenseOut])
async def list_expenses(
    period_id: str | None = None,
    db: AsyncSession = Depends(get_db_with_role),
):
    query = select(Expense).order_by(Expense.expense_date.desc())
    if period_id:
        query = query.where(Expense.period_id == period_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=ExpenseOut)
async def create_expense(
    body: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    # Verificar período no cerrado
    res = await db.execute(select(Period).where(Period.id == body.period_id))
    period = res.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")
    if period.is_closed:
        raise HTTPException(status_code=400, detail="El período está cerrado")

    expense = Expense(**body.model_dump(), created_by=current_user.id)
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.delete("/{expense_id}")
async def delete_expense(expense_id: str, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    await db.delete(expense)
    await db.commit()
    return {"ok": True}
