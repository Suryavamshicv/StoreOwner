export type CodeType = 'QR_CODE' | 'EAN_13' | 'UPC' | 'CODE_128';

export interface ProductCategory {
  category_id?: number | string;
  category_name: string;
  description?: string;
  ownerId?: string;
  createdAt?: string;
}

export interface SupermarketProduct {
  id?: string;
  product_id?: number | string;
  category_id?: number | string | null;
  category_name?: string;
  product_name: string;
  brand_name?: string;
  retail_price: number;
  stock_quantity: number;
  product_description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
  
  // Scannable identifiers (for 1:N or inline codes)
  scannable_codes?: ScannableCode[];
  
  // Legacy / Direct access convenience
  name?: string; // aliases product_name
  price?: number; // aliases retail_price
  stock?: number; // aliases stock_quantity
  category?: string; // aliases category_name
  qrCode?: string;
  barcode?: string;
  ownerId?: string;
}

export interface ScannableCode {
  code_id?: number | string;
  product_id?: number | string;
  code_payload: string;
  code_type: CodeType;
  is_active: boolean;
  created_at?: string;
  ownerId?: string;
}

export type UserRole = 'admin' | 'store_owner' | 'vendor' | 'cashier';

export interface AppUser {
  user_id?: number;
  firebase_uid?: string;
  email: string;
  full_name?: string;
  role: UserRole;
  phone?: string;
  store_name?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Vendor {
  vendor_id?: number;
  vendor_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  supplied_categories?: string;
  payment_terms?: string;
  lead_time_days?: number;
  status: 'active' | 'inactive' | 'suspended';
  created_at?: string;
  updated_at?: string;
}

export interface StoreSubscription {
  subscription_id?: number;
  user_id?: number;
  firebase_uid?: string;
  user_email?: string;
  store_name?: string;
  plan_name: string;
  plan_tier: 'basic' | 'pro' | 'enterprise';
  billing_cycle: 'monthly' | 'yearly';
  price: number;
  status: 'active' | 'inactive' | 'trial' | 'expired' | 'cancelled';
  is_enabled: boolean;
  inventory_limit: number;
  features_enabled?: string[] | any;
  start_date?: string;
  end_date?: string;
  last_payment_reference?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OwnerProfile {
  uid: string;
  email: string;
  role?: UserRole;
  storeName?: string;
  storeCode?: string; // Compact 8-char store ID (e.g. 9QE24TFC)
  location?: string;
  paymentUPI?: string;
  payoutAccount?: string;
  subscriptionStatus: 'inactive' | 'active' | 'trial';
  subscriptionEndDate?: string;
  createdAt?: string;
  lowStockThreshold?: number;
  customCheckoutUrl?: string;
}

export interface SaleRecord {
  id: string;
  ownerId: string;
  total: number;
  itemsCount: number;
  paymentStatus: 'pending' | 'completed' | 'failed';
  createdAt: string;
}
