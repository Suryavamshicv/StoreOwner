import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Star, Zap, ShieldCheck, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createRazorpayOrder, verifyRazorpayPayment } from '../lib/postgresApi';

interface Props {
  onSuccess: () => void | Promise<void>;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function Subscription({ onSuccess }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: '₹100',
      features: ['Up to 500 Inventory Items', 'Standard QR Checkout', 'Basic Sales Reports'],
      icon: <Zap className="w-6 h-6 text-blue-400" />,
      color: 'from-blue-600/20'
    },
    {
      id: 'pro',
      name: 'Professional',
      price: '₹200',
      features: ['Unlimited Inventory', 'Express QR Checkout', 'Advanced Analytics', 'Priority Support'],
      icon: <Star className="w-6 h-6 text-netflix-red" />,
      color: 'from-netflix-red/20',
      popular: true
    }
  ];

  const handleSubscribe = async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      const selectedPlan = planId as 'basic' | 'pro';
      const checkoutScript = document.createElement('script');
      checkoutScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
      checkoutScript.async = true;
      await new Promise<void>((resolve, reject) => {
        checkoutScript.onload = () => resolve();
        checkoutScript.onerror = () => reject(new Error('Unable to load Razorpay Checkout'));
        document.body.appendChild(checkoutScript);
      });

      const { keyId, plan, order } = await createRazorpayOrder(selectedPlan);
      const checkout = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'StoreOwner India',
        description: `${plan.name} monthly subscription`,
        order_id: order.id,
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await verifyRazorpayPayment({ planId: selectedPlan, ...response });
            await onSuccess();
          } catch (verificationError: any) {
            setError(verificationError.message || 'Payment verification failed.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false)
        },
        theme: { color: '#e50914' }
      });
      checkout.open();
    } catch (paymentError: any) {
      setError(paymentError.message || 'Unable to start payment.');
      setLoading(false);
    } finally {
      // The checkout callback controls loading after the payment window opens.
    }
  };

  return (
    <div className="min-h-screen px-6 py-12 flex flex-col items-center bg-netflix-black relative overflow-hidden text-slate-800">
      {/* Background Glows */}
      <div className="background-glow pointer-events-none">
        <div className="glow-red opacity-30"></div>
        <div className="glow-blue opacity-30"></div>
      </div>

      <header className="w-full max-w-5xl flex items-center justify-between mb-12 z-10">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-netflix-red text-white flex items-center justify-center text-xl font-black shadow-lg">S</span>
          <span className="text-xl font-black tracking-tight text-slate-800">StoreOwner India</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/80 border border-slate-200 text-slate-600 text-sm font-bold hover:bg-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/80 border border-slate-200 text-slate-600 text-sm font-bold hover:bg-white transition-colors">
            <Home className="w-4 h-4" />
            Home
          </button>
        </div>
      </header>

      <div className="text-center mb-12 z-10">
        <h1 className="text-4xl font-black font-display mb-4 tracking-tight text-slate-800">Choose Your Plan</h1>
        <p className="text-slate-500 max-w-sm mx-auto">Manage your store effortlessly with our powerful inventory tools and instant payouts.</p>
        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl z-10">
        {plans.map((plan) => (
          <motion.div
            key={plan.id}
            whileHover={{ scale: 1.02 }}
            className={`glass-card relative overflow-hidden p-8 ${plan.popular ? 'border-netflix-red shadow-2xl shadow-netflix-red/10 animate-pulse-subtle' : ''}`}
          >
            {plan.popular && (
              <div className="absolute top-4 right-4 bg-netflix-red text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                Recommended
              </div>
            )}
            
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/50">
                {plan.icon}
              </div>
              <h3 className="text-2xl font-black text-slate-850">{plan.name}</h3>
            </div>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-black text-slate-800">{plan.price}</span>
              <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]"> / month</span>
            </div>

            <ul className="space-y-4 mb-10 min-h-[160px]">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-3 text-sm text-slate-600">
                  <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                    <Check className="w-3 h-3 text-green-500" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSubscribe(plan.id)}
              disabled={loading}
              className={`w-full py-4 rounded-2xl font-black transition-all shadow-md ${
                plan.popular 
                  ? 'bg-netflix-red hover:opacity-90 text-white shadow-netflix-red/20' 
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {loading ? 'Processing...' : 'Activate Plan'}
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 flex items-center gap-3 text-slate-400 text-[10px] font-black uppercase tracking-widest z-10">
        <ShieldCheck className="w-4 h-4" />
        Secure 256-bit SSL Encrypted Payment
      </div>
    </div>
  );
}
