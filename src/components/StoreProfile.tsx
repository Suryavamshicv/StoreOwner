import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { motion } from 'motion/react';
import { Store, MapPin, Save, ShieldCheck, CreditCard, Landmark, Globe, Hash, RefreshCw, Check, FileText } from 'lucide-react';
import { formatStoreId, generateRandomStoreId } from '../lib/storeUtils';
import { updateAppUser } from '../lib/postgresApi';
import { useAuth } from '../context/AuthContext';

export default function StoreProfile() {
  const { appUser, refreshAuth } = useAuth();
  const envBaseUrl = import.meta.env.VITE_QR_BASE_URL || 'https://quickscannerver1.vercel.app';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    storeName: '',
    storeCode: '',
    location: '',
    businessName: '',
    tradeName: '',
    gstin: '',
    pan: '',
    fssai: '',
    state: 'Karnataka',
    pincode: '',
    paymentUPI: '',
    payoutAccount: '',
    customCheckoutUrl: ''
  });

  useEffect(() => {
    async function fetchProfile() {
      try {
        setFormData(prev => ({
          ...prev,
          storeName: appUser?.store_name || '',
          storeCode: formatStoreId(appUser?.firebase_uid || String(appUser?.user_id || '')),
          businessName: appUser?.full_name || '',
          tradeName: appUser?.store_name || ''
        }));
      } catch (e) {
        console.error('Failed to load PostgreSQL profile:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [appUser]);

  const handleRegenerateCode = () => {
    const newCode = generateRandomStoreId();
    setFormData(prev => ({ ...prev, storeCode: newCode }));
  };

  const handleStoreCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
    setFormData(prev => ({ ...prev, storeCode: clean }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.user_id) return;
    setSaving(true);
    try {
      const finalStoreCode = formatStoreId(formData.storeCode || String(appUser.user_id));
      await updateAppUser(appUser.user_id, {
        full_name: formData.businessName,
        store_name: formData.tradeName || formData.storeName,
        phone: appUser.phone
      });
      await refreshAuth();
      setFormData(prev => ({ ...prev, storeCode: finalStoreCode }));
      alert('Store profile updated successfully!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update store profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-20 text-netflix-red font-bold">Loading...</div>
    </Layout>
  );

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8 pb-12 text-slate-800">
        <header>
          <h2 className="text-3xl font-bold text-slate-800">Store Profile & Indian Compliance</h2>
          <p className="text-slate-500 text-sm">Manage business entity details, GSTIN, PAN, FSSAI licenses, and store checkout endpoints</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass-card p-8 space-y-6">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Legal & Tax Compliance Details (India Retail Law)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1">Legal Business Name</label>
                <input 
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="e.g. Sharma Retail Pvt Ltd"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-5 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1">Trade / Brand Name</label>
                <input 
                  value={formData.tradeName}
                  onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                  placeholder="e.g. Fresh Mart Supermarket"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-5 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-netflix-red" />
                  GSTIN (15 Chars)
                </label>
                <input 
                  maxLength={15}
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  placeholder="29AAAAA0000A1Z5"
                  className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-900 font-mono font-bold text-xs uppercase focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-netflix-red" />
                  PAN (10 Chars)
                </label>
                <input 
                  maxLength={10}
                  value={formData.pan}
                  onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                  placeholder="ABCDE1234F"
                  className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-900 font-mono font-bold text-xs uppercase focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1">FSSAI License (14 Digits)</label>
                <input 
                  maxLength={14}
                  value={formData.fssai}
                  onChange={(e) => setFormData({ ...formData, fssai: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                  placeholder="10020021000555"
                  className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1 flex items-center gap-2">
                  <Store className="w-3 h-3 text-slate-500" />
                  Store Public Name
                </label>
                <input 
                  required
                  value={formData.storeName}
                  onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                  placeholder="e.g. Metro Fresh #442"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-netflix-red/30 font-bold text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1 flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-slate-500" />
                  Store Address & Location
                </label>
                <input 
                  required
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Ground Floor, Sector 5, Bangalore"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-netflix-red/30 font-bold text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1">State</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-5 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                >
                  <option value="Karnataka">Karnataka</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                  <option value="Gujarat">Gujarat</option>
                  <option value="Telangana">Telangana</option>
                  <option value="Kerala">Kerala</option>
                  <option value="West Bengal">West Bengal</option>
                  <option value="Other">Other State</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1">Pincode</label>
                <input 
                  maxLength={6}
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="560001"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-5 text-slate-800 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
            </div>

            {/* Store ID (Max 8 Digits for Scan App Compatibility) */}
            <div className="space-y-2 bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-black flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-netflix-red" />
                  Store ID (Max 8 Digits for Scan App)
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-black text-netflix-red bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                    {formData.storeCode.length}/8 Digits
                  </span>
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate</span>
                  </button>
                </div>
              </div>
              <input 
                required
                maxLength={8}
                value={formData.storeCode}
                onChange={handleStoreCodeChange}
                placeholder="e.g. 9QE24TFC"
                className="w-full bg-white border border-slate-200 rounded-xl py-3 px-5 text-slate-900 font-mono text-xl font-black tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-netflix-red/30 shadow-inner"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1 flex items-center gap-2">
                  <CreditCard className="w-3 h-3 text-slate-500" />
                  Payment UPI ID
                </label>
                <input 
                  value={formData.paymentUPI}
                  onChange={(e) => setFormData({ ...formData, paymentUPI: e.target.value })}
                  placeholder="name@upi"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 px-5 text-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black ml-1 flex items-center gap-2">
                  <Landmark className="w-3 h-3 text-slate-500" />
                  Bank Account / Payout Detail
                </label>
                <input 
                  value={formData.payoutAccount}
                  onChange={(e) => setFormData({ ...formData, payoutAccount: e.target.value })}
                  placeholder="A/C No & IFSC"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 px-5 text-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-4 bg-netflix-red hover:bg-red-700 text-white font-black rounded-2xl shadow-xl shadow-netflix-red/25 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer uppercase tracking-wider text-sm"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Saving Compliance & Profile...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Save Compliance & Store Profile</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}
