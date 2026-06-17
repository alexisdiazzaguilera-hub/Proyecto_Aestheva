from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_with_role, require_admin
from app.models.config_param import ConfigParam
from app.models.expense import Expense
from app.models.period import Period
from app.models.product import Product
from app.models.sale import Sale

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_admin)])


# ── helpers ────────────────────────────────────────────────────────────────────

async def _get_config(db: AsyncSession) -> dict:
    result = await db.execute(select(ConfigParam))
    return {p.key: (Decimal(str(p.value)) if p.value is not None else None) for p in result.scalars().all()}


def _bank_fee(price: Decimal, method: str) -> Decimal:
    rates = {"efectivo": Decimal("0"), "tarjeta": Decimal("0.03"), "msi": Decimal("0.09")}
    return price * rates.get(method, Decimal("0"))


# ── schemas ────────────────────────────────────────────────────────────────────

class PeriodSummary(BaseModel):
    period_id: str
    period_month: date
    total_sales: Decimal
    total_supply_costs: Decimal
    total_bank_fees: Decimal
    gross_margin: Decimal
    gross_margin_pct: Decimal
    total_expenses: Decimal
    net_result: Decimal
    visit_count: int
    avg_ticket: Decimal
    fixed_cost_budget: Decimal | None
    deficit_vs_budget: Decimal | None


class AnnualRow(BaseModel):
    period_month: date
    total_sales: Decimal
    total_expenses: Decimal
    gross_margin: Decimal
    net_result: Decimal
    visit_count: int


class StockAlert(BaseModel):
    id: str
    name: str
    stock_quantity: Decimal
    stock_min: Decimal
    category: str


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=PeriodSummary)
async def get_summary(period_id: str, db: AsyncSession = Depends(get_db_with_role)):
    res = await db.execute(select(Period).where(Period.id == period_id))
    period = res.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    cfg = await _get_config(db)
    fixed_budget = cfg.get("fixed_monthly_cost")

    # Ventas
    sales_res = await db.execute(select(Sale).where(Sale.period_id == period_id))
    sales = sales_res.scalars().all()

    total_sales = sum(Decimal(str(s.sale_price)) for s in sales)
    total_supply = sum(Decimal(str(s.supply_cost_est)) for s in sales)
    total_fees = sum(_bank_fee(Decimal(str(s.sale_price)), s.payment_method) for s in sales)
    gross_margin = total_sales - total_supply - total_fees
    gross_margin_pct = (gross_margin / total_sales * 100) if total_sales > 0 else Decimal("0")
    visit_count = len(sales)
    avg_ticket = (total_sales / visit_count) if visit_count > 0 else Decimal("0")

    # Gastos
    exp_res = await db.execute(select(Expense).where(Expense.period_id == period_id))
    expenses = exp_res.scalars().all()
    total_expenses = sum(Decimal(str(e.amount)) for e in expenses)

    net_result = total_sales - total_expenses
    deficit = (total_sales - fixed_budget) if fixed_budget is not None else None

    return PeriodSummary(
        period_id=str(period.id),
        period_month=period.period_month,
        total_sales=total_sales,
        total_supply_costs=total_supply,
        total_bank_fees=total_fees,
        gross_margin=gross_margin,
        gross_margin_pct=gross_margin_pct,
        total_expenses=total_expenses,
        net_result=net_result,
        visit_count=visit_count,
        avg_ticket=avg_ticket,
        fixed_cost_budget=fixed_budget,
        deficit_vs_budget=deficit,
    )


@router.get("/annual", response_model=list[AnnualRow])
async def get_annual(db: AsyncSession = Depends(get_db_with_role)):
    periods_res = await db.execute(select(Period).order_by(Period.period_month))
    periods = periods_res.scalars().all()

    rows = []
    for p in periods:
        sales_res = await db.execute(select(Sale).where(Sale.period_id == p.id))
        sales = sales_res.scalars().all()
        total_sales = sum(Decimal(str(s.sale_price)) for s in sales)
        total_supply = sum(Decimal(str(s.supply_cost_est)) for s in sales)
        total_fees = sum(_bank_fee(Decimal(str(s.sale_price)), s.payment_method) for s in sales)
        gross_margin = total_sales - total_supply - total_fees

        exp_res = await db.execute(select(Expense).where(Expense.period_id == p.id))
        total_expenses = sum(Decimal(str(e.amount)) for e in exp_res.scalars().all())

        rows.append(AnnualRow(
            period_month=p.period_month,
            total_sales=total_sales,
            total_expenses=total_expenses,
            gross_margin=gross_margin,
            net_result=total_sales - total_expenses,
            visit_count=len(sales),
        ))

    return rows


@router.get("/stock-alerts", response_model=list[StockAlert])
async def get_stock_alerts(db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(
        select(Product).where(
            Product.is_active == True,
            Product.stock_quantity <= Product.stock_min,
        ).order_by(Product.stock_quantity)
    )
    products = result.scalars().all()
    return [StockAlert(id=str(p.id), name=p.name, stock_quantity=Decimal(str(p.stock_quantity)), stock_min=Decimal(str(p.stock_min)), category=p.category) for p in products]
