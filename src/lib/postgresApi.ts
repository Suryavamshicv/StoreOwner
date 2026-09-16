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
      host: 'PostgreSQL Database',
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
  password?: string;
}): Promise<AppUser> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create user' }));
    throw new Error(err.error || 'Failed to create user in PostgreSQL');
  }
  return await res.json();
}

export async function updateAppUser(
  userId: number,
  data: Partial<AppUser> & { password?: string }
): Promise<AppUser> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update user' }));
    throw new Error(err.error || 'Failed to update user in PostgreSQL');
  }
  return await res.json();
}

export async function deleteAppUser(userId: number): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete user' }));
    throw new Error(err.error || 'Failed to delete user');
  }
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
export async function fetchSubscriptions(filters?: { user_id?: number; firebase_uid?: string }): Promise<StoreSubscription[]> {
  const params = new URLSearchParams();
  if (filters?.user_id) params.set('user_id', String(filters.user_id));
  if (filters?.firebase_uid) params.set('firebase_uid', filters.firebase_uid);
  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/subscriptions${queryStr}`, { headers: getAuthHeaders() });
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

// PostgreSQL direct login validation against app_users table
export async function loginWithPostgres(credentials: {
  identifier?: string;
  email?: string;
  phone?: string;
  password: string;
}): Promise<{
  success: boolean;
  user: AppUser;
  role: UserRole;
  isAdmin: boolean;
  isSubscribed: boolean;
  subscription: StoreSubscription | null;
}> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  const data = await res.json().catch(() => ({ error: 'Login request failed' }));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to validate credentials against PostgreSQL app_users');
  }

  setGlobalAuthContext({
    role: data.role,
    isSubscribed: data.isSubscribed,
    email: data.user.email,
    phone: data.user.phone,
    uid: data.user.firebase_uid || `pg_user_${data.user.user_id}`
  });

  return data;
}

// PostgreSQL direct user registration creating user in app_users table
export async function registerWithPostgres(registrationData: {
  email: string;
  password: string;
  full_name?: string;
  store_name?: string;
  phone?: string;
}): Promise<{
  success: boolean;
  user: AppUser;
  role: UserRole;
  isAdmin: boolean;
  isSubscribed: boolean;
  subscription: StoreSubscription | null;
}> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registrationData)
  });

  const data = await res.json().catch(() => ({ error: 'Registration request failed' }));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to register account in PostgreSQL app_users');
  }

  setGlobalAuthContext({
    role: data.role,
    isSubscribed: data.isSubscribed,
    email: data.user.email,
    phone: data.user.phone,
    uid: data.user.firebase_uid || `pg_user_${data.user.user_id}`
  });

  return data;
}

// Auth sync helper
export async function resetPasswordWithPostgres(params: {
  identifier?: string;
  email?: string;
  phone?: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => ({ error: 'Password reset request failed' }));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to reset password in database');
  }
  return data;
}

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
