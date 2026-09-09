import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { QRCodeSVG } from 'qrcode.react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { QrCode, Share2, Download, ExternalLink, Settings, Check, RefreshCw, Sparkles, Copy, Hash, Edit3 } from 'lucide-react';
import { OperationType, handleFirestoreError } from '../lib/utils';
import { formatStoreId, generateRandomStoreId } from '../lib/storeUtils';

export default function QRGenerator() {
  const envBaseUrl = import.meta.env.VITE_QR_BASE_URL || 'https://quickscannerver1.vercel.app';
  
  const [storeData, setStoreData] = useState({
    name: 'My Store',
    storeCode: '',
    location: 'Main Terminal',
    upi: '',
    customCheckoutUrl: ''
  });
  const [configUrl, setConfigUrl] = useState('');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isEditingStoreId, setIsEditingStoreId] = useState(false);
  const [customStoreIdInput, setCustomStoreIdInput] = useState('');
  const [savingStoreId, setSavingStoreId] = useState(false);

  useEffect(() => {
    async function fetchStoreData() {
      if (!auth.currentUser) return;
      try {
        const ownerDoc = await getDoc(doc(db, 'owners', auth.currentUser.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data();
          const customUrl = data.customCheckoutUrl || '';
          const resolvedStoreCode = formatStoreId(data.storeCode || auth.currentUser.uid);
          setStoreData({
            name: data.storeName || 'My Store',
            storeCode: resolvedStoreCode,
            location: data.location || 'Main Terminal',
            upi: data.paymentUPI || '',
            customCheckoutUrl: customUrl
          });
          setCustomStoreIdInput(resolvedStoreCode);
          setConfigUrl(customUrl || envBaseUrl);
        } else {
          const defaultCode = formatStoreId(auth.currentUser?.uid);
          setStoreData(prev => ({ ...prev, storeCode: defaultCode }));
          setCustomStoreIdInput(defaultCode);
          setConfigUrl(envBaseUrl);
        }
      } catch (e) {
        console.error("Error fetching store data:", e);
      }
    }
    fetchStoreData();
  }, [envBaseUrl]);

  // Guaranteed compact Store ID max 8 digits/characters (e.g. 9QE24TFC)
  const compactStoreId = formatStoreId(storeData.storeCode || auth.currentUser?.uid);

  // Use custom configured URL if provided, otherwise fallback to the environment variable
  const activeBaseUrl = (storeData.customCheckoutUrl && storeData.customCheckoutUrl.trim() !== '') 
    ? storeData.customCheckoutUrl.trim() 
    : envBaseUrl;

  const urlParams = new URLSearchParams({
    id: compactStoreId,
    name: storeData.name,
    location: storeData.location,
    upi: storeData.upi
  });
  const checkoutUrl = `${activeBaseUrl.replace(/\/+$/, '')}?${urlParams.toString()}`;

  const handleSaveStoreId = async () => {
    if (!auth.currentUser) return;
    setSavingStoreId(true);
    try {
      const cleanId = formatStoreId(customStoreIdInput);
      const docRef = doc(db, 'owners', auth.currentUser.uid);
      await updateDoc(docRef, { storeCode: cleanId });
      setStoreData(prev => ({ ...prev, storeCode: cleanId }));
      setCustomStoreIdInput(cleanId);
      setIsEditingStoreId(false);
      alert(`Store ID successfully updated to ${cleanId}! Customer scan app will display this compact ID.`);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'owners');
    } finally {
      setSavingStoreId(false);
    }
  };

  const handleRegenerateStoreId = () => {
    const newId = generateRandomStoreId();
    setCustomStoreIdInput(newId);
  };

  const handleCopyStoreId = () => {
    navigator.clipboard.writeText(compactStoreId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSaveCustomUrl = async () => {
    if (!auth.currentUser) return;
    setSavingUrl(true);
    try {
      const cleaned = configUrl.trim();
      const docRef = doc(db, 'owners', auth.currentUser.uid);
      await updateDoc(docRef, {
        customCheckoutUrl: cleaned
      });
      setStoreData(prev => ({ ...prev, customCheckoutUrl: cleaned }));
      setIsEditingUrl(false);
      alert('Checkout QR base URL updated successfully!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'owners');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleResetToEnv = async () => {
    if (!auth.currentUser) return;
    setSavingUrl(true);
    try {
      const docRef = doc(db, 'owners', auth.currentUser.uid);
      await updateDoc(docRef, {
        customCheckoutUrl: ''
      });
      setStoreData(prev => ({ ...prev, customCheckoutUrl: '' }));
      setConfigUrl(envBaseUrl);
      setIsEditingUrl(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'owners');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = document.getElementById('store-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 80;
      canvas.height = img.height + 120;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 40, 30);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(storeData.name, canvas.width / 2, canvas.height - 50);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('Scan for Auto-Checkout', canvas.width / 2, canvas.height - 25);
        
        const a = document.createElement('a');
        a.download = `${storeData.name.replace(/\s+/g, '_')}_QR_Checkout.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${storeData.name} - QR Checkout`,
          text: `Scan to start instant self-checkout at ${storeData.name}`,
          url: checkoutUrl,
        });
      } catch (err) {
        console.log('Share dismissed');
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Layout>
      <div className="space-y-8 flex flex-col items-center pb-12 text-slate-800">
        <div className="text-center w-full max-w-xl">
          <h2 className="text-3xl font-bold text-slate-800">Customer QR Access</h2>
          <p className="text-slate-500 text-sm mt-1">Display this QR code for entrance checkout pedestals and customer mobile scanners</p>
        </div>

        {/* Configuration Notice Bar */}
        <div className="w-full max-w-lg bg-white border border-slate-200/70 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Settings className="w-4 h-4 text-netflix-red" />
              <span>QR Base URL Configuration</span>
            </div>
            <button
              onClick={() => setIsEditingUrl(!isEditingUrl)}
              className="text-xs font-bold text-netflix-red hover:underline cursor-pointer"
            >
              {isEditingUrl ? 'Cancel' : 'Change URL'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <span className="font-mono text-[11px] truncate flex-1 font-semibold text-slate-700">
              {activeBaseUrl}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
              storeData.customCheckoutUrl 
                ? 'bg-amber-100 text-amber-800' 
                : 'bg-emerald-100 text-emerald-800'
            }`}>
              {storeData.customCheckoutUrl ? 'Custom' : 'ENV: VITE_QR_BASE_URL'}
            </span>
          </div>

          {isEditingUrl && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="pt-2 border-t border-slate-100 space-y-3"
            >
              <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">
                Custom Checkout Base URL (Overrides Environment Variable)
              </label>
              <input
                type="url"
                value={configUrl}
                onChange={(e) => setConfigUrl(e.target.value)}
                placeholder="https://your-custom-checkout-app.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={handleResetToEnv}
                  disabled={savingUrl}
                  className="px-3 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset to ENV ({envBaseUrl})
                </button>
                <button
                  onClick={handleSaveCustomUrl}
                  disabled={savingUrl}
                  className="px-4 py-2 text-xs text-white bg-netflix-red hover:bg-red-700 rounded-xl font-bold transition-all shadow-xs"
                >
                  {savingUrl ? 'Saving...' : 'Save Base URL'}
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* QR Code Presentation Box */}
        <section className="bg-white border border-slate-200/60 rounded-[2.5rem] p-8 w-full max-w-lg flex flex-col items-center shadow-xs">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-50 border border-slate-100 p-6 rounded-[2.5rem] shadow-sm"
          >
            <div className="p-4 bg-white border-[8px] border-slate-900 rounded-3xl shadow-inner flex items-center justify-center">
              <QRCodeSVG 
                id="store-qr-svg"
                value={checkoutUrl}
                size={220}
                level="H"
                includeMargin={false}
              />
            </div>
          </motion.div>
          
          <div className="mt-6 text-center space-y-2 w-full max-w-sm">
            <h3 className="font-bold text-xl text-slate-900">{storeData.name}</h3>
            <p className="text-xs text-slate-500 font-medium">{storeData.location}</p>

            {/* Compact Store ID (Max 8 Digits - e.g. 9QE24TFC) */}
            <div className="pt-2 flex flex-col items-center gap-1.5">
              <div className="inline-flex items-center gap-2 bg-slate-100/90 border border-slate-200/80 px-3.5 py-1.5 rounded-xl shadow-xs">
                <Hash className="w-3.5 h-3.5 text-netflix-red" />
                <span className="font-mono text-base tracking-[0.18em] font-black text-slate-900 select-all">
                  {compactStoreId}
                </span>
                <button
                  onClick={handleCopyStoreId}
                  className="ml-1 p-1 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                  title="Copy Store ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setIsEditingStoreId(!isEditingStoreId)}
                  className="p-1 text-slate-400 hover:text-netflix-red transition-colors cursor-pointer"
                  title="Customize Store ID (Max 8 Digits)"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Store ID for Scan App
                </span>
                <span className="text-[9px] font-mono font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 rounded">
                  Max 8 Digits
                </span>
              </div>

              {isEditingStoreId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-2 text-left space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider font-black text-slate-600">
                      Edit Store ID (Max 8 Digits)
                    </label>
                    <button
                      type="button"
                      onClick={handleRegenerateStoreId}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Random</span>
                    </button>
                  </div>
                  <input
                    maxLength={8}
                    value={customStoreIdInput}
                    onChange={(e) => setCustomStoreIdInput(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8))}
                    placeholder="e.g. 9QE24TFC"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-center font-mono font-black text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsEditingStoreId(false)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveStoreId}
                      disabled={savingStoreId}
                      className="px-3.5 py-1.5 bg-netflix-red text-white text-xs font-bold rounded-lg hover:bg-red-700 cursor-pointer shadow-xs"
                    >
                      {savingStoreId ? 'Saving...' : 'Save Store ID'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </section>

        {/* Action Controls & Endpoint */}
        <div className="w-full max-w-lg space-y-4">
          <div className="glass-card p-6 text-center space-y-3">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">
                <ExternalLink className="w-3.5 h-3.5 text-netflix-red" />
                Active Checkout Endpoint
              </div>
              <button 
                onClick={handleCopy}
                className="text-xs font-bold text-netflix-red hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs font-bold break-all text-slate-800 font-mono border border-slate-100 bg-slate-50 rounded-xl p-3.5 select-all text-left">
              {checkoutUrl}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleDownload}
              className="flex flex-col items-center gap-3 bg-white border border-slate-200/50 rounded-[2rem] p-6 hover:bg-slate-50 transition-all group shadow-xs active:scale-95 cursor-pointer"
            >
              <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-netflix-red/10 transition-colors">
                <Download className="w-6 h-6 text-slate-500 group-hover:text-netflix-red" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Download QR PNG</span>
            </button>
            <button 
              onClick={handleShare}
              className="flex flex-col items-center gap-3 bg-white border border-slate-200/50 rounded-[2rem] p-6 hover:bg-slate-50 transition-all group shadow-xs active:scale-95 cursor-pointer"
            >
              <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-netflix-red/10 transition-colors">
                <Share2 className="w-6 h-6 text-slate-500 group-hover:text-netflix-red" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Share Link / Copy</span>
            </button>
          </div>
        </div>

        <div className="max-w-lg w-full bg-netflix-red/5 border border-netflix-red/15 p-5 rounded-3xl flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-netflix-red flex items-center justify-center shrink-0 shadow-md shadow-netflix-red/15 mt-0.5">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div className="text-xs text-slate-600 leading-relaxed font-medium space-y-1">
            <p className="font-bold text-slate-900">How Customer Scanning Works:</p>
            <p>
              When customers enter your store, scanning this QR code launches their instant browser-based self-checkout cart loaded with your store ID and product catalog.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

