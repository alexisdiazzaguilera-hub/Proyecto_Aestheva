from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db_with_role, require_admin
from app.models.config_param import ConfigParam
from app.schemas.config import ConfigParamOut, ConfigParamUpdate

router = APIRouter(prefix="/config", tags=["config"], dependencies=[Depends(require_admin)])


@router.get("/", response_model=list[ConfigParamOut])
async def list_config(db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(ConfigParam).order_by(ConfigParam.key))
    return result.scalars().all()


@router.put("/{key}", response_model=ConfigParamOut)
async def update_config(key: str, body: ConfigParamUpdate, db: AsyncSession = Depends(get_db_with_role)):
    result = await db.execute(select(ConfigParam).where(ConfigParam.key == key))
    param = result.scalar_one_or_none()
    if not param:
        raise HTTPException(status_code=404, detail="Parámetro no encontrado")
    param.value = body.value
    await db.commit()
    await db.refresh(param)
    return param
