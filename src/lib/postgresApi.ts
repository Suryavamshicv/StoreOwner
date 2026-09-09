import { SupermarketProduct, ProductCategory, CodeType, AppUser, Vendor, StoreSubscription, UserRole } from '../types';

export interface PostgresStatus {
  connected: boolean;
  host: string;
  database: string;
  counts: {
    products: number;
    scannableCodes: number;
    categories: number;
    users?: number;
    vendors?: number;
    subscriptions?: number;
  };
}

export interface UserAuthContext {
  role?: UserRole | string;
  isSubscribed?: boolean;
  email?: string;
  phone?: string;
  uid?: string;
}

export interface AuthResponse {
  user: AppUser;
  role: UserRole;
  isAdmin: boolean;
  isSubscribed: boolean;
  subscription: StoreSubscription | null;
}

let globalAuthContext: UserAuthContext = {
  role: 'store_owner',
  isSubscribed: false,
  email: '',
  phone: '',
  uid: ''
};

export function setGlobalAuthContext(ctx: Partial<UserAuthContext>) {
  globalAuthContext = { ...globalAuthContext, ...ctx };
}

export function getGlobalAuthContext(): UserAuthContext {
  return globalAuthContext;
}

async function authRequest(path: string, body?: Record<string, unknown>): Promise<AuthResponse> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Authentication failed' }));
    throw new Error(err.error || 'Authentication failed');
  }
  return await res.json();
}

export function registerWithPostgres(data: {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  store_name?: string;
}): Promise<AuthResponse> {
  return authRequest('/api/auth/register', data);
}

export function loginWithPostgres(email: string, password: string): Promise<AuthResponse> {
  return authRequest('/api/auth/login', { email, password });
}

export function getCurrentPostgresSession(): Promise<AuthResponse> {
  return authRequest('/api/auth/session');
}

export async function logoutFromPostgres(): Promise<void> {
  await authRequest('/api/auth/logout', {});
}

function getAuthHeaders(override?: UserAuthContext): Record<string, string> {
  const ctx = override || globalAuthContext;
  const headers: Record<string, string> = {};
  if (ctx.role) headers['x-user-role'] = ctx.role;
  if (ctx.isSubscribed) headers['x-user-subscription'] = 'active';
  else headers['x-user-subscription'] = 'inactive';
  if (ctx.email) headers['x-user-email'] = ctx.email;
  if (ctx.phone) headers['x-user-phone'] = ctx.phone;
  if (ctx.uid) headers['x-user-uid'] = ctx.uid;
  return headers;
}

export async function getPostgresStatus(): Promise<PostgresStatus> {
  try {
    const res = await fetch('/api/postgres/status', {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.error('Failed to fetch Postgres status:', err);
    return {
      connected: false,
      host: 'db.prisma.io',
      database: 'postgres',
      counts: { products: 0, scannableCodes: 0, categories: 0, users: 0, vendors: 0, subscriptions: 0 }
    };
  }
}

export async function fetchPostgresProducts(authOverride?: UserAuthContext): Promise<SupermarketProduct[]> {
  const res = await fetch('/api/products', {
    headers: getAuthHeaders(authOverride)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch products' }));
    throw new Error(err.error || 'Failed to fetch products from PostgreSQL');
  }
  const data = await res.json();
  return data.map((p: any) => ({
    ...p,
    id: String(p.id || p.product_id),
    name: p.name || p.product_name,
    brand: p.brand || p.brand_name || '',
    price: Number(p.price ?? p.retail_price ?? 0),
    stock: Number(p.stock ?? p.stock_quantity ?? 0),
    category: p.category || p.category_name || 'General',
    qrCode: p.qrCode || p.barcode || p.code_payload || '',
    barcode: p.barcode || p.qrCode || p.code_payload || '',
    codeType: (p.codeType || p.code_type || 'QR_CODE') as CodeType
  }));
}

export async function createPostgresProduct(product: {
  name: string;
  brand?: string;
  price: number;
  stock: number;
  description?: string;
  category?: string;
  qrCode?: string;
  barcode?: string;
  codeType?: CodeType;
  image_url?: string;
}, authOverride?: UserAuthContext): Promise<SupermarketProduct> {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders(authOverride)
    },
    body: JSON.stringify(product)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create product' }));
    throw new Error(err.error || 'Failed to create product in PostgreSQL');
  }
  const p = await res.json();
  return {
    ...p,
    id: String(p.id || p.product_id),
    name: p.name || p.product_name,
    brand: p.brand || p.brand_name || '',
    price: Number(p.price ?? p.retail_price ?? 0),
    stock: Number(p.stock ?? p.stock_quantity ?? 0),
    category: p.category || p.category_name || 'General',
    qrCode: p.qrCode || p.barcode || p.code_payload || '',
    barcode: p.barcode || p.qrCode || p.code_payload || ''
  };
}

export async function updatePostgresProduct(
  id: string | number,
  product: {
    name: string;
    brand?: string;
    price: number;
    stock: number;
    description?: string;
    category?: string;
    qrCode?: string;
    barcode?: string;
    codeType?: CodeType;
    image_url?: string;
  },
  authOverride?: UserAuthContext
): Promise<SupermarketProduct> {
  const res = await fetch(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders(authOverride)
    },
    body: JSON.stringify(product)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update product' }));
    throw new Error(err.error || 'Failed to update product in PostgreSQL');
  }
  return await res.json();
}

export async function deletePostgresProduct(id: string | number, authOverride?: UserAuthContext): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(authOverride)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete product' }));
    throw new Error(err.error || 'Failed to delete product from PostgreSQL');
  }
}

export async function bulkImportPostgresProducts(items: any[], authOverride?: UserAuthContext): Promise<{
  success: boolean;
  count: number;
  errors?: string[];
}> {
  const res = await fetch('/api/products/bulk', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders(authOverride)
    },
    body: JSON.stringify({ items })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Bulk import failed' }));
    throw new Error(err.error || 'Bulk import to PostgreSQL failed');
  }
  return await res.json();
}

export async function lookupPostgresCode(code: string): Promise<SupermarketProduct | null> {
  const res = await fetch(`/api/scannable-codes/lookup/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Lookup failed');
  }
  const p = await res.json();
  return {
    ...p,
    id: String(p.id || p.product_id),
    name: p.name || p.product_name,
    brand: p.brand || p.brand_name || '',
    price: Number(p.price ?? p.retail_price ?? 0),
    stock: Number(p.stock ?? p.stock_quantity ?? 0),
    category: p.category || p.category_name || 'General',
    qrCode: p.qrCode || p.barcode || p.code_payload || ''
  };
}

export async function updatePostgresStock(id: string | number, stock: number, authOverride?: UserAuthContext): Promise<void> {
  const res = await fetch(`/api/products/${id}/stock`, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      ...getAuthHeaders(authOverride)
    },
    body: JSON.stringify({ stock })
  });
  if (!res.ok) throw new Error('Failed to update stock');
}

export async function fetchPostgresCategories(): Promise<ProductCategory[]> {
  const res = await fetch('/api/categories');
  if (!res.ok) return [];
  return await res.json();
}

// ============================================================================
// USER MANAGEMENT API CLIENT
// ============================================================================
export async function fetchAppUsers(): Promise<AppUser[]> {
  const res = await fetch('/api/users', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users from database');
  return await res.json();
}

export async function createAppUser(userData: {
  email: string;
  full_name?: string;
  role?: UserRole;
  phone?: string;
  store_name?: string;
  firebase_uid?: string;
}): Promise<AppUser> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create user' }));
    throw new Error(err.error || 'Failed to create user');
  }
  return await res.json();
}

export async function updateAppUser(
  userId: number,
  data: Partial<AppUser>
): Promise<AppUser> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update user' }));
    throw new Error(err.error || 'Failed to update user');
  }
  return await res.json();
}

// ============================================================================
// VENDOR MANAGEMENT API CLIENT
// ============================================================================
export async function fetchVendors(): Promise<Vendor[]> {
  const res = await fetch('/api/vendors', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch vendors from database');
  return await res.json();
}

export async function createVendor(vendorData: {
  vendor_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  supplied_categories?: string;
  payment_terms?: string;
  lead_time_days?: number;
  status?: 'active' | 'inactive' | 'suspended';
}): Promise<Vendor> {
  const res = await fetch('/api/vendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(vendorData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create vendor' }));
    throw new Error(err.error || 'Failed to create vendor');
  }
  return await res.json();
}

export async function updateVendor(
  vendorId: number,
  vendorData: Partial<Vendor>
): Promise<Vendor> {
  const res = await fetch(`/api/vendors/${vendorId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(vendorData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update vendor' }));
    throw new Error(err.error || 'Failed to update vendor');
  }
  return await res.json();
}

export async function deleteVendor(vendorId: number): Promise<void> {
  const res = await fetch(`/api/vendors/${vendorId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error('Failed to delete vendor');
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT API CLIENT
// ============================================================================
export async function fetchSubscriptions(): Promise<StoreSubscription[]> {
  const res = await fetch('/api/subscriptions', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch subscriptions from database');
  return await res.json();
}

export async function createSubscription(subData: {
  user_id?: number;
  firebase_uid?: string;
  plan_name: string;
  plan_tier?: 'basic' | 'pro' | 'enterprise';
  billing_cycle?: 'monthly' | 'yearly';
  price?: number;
  status?: 'active' | 'inactive' | 'trial' | 'expired' | 'cancelled';
  is_enabled?: boolean;
  inventory_limit?: number;
  days?: number;
  payment_reference?: string;
}): Promise<StoreSubscription> {
  const res = await fetch('/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(subData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create subscription' }));
    throw new Error(err.error || 'Failed to create subscription');
  }
  return await res.json();
}

export async function updateSubscription(
  subscriptionId: number,
  data: Partial<StoreSubscription> & { extend_days?: number }
): Promise<StoreSubscription> {
  const res = await fetch(`/api/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update subscription' }));
    throw new Error(err.error || 'Failed to update subscription');
  }
  return await res.json();
}

export async function createRazorpayOrder(planId: 'basic' | 'pro'): Promise<{
  keyId: string;
  plan: { name: string; price: number; inventoryLimit: number };
  order: { id: string; amount: number; currency: string };
}> {
  const res = await fetch('/api/payments/razorpay/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ planId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unable to start payment' }));
    throw new Error(err.error || 'Unable to start payment');
  }
  return await res.json();
}

export async function verifyRazorpayPayment(data: {
  planId: 'basic' | 'pro';
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ success: boolean; subscription: StoreSubscription }> {
  const res = await fetch('/api/payments/razorpay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Payment verification failed' }));
    throw new Error(err.error || 'Payment verification failed');
  }
  return await res.json();
}

// Auth sync helper
export async function syncAuthUser(params: {
  firebase_uid?: string;
  email: string;
  full_name?: string;
  store_name?: string;
  phone?: string;
}): Promise<{
  user: AppUser;
  role: UserRole;
  isAdmin: boolean;
  isSubscribed: boolean;
  subscription: StoreSubscription | null;
}> {
  const res = await fetch('/api/auth/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Auth sync failed' }));
    throw new Error(err.error || 'Auth sync failed');
  }
  const result = await res.json();
  setGlobalAuthContext({
    role: result.role,
    isSubscribed: result.isSubscribed,
    email: params.email,
    uid: params.firebase_uid
  });
  return result;
}
