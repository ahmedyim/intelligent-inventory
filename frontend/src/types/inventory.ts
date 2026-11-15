export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT';

export interface InventoryRow {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  reorder_level: number | null;
  last_counted_at?: string | null;
  updated_at: string;
}

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  image_url?: string | null;
  unit: string;
  cost_price: string; // Decimal arrives as a string
  reorder_level?: number | null;
  [key: string]: unknown; // other product fields
}

// A stock row together with its product
export interface InventoryItem extends InventoryRow {
  product: InventoryProduct;
}

export interface InventoryList {
  items: InventoryItem[]; // was InventoryRow[]
  total: number;
  skip: number;
  limit: number;
}

export interface StockMovement {
  id: string;
  inventory_id: string;
  product_id: string;
  branch_id: string;
  movement_type: MovementType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost?: string | null; // Decimal arrives as a string
  unit_price?: string | null;
  reason: string;
  note?: string | null;
  created_by?: string | null;
  created_at: string;
  product_name?: string | null;
}

export interface MovementList {
  items: StockMovement[];
  total: number;
  skip: number;
  limit: number;
}

export interface InventoryQuery {
  branch_id?: string;
  product_id?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export interface LowStockQuery {
  branch_id?: string;
  skip?: number;
  limit?: number;
}

export interface LowStockItem {
  product_id: string;
  product_name: string;
  sku: string;
  branch_id: string;
  quantity: number;
  reorder_level: number;
}

export interface MovementsQuery {
  product_id?: string;
  branch_id?: string;
  reason?: string;
  movement_type?: MovementType;
  skip?: number;
  limit?: number;
}

export interface InventoryCreateBody {
  product_id: string;
  branch_id: string;
  reorder_level?: number | null;
}

export interface StockReceiveBody {
  product_id: string;
  branch_id: string;
  quantity: number;
  unit_cost: number | string;
  new_selling_price?: number | string | null;
  reason?: string;
  note?: string | null;
}

export interface StockIssueBody {
  product_id: string;
  branch_id: string;
  quantity: number;
  reason: 'sale' | 'damage' | 'loss' | 'expired' | 'other';
  note?: string | null;
}

export interface StockAdjustBody {
  product_id: string;
  branch_id: string;
  counted_quantity: number;
  note?: string | null;
}