import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { collection, query, where, getDocs, limit, orderBy, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion } from 'motion/react';
import { TrendingUp, Package, DollarSign, ArrowUpRight, ArrowDownRight, AlertTriangle, Database } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { fetchPostgresProducts } from '../lib/postgresApi';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState({
    totalSales: 0,
    inventoryCount: 0,
    recentSales: [] as any[]
  });
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [isPostgresActive, setIsPostgresActive] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // 1. Try fetching inventory directly from PostgreSQL (Vercel / Prisma)
      let allItems: any[] = [];
      try {
        const pgProducts = await fetchPostgresProducts();
        if (pgProducts && pgProducts.length > 0) {
          allItems = pgProducts;
          setIsPostgresActive(true);
        }
      } catch (err) {
        console.warn('Dashboard: Postgres fetch notice:', err);
      }

      let total = 0;
      let recentSalesList: any[] = [];
      let thresholdVal = Number(localStorage.getItem('lowStockThreshold') || '10');

      if (auth.currentUser) {
        try {
          const salesQuery = query(
            collection(db, 'sales'),
            where('ownerId', '==', auth.currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(5)
          );
          const ownerDocRef = doc(db, 'owners', auth.currentUser.uid);

          const [salesSnap, ownerSnap] = await Promise.all([
            getDocs(salesQuery),
            getDoc(ownerDocRef)
          ]);

          total = salesSnap.docs.reduce((acc, doc) => acc + (doc.data().total || 0), 0);
          recentSalesList = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          if (ownerSnap.exists() && ownerSnap.data().lowStockThreshold !== undefined) {
            thresholdVal = ownerSnap.data().lowStockThreshold;
            localStorage.setItem('lowStockThreshold', String(thresholdVal));
          }

          // If PostgreSQL wasn't loaded, fallback to Firestore inventory
          if (allItems.length === 0) {
            const inventoryQuery = query(
              collection(db, 'inventory'),
              where('ownerId', '==', auth.currentUser.uid)
            );
            const invSnap = await getDocs(inventoryQuery);
            allItems = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn('Dashboard fetch data error:', e);
        }
      }

      setLowStockThreshold(thresholdVal);
      const lowItems = allItems.filter((item: any) => Number(item.stock ?? item.stock_quantity ?? 0) < thresholdVal);
      setLowStockItems(lowItems);

      setStats({
        totalSales: total,
        inventoryCount: allItems.length,
        recentSales: recentSalesList
      });
    }
    fetchData();
    window.addEventListener('stockUpdated', fetchData);
    return () => window.removeEventListener('stockUpdated', fetchData);
  }, []);

  const cards = [
    { label: 'Total Revenue', value: `₹${stats.totalSales.toLocaleString()}`, icon: DollarSign, trend: '+12%', up: true },
    { label: 'Items in Stock', value: stats.inventoryCount.toString(), icon: Package, trend: '-2', up: false },
    { label: 'Market Reach', value: 'High', icon: TrendingUp, trend: '+5%', up: true },
  ];  return (
    <Layout>
      <div className="space-y-8 pb-12 text-slate-800">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-slate-800">Welcome back, {auth.currentUser?.displayName?.split(' ')[0] || 'Store Owner'}</h2>
              {isAdmin && isPostgresActive && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Postgres DB Connected (Admin View)
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm">
              Your store inventory and sales are synchronized with the scanning app ({stats.inventoryCount} products indexed).
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-netflix-red to-blue-400 border-2 border-slate-200 shadow-md"></div>
          </div>
        </header>

        {/* Low Stock Warning Notification Banner */}
        {lowStockItems.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-red-50 border border-red-200 text-red-800 rounded-3xl shadow-xs animate-pulse"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl mt-0.5 sm:mt-0">
                <AlertTriangle className="w-5 h-5 text-red-650" />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-wider text-red-950">Low Stock Alert Notification</p>
                <p className="text-xs text-red-700 font-medium">
                  {lowStockItems.length} item(s) are below your defined threshold of {lowStockThreshold} units.
                </p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/inventory?filter=low-stock')}
              className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-md shadow-red-500/10 active:scale-95 shrink-0 cursor-pointer"
            >
              View & Restock Items ({lowStockItems.length})
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-card p-6 flex flex-col justify-between"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-netflix-red/10 rounded-2xl">
                  <card.icon className="w-6 h-6 text-netflix-red" />
                </div>
                <div className={cn(
                  "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
                  card.up ? "bg-green-500/10 text-green-600" : "bg-netflix-red/10 text-netflix-red"
                )}>
                  {card.trend}
                  {card.up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">{card.label}</p>
                <h3 className="text-4xl font-black tracking-tight text-slate-800">{card.value}</h3>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white border border-slate-200/50 shadow-xs rounded-[2.5rem] p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-800">Recent Sales</h3>
              <button className="text-netflix-red text-xs font-bold hover:underline">View All Records</button>
            </div>
            <div className="space-y-4">
              {stats.recentSales.length > 0 ? stats.recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center text-green-600 font-bold">
                      ₹
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-850">Order #{sale.id.slice(0, 5)}</p>
                      <p className="text-xs text-slate-400">{new Date(sale.createdAt).toLocaleTimeString()} • {sale.itemsCount} items</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">+₹{sale.total}</p>
                    <p className="text-[10px] text-slate-400 italic uppercase font-semibold">{sale.paymentStatus}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 text-slate-400 italic text-sm">
                  No recent sales recorded.
                </div>
              )}
            </div>
            
            <div className="mt-8 p-4 bg-netflix-red/5 border border-netflix-red/15 rounded-2xl flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-netflix-red flex items-center justify-center shadow-md">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                 <p className="text-xs font-bold text-slate-800">Direct Payouts: OK</p>
                 <p className="text-[10px] text-slate-500 leading-tight">Funds appearing in your dashboard are being routed instantly.</p>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200/50 shadow-xs rounded-[2.5rem] p-8 flex flex-col justify-center items-center text-center space-y-6">
            <div className="p-6 bg-slate-50 border border-slate-200/30 rounded-3xl shadow-xs">
              <div className="w-32 h-32 bg-slate-100/50 flex items-center justify-center rounded-xl">
                 {lowStockItems.length > 0 ? (
                   <AlertTriangle className="w-16 h-16 text-red-500 animate-bounce" />
                 ) : (
                   <Package className="w-16 h-16 text-slate-600 opacity-20" />
                 )}
              </div>
            </div>
            <div>
              <h4 className="text-xl font-bold text-slate-800">Inventory Alert</h4>
              <p className="text-slate-500 text-sm mt-2 max-w-[280px]">
                {lowStockItems.length > 0 ? (
                  <span className="text-red-500 font-bold block">
                    {lowStockItems.length} item(s) are running extremely low! (below {lowStockThreshold} Units)
                  </span>
                ) : (
                  'All items are well stocked and currently within safe limits.'
                )}
              </p>
              {lowStockItems.length > 0 && (
                <div className="mt-3 text-xs text-slate-500 max-w-[280px] bg-slate-50 p-3 rounded-2xl border border-slate-100 italic">
                  Running low: {lowStockItems.map(i => i.name).join(', ')}
                </div>
              )}
            </div>
            <button 
              onClick={() => navigate('/inventory')}
              className={cn(
                "w-full max-w-[200px] py-3 rounded-xl text-sm font-bold text-white transition-all shadow-md active:scale-95",
                lowStockItems.length > 0 
                  ? "bg-red-600 hover:opacity-90 shadow-red-500/15" 
                  : "bg-netflix-red hover:opacity-90 shadow-netflix-red/15"
              )}
            >
              Manage Items
            </button>
          </section>
        </div>
      </div>
    </Layout>
  );
}
