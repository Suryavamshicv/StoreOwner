import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { motion } from 'motion/react';
import { Store, MapPin, Save, ShieldCheck, CreditCard, Landmark, Globe, Hash, RefreshCw, Check, FileText, LogOut, User, Phone, Mail, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OperationType, handleFirestoreError } from '../lib/utils';
import { formatStoreId, generateRandomStoreId } from '../lib/storeUtils';

export default function StoreProfile() {
  const { user, appUser, isAdmin, signOut } = useAuth();
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
      if (!auth.currentUser) return;
      try {
        const docRef = doc(db, 'owners', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            storeName: data.storeName || data.businessName || '',
            storeCode: formatStoreId(data.storeCode || auth.currentUser.uid),
            location: data.location || data.address || '',
            businessName: data.businessName || '',
            tradeName: data.tradeName || '',
            gstin: data.gstin || '',
            pan: data.pan || '',
            fssai: data.fssai || '',
            state: data.state || 'Karnataka',
            pincode: data.pincode || '',
            paymentUPI: data.paymentUPI || '',
            payoutAccount: data.payoutAccount || '',
            customCheckoutUrl: data.customCheckoutUrl || ''
          });
        } else {
          setFormData(prev => ({
            ...prev,
            storeCode: formatStoreId(auth.currentUser?.uid)
          }));
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'owners');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

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
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'owners', auth.currentUser.uid);
      const finalStoreCode = formatStoreId(formData.storeCode || auth.currentUser.uid);
      await updateDoc(docRef, {
        storeName: formData.storeName,
        storeCode: finalStoreCode,
        location: formData.location,
        businessName: formData.businessName,
        tradeName: formData.tradeName,
        gstin: formData.gstin.toUpperCase(),
        pan: formData.pan.toUpperCase(),
        fssai: formData.fssai,
        state: formData.state,
        pincode: formData.pincode,
        paymentUPI: formData.paymentUPI,
        payoutAccount: formData.payoutAccount,
        customCheckoutUrl: formData.customCheckoutUrl.trim()
      });
      setFormData(prev => ({ ...prev, storeCode: finalStoreCode }));
      alert('Compliance and Store Profile updated successfully!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'owners');
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

        {/* User Account & Session Controls */}
        {(() => {
          const fallbackAuth = JSON.parse(localStorage.getItem('store_owner_fallback_auth') || '{}');
          const storedPhone = localStorage.getItem('store_owner_phone') || fallbackAuth.phone || appUser?.phone || (user?.phoneNumber?.replace(/\D/g, '')) || '';
          const isUserAdmin = isAdmin || storedPhone.includes('9739765357') || user?.email?.includes('9739765357');

          const properUserName = 
            formData.businessName ||
            formData.tradeName ||
            appUser?.full_name || 
            user?.displayName || 
            fallbackAuth.businessName || 
            (isUserAdmin ? 'Admin (9739765357)' : storedPhone ? `Merchant (${storedPhone})` : 'Store Owner');

          return (
            <div className="glass-card p-6 border border-slate-200/80 rounded-3xl space-y-5 bg-white/90 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg shadow-md">
                    {properUserName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-black text-slate-900">{properUserName}</h4>
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${
                        isUserAdmin ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {isUserAdmin ? 'Administrator' : 'Verified Store Owner'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                      {storedPhone && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          +91 {storedPhone}
                        </span>
                      )}
                      {(user?.email || appUser?.email) && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {user?.email || appUser?.email}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => signOut()}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-200 hover:border-red-200 shadow-xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <span className="font-mono text-[11px]">
                  Store ID: <strong className="text-slate-800">{formData.storeCode || 'AUTO'}</strong>
                </span>
                <span className="text-[11px] text-slate-400">
                  Data secured with PostgreSQL backend & Firebase Authentication
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
