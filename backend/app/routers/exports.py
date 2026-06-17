import csv
import io
import json
from decimal import Decimal
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db_with_role, require_admin
from app.models.client import Client, ClientToken
from app.models.expense import Expense
from app.models.period import Period
from app.models.product import Product
from app.models.sale import Sale
from app.models.service import Service

router = APIRouter(prefix="/exports", tags=["exports"], dependencies=[Depends(require_admin)])


def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, date):
        return str(obj)
    raise TypeError


def _stream_csv(rows: list[dict], filename: str) -> StreamingResponse:
    if not rows:
        raise HTTPException(status_code=404, detail="Sin datos para exportar")
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}.csv"},
    )


def _stream_json(rows: list[dict], filename: str) -> StreamingResponse:
    content = json.dumps(rows, ensure_ascii=False, indent=2, default=_decimal_default)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}.json"},
    )


# ── Productos ──────────────────────────────────────────────────────────────────

@router.get("/products")
async def export_products(format: str = "json", db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Product).where(Product.is_active == True).order_by(Product.category, Product.name))
    products = result.scalars().all()
    rows = [{
        "id": str(p.id), "name": p.name, "category": p.category,
        "unit_cost": Decimal(str(p.unit_cost)), "sale_price": Decimal(str(p.sale_price)),
        "unit_of_measure": p.unit_of_measure, "stock_quantity": Decimal(str(p.stock_quantity)),
        "stock_min": Decimal(str(p.stock_min)), "yield_per_unit": p.yield_per_unit,
        "cost_per_application": Decimal(str(p.unit_cost)) / p.yield_per_unit if p.yield_per_unit > 1 else Decimal(str(p.unit_cost)),
        "notes": p.notes or "",
    } for p in products]
    return _stream_json(rows, "productos") if format == "json" else _stream_csv(rows, "productos")


# ── Servicios ──────────────────────────────────────────────────────────────────

@router.get("/services")
async def export_services(format: str = "json", db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Service).where(Service.is_active == True).order_by(Service.area, Service.name))
    services = result.scalars().all()
    rows = [{
        "id": str(s.id), "sku": s.sku, "name": s.name, "area": s.area,
        "sale_price": Decimal(str(s.sale_price)), "duration_min": s.duration_min,
        "variable_cost": Decimal(str(s.variable_cost)),
    } for s in services]
    return _stream_json(rows, "servicios") if format == "json" else _stream_csv(rows, "servicios")


# ── Ventas ─────────────────────────────────────────────────────────────────────

@router.get("/sales")
async def export_sales(
    period_id: str | None = None,
    format: str = "json",
    db: AsyncSession = Depends(get_db_with_role),
):
    query = (
        select(Sale)
        .options(
            selectinload(Sale.staff),
            selectinload(Sale.client_token).selectinload(ClientToken.client),
            selectinload(Sale.period),
        )
        .order_by(Sale.sale_date.desc())
    )
    if period_id:
        query = query.where(Sale.period_id == period_id)
    result = await db.execute(query)
    sales = result.scalars().all()

    def bank_fee(price, method):
        rates = {"efectivo": Decimal("0"), "tarjeta": Decimal("0.03"), "msi": Decimal("0.09")}
        return price * rates.get(method, Decimal("0"))

    rows = []
    for s in sales:
        price = Decimal(str(s.sale_price))
        supply = Decimal(str(s.supply_cost_est))
        fee = bank_fee(price, s.payment_method)
        margin = price - supply - fee
        rows.append({
            "id": str(s.id),
            "period_month": str(s.period.period_month) if s.period else "",
            "sale_date": str(s.sale_date) if s.sale_date else "",
            "service_name": s.service_name_snapshot,
            "staff_name": s.staff.name if s.staff else "",
            "client_name": s.client_token.client.full_name if s.client_token and s.client_token.client else "",
            "sale_price": price,
            "payment_method": s.payment_method,
            "promo_tag": s.promo_tag or "",
            "supply_cost_est": supply,
            "bank_fee": fee,
            "margin": margin,
            "margin_pct": round(float(margin / price * 100), 2) if price > 0 else 0,
            "notes": s.notes or "",
        })
    return _stream_json(rows, "ventas") if format == "json" else _stream_csv(rows, "ventas")


# ── Gastos ─────────────────────────────────────────────────────────────────────

@router.get("/expenses")
async def export_expenses(
    period_id: str | None = None,
    format: str = "json",
    db: AsyncSession = Depends(get_db_with_role),
):
    query = select(Expense).options(selectinload(Expense.period)).order_by(Expense.expense_date.desc())
    if period_id:
        query = query.where(Expense.period_id == period_id)
    result = await db.execute(query)
    expenses = result.scalars().all()
    rows = [{
        "id": str(e.id),
        "period_month": str(e.period.period_month) if e.period else "",
        "expense_date": str(e.expense_date),
        "concept": e.concept, "category": e.category,
        "amount": Decimal(str(e.amount)),
    } for e in expenses]
    return _stream_json(rows, "gastos") if format == "json" else _stream_csv(rows, "gastos")


# ── Marketing (pseudonimizado, sin PII) ────────────────────────────────────────

@router.get("/marketing")
async def export_marketing(
    period_id: str | None = None,
    format: str = "csv",
    db: AsyncSession = Depends(get_db_with_role),
):
    """Exporta tratamiento + token de cliente. Sin nombres reales. Seguro para agencias."""
    query = (
        select(Sale)
        .options(selectinload(Sale.client_token), selectinload(Sale.period))
        .order_by(Sale.sale_date)
    )
    if period_id:
        query = query.where(Sale.period_id == period_id)
    result = await db.execute(query)
    sales = result.scalars().all()
    rows = [{
        "period_month": str(s.period.period_month) if s.period else "",
        "sale_date": str(s.sale_date) if s.sale_date else "",
        "treatment": s.service_name_snapshot,
        "payment_method": s.payment_method,
        "promo_tag": s.promo_tag or "",
        "client_token": s.client_token.token if s.client_token else "",
    } for s in sales]
    return _stream_json(rows, "marketing") if format == "json" else _stream_csv(rows, "marketing")
