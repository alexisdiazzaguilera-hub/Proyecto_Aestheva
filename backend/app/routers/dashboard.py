from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_with_role, require_admin
from app.models.appointment import Appointment, AppointmentService
from app.models.config_param import ConfigParam
from app.models.equipment import Equipment
from app.models.expense import Expense
from app.models.period import Period
from app.models.product import Product
from app.models.sale import Sale
from app.models.service import Service
from app.models.staff import Staff

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


class DepreciationRow(BaseModel):
    id: str
    name: str
    acquisition_cost: Decimal
    useful_life_months: int
    monthly_sessions_default: int
    monthly_depreciation: Decimal
    cost_per_session: Decimal
    months_elapsed: int | None
    accumulated_depreciation: Decimal | None
    remaining_value: Decimal | None


class BreakevenResult(BaseModel):
    fixed_monthly_cost: Decimal | None
    avg_variable_cost_pct: Decimal
    contribution_margin_pct: Decimal
    breakeven_revenue: Decimal | None
    breakeven_visits: Decimal | None
    avg_ticket: Decimal | None


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


@router.get("/depreciation", response_model=list[DepreciationRow])
async def get_depreciation(db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Equipment).where(Equipment.is_active == True).order_by(Equipment.name))
    equipments = result.scalars().all()
    today = date.today()
    rows = []
    for eq in equipments:
        cost = Decimal(str(eq.acquisition_cost))
        life = eq.useful_life_months or 1
        sessions = eq.monthly_sessions_default or 1
        monthly_dep = cost / life
        cost_per_session = monthly_dep / sessions

        created_month = eq.created_at.date().replace(day=1)
        months_elapsed = (today.year - created_month.year) * 12 + (today.month - created_month.month)
        months_elapsed = min(months_elapsed, life)
        accumulated = monthly_dep * months_elapsed
        remaining = cost - accumulated

        rows.append(DepreciationRow(
            id=str(eq.id), name=eq.name,
            acquisition_cost=cost, useful_life_months=life,
            monthly_sessions_default=sessions,
            monthly_depreciation=monthly_dep.quantize(Decimal("0.01")),
            cost_per_session=cost_per_session.quantize(Decimal("0.01")),
            months_elapsed=months_elapsed,
            accumulated_depreciation=accumulated.quantize(Decimal("0.01")),
            remaining_value=max(Decimal("0"), remaining).quantize(Decimal("0.01")),
        ))
    return rows


@router.get("/breakeven", response_model=BreakevenResult)
async def get_breakeven(period_id: str | None = None, db: AsyncSession = Depends(get_db_with_role)):
    cfg = await _get_config(db)
    fixed = cfg.get("fixed_monthly_cost")

    query = select(Sale)
    if period_id:
        query = query.where(Sale.period_id == period_id)
    sales_res = await db.execute(query)
    sales = sales_res.scalars().all()

    if not sales:
        return BreakevenResult(
            fixed_monthly_cost=fixed,
            avg_variable_cost_pct=Decimal("0"),
            contribution_margin_pct=Decimal("100"),
            breakeven_revenue=fixed,
            breakeven_visits=None,
            avg_ticket=None,
        )

    total_sales = sum(Decimal(str(s.sale_price)) for s in sales)
    total_supply = sum(Decimal(str(s.supply_cost_est)) for s in sales)
    total_fees = sum(_bank_fee(Decimal(str(s.sale_price)), s.payment_method) for s in sales)
    total_variable = total_supply + total_fees

    avg_var_pct = (total_variable / total_sales * 100) if total_sales > 0 else Decimal("0")
    contribution_pct = Decimal("100") - avg_var_pct
    avg_ticket = total_sales / len(sales)

    if fixed is not None and contribution_pct > 0:
        breakeven_rev = fixed / (contribution_pct / 100)
        breakeven_visits = breakeven_rev / avg_ticket if avg_ticket > 0 else None
    else:
        breakeven_rev = None
        breakeven_visits = None

    return BreakevenResult(
        fixed_monthly_cost=fixed,
        avg_variable_cost_pct=avg_var_pct.quantize(Decimal("0.01")),
        contribution_margin_pct=contribution_pct.quantize(Decimal("0.01")),
        breakeven_revenue=breakeven_rev.quantize(Decimal("0.01")) if breakeven_rev else None,
        breakeven_visits=breakeven_visits.quantize(Decimal("0.1")) if breakeven_visits else None,
        avg_ticket=avg_ticket.quantize(Decimal("0.01")),
    )


@router.get("/staff-performance")
async def get_staff_performance(period_id: str, db: AsyncSession = Depends(get_db_with_role)):
    """Ingresos, comisión y margen neto por profesional para el período dado."""
    res = await db.execute(select(Period).where(Period.id == period_id))
    period = res.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    # Rango del mes
    start = period.period_month
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    # Líneas de servicio completadas con staff asignado dentro del período
    lines_res = await db.execute(
        select(AppointmentService)
        .join(Appointment, Appointment.id == AppointmentService.appointment_id)
        .where(
            Appointment.status == "completada",
            Appointment.scheduled_at >= start,
            Appointment.scheduled_at < end,
            AppointmentService.staff_id.isnot(None),
        )
    )
    lines = lines_res.scalars().all()

    # Agregar por staff
    staff_map: dict[str, dict] = {}
    for line in lines:
        sid = str(line.staff_id)
        if sid not in staff_map:
            staff_res = await db.get(Staff, line.staff_id)
            staff_map[sid] = {
                "staff_id": sid,
                "staff_name": staff_res.name if staff_res else "—",
                "service_count": 0,
                "total_revenue": Decimal("0"),
                "total_commission": Decimal("0"),
            }
        entry = staff_map[sid]
        entry["service_count"] += 1
        entry["total_revenue"] += Decimal(str(line.unit_price or 0))
        entry["total_commission"] += Decimal(str(line.commission_amount or 0))

    rows = []
    for entry in staff_map.values():
        revenue = entry["total_revenue"]
        commission = entry["total_commission"]
        net = revenue - commission
        net_pct = (net / revenue * 100).quantize(Decimal("0.1")) if revenue > 0 else Decimal("0")
        rows.append({
            **entry,
            "total_revenue": revenue.quantize(Decimal("0.01")),
            "total_commission": commission.quantize(Decimal("0.01")),
            "net_margin": net.quantize(Decimal("0.01")),
            "net_margin_pct": net_pct,
        })

    # Ordenar por ingresos desc
    rows.sort(key=lambda r: r["total_revenue"], reverse=True)
    return rows


@router.get("/area-performance")
async def get_area_performance(period_id: str, db: AsyncSession = Depends(get_db_with_role)):
    """Ingresos por área de la clínica para el período dado."""
    res = await db.execute(select(Period).where(Period.id == period_id))
    period = res.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    start = period.period_month
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    lines_res = await db.execute(
        select(AppointmentService)
        .join(Appointment, Appointment.id == AppointmentService.appointment_id)
        .where(
            Appointment.status == "completada",
            Appointment.scheduled_at >= start,
            Appointment.scheduled_at < end,
            AppointmentService.service_id.isnot(None),
        )
    )
    lines = lines_res.scalars().all()

    area_map: dict[str, dict] = {}
    for line in lines:
        svc = await db.get(Service, line.service_id)
        area = svc.area if svc else "otro"
        if area not in area_map:
            area_map[area] = {"area": area, "service_count": 0, "total_revenue": Decimal("0")}
        area_map[area]["service_count"] += 1
        area_map[area]["total_revenue"] += Decimal(str(line.unit_price or 0))

    total = sum(e["total_revenue"] for e in area_map.values())
    rows = []
    for entry in area_map.values():
        rev = entry["total_revenue"]
        rows.append({
            **entry,
            "total_revenue": rev.quantize(Decimal("0.01")),
            "revenue_pct": (rev / total * 100).quantize(Decimal("0.1")) if total > 0 else Decimal("0"),
        })

    rows.sort(key=lambda r: r["total_revenue"], reverse=True)
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
