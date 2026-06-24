from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db_with_role, require_admin
from app.models.appointment import Appointment, AppointmentService
from app.models.client import Client
from app.models.service import Service
from app.models.service_staff_commission import ServiceStaffCommission
from app.models.staff import Staff
from app.models.user import User

router = APIRouter(prefix="/appointments", tags=["appointments"])

LEAD_SOURCES = ("instagram", "facebook", "google", "referido", "walk_in", "otro")


# ── Schemas ────────────────────────────────────────────────────────────────────

class ServiceLineIn(BaseModel):
    service_id: UUID | None = None
    service_name: str
    staff_id: UUID | None = None
    unit_price: Decimal | None = None
    supply_cost_est: Decimal = Decimal("0")
    sort_order: int = 0


class AppointmentCreate(BaseModel):
    # Cliente — puede ser existente (client_id) o nuevo (client_name)
    client_id: UUID | None = None
    client_name: str | None = None
    client_email: str | None = None
    client_phone: str | None = None
    lead_source: str | None = None
    initial_inquiry: str | None = None
    # Cita
    scheduled_at: datetime
    duration_min: int = 60
    notes: str | None = None
    services: list[ServiceLineIn]


class FinancialClose(BaseModel):
    """Datos que recepción completa al cerrar el servicio."""
    final_price: Decimal
    payment_method: Literal["efectivo", "tarjeta", "msi"]
    supply_cost_est: Decimal = Decimal("0")
    notes: str | None = None


class FinancialApproval(BaseModel):
    """Admin completa comisiones y aprueba los datos financieros."""
    final_price: Decimal | None = None
    payment_method: Literal["efectivo", "tarjeta", "msi"] | None = None
    commission_override_pct: Decimal | None = None
    commission_amount: Decimal | None = None
    supply_cost_est: Decimal | None = None


class AppointmentServiceOut(BaseModel):
    id: UUID
    service_id: UUID | None
    service_name_snapshot: str
    staff_id: UUID | None
    staff_name_snapshot: str | None
    unit_price: Decimal | None
    commission_pct: Decimal | None
    commission_amount: Decimal | None
    supply_cost_est: Decimal

    class Config:
        from_attributes = True


class ClientOut(BaseModel):
    id: UUID
    full_name: str
    email: str | None
    phone: str | None
    lead_source: str | None

    class Config:
        from_attributes = True


class AppointmentOut(BaseModel):
    id: UUID
    client: ClientOut
    scheduled_at: datetime
    duration_min: int
    status: str
    notes: str | None
    final_price: Decimal | None
    payment_method: str | None
    commission_override_pct: Decimal | None
    commission_amount: Decimal | None
    supply_cost_est: Decimal
    financial_complete: bool
    completed_at: datetime | None
    created_at: datetime
    services: list[AppointmentServiceOut]

    class Config:
        from_attributes = True


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _resolve_client(body: AppointmentCreate, db: AsyncSession) -> Client:
    if body.client_id:
        result = await db.execute(select(Client).where(Client.id == body.client_id))
        client = result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        return client

    if not body.client_name:
        raise HTTPException(status_code=422, detail="Se requiere client_id o client_name")

    if body.lead_source and body.lead_source not in LEAD_SOURCES:
        raise HTTPException(status_code=422, detail=f"lead_source inválido. Opciones: {LEAD_SOURCES}")

    client = Client(
        full_name=body.client_name.strip(),
        email=body.client_email,
        phone=body.client_phone,
        lead_source=body.lead_source,
        initial_inquiry=body.initial_inquiry,
        first_visit_date=body.scheduled_at.date(),
    )
    db.add(client)
    await db.flush()
    return client


async def _resolve_default_commission(service_id: UUID | None, staff_id: UUID | None, db: AsyncSession) -> Decimal | None:
    """Busca la tasa default en service_staff_commissions. Devuelve None si no existe."""
    if not service_id or not staff_id:
        return None
    result = await db.execute(
        select(ServiceStaffCommission).where(
            ServiceStaffCommission.service_id == service_id,
            ServiceStaffCommission.staff_id == staff_id,
            ServiceStaffCommission.is_active == True,
        )
    )
    ssc = result.scalar_one_or_none()
    if ssc and ssc.commission_type == "pct":
        return Decimal(str(ssc.commission_value))
    return None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=AppointmentOut)
async def create_appointment(
    body: AppointmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    if not body.services:
        raise HTTPException(status_code=422, detail="Una cita debe tener al menos un servicio")

    client = await _resolve_client(body, db)

    appointment = Appointment(
        client_id=client.id,
        scheduled_at=body.scheduled_at,
        duration_min=body.duration_min,
        notes=body.notes,
        status="agendada",
        created_by=current_user.id,
    )
    db.add(appointment)
    await db.flush()

    for line in body.services:
        # Snapshot del nombre del staff si viene id
        staff_name = None
        if line.staff_id:
            staff_res = await db.execute(select(Staff).where(Staff.id == line.staff_id))
            st = staff_res.scalar_one_or_none()
            staff_name = st.name if st else None

        appt_svc = AppointmentService(
            appointment_id=appointment.id,
            service_id=line.service_id,
            service_name_snapshot=line.service_name,
            staff_id=line.staff_id,
            staff_name_snapshot=staff_name,
            unit_price=line.unit_price,
            supply_cost_est=line.supply_cost_est,
            sort_order=line.sort_order,
            # Comisión queda null hasta aprobación admin (según decisión P8)
            commission_pct=None,
            commission_amount=None,
        )
        db.add(appt_svc)

    await db.commit()

    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(Appointment.id == appointment.id)
    )
    return result.scalar_one()


@router.get("/", response_model=list[AppointmentOut])
async def list_appointments(
    status: str | None = None,
    pending_financial: bool = False,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    query = (
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .order_by(Appointment.scheduled_at.asc())
    )
    if status:
        query = query.where(Appointment.status == status)
    if pending_financial:
        query = query.where(
            Appointment.status != "cancelada",
            Appointment.financial_complete == False,
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{appt_id}", response_model=AppointmentOut)
async def get_appointment(
    appt_id: UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(Appointment.id == appt_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return appt


@router.patch("/{appt_id}/status")
async def update_status(
    appt_id: UUID,
    status: Literal["agendada", "confirmada", "en_proceso", "completada", "cancelada"],
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(select(Appointment).where(Appointment.id == appt_id))
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    appt.status = status
    if status == "completada" and not appt.completed_at:
        appt.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "status": status}


@router.patch("/{appt_id}/close", response_model=AppointmentOut)
async def close_appointment(
    appt_id: UUID,
    body: FinancialClose,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    """Recepción cierra el servicio: registra precio cobrado y método de pago."""
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(Appointment.id == appt_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if appt.status == "cancelada":
        raise HTTPException(status_code=400, detail="No se puede cerrar una cita cancelada")

    appt.final_price = body.final_price
    appt.payment_method = body.payment_method
    appt.supply_cost_est = body.supply_cost_est
    if body.notes:
        appt.notes = body.notes
    appt.status = "completada"
    appt.completed_at = datetime.now(timezone.utc)
    # Comisión queda null → admin debe aprobar (financial_complete permanece False)
    appt.financial_complete = False

    await db.commit()
    await db.refresh(appt)

    result2 = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(Appointment.id == appt_id)
    )
    return result2.scalar_one()


@router.patch("/{appt_id}/approve", response_model=AppointmentOut, dependencies=[Depends(require_admin)])
async def approve_financials(
    appt_id: UUID,
    body: FinancialApproval,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    """Admin completa y aprueba los datos financieros de la cita."""
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(Appointment.id == appt_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if body.final_price is not None:
        appt.final_price = body.final_price
    if body.payment_method is not None:
        appt.payment_method = body.payment_method
    if body.commission_override_pct is not None:
        appt.commission_override_pct = body.commission_override_pct
    if body.commission_amount is not None:
        appt.commission_amount = body.commission_amount
    if body.supply_cost_est is not None:
        appt.supply_cost_est = body.supply_cost_est

    appt.financial_complete = True
    appt.approved_by = current_user.id

    await db.commit()

    result2 = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(Appointment.id == appt_id)
    )
    return result2.scalar_one()


@router.get("/alerts/pending-financials")
async def pending_financial_alerts(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_with_role),
):
    """Lista citas completadas o en proceso sin datos financieros aprobados."""
    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.client), selectinload(Appointment.services))
        .where(
            Appointment.status.in_(["completada", "en_proceso"]),
            Appointment.financial_complete == False,
        )
        .order_by(Appointment.scheduled_at.desc())
    )
    appts = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "client_name": a.client.full_name,
            "scheduled_at": a.scheduled_at,
            "status": a.status,
            "services": [s.service_name_snapshot for s in a.services],
            "has_price": a.final_price is not None,
            "has_payment": a.payment_method is not None,
        }
        for a in appts
    ]
