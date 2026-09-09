import React, { useState, useEffect, useMemo } from 'react';
import Layout from './Layout';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Edit3, Trash2, X, PackageOpen, AlertTriangle, 
  QrCode, Camera, Sparkles, Printer, Tag, Database, Code, 
  CheckCircle2, Copy, Check, Barcode as BarcodeIcon, Layers,
  UploadCloud, Download, FileSpreadsheet, RefreshCw, Bell, BellRing, Filter,
  PlusCircle, AlertCircle, Lock, ShieldCheck
} from 'lucide-react';
import { OperationType, handleFirestoreError, cn } from '../lib/utils';
import ScannerModal from './ScannerModal';
import ItemQRModal from './ItemQRModal';
import CsvUploadModal from './CsvUploadModal';
import { QRCodeSVG } from 'qrcode.react';
import { CodeType, SupermarketProduct } from '../types';
import { 
  fetchPostgresProducts, 
  createPostgresProduct, 
  updatePostgresProduct, 
  deletePostgresProduct, 
  getPostgresStatus, 
  updatePostgresStock,
  PostgresStatus 
} from '../lib/postgresApi';

const DEFAULT_CATEGORIES = [
  'Dairy & Eggs',
  'Bakery & Snacks',
  'Beverages',
  'Pantry & Staples',
  'Fresh Produce',
  'Frozen Foods',
  'Personal Care',
  'Household Essentials'
];

export default function Inventory() {
  const navigate = useNavigate();
  const { isAdmin, isSubscribed, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<SupermarketProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isRestockDrawerOpen, setIsRestockDrawerOpen] = useState(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [selectedQRItem, setSelectedQRItem] = useState<any | null>(null);
  const [isBatchPrintOpen, setIsBatchPrintOpen] = useState(false);
  const [storeName, setStoreName] = useState('My Supermarket');
  const [copiedSQL, setCopiedSQL] = useState(false);
  
  const [editingItem, setEditingItem] = useState<any>(null);
  const [scannerTarget, setScannerTarget] = useState<'barcode' | 'qrCode'>('barcode');
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);
  const [formError, setFormError] = useState('');
  const [dbSyncToast, setDbSyncToast] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    description: '',
    price: '',
    stock: '',
    category: 'Dairy & Eggs',
    customCategory: '',
    qrCode: '',
    barcode: '',
    codeType: 'QR_CODE' as CodeType
  });

  // Real-time Duplicate Barcode Check (ensures barcode is unique across database)
  const duplicateBarcodeItem = useMemo(() => {
    const enteredBarcode = formData.barcode.trim().toLowerCase();
    if (!enteredBarcode) return null;
    return items.find(item => {
      if (editingItem) {
        const currentId = String(editingItem.id || editingItem.product_id);
        const itemId = String(item.id || (item as any).product_id);
        if (currentId === itemId) return false;
      }
      const itemBarcode = (item.barcode || item.qrCode || item.code_payload || '').trim().toLowerCase();
      return itemBarcode === enteredBarcode;
    });
  }, [formData.barcode, items, editingItem]);

  // Real-time Duplicate Product Name Check
  const duplicateNameItem = useMemo(() => {
    const enteredName = formData.name.trim().toLowerCase();
    if (!enteredName) return null;
    return items.find(item => {
      if (editingItem) {
        const currentId = String(editingItem.id || editingItem.product_id);
        const itemId = String(item.id || (item as any).product_id);
        if (currentId === itemId) return false;
      }
      const itemName = (item.name || item.product_name || '').trim().toLowerCase();
      return itemName === enteredName;
    });
  }, [formData.name, items, editingItem]);
  const [threshold, setThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('lowStockThreshold');
    return saved !== null ? Math.max(0, parseInt(saved) || 10) : 10;
  });
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [pgStatus, setPgStatus] = useState<PostgresStatus | null>(null);
  const [isPostgresActive, setIsPostgresActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('filter') === 'low-stock') {
      setFilterLowStockOnly(true);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchItems();
    fetchStoreInfo();
  }, []);

  async function fetchStoreInfo() {
    const local = localStorage.getItem('lowStockThreshold');
    if (local !== null) {
      setThreshold(Math.max(0, parseInt(local) || 10));
    }
    if (!auth.currentUser) return;
    try {
      const docRef = doc(db, 'owners', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (d.lowStockThreshold !== undefined) {
          setThreshold(d.lowStockThreshold);
          localStorage.setItem('lowStockThreshold', String(d.lowStockThreshold));
        }
        if (d.storeName) setStoreName(d.storeName);
      }
    } catch (e) {
      console.error("Error fetching store info", e);
    }
  }

  const handleSaveThreshold = async (newVal?: number) => {
    const targetVal = typeof newVal === 'number' ? newVal : threshold;
    setThreshold(targetVal);
    localStorage.setItem('lowStockThreshold', String(targetVal));
    window.dispatchEvent(new Event('stockUpdated'));

    if (!auth.currentUser) return;
    setSavingThreshold(true);
    try {
      const docRef = doc(db, 'owners', auth.currentUser.uid);
      await updateDoc(docRef, {
        lowStockThreshold: targetVal
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'owners');
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleQuickRestock = async (item: SupermarketProduct, addQty: number) => {
    const itemId = item.id || (item as any).product_id;
    const currentStock = Number(item.stock ?? item.stock_quantity ?? 0);
    const newStock = Math.max(0, currentStock + addQty);

    setRestockingId(String(itemId));

    // Optimistic state update
    setItems(prev => prev.map(p => {
      const pId = p.id || (p as any).product_id;
      if (String(pId) === String(itemId)) {
        return { ...p, stock: newStock, stock_quantity: newStock };
      }
      return p;
    }));

    try {
      await updatePostgresStock(itemId, newStock);
      if (auth.currentUser && typeof itemId === 'string' && itemId.length > 10) {
        const docRef = doc(db, 'inventory', itemId);
        await updateDoc(docRef, { stock: newStock, stock_quantity: newStock }).catch(() => {});
      }
      window.dispatchEvent(new Event('stockUpdated'));
    } catch (err: any) {
      console.error('Failed to update stock:', err);
      alert('Failed to update stock: ' + (err.message || 'Error occurred'));
      fetchItems();
    } finally {
      setRestockingId(null);
    }
  };

  async function fetchItems() {
    setIsLoading(true);
    // If user is a store owner without active subscription and not admin, block database access
    if (!isAdmin && !isSubscribed) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      // 1. Primary data source: PostgreSQL (Vercel / Prisma)
      const pgProducts = await fetchPostgresProducts();
      setItems(pgProducts);
      setIsPostgresActive(true);

      const status = await getPostgresStatus();
      setPgStatus(status);
    } catch (pgError) {
      console.warn('PostgreSQL fetch failed, falling back to Firestore:', pgError);
      setIsPostgresActive(false);

      if (auth.currentUser) {
        try {
          const q = query(
            collection(db, 'inventory'),
            where('ownerId', '==', auth.currentUser.uid)
          );
          const snap = await getDocs(q);
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupermarketProduct));
          setItems(list);
        } catch (e) {
          handleFirestoreError(e, OperationType.LIST, 'inventory');
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  const handleGenerateQRCode = () => {
    const slug = (formData.name || 'PROD').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const generated = `ITEM-${slug}-${randomSuffix}`;
    setFormData(prev => ({ ...prev, qrCode: generated }));
    setFormError('');
  };

  const openScannerFor = (target: 'barcode' | 'qrCode') => {
    setScannerTarget(target);
    setIsScannerOpen(true);
  };

  const handleScanSuccess = (code: string) => {
    const cleanCode = code.trim();
    const isEAN = /^\d{13}$/.test(cleanCode);
    const isUPC = /^\d{12}$/.test(cleanCode);
    const determinedType: CodeType = isEAN ? 'EAN_13' : isUPC ? 'UPC' : 'CODE_128';
    
    if (scannerTarget === 'barcode') {
      setFormData(prev => ({ 
        ...prev, 
        barcode: cleanCode,
        qrCode: prev.qrCode || cleanCode,
        codeType: determinedType 
      }));
    } else {
      setFormData(prev => ({ 
        ...prev, 
        qrCode: cleanCode,
        codeType: cleanCode.startsWith('ITEM-') ? 'QR_CODE' : determinedType 
      }));
    }
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Product name is required.');
      return;
    }

    // Duplicate Barcode check
    if (duplicateBarcodeItem) {
      setFormError(`Duplicate Barcode: "${formData.barcode}" is already assigned to "${duplicateBarcodeItem.name || duplicateBarcodeItem.product_name}". Please enter or scan a unique barcode.`);
      return;
    }

    setIsSubmittingItem(true);

    const finalCategory = formData.category === 'CUSTOM' ? formData.customCategory.trim() : formData.category;
    const finalBarcode = formData.barcode.trim();
    const finalQrCode = formData.qrCode.trim() || finalBarcode || `ITEM-${(formData.name || 'PROD').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    try {
      // 1. Save and synchronize directly with PostgreSQL (Vercel / Prisma)
      if (editingItem) {
        await updatePostgresProduct(editingItem.id || editingItem.product_id, {
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          description: formData.description.trim(),
          price: parseFloat(formData.price) || 0,
          stock: parseInt(formData.stock) || 0,
          category: finalCategory || 'General',
          qrCode: finalQrCode,
          barcode: finalBarcode || finalQrCode,
          codeType: formData.codeType
        });
      } else {
        await createPostgresProduct({
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          description: formData.description.trim(),
          price: parseFloat(formData.price) || 0,
          stock: parseInt(formData.stock) || 0,
          category: finalCategory || 'General',
          qrCode: finalQrCode,
          barcode: finalBarcode || finalQrCode,
          codeType: formData.codeType
        });
      }

      // 2. Optional sync with Firestore if authenticated
      if (auth.currentUser) {
        try {
          const firestoreData: Record<string, any> = {
            name: formData.name.trim(),
            product_name: formData.name.trim(),
            brand: formData.brand.trim(),
            brand_name: formData.brand.trim(),
            description: formData.description.trim(),
            product_description: formData.description.trim(),
            price: parseFloat(formData.price) || 0,
            retail_price: parseFloat(formData.price) || 0,
            stock: parseInt(formData.stock) || 0,
            stock_quantity: parseInt(formData.stock) || 0,
            category: finalCategory || 'General',
            category_name: finalCategory || 'General',
            qrCode: finalQrCode,
            barcode: finalBarcode || finalQrCode,
            code_type: formData.codeType,
            code_payload: finalBarcode || finalQrCode,
            ownerId: auth.currentUser.uid,
            updatedAt: new Date().toISOString()
          };

          if (editingItem && typeof editingItem.id === 'string' && editingItem.id.length > 10) {
            await updateDoc(doc(db, 'inventory', editingItem.id), firestoreData);
          } else {
            await addDoc(collection(db, 'inventory'), firestoreData);
          }
        } catch (e) {
          console.warn('Firestore sync note:', e);
        }
      }

      setDbSyncToast(
        editingItem 
          ? `Updated "${formData.name}" & synchronized with PostgreSQL database!`
          : `Added "${formData.name}" to inventory & synchronized with PostgreSQL database!`
      );
      setTimeout(() => setDbSyncToast(null), 4500);

      setIsModalOpen(false);
      setEditingItem(null);
      resetForm();
      await fetchItems();
      window.dispatchEvent(new Event('stockUpdated'));
    } catch (pgErr: any) {
      console.error('Failed saving to PostgreSQL:', pgErr);
      setFormError(pgErr.message || 'Failed saving product to database. Please check connection.');
    } finally {
      setIsSubmittingItem(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      brand: '',
      description: '',
      price: '',
      stock: '',
      category: 'Dairy & Eggs',
      customCategory: '',
      qrCode: '',
      barcode: '',
      codeType: 'EAN_13'
    });
    setFormError('');
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deletePostgresProduct(id);
      if (typeof id === 'string' && id.length > 10 && auth.currentUser) {
        await deleteDoc(doc(db, 'inventory', id)).catch(() => {});
      }
      fetchItems();
      window.dispatchEvent(new Event('stockUpdated'));
    } catch (e: any) {
      alert('Failed to delete: ' + (e.message || 'Error occurred'));
    }
  };

  const openNewItemModal = () => {
    if (!isAdmin && !isSubscribed) {
      alert('Active subscription required to add new items to database. Please subscribe to continue.');
      navigate('/subscribe');
      return;
    }
    setEditingItem(null);
    setFormError('');
    setFormData({
      name: '',
      brand: '',
      description: '',
      price: '',
      stock: '',
      category: 'Dairy & Eggs',
      customCategory: '',
      qrCode: '',
      barcode: '',
      codeType: 'EAN_13'
    });
    setIsModalOpen(true);
  };

  const openEditItemModal = (item: any) => {
    setEditingItem(item);
    const cat = item.category || item.category_name || 'Dairy & Eggs';
    const isCustom = !DEFAULT_CATEGORIES.includes(cat);

    setFormData({
      name: item.name || item.product_name || '',
      brand: item.brand || item.brand_name || '',
      description: item.description || item.product_description || '',
      price: (item.price ?? item.retail_price ?? '').toString(),
      stock: (item.stock ?? item.stock_quantity ?? '').toString(),
      category: isCustom ? 'CUSTOM' : cat,
      customCategory: isCustom ? cat : '',
      qrCode: item.qrCode || item.code_payload || item.barcode || `ITEM-${item.id?.slice(0, 6)}`,
      barcode: item.barcode || item.qrCode || '',
      codeType: item.code_type || 'QR_CODE'
    });
    setIsModalOpen(true);
  };

  const lowStockItems = useMemo(() => {
    return items.filter(item => {
      const qty = Number(item.stock ?? item.stock_quantity ?? 0);
      return qty < threshold;
    });
  }, [items, threshold]);

  const filteredItems = items.filter(item => {
    const name = item.name || item.product_name || '';
    const brand = item.brand || item.brand_name || '';
    const cat = item.category || item.category_name || '';
    const qr = item.qrCode || item.code_payload || '';
    const barcode = item.barcode || '';
    const qty = Number(item.stock ?? item.stock_quantity ?? 0);

    const matchesSearch = 
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      barcode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || cat === categoryFilter;
    const matchesLowStock = !filterLowStockOnly || qty < threshold;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  const sqlSchemaText = `-- PostgreSQL DDL Schema for Supermarket Architecture
-- 1. Product Categories
CREATE TABLE product_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

-- 2. Supermarket Products
CREATE TABLE supermarket_products (
    product_id SERIAL PRIMARY KEY,
    category_id INT REFERENCES product_categories(category_id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    brand_name VARCHAR(100),
    retail_price NUMERIC(10, 2) NOT NULL,
    stock_quantity INT DEFAULT 0 CHECK (stock_quantity >= 0),
    product_description TEXT,
    image_url VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Scannable Identifiers (Barcodes and QR Codes)
CREATE TABLE scannable_codes (
    code_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES supermarket_products(product_id) ON DELETE CASCADE,
    code_payload VARCHAR(512) NOT NULL UNIQUE,
    code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('QR_CODE', 'EAN_13', 'UPC', 'CODE_128')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. B-Tree Index for Instantaneous Scan Lookups
CREATE INDEX idx_scannable_codes_lookup ON scannable_codes(code_payload);`;

  const copySQL = () => {
    navigator.clipboard.writeText(sqlSchemaText);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  const handleExportCsv = () => {
    if (items.length === 0) {
      alert('No products to export.');
      return;
    }

    const headers = ['product_name', 'brand_name', 'category_name', 'retail_price', 'stock_quantity', 'product_description', 'code_payload', 'code_type'];
    const rows = items.map(item => [
      `"${(item.name || item.product_name || '').replace(/"/g, '""')}"`,
      `"${(item.brand || item.brand_name || '').replace(/"/g, '""')}"`,
      `"${(item.category || item.category_name || 'General').replace(/"/g, '""')}"`,
      item.price ?? item.retail_price ?? 0,
      item.stock ?? item.stock_quantity ?? 0,
      `"${(item.description || item.product_description || '').replace(/"/g, '""')}"`,
      `"${item.qrCode || item.code_payload || item.barcode || ''}"`,
      item.code_type || 'QR_CODE'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${storeName.toLowerCase().replace(/\s+/g, '_')}_catalog_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isAdmin && !isSubscribed) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <section className="w-full max-w-xl bg-white rounded-3xl border border-amber-200 p-8 md:p-12 shadow-sm text-center space-y-6">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider text-amber-800">Subscription Required</p>
              <h2 className="text-2xl font-black text-slate-900">Inventory is locked</h2>
              <p className="text-sm text-slate-600">Subscribe to manage your store inventory.</p>
            </div>
            <button
              onClick={() => navigate('/subscribe')}
              className="w-full py-3.5 bg-netflix-red text-white font-black rounded-2xl shadow-lg shadow-netflix-red/20 hover:bg-red-700 transition-colors"
            >
              Choose a Subscription
            </button>
          </section>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 pb-12 text-slate-800">
        {/* Header with Title and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-bold text-slate-800">Supermarket Catalog</h2>
              {isAdmin && (
                <span className="bg-purple-100 text-purple-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider border border-purple-200">
                  Admin • SQL Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage categories, products, and scannable code identifiers (QR_CODE, EAN-13, UPC, CODE_128)
            </p>
          </div>
          {(isAdmin || isSubscribed) && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setIsCsvModalOpen(true)}
                className="px-3.5 py-2.5 bg-netflix-red/10 text-netflix-red hover:bg-netflix-red/15 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 border border-netflix-red/20"
                title="Bulk Import Products from CSV File"
              >
                <UploadCloud className="w-4 h-4 text-netflix-red" />
                <span>Import CSV</span>
              </button>

              {items.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-700 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Export catalog to CSV spreadsheet"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setIsSchemaModalOpen(true)}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-700 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="View PostgreSQL Table Schema"
                >
                  <Database className="w-4 h-4 text-slate-600" />
                  <span>Schema</span>
                </button>
              )}

              {items.length > 0 && (
                <button
                  onClick={() => setIsBatchPrintOpen(true)}
                  className="px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl text-slate-700 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print Tags</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* PostgreSQL Live Integration Status Banner (Only Admin Can See) */}
        {isAdmin && (
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 shadow-lg border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {isPostgresActive ? 'PostgreSQL Active (Admin View)' : 'Firestore Fallback'}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    db.prisma.io:5432/postgres
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Connected to scanning app database • <strong className="text-white font-black">{items.length} Products</strong> in catalog ({pgStatus?.counts?.scannableCodes ?? items.length} scannable codes indexed)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 self-end md:self-center flex-wrap">
              <button
                onClick={() => fetchItems()}
                disabled={isLoading}
                className="px-3.5 py-2 bg-slate-700/80 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer active:scale-95 border border-slate-600"
                title="Refresh and sync data from PostgreSQL database"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                <span>{isLoading ? 'Syncing...' : 'Sync DB'}</span>
              </button>
              <button
                onClick={() => setIsSchemaModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Tables DDL</span>
              </button>
            </div>
          </div>
        )}

        {/* SUBSCRIPTION LOCKED NOTICE (IF NOT ADMIN AND NOT SUBSCRIBED) */}
        {!isAdmin && !isSubscribed && (
          <div className="bg-white rounded-3xl border border-amber-200 p-8 md:p-12 shadow-sm text-center max-w-2xl mx-auto my-8 space-y-5">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                Subscription Required
              </span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Catalog & Inventory Access Locked
              </h3>
              <p className="text-slate-600 text-sm max-w-md mx-auto leading-relaxed">
                Once the actual store owner gets an active subscription, they will be able to manage, create, and modify inventory. Currently, you do not have permission to edit, add, or view items from the database.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/subscribe')}
                className="w-full sm:w-auto px-6 py-3 bg-netflix-red text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-netflix-red/20 hover:bg-red-700 transition-all cursor-pointer"
              >
                Get Subscription Now
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full sm:w-auto px-6 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl hover:bg-slate-200 transition-all cursor-pointer"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}

        {(isAdmin || isSubscribed) && (
          <>
        {/* Low Stock Notification Alert Banner */}
        {lowStockItems.length > 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white rounded-3xl p-5 shadow-xl shadow-red-600/20 border border-red-500/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-inner">
                <BellRing className="w-6 h-6 animate-bounce" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-black/30 text-white px-2.5 py-0.5 rounded-full border border-white/20">
                    Low Stock Alert
                  </span>
                  <span className="text-xs font-mono font-black bg-white text-red-700 px-2.5 py-0.5 rounded-full shadow-xs">
                    {lowStockItems.length} Product{lowStockItems.length > 1 ? 's' : ''} Below Threshold
                  </span>
                </div>
                <h3 className="font-extrabold text-lg text-white leading-tight">
                  {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} in your inventory require immediate restocking
                </h3>
                <p className="text-xs text-red-100 font-medium">
                  Configured threshold is <strong className="text-white underline font-bold">{threshold} units</strong>. Items below this may cause cart stockout errors for shoppers using the scan app.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end md:self-center shrink-0 flex-wrap">
              <button
                onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2",
                  filterLowStockOnly 
                    ? "bg-white text-red-700 hover:bg-slate-100 ring-2 ring-white" 
                    : "bg-black/30 hover:bg-black/40 text-white border border-white/30"
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{filterLowStockOnly ? 'Show All Products' : `View Low Stock (${lowStockItems.length})`}</span>
              </button>

              <button
                onClick={() => setIsRestockDrawerOpen(true)}
                className="px-4 py-2.5 bg-white hover:bg-red-50 text-red-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <PackageOpen className="w-4 h-4" />
                <span>Quick Restock Sheet</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between gap-4 text-emerald-900 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900">
                  Stock Health Optimal: All {items.length} products meet or exceed your {threshold} units minimum threshold.
                </p>
                <p className="text-[11px] text-emerald-700">
                  No inventory shortage notifications at this time.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-black text-emerald-800 bg-emerald-200/60 px-2.5 py-1 rounded-lg border border-emerald-300 shrink-0">
              Threshold: {threshold}
            </span>
          </div>
        )}

        {/* Low Stock Alert Settings Card with Presets */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white border border-slate-200/80 rounded-3xl shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-red-50 text-red-500 rounded-2xl shrink-0 mt-0.5 border border-red-100">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-800">Low Stock Notification Threshold</h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                  Configurable
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-0.5">
                Automatically flags items with <code className="font-mono font-bold text-slate-700">stock_quantity &lt; {threshold}</code> and displays restock alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-end md:self-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">Presets:</span>
            {[5, 10, 15, 20, 50].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleSaveThreshold(val)}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  threshold === val 
                    ? "bg-netflix-red text-white shadow-xs font-black ring-2 ring-netflix-red/30" 
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                )}
              >
                {val}
              </button>
            ))}

            <div className="flex items-center gap-2 ml-1 pl-2 border-l border-slate-200">
              <input
                type="number"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-center text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-netflix-red/30 text-sm font-mono"
              />
              <button
                onClick={() => handleSaveThreshold()}
                disabled={savingThreshold}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
              >
                {savingThreshold ? 'Saving...' : 'Set'}
              </button>
            </div>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input 
                type="text"
                placeholder="Search by product name, brand, category, barcode, or code payload..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-netflix-red/30 transition-all placeholder:text-slate-400 font-medium text-sm"
              />
            </div>
          </div>

          {/* Category Chips Bar with Low Stock Alert Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            {/* Low Stock Filter Chip */}
            <button
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shadow-xs",
                filterLowStockOnly
                  ? "bg-red-600 text-white ring-2 ring-red-300"
                  : lowStockItems.length > 0
                    ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                    : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              )}
            >
              <AlertTriangle className={cn("w-3.5 h-3.5", lowStockItems.length > 0 && "text-red-500 animate-pulse")} />
              <span>Low Stock Alerts</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.2 rounded-full font-extrabold",
                filterLowStockOnly ? "bg-white text-red-700" : "bg-red-100 text-red-700"
              )}>
                {lowStockItems.length}
              </span>
            </button>

            <button
              onClick={() => {
                setCategoryFilter('ALL');
                if (filterLowStockOnly) setFilterLowStockOnly(false);
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer",
                categoryFilter === 'ALL' && !filterLowStockOnly
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              All Categories ({items.length})
            </button>
            {DEFAULT_CATEGORIES.map((cat) => {
              const count = items.filter(i => (i.category || i.category_name) === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5",
                    categoryFilter === cat
                      ? "bg-netflix-red text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span>{cat}</span>
                  {count > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-extrabold",
                      categoryFilter === cat ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.length > 0 ? filteredItems.map((item) => {
            const prodName = item.name || item.product_name || 'Untitled Product';
            const brand = item.brand || item.brand_name;
            const price = item.price ?? item.retail_price ?? 0;
            const stock = Number(item.stock ?? item.stock_quantity ?? 0);
            const isLowStock = stock < threshold;
            const cat = item.category || item.category_name || 'General';
            const code = item.qrCode || item.code_payload || item.barcode || 'NO-CODE';
            const codeType = item.code_type || (code.startsWith('ITEM-') ? 'QR_CODE' : 'EAN_13');
            const desc = item.description || item.product_description;
            const itemId = String(item.id || (item as any).product_id);
            const isRestockingThis = restockingId === itemId;

            // Stock percentage relative to threshold (capped at 100%)
            const stockPct = threshold > 0 ? Math.min(100, Math.round((stock / threshold) * 100)) : 100;

            return (
              <motion.div
                layout
                key={item.id}
                className={cn(
                  "glass-card p-5 flex flex-col justify-between hover:shadow-md transition-all space-y-4 rounded-3xl relative overflow-hidden",
                  isLowStock 
                    ? "border-2 border-red-500/90 bg-gradient-to-br from-red-50/80 via-white to-red-50/30 ring-2 ring-red-400/20 shadow-md shadow-red-500/5" 
                    : "border border-slate-200/60 bg-white"
                )}
              >
                {/* Prominent Low Stock Notification Header Banner */}
                {isLowStock && (
                  <div className="flex items-center justify-between bg-gradient-to-r from-red-600 to-rose-600 text-white px-3.5 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-wider shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-200 animate-bounce" />
                      <span>Low Stock Alert • Only {stock} Unit{stock === 1 ? '' : 's'} Remaining</span>
                    </div>
                    <span className="font-mono text-[9px] bg-black/25 px-2 py-0.5 rounded-full border border-white/20">
                      Min {threshold}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border",
                      isLowStock 
                        ? "bg-red-100 border-red-200 text-red-600" 
                        : "bg-slate-50 border-slate-200/60 text-netflix-red"
                    )}>
                      <PackageOpen className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                          {cat}
                        </span>
                        {brand && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                            {brand}
                          </span>
                        )}
                        {isLowStock && (
                          <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-md uppercase">
                            Restock Required
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-lg text-slate-900 leading-tight mt-1">{prodName}</h4>
                      {desc && (
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{desc}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-black text-2xl text-slate-900">₹{price}</p>
                    <div className="flex flex-col items-end mt-0.5">
                      <p className={cn(
                        "text-xs font-black uppercase tracking-wider flex items-center gap-1",
                        isLowStock ? "text-red-600" : "text-emerald-600"
                      )}>
                        {isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />}
                        {stock} Units
                      </p>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Min: {threshold}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stock Level Health Gauge */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className={isLowStock ? "text-red-700" : "text-slate-500"}>
                      {isLowStock ? 'Deficit Level' : 'Stock Capacity'}
                    </span>
                    <span className={cn("font-mono", isLowStock ? "text-red-600 font-black" : "text-slate-600")}>
                      {stock} / {threshold} units ({stockPct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500 rounded-full",
                        isLowStock 
                          ? stock === 0 ? "bg-red-700" : "bg-red-500" 
                          : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, Math.max(8, stockPct))}%` }}
                    />
                  </div>
                </div>

                {/* Scannable Identifiers & Actions Row */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono shrink-0">
                      {codeType}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md truncate max-w-[130px]">
                      {code}
                    </span>
                  </div>

                  {/* 1-Click Quick Restock Buttons */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase text-slate-400 hidden sm:inline">Restock:</span>
                    {[5, 10, 25].map((addQty) => (
                      <button
                        key={addQty}
                        onClick={() => handleQuickRestock(item, addQty)}
                        disabled={isRestockingThis}
                        className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-2xs active:scale-95",
                          isLowStock 
                            ? "bg-red-100 hover:bg-red-600 hover:text-white text-red-700 border border-red-200" 
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        )}
                        title={`Quick add +${addQty} units to inventory stock`}
                      >
                        +{addQty}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <button
                      onClick={() => setSelectedQRItem({ ...item, name: prodName, price, qrCode: code, category: cat })}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-netflix-red hover:text-white text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="View & Print QR Shelf Tag"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Tag</span>
                    </button>

                    <button 
                      onClick={() => openEditItemModal(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                      title="Edit Product"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={() => item.id && handleDelete(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      title="Delete Product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          }) : (
            <div className="col-span-full text-center py-20 glass-card rounded-3xl border border-slate-200">
              <PackageOpen className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-400" />
              <p className="text-slate-600 font-medium">No products match your filter</p>
              <button
                onClick={openNewItemModal}
                className="mt-4 px-5 py-2.5 bg-netflix-red text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
              >
                Add Supermarket Product
              </button>
            </div>
          )}
        </div>
        </>
        )}

        {/* Add / Edit Product Modal with PostgreSQL Fields */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModalOpen(false)}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl z-10 text-slate-800 max-h-[92vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{editingItem ? 'Edit Product' : 'Add Supermarket Product'}</h3>
                    <p className="text-xs text-slate-500">Structured according to supermarket_products catalog</p>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-800 p-1 cursor-pointer">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Form Error Banner */}
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-50 border-2 border-red-300 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 shadow-xs"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold">Validation Error</p>
                        <p className="text-[11px] text-red-600 mt-0.5">{formError}</p>
                      </div>
                      <button type="button" onClick={() => setFormError('')} className="text-red-400 hover:text-red-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}

                  {/* Product Name & Brand */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">
                        Product Name *
                      </label>
                      <input 
                        required
                        placeholder="e.g. Farm Fresh Whole Milk 1L"
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          setFormError('');
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-sm font-semibold"
                      />
                      {duplicateNameItem && (
                        <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1 mt-1 ml-1">
                          <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>Note: Similar item "{duplicateNameItem.name || duplicateNameItem.product_name}" exists in {duplicateNameItem.category || duplicateNameItem.category_name}.</span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">
                        Brand Name
                      </label>
                      <input 
                        placeholder="e.g. Amul"
                        value={formData.brand}
                        onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-sm"
                      />
                    </div>
                  </div>

                  {/* Price, Stock, Category */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Retail Price (₹) *</label>
                      <input 
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-sm font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Stock Quantity *</label>
                      <input 
                        required
                        type="number"
                        min="0"
                        placeholder="100"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-sm font-bold"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Category *</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-xs font-semibold"
                      >
                        {DEFAULT_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="CUSTOM">+ Custom Category...</option>
                      </select>
                    </div>
                  </div>

                  {formData.category === 'CUSTOM' && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Custom Category Name</label>
                      <input 
                        required
                        placeholder="Enter category name"
                        value={formData.customCategory}
                        onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-sm"
                      />
                    </div>
                  )}

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">Product Description</label>
                    <textarea 
                      rows={2}
                      placeholder="Product details, packaging size, ingredients, or storage instructions"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3.5 focus:ring-2 focus:ring-netflix-red text-slate-800 focus:outline-none text-xs"
                    />
                  </div>

                  {/* Dedicated Barcode Section (Manual Entry + Dedicated Scanner Button) */}
                  <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px] uppercase tracking-wider text-slate-900 font-black flex items-center gap-1.5">
                          <BarcodeIcon className="w-4 h-4 text-netflix-red" />
                          <span>Product Barcode (EAN-13 / UPC / Code 128)</span>
                        </label>
                        <p className="text-[10px] text-slate-500">
                          Enter barcode manually or scan barcode directly for this field
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Indexed</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input 
                            type="text"
                            placeholder="e.g. 8901262010015 or 012345678905"
                            value={formData.barcode}
                            onChange={(e) => {
                              setFormData({ ...formData, barcode: e.target.value });
                              setFormError('');
                            }}
                            className={cn(
                              "w-full bg-white border rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none transition-all",
                              duplicateBarcodeItem 
                                ? "border-red-400 ring-2 ring-red-200 bg-red-50/50 text-red-900" 
                                : "border-slate-200 text-slate-800 focus:ring-2 focus:ring-netflix-red"
                            )}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => openScannerFor('barcode')}
                          className="px-3.5 py-2 bg-netflix-red hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer active:scale-95 transition-all"
                          title="Open live camera to scan barcode specifically into this field"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Scan Barcode</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-[11px]">
                        <span className="text-slate-500 text-[10px]">Barcode Type:</span>
                        <select
                          value={formData.codeType}
                          onChange={(e) => setFormData({ ...formData, codeType: e.target.value as CodeType })}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-bold focus:ring-2 focus:ring-netflix-red focus:outline-none"
                        >
                          <option value="EAN_13">EAN_13 (13-digit standard)</option>
                          <option value="UPC">UPC (12-digit)</option>
                          <option value="CODE_128">CODE_128 (Alphanumeric)</option>
                          <option value="QR_CODE">QR_CODE</option>
                        </select>
                      </div>

                      {/* Duplicate Item Check Alert Banner */}
                      {duplicateBarcodeItem && (
                        <motion.div 
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-red-50 border-2 border-red-300 rounded-xl flex items-start gap-2.5 text-xs text-red-800 shadow-xs"
                        >
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="font-extrabold text-red-700">Duplicate Item Detected!</p>
                            <p className="text-[11px] text-red-600 leading-relaxed">
                              Barcode <strong>"{formData.barcode}"</strong> already exists on another item:
                              <span className="font-bold text-slate-900 block mt-0.5">
                                • {duplicateBarcodeItem.name || duplicateBarcodeItem.product_name} ({duplicateBarcodeItem.brand || duplicateBarcodeItem.brand_name || 'Generic'}) - ₹{duplicateBarcodeItem.price || duplicateBarcodeItem.retail_price}
                              </span>
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* Collapsible Shelf QR Tag Section */}
                    <div className="pt-2 border-t border-slate-200/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase tracking-wider text-slate-600 font-bold flex items-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5 text-slate-500" />
                          <span>Shelf QR Tag (Optional)</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleGenerateQRCode}
                          className="text-[10px] font-bold text-netflix-red hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          Auto-Generate QR
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text"
                          placeholder="e.g. ITEM-MILK-9812 (leave empty to use barcode)"
                          value={formData.qrCode}
                          onChange={(e) => setFormData({ ...formData, qrCode: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-mono focus:ring-2 focus:ring-netflix-red focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => openScannerFor('qrCode')}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-2xs flex items-center gap-1"
                          title="Scan shelf QR code into this field"
                        >
                          <Camera className="w-3 h-3 text-slate-500" />
                          <span>Scan QR</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button with Duplicate Prevention and DB Sync State */}
                  <button 
                    type="submit"
                    disabled={isSubmittingItem || !!duplicateBarcodeItem}
                    className={cn(
                      "w-full py-3.5 rounded-xl font-black mt-2 shadow-md transition-all text-sm flex items-center justify-center gap-2",
                      duplicateBarcodeItem
                        ? "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed"
                        : isSubmittingItem
                          ? "bg-netflix-red/70 text-white cursor-wait"
                          : "bg-netflix-red text-white hover:bg-red-700 shadow-netflix-red/20 active:scale-95 cursor-pointer"
                    )}
                  >
                    {isSubmittingItem ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Syncing with PostgreSQL Database...</span>
                      </>
                    ) : duplicateBarcodeItem ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span>Cannot Save: Duplicate Barcode</span>
                      </>
                    ) : editingItem ? (
                      'Update Supermarket Product & Sync DB'
                    ) : (
                      'Save New Product & Sync with DB'
                    )}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* PostgreSQL Database Schema Modal */}
        <AnimatePresence>
          {isSchemaModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSchemaModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl z-10 text-slate-800 max-h-[90vh] flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">PostgreSQL Database Schema</h3>
                      <p className="text-xs text-slate-500">Relational table definitions & B-Tree indexes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copySQL}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {copiedSQL ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSQL ? 'Copied' : 'Copy DDL'}</span>
                    </button>
                    <button onClick={() => setIsSchemaModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-900 text-slate-100 p-4 rounded-2xl font-mono text-xs leading-relaxed space-y-4">
                  <pre className="whitespace-pre-wrap">{sqlSchemaText}</pre>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="font-extrabold text-slate-800">1. product_categories</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">category_id, category_name, description</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="font-extrabold text-slate-800">2. supermarket_products</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">product_id, category_id, retail_price, stock</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="font-extrabold text-slate-800">3. scannable_codes</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">code_payload, code_type, B-Tree index</p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Live Camera Barcode Scanner Modal with Targeted Field Mode */}
        <ScannerModal 
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={handleScanSuccess}
          title={scannerTarget === 'barcode' ? "Scan Product Barcode" : "Scan Shelf QR Code"}
          subtitle={scannerTarget === 'barcode' ? "Point camera at product barcode (EAN-13, UPC, Code 128) to autofill barcode field" : "Point camera at QR code tag to autofill shelf tag"}
          targetFieldLabel={scannerTarget === 'barcode' ? "Barcode Field" : "QR Code Field"}
        />

        {/* Single Product QR Shelf Tag Modal */}
        <ItemQRModal 
          item={selectedQRItem}
          storeName={storeName}
          onClose={() => setSelectedQRItem(null)}
        />

        {/* Batch Print All Product QR Labels Modal */}
        <AnimatePresence>
          {isBatchPrintOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsBatchPrintOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl z-10 text-slate-800 max-h-[90vh] flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-netflix-red/10 text-netflix-red rounded-xl">
                      <Tag className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Print All Shelf QR Price Tags</h3>
                      <p className="text-xs text-slate-500">Sheet of scannable QR tags for store shelves</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-netflix-red text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Printer className="w-4 h-4" /> Print Sheet
                    </button>
                    <button onClick={() => setIsBatchPrintOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {items.map((item) => {
                      const name = item.name || item.product_name || '';
                      const price = item.price ?? item.retail_price ?? 0;
                      const code = item.qrCode || item.code_payload || item.barcode || item.id;
                      return (
                        <div key={item.id} className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-3 text-center space-y-1.5 shadow-xs flex flex-col items-center">
                          <p className="text-[9px] font-black uppercase text-netflix-red truncate w-full">{storeName}</p>
                          <p className="text-xs font-black text-slate-900 truncate w-full">{name}</p>
                          <p className="text-sm font-black text-emerald-600">₹{price}</p>
                          <div className="p-1.5 bg-white border border-slate-900 rounded-lg">
                            <QRCodeSVG 
                              value={code}
                              size={72}
                              level="M"
                            />
                          </div>
                          <p className="font-mono text-[9px] text-slate-600 truncate w-full">{code}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Bulk CSV Upload Modal */}
        <AnimatePresence>
          {isCsvModalOpen && (
            <CsvUploadModal
              isOpen={isCsvModalOpen}
              onClose={() => setIsCsvModalOpen(false)}
              onSuccess={() => {
                fetchItems();
              }}
              existingItemsCount={items.length}
            />
          )}
        </AnimatePresence>

        {/* Dedicated Low Stock Restock Manager Modal */}
        <AnimatePresence>
          {isRestockDrawerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsRestockDrawerOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl z-10 text-slate-800 max-h-[90vh] flex flex-col"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
                      <BellRing className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">Low Stock Restock Manager</h3>
                      <p className="text-xs text-slate-500">
                        {lowStockItems.length} product{lowStockItems.length > 1 ? 's' : ''} currently below configured threshold of <strong className="text-slate-800">{threshold} units</strong>
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsRestockDrawerOpen(false)} 
                    className="text-slate-400 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {lowStockItems.length > 0 ? (
                    lowStockItems.map((item) => {
                      const prodName = item.name || item.product_name || 'Product';
                      const brand = item.brand || item.brand_name;
                      const price = item.price ?? item.retail_price ?? 0;
                      const stock = Number(item.stock ?? item.stock_quantity ?? 0);
                      const cat = item.category || item.category_name || 'General';
                      const deficit = Math.max(1, threshold - stock);
                      const itemId = String(item.id || (item as any).product_id);
                      const isRestockingThis = restockingId === itemId;

                      return (
                        <div 
                          key={item.id} 
                          className="p-4 rounded-2xl bg-red-50/50 border border-red-200/80 hover:bg-red-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-white text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                                {cat}
                              </span>
                              {brand && (
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                  {brand}
                                </span>
                              )}
                              <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-md">
                                Deficit: -{deficit} units
                              </span>
                            </div>
                            <h4 className="font-bold text-base text-slate-900">{prodName}</h4>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>Price: <strong className="text-slate-800">₹{price}</strong></span>
                              <span>•</span>
                              <span className="text-red-700 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Current Stock: <strong>{stock}</strong> / {threshold}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Add:</span>
                            {[5, 10, 20].map((qty) => (
                              <button
                                key={qty}
                                onClick={() => handleQuickRestock(item, qty)}
                                disabled={isRestockingThis}
                                className="px-3 py-1.5 bg-white hover:bg-red-600 hover:text-white text-red-700 border border-red-200 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                              >
                                +{qty}
                              </button>
                            ))}
                            {deficit > 0 && (
                              <button
                                onClick={() => handleQuickRestock(item, deficit)}
                                disabled={isRestockingThis}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                                title={`Fill exact deficit of ${deficit} units to hit threshold`}
                              >
                                Fill (+{deficit})
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-500 space-y-2">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                      <p className="font-bold text-slate-800 text-base">All inventory items are well-stocked!</p>
                      <p className="text-xs text-slate-500">No products currently fall below your threshold of {threshold} units.</p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">
                    Changes sync immediately with PostgreSQL for customer scanning app.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setFilterLowStockOnly(true);
                        setIsRestockDrawerOpen(false);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Filter Grid View
                    </button>
                    <button
                      onClick={() => setIsRestockDrawerOpen(false)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Floating Add New Item Button - Exclusively at Lower Right Corner */}
        <button
          onClick={openNewItemModal}
          id="fab-add-new-item"
          className="fixed bottom-24 md:bottom-8 right-6 md:right-8 z-40 bg-netflix-red hover:bg-red-700 text-white font-black px-6 py-4 rounded-full shadow-2xl shadow-netflix-red/50 flex items-center gap-2.5 border-2 border-white/50 active:scale-95 transition-all cursor-pointer ring-4 ring-netflix-red/20 group"
          title="Add New Product to Inventory & Sync with Database"
        >
          <PlusCircle className="w-5 h-5 text-white group-hover:rotate-90 transition-transform duration-200" />
          <span className="text-xs uppercase tracking-wider font-extrabold">+ Add New Item</span>
        </button>

        {/* Database Synchronization Feedback Toast */}
        <AnimatePresence>
          {dbSyncToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500/50 text-xs font-semibold"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-white">Database Synchronized</p>
                <p className="text-slate-300 text-[11px]">{dbSyncToast}</p>
              </div>
              <button onClick={() => setDbSyncToast(null)} className="ml-3 text-slate-400 hover:text-white p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
