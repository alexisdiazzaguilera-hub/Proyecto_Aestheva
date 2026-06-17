from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db_with_role, require_admin
from app.models.service import Service
from app.models.user import User
from app.schemas.service import ServiceAdmin, ServiceCreate, ServicePublic, ServiceUpdate

router = APIRouter(prefix="/services", tags=["services"])


@router.get("/catalog")
async def get_catalog(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_with_role),
):
    """Devuelve el catálogo. La recepcionista no ve precios ni costos."""
    result = await db.execute(select(Service).where(Service.is_active == True).order_by(Service.area, Service.name))
    services = result.scalars().all()

    if current_user.role == "recepcionista":
        return [ServicePublic.model_validate(s) for s in services]
    return [ServiceAdmin.model_validate(s) for s in services]


@router.post("/", response_model=ServiceAdmin, dependencies=[Depends(require_admin)])
async def create_service(body: ServiceCreate, db: AsyncSession = Depends(get_db_with_role)):
    # Genera SKU automático: SVC-001, SVC-002, ...
    count_result = await db.execute(select(Service))
    count = len(count_result.scalars().all())
    sku = f"SVC-{(count + 1):03d}"

    service = Service(**body.model_dump(), sku=sku)
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return ServiceAdmin.model_validate(service)


@router.put("/{service_id}", response_model=ServiceAdmin, dependencies=[Depends(require_admin)])
async def update_service(
    service_id: str,
    body: ServiceUpdate,
    db: AsyncSession = Depends(get_db_with_role),
):
    result = await db.execute(select(Service).where(Service.id == service_id))
    service = result.scalar_one_or_none()
    if not service:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(service, field, value)

    await db.commit()
    await db.refresh(service)
    return ServiceAdmin.model_validate(service)
