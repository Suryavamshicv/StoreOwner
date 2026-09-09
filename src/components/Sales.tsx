import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion } from 'motion/react';
import { Receipt, Calendar, User, ShoppingBag } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Sales() {
  const [sales, setSales] = useState<any[]>([]);

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'sales'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    setSales(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }

  return (
    <Layout>
      <div className="space-y-6 pb-12 text-slate-800">
        <header>
          <h2 className="text-3xl font-bold text-slate-800">Sales History</h2>
          <p className="text-slate-500 text-sm">Real-time payment tracking & payout status</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sales.length > 0 ? sales.map((sale, idx) => (
            <motion.div
              key={sale.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card p-6 border border-slate-200/40"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-600 border border-green-500/25">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-slate-800">Order #{sale.id.slice(0, 8).toUpperCase()}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(sale.createdAt).toLocaleDateString()} • {new Date(sale.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black tracking-tight text-green-600">₹{sale.total}</p>
                  <span className={cn(
                    "text-[10px] font-black uppercase py-1 px-3 rounded-full mt-2 inline-block shadow-xs",
                    sale.paymentStatus === 'completed' ? "bg-green-500/10 text-green-600 border border-green-500/10" : "bg-yellow-500/10 text-yellow-600 border border-yellow-500/10"
                  )}>
                    {sale.paymentStatus}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <ShoppingBag className="w-4 h-4" />
                  {sale.itemsCount} Products
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <User className="w-4 h-4" />
                  Direct Checkout
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="col-span-full text-center py-24 glass-card border-slate-200/40">
              <Receipt className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-400" />
              <p className="text-slate-400 font-medium tracking-wide">No sales records available</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
