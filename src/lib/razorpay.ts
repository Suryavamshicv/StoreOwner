/**
 * Razorpay Payment Gateway integration for StoreOwner Supermarket Suite
 */

export interface RazorpayConfig {
  keyId: string;
  isConfigured: boolean;
  currency: string;
}

export interface RazorpayOrderResponse {
  success: boolean;
  order: {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status: string;
  };
  keyId: string;
  isSimulated?: boolean;
}

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}

/**
 * Ensures Razorpay Checkout script is loaded in the browser
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      return resolve(true);
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Razorpay script could not be loaded from CDN');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Fetches Razorpay public config from backend
 */
export async function getRazorpayConfig(): Promise<RazorpayConfig> {
  try {
    const res = await fetch('/api/razorpay/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to load razorpay config:', err);
  }
  return {
    keyId: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_51StoreOwnerDemo',
    isConfigured: false,
    currency: 'INR'
  };
}

/**
 * Creates a server-side order for Razorpay checkout
 */
export async function createRazorpayOrder(params: {
  amount: number;
  currency?: string;
  plan_tier: string;
  plan_name: string;
  billing_cycle: 'monthly' | 'yearly';
  store_name?: string;
  user_email?: string;
}): Promise<RazorpayOrderResponse> {
  const res = await fetch('/api/razorpay/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to initialize Razorpay checkout order');
  }

  return await res.json();
}

/**
 * Verifies Razorpay payment and activates store subscription in database
 */
export async function verifyRazorpayPayment(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature?: string;
  plan_tier: string;
  plan_name: string;
  billing_cycle: string;
  price: number;
  user_id?: number | null;
  firebase_uid?: string | null;
  email?: string;
  phone?: string;
  store_name?: string;
  inventory_limit?: number;
  days?: number;
}): Promise<{ success: boolean; subscription: any; message: string }> {
  const res = await fetch('/api/razorpay/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Payment verification failed');
  }

  return await res.json();
}
