from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, config, equipment, products, recipes, services, staff

app = FastAPI(
    title="Aestheva OS API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(services.router)
app.include_router(products.router)
app.include_router(staff.router)
app.include_router(recipes.router)
app.include_router(equipment.router)
app.include_router(config.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aestheva-backend"}
