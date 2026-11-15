export interface PublicStats {
    branches: number;
    products: number;
    units_in_stock: number;
    sales_this_month: number | null;
}

export interface PublicBranch {
    id: string;
    name: string;
    location?: string | null;
    phone?: string | null;
    email?: string | null;
}

export interface PublicCategory {
    name: string;
    products: number;
}

export interface PublicProduct {
    id: string;
    name: string;
    description?: string | null;
    unit: string;
    image_url?: string | null;
    price: number;
    category?: string | null;
    in_stock: boolean;
    branches_available: number;
}

export interface PublicProductList {
    items: PublicProduct[];
    total: number;
    skip: number;
    limit: number;
}

export interface PublicProductsQuery {
    search?: string;
    category?: string;
    in_stock_only?: boolean;
    skip?: number;
    limit?: number;
}