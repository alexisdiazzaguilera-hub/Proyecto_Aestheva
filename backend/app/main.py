from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

from app.routers import auth, config, dashboard, equipment, expenses, exports, products, recipes, sales, services, staff
from app.routers import appointments, commissions

app = FastAPI(
    title="Aestheva OS API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
app.include_router(sales.router)
app.include_router(expenses.router)
app.include_router(dashboard.router)
app.include_router(config.router)
app.include_router(exports.router)
app.include_router(appointments.router)
app.include_router(commissions.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aestheva-backend"}
