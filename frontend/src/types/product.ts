export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  unit: string;
  category_id?: string | null;
  supplier_id?: string | null;
  cost_price: string;
  selling_price: string;
  reorder_level: number;
  lead_time_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  total_stock: number;
}

export interface ProductList {
  items: Product[];
  total: number;
  skip: number;
  limit: number;
}

export interface InitialStock {
  branch_id: string;
  quantity: number;
}

export interface ProductCreate {
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  unit?: string;
  category_id?: string | null;
  supplier_id?: string | null;
  cost_price: number; // numbers are accepted when sending
  selling_price: number;
  reorder_level?: number;
  lead_time_days?: number;
  initial_stock?: InitialStock | null;
}

export type ProductUpdate = Partial<Omit<ProductCreate, 'initial_stock' | 'cost_price'>> & {
  is_active?: boolean;
};
