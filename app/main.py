from fastapi import FastAPI,Depends,HTTPException,status
from contextlib import asynccontextmanager
from app.routes import (
    users,auth,products,
    branches,supplier,
    categories,inventory,sales,customers,payment_methods)
from app.core.seed import seed_super_admin
from app.core.db import engine
from app.core.error_handlers import register_error_handlers
@asynccontextmanager
async def lifespan(app:FastAPI):
    await seed_super_admin()
    yield
    await engine.dispose()
app=FastAPI(
    lifespan=lifespan,
    title="Inventory Management API",
    description="Multi-branch inventory management system backend built with FastAPI and PostgreSQL",
    version="1.0.0"
    )
register_error_handlers(app)

app.include_router(users.router,prefix="/api/v1/users")
app.include_router(auth.router,prefix="/api/v1/auth")
app.include_router(branches.router,prefix="/api/v1/branches")
app.include_router(supplier.router,prefix="/api/v1/supplier")
app.include_router(inventory.router,prefix="/api/v1/inventory")

app.include_router(categories.router,prefix="/api/v1/categories")
app.include_router(products.router,prefix="/api/v1/products")
app.include_router(payment_methods.router,prefix="/api/v1/payment-methods")
app.include_router(sales.router,prefix="/api/v1/sales")
app.include_router(customers.router, prefix="/customers")


@app.get("/health",tags=["Health Check"])
def root_health_check():
    return {"status": "healthy", "message": "Inventory Management API is running successfully"}
