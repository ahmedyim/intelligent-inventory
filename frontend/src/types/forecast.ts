export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'DISMISSED';

export interface SuggestionProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  barcode?: string | null;
  image_url?: string | null;
}

export interface Suggestion {
  id: string;
  product_id: string;
  branch_id: string;
  supplier_id?: string | null;
  current_stock: number;
  suggested_qty: number;
  urgency: string;    // for example HIGH, MEDIUM, LOW (the enum values of your backend)
  confidence: string; // for example HIGH, MEDIUM, LOW
  reason: string;
  method: string;
  status: SuggestionStatus;
  generated_at: string;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  product?: SuggestionProduct | null;
}

export interface SuggestionList {
  items: Suggestion[];
  total: number;
  skip: number;
  limit: number;
}

export interface SuggestionsQuery {
  branch_id: string;
  status?: SuggestionStatus;
  urgency?: string;
  skip?: number;
  limit?: number;
}

export interface RunResult {
  branch_id: string;
  created: number;
}

export interface ProductForecast {
  product_id: string;
  branch_id: string;
  method: string;
  history_days: number;
  avg_daily: number;
  std_daily: number;
  horizon_days: number;
  daily: number[];
  total_units: number;
}