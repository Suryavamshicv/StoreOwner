import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Box, BarChart3, QrCode, LogOut, Settings, Bell, AlertTriangle, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, appUser, isAdmin, role, isSubscribed, subscription, signOut } = useAuth();
  const [lowStockCount, setLowStockCount] = useState<number>(0);

  useEffect(() => {
    async function checkStockHealth() {
      try {
        const threshold = Number(localStorage.getItem('lowStockThreshold') || '10');
        const res = await fetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const low = data.filter((p: any) => {
              const qty = Number(p.stock ?? p.stock_quantity ?? 0);
              return qty < threshold;
            });
            setLowStockCount(low.length);
          }
        }
      } catch (e) {
        // silent fallback
      }
    }

    checkStockHealth();
    window.addEventListener('stockUpdated', checkStockHealth);
    return () => window.removeEventListener('stockUpdated', checkStockHealth);
  }, []);

  const navItems: Array<{
    icon: any;
    label: string;
    path: string;
    badge?: number;
    badgeText?: string;
  }> = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: Box, label: 'Inventory', path: '/inventory', badge: lowStockCount },
    { icon: BarChart3, label: 'Sales', path: '/sales' },
    { icon: QrCode, label: 'QR Access', path: '/qr' },
    { 
      icon: CreditCard, 
      label: 'Subscription', 
      path: '/subscription', 
      badgeText: isAdmin ? 'Admin' : isSubscribed ? 'Active' : 'Upgrade' 
    },
    { icon: Settings, label: 'Settings', path: '/profile' },
  ];

  if (isAdmin) {
    navItems.push({ icon: ShieldCheck, label: 'Admin Portal', path: '/admin', badge: undefined });
  }

  const handleOpenLowStockAlerts = () => {
    navigate('/inventory?filter=low-stock');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const fallbackAuth = JSON.parse(localStorage.getItem('store_owner_fallback_auth') || '{}');
  const storedPhone = localStorage.getItem('store_owner_phone') || fallbackAuth.phone || appUser?.phone || (user?.phoneNumber?.replace(/\D/g, '')) || '';
  const isUserAdmin = isAdmin || storedPhone.includes('9739765357') || user?.email?.includes('9739765357');

  const currentUserName = 
    appUser?.full_name || 
    user?.displayName || 
    fallbackAuth.businessName || 
    (isUserAdmin ? 'Admin (9739765357)' : storedPhone ? `Merchant (${storedPhone})` : 'Store Owner');

  return (
    <div className="flex min-h-screen bg-netflix-black overflow-hidden relative">
      {/* Background Glows */}
      <div className="background-glow pointer-events-none">
        <div className="glow-red opacity-40"></div>
        <div className="glow-blue opacity-40"></div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 h-screen glass sticky top-0 flex-col z-40">
        <div className="p-6">
          <div className="flex items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-netflix-red rounded-lg flex items-center justify-center font-black text-xl text-white">S</div>
              <div>
                <h1 className="text-lg font-bold tracking-tight font-display text-slate-800 leading-tight">StoreOwner</h1>
                <p className="text-[10px] text-slate-400 font-medium">Retail Operations</p>
              </div>
            </div>

            {/* Notification Bell */}
            <button
              onClick={handleOpenLowStockAlerts}
              className={cn(
                "relative p-2 rounded-xl transition-all cursor-pointer",
                lowStockCount > 0 
                  ? "bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200" 
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              )}
              title={lowStockCount > 0 ? `${lowStockCount} items below stock threshold` : 'Inventory stock health optimal'}
            >
              <Bell className={cn("w-4 h-4", lowStockCount > 0 && "animate-wiggle")} />
              {lowStockCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-netflix-red text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                  {lowStockCount > 99 ? '99+' : lowStockCount}
                </span>
              )}
            </button>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all font-medium text-sm",
                  isActive ? "bg-netflix-red/10 text-netflix-red font-bold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-mono font-black px-1.5 py-0.5 rounded-full shadow-xs animate-pulse">
                      {item.badge}
                    </span>
                  )}
                  {item.badgeText && (
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                      item.badgeText === 'Admin'
                        ? "bg-purple-100 text-purple-700 border border-purple-200"
                        : item.badgeText === 'Active'
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-netflix-red/10 text-netflix-red border border-netflix-red/20 font-bold"
                    )}>
                      {item.badgeText}
                    </span>
                  )}
                </div>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 space-y-3">
          {/* Quick Subscription Card */}
          <div 
            onClick={() => navigate('/subscription')}
            className="p-3 bg-gradient-to-br from-slate-50 to-white hover:border-netflix-red/30 border border-slate-200/90 rounded-2xl cursor-pointer transition-all group shadow-xs"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-slate-500">
                <CreditCard className="w-3.5 h-3.5 text-netflix-red" />
                <span className="text-[10px] font-black uppercase tracking-wider">Plan Status</span>
              </div>
              <span className={cn(
                "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider",
                isAdmin 
                  ? "bg-purple-100 text-purple-700" 
                  : isSubscribed 
                  ? "bg-emerald-100 text-emerald-700" 
                  : "bg-amber-100 text-amber-800"
              )}>
                {isAdmin ? 'Admin' : isSubscribed ? 'Active' : 'Unsubscribed'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 group-hover:text-netflix-red transition-colors">
              <span className="truncate">
                {isAdmin ? 'Enterprise Unlimited' : (subscription?.plan_name || 'Professional Plan')}
              </span>
              <span className="text-[11px] text-slate-400 group-hover:translate-x-0.5 transition-transform ml-1">→</span>
            </div>
          </div>

          <div className="p-3.5 bg-netflix-red/10 border border-netflix-red/20 rounded-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-netflix-red uppercase tracking-widest mb-1">Signed in as</p>
              {lowStockCount > 0 && (
                <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.2 rounded">
                  {lowStockCount} Low
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-slate-800 truncate" title={currentUserName}>{currentUserName}</p>
            <button 
              onClick={handleSignOut}
              className="w-full mt-2.5 flex items-center justify-center gap-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors text-slate-700 cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen relative z-10">
        {/* Mobile Header */}
        <header className="md:hidden glass border-x-0 border-t-0 fixed top-0 w-full z-40 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-netflix-red rounded-lg flex items-center justify-center font-black text-sm text-white">S</div>
              <h1 className="text-netflix-red text-xl font-black font-display tracking-tighter">StoreOwner</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/subscription')}
                className="px-2.5 py-1 bg-netflix-red/10 border border-netflix-red/20 text-netflix-red rounded-lg text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
              >
                <CreditCard className="w-3 h-3" />
                <span>{isSubscribed ? 'Plan' : 'Subscribe'}</span>
              </button>
              <button
                onClick={handleOpenLowStockAlerts}
                className={cn(
                  "relative p-2 rounded-xl transition-all cursor-pointer",
                  lowStockCount > 0 ? "text-netflix-red bg-red-50" : "text-slate-400"
                )}
              >
                <Bell className="w-5 h-5" />
                {lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-netflix-red text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                    {lowStockCount}
                  </span>
                )}
              </button>
              <button 
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-slate-800 cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 pt-20 md:pt-8 md:pb-8 pb-28 px-4 sm:px-6 max-w-7xl mx-auto w-full">
          {children}
        </main>

        {/* Mobile Navigation */}
        <nav className="md:hidden glass border-x-0 border-b-0 fixed bottom-0 left-0 right-0 z-40 px-3 pt-3 pb-6">
          <div className="flex items-center justify-around max-w-md mx-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex flex-col items-center gap-1 transition-all relative py-1 px-2 rounded-xl",
                  isActive ? "text-netflix-red font-bold" : "text-gray-500"
                )}
              >
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-netflix-red text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider leading-none mt-0.5 truncate max-w-[60px]">
                  {item.label === 'Subscription' ? 'Plans' : item.label.split(' ')[0]}
                </span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
