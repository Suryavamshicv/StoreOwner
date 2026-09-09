import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Box, BarChart3, QrCode, LogOut, Settings, Bell, AlertTriangle, ShieldCheck } from 'lucide-react';
import { logoutFromPostgres } from '../lib/postgresApi';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isAdmin, role, isSubscribed, user } = useAuth();
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

  const navItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: Box, label: 'Inventory', path: '/inventory', badge: lowStockCount },
    { icon: BarChart3, label: 'Sales', path: '/sales' },
    { icon: QrCode, label: 'QR Access', path: '/qr' },
    { icon: Settings, label: 'Profile', path: '/profile' },
  ];

  if (isAdmin) {
    navItems.push({ icon: ShieldCheck, label: 'Admin Portal', path: '/admin', badge: undefined });
  }

  const handleOpenLowStockAlerts = () => {
    navigate('/inventory?filter=low-stock');
  };

  const handleSignOut = async () => {
    try {
      await logoutFromPostgres();
      window.location.replace('/auth');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Unable to sign out. Please try again.');
    }
  };

  const currentUserName = user?.displayName || user?.email || 'Store Owner';

  return (
    <div className="flex min-h-screen bg-netflix-black overflow-hidden relative">
      {/* Background Glows */}
      <div className="background-glow pointer-events-none">
        <div className="glow-red opacity-40"></div>
        <div className="glow-blue opacity-40"></div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 h-screen glass sticky top-0 flex-col z-40">
        <div className="p-8">
          <div className="flex items-center justify-between gap-3 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-netflix-red rounded-lg flex items-center justify-center font-black text-xl text-white">S</div>
              <h1 className="text-xl font-bold tracking-tight font-display text-slate-800">StoreOwner</h1>
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

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium",
                  isActive ? "bg-netflix-red/10 text-netflix-red" : "text-slate-500 hover:text-slate-800"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-mono font-black px-2 py-0.5 rounded-full shadow-xs animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-6">
          <div className="p-4 bg-netflix-red/10 border border-netflix-red/20 rounded-2xl">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-netflix-red uppercase tracking-widest mb-1">Signed in as</p>
              {lowStockCount > 0 && (
                <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.2 rounded">
                  {lowStockCount} Low
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-slate-800 truncate" title={currentUserName}>{currentUserName}</p>
            <button 
              onClick={handleSignOut}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors text-slate-700 cursor-pointer"
            >
              <LogOut className="w-3 h-4" />
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
            <h1 className="text-netflix-red text-2xl font-bold font-display tracking-tighter">STORE</h1>
            <div className="flex items-center gap-3">
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

        <main className="flex-1 pt-24 md:pt-8 md:pb-8 pb-32 px-6 max-w-7xl mx-auto w-full">
          {children}
        </main>

        {/* Mobile Navigation */}
        <nav className="md:hidden glass border-x-0 border-b-0 fixed bottom-0 left-0 right-0 z-40 px-6 pt-4 pb-8">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex flex-col items-center gap-1 transition-all relative",
                  isActive ? "text-netflix-red" : "text-gray-500"
                )}
              >
                <div className="relative">
                  <item.icon className="w-6 h-6" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 bg-netflix-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none mt-1">
                  {item.label.split(' ')[0]}
                </span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
