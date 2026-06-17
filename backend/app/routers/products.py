from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_with_role, require_admin
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate

router = APIRouter(prefix="/products", tags=["products"], dependencies=[Depends(require_admin)])


@router.get("/", response_model=list[ProductOut])
async def list_products(db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Product).where(Product.is_active == True).order_by(Product.category, Product.name))
    return result.scalars().all()


@router.get("/all", response_model=list[ProductOut])
async def list_all_products(db: AsyncSession = Depends(get_db_with_role)):
    """Incluye inactivos — para gestión del admin."""
    result = await db.execute(select(Product).order_by(Product.category, Product.name))
    return result.scalars().all()


@router.post("/", response_model=ProductOut)
async def create_product(body: ProductCreate, db: AsyncSession = Depends(get_db_with_role)):
    product = Product(**body.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, body: ProductUpdate, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}")
async def deactivate_product(product_id: str, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.is_active = False
    await db.commit()
    return {"ok": True}
