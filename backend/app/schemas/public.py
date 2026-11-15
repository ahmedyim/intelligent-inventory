import uuid

from pydantic import BaseModel


class PublicStats(BaseModel):
    branches: int
    products: int
    units_in_stock: int
    sales_this_month: int | None = None   # a count only; never any money


class PublicBranch(BaseModel):
    id: uuid.UUID
    name: str
    location: str | None = None
    phone: str | None = None
    email: str | None = None


class PublicCategory(BaseModel):
    name: str
    products: int


class PublicProduct(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    unit: str
    image_url: str | None = None
    price: float
    category: str | None = None
    in_stock: bool                 # yes or no, never the quantity
    branches_available: int        # how many branches have it


class PublicProductList(BaseModel):
    items: list[PublicProduct]
    total: int
    skip: int
    limit: int