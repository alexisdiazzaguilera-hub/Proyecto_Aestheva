from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db_with_role, require_admin
from app.models.product import Product
from app.models.service import Service
from app.models.service_recipe import ServiceRecipe
from app.schemas.recipe import RecipeLineOut, RecipeUpdate

router = APIRouter(prefix="/services/{service_id}/recipe", tags=["recipes"], dependencies=[Depends(require_admin)])


async def _get_service(service_id: str, db: AsyncSession) -> Service:
    result = await db.execute(
        select(Service).options(selectinload(Service.recipe_lines).selectinload(ServiceRecipe.product))
        .where(Service.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return service


@router.get("/", response_model=list[RecipeLineOut])
async def get_recipe(service_id: str, db: AsyncSession = Depends(get_db_with_role)):
    service = await _get_service(service_id, db)
    return _build_lines(service.recipe_lines)


@router.put("/", response_model=list[RecipeLineOut])
async def set_recipe(service_id: str, body: RecipeUpdate, db: AsyncSession = Depends(get_db_with_role)):
    service = await _get_service(service_id, db)

    # Borra líneas existentes
    for line in list(service.recipe_lines):
        await db.delete(line)
    await db.flush()

    # Inserta nuevas
    for item in body.lines:
        product_result = await db.execute(select(Product).where(Product.id == item.product_id))
        product = product_result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Producto {item.product_id} no encontrado")
        db.add(ServiceRecipe(service_id=service.id, product_id=product.id, quantity=item.quantity))

    await db.commit()
    await db.refresh(service)

    # Recarga con productos
    result = await db.execute(
        select(Service).options(selectinload(Service.recipe_lines).selectinload(ServiceRecipe.product))
        .where(Service.id == service_id)
    )
    service = result.scalar_one()
    return _build_lines(service.recipe_lines)


def _build_lines(lines: list[ServiceRecipe]) -> list[RecipeLineOut]:
    result = []
    for line in lines:
        p = line.product
        cost_per_app = Decimal(str(p.unit_cost)) / Decimal(str(p.yield_per_unit)) if p.yield_per_unit > 1 else Decimal(str(p.unit_cost))
        line_cost = cost_per_app * Decimal(str(line.quantity))
        result.append(RecipeLineOut(
            id=line.id,
            product_id=p.id,
            product_name=p.name,
            quantity=Decimal(str(line.quantity)),
            unit_of_measure=p.unit_of_measure,
            unit_cost=Decimal(str(p.unit_cost)),
            yield_per_unit=p.yield_per_unit,
            cost_per_application=cost_per_app,
            line_cost=line_cost,
        ))
    return result
