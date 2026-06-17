import hashlib
import hmac
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from decimal import Decimal
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_current_user, get_db_with_role
from app.models.client import Client, ClientToken
from app.models.period import Period
from app.models.sale import Sale
from app.models.service import Service
from app.models.staff import Staff
from app.models.user import User

router = APIRouter(tags=["sales"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class SaleCreate(BaseModel):
    service_id: UUID
    client_name: str
    staff_id: UUID | None = None
    sale_price: Decimal
    payment_method: str             # efectivo | tarjeta | msi
    promo_tag: str | None = None
    supply_cost_est: Decimal = Decimal("0")
    sale_date: date | None = None
    notes: str | None = None


class SalePublic(BaseModel):
    """Vista recepcionista — sin costos ni margen."""
    id: UUID
    service_name_snapshot: str
    staff_name: str | None
    client_name: str | None
    sale_price: Decimal
    payment_method: str
    promo_tag: str | None
    sale_date: date | None
    notes: str | None


class SaleAdmin(SalePublic):
    """Vista admin — agrega costos."""
    supply_cost_est: Decimal
    bank_fee: Decimal
    margin: Decimal
    margin_pct: Decimal


class PeriodOut(BaseModel):
    id: UUID
    period_month: date
    is_closed: bool


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_token(client_id: str) -> str:
    return hmac.new(settings.clinic_secret.encode(), client_id.encode(), hashlib.sha256).hexdigest()


def _bank_fee(price: Decimal, method: str) -> Decimal:
    rates = {"efectivo": Decimal("0"), "tarjeta": Decimal("0.03"), "msi": Decimal("0.09")}
    return price * rates.get(method, Decimal("0"))


async def _get_or_create_period(month: date, db: AsyncSession) -> Period:
    first_day = month.replace(day=1)
    result = await db.execute(select(Period).where(Period.period_month == first_day))
    period = result.scalar_one_or_none()
    if not period:
        period = Period(period_month=first_day)
        db.add(period)
        await db.flush()
    return period


async def _get_or_create_client_token(name: str, db: AsyncSession) -> ClientToken:
    """Crea o recupera el client_token para un nombre de cliente."""
    name_hash = hashlib.sha256(name.strip().lower().encode()).hexdigest()
    result = await db.execute(select(Client).where(Client.phone_hash == name_hash))
    client = result.scalar_one_or_none()
    if not client:
        client = Client(full_name=name.strip(), phone_hash=name_hash)
        db.add(client)
        await db.flush()
        token_str = _make_token(str(client.id))
        ct = ClientToken(client_id=client.id, token=token_str)
        db.add(ct)
        await db.flush()
        return ct
    result2 = await db.execute(select(ClientToken).where(ClientToken.client_id == client.id))
    return result2.scalar_one()


def _build_sale_public(sale: Sale, client_name: str | None) -> SalePublic:
    return SalePublic(
        id=sale.id,
        service_name_snapshot=sale.service_name_snapshot,
        staff_name=sale.staff.name if sale.staff else None,
        client_name=client_name,
        sale_price=Decimal(str(sale.sale_price)),
        payment_method=sale.payment_method,
        promo_tag=sale.promo_tag,
        sale_date=sale.sale_date,
        notes=sale.notes,
    )


def _build_sale_admin(sale: Sale, client_name: str | None) -> SaleAdmin:
    price = Decimal(str(sale.sale_price))
    supply = Decimal(str(sale.supply_cost_est))
    fee = _bank_fee(price, sale.payment_method)
    margin = price - supply - fee
    margin_pct = (margin / price * 100) if price > 0 else Decimal("0")
    return SaleAdmin(
        **_build_sale_public(sale, client_name).model_dump(),
        supply_cost_est=supply,
        bank_fee=fee,
        margin=margin,
        margin_pct=margin_pct,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/periods", response_model=list[PeriodOut])
async def list_periods(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(select(Period).order_by(Period.period_month.desc()))
    return result.scalars().all()


@router.post("/periods/current", response_model=PeriodOut)
async def get_or_create_current_period(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    today = datetime.now(timezone.utc).date()
    period = await _get_or_create_period(today, db)
    await db.commit()
    await db.refresh(period)
    return period


@router.post("/sales", response_model=SalePublic)
async def create_sale(
    body: SaleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    # Servicio
    svc_result = await db.execute(select(Service).where(Service.id == body.service_id))
    service = svc_result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    # Período
    sale_date = body.sale_date or datetime.now(timezone.utc).date()
    period = await _get_or_create_period(sale_date, db)

    if period.is_closed:
        raise HTTPException(status_code=400, detail="El período está cerrado")

    # Cliente → token
    client_token = await _get_or_create_client_token(body.client_name, db)

    sale = Sale(
        period_id=period.id,
        service_id=service.id,
        service_name_snapshot=service.name,
        staff_id=body.staff_id,
        client_token_id=client_token.id,
        sale_price=body.sale_price,
        payment_method=body.payment_method,
        promo_tag=body.promo_tag,
        supply_cost_est=body.supply_cost_est,
        sale_date=sale_date,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(sale)
    await db.commit()
    await db.refresh(sale)

    # Cargar relaciones
    result = await db.execute(
        select(Sale).options(selectinload(Sale.staff), selectinload(Sale.client_token).selectinload(ClientToken.client))
        .where(Sale.id == sale.id)
    )
    sale = result.scalar_one()
    client_name = sale.client_token.client.full_name if sale.client_token and sale.client_token.client else None
    return _build_sale_public(sale, client_name)


@router.get("/sales")
async def list_sales(
    period_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    query = select(Sale).options(
        selectinload(Sale.staff),
        selectinload(Sale.client_token).selectinload(ClientToken.client),
    ).order_by(Sale.sale_date.desc(), Sale.created_at.desc())

    if period_id:
        query = query.where(Sale.period_id == period_id)

    result = await db.execute(query)
    sales = result.scalars().all()

    out = []
    for sale in sales:
        client_name = None
        # Solo admin puede ver el nombre real del cliente
        if current_user.role == "administrador" and sale.client_token and sale.client_token.client:
            client_name = sale.client_token.client.full_name

        if current_user.role == "administrador":
            out.append(_build_sale_admin(sale, client_name).model_dump())
        else:
            # Recepcionista ve nombre del cliente (lo capturó ella)
            if sale.client_token and sale.client_token.client:
                client_name = sale.client_token.client.full_name
            out.append(_build_sale_public(sale, client_name).model_dump())

    return out


@router.delete("/sales/{sale_id}")
async def delete_sale(
    sale_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    # Solo admin o quien la creó puede borrarla
    if current_user.role != "administrador" and sale.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Sin permiso")
    await db.delete(sale)
    await db.commit()
    return {"ok": True}
