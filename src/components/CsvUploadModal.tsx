import React, { useState, useRef, DragEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UploadCloud, FileText, Download, CheckCircle2, AlertTriangle, 
  X, RefreshCw, Layers, ArrowRight, Table, Check, Sparkles, 
  FileSpreadsheet, ShieldAlert, PackageCheck
} from 'lucide-react';
import Papa from 'papaparse';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { CodeType, SupermarketProduct } from '../types';
import { cn, OperationType, handleFirestoreError } from '../lib/utils';
import { bulkImportPostgresProducts } from '../lib/postgresApi';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingItemsCount: number;
}

interface ParsedItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  qrCode: string;
  barcode: string;
  codeType: CodeType;
  isValid: boolean;
  errors: string[];
}

export default function CsvUploadModal({ isOpen, onClose, onSuccess, existingItemsCount }: CsvUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.txt')) {
      setParseErrors(['Please upload a valid .csv file format.']);
      return;
    }

    setFile(selectedFile);
    setParseErrors([]);
    setImportSuccess(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        const rows = results.data as Record<string, any>[];
        if (!rows || rows.length === 0) {
          setParseErrors(['The uploaded CSV file is empty or has no valid rows.']);
          setParsedItems([]);
          return;
        }

        const items: ParsedItem[] = rows.map((row, index) => {
          // Normalize header matching (case insensitive & aliases)
          const keys = Object.keys(row);
          const getVal = (aliases: string[]): string => {
            for (const alias of aliases) {
              const matchedKey = keys.find(k => k.trim().toLowerCase() === alias.toLowerCase());
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
                return String(row[matchedKey]).trim();
              }
            }
            return '';
          };

          const name = getVal(['product_name', 'name', 'item_name', 'title', 'product', 'item']);
          const brand = getVal(['brand_name', 'brand', 'company', 'manufacturer']);
          const category = getVal(['category_name', 'category', 'dept', 'department']) || 'Dairy & Eggs';
          const priceRaw = getVal(['retail_price', 'price', 'mrp', 'cost', 'unit_price', 'rate']);
          const stockRaw = getVal(['stock_quantity', 'stock', 'qty', 'quantity', 'count', 'units']);
          const description = getVal(['product_description', 'description', 'details', 'desc']);
          let codePayload = getVal(['code_payload', 'qrCode', 'qr_code', 'barcode', 'code', 'sku', 'ean']);
          const codeTypeRaw = getVal(['code_type', 'type', 'format']).toUpperCase();

          const price = parseFloat(priceRaw) || 0;
          const stock = parseInt(stockRaw, 10) || 0;
          const errors: string[] = [];

          if (!name) {
            errors.push('Product name is required');
          }
          if (isNaN(price) || price < 0) {
            errors.push('Invalid price');
          }
          if (isNaN(stock) || stock < 0) {
            errors.push('Invalid stock');
          }

          // Auto-generate code if empty
          if (!codePayload) {
            const cleanSlug = (name || 'PROD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            codePayload = `ITEM-${cleanSlug || 'AUTO'}-${randomCode}`;
          }

          let codeType: CodeType = 'QR_CODE';
          if (['EAN_13', 'UPC', 'CODE_128', 'QR_CODE'].includes(codeTypeRaw)) {
            codeType = codeTypeRaw as CodeType;
          } else if (/^\d{13}$/.test(codePayload)) {
            codeType = 'EAN_13';
          } else if (/^\d{12}$/.test(codePayload)) {
            codeType = 'UPC';
          }

          return {
            id: `row-${index}`,
            name,
            brand,
            category,
            price,
            stock,
            description,
            qrCode: codePayload,
            barcode: codePayload,
            codeType,
            isValid: errors.length === 0,
            errors
          };
        });

        setParsedItems(items);
      },
      error: (err) => {
        setParseErrors([`Failed to parse CSV file: ${err.message}`]);
      }
    });
  };

  const handleDownloadSampleTemplate = () => {
    const csvContent = `product_name,brand_name,category_name,retail_price,stock_quantity,product_description,code_payload,code_type
Farm Fresh Whole Milk 1L,Amul,Dairy & Eggs,64.00,100,Pasteurized homogenized full-cream cow milk,ITEM-MILK-101,QR_CODE
Greek Yogurt Plain 400g,Epigamia,Dairy & Eggs,110.00,45,High protein strained Greek yogurt,ITEM-YOGURT-202,QR_CODE
Multigrain Sourdough Bread 400g,Bonn Bakers,Bakery & Snacks,55.00,30,Naturally fermented artisanal sourdough bread,ITEM-BREAD-303,QR_CODE
Sparkling Lime Soda 500ml,Schweppes,Beverages,40.00,80,Crisp carbonated lime refreshing soda,8901262010015,EAN_13
Extra Virgin Olive Oil 500ml,Borges,Pantry & Staples,450.00,25,First cold-pressed Mediterranean olive oil,ITEM-OIL-505,QR_CODE
Basmati Premium Rice 5kg,Daawat,Pantry & Staples,620.00,40,Aged long-grain royal basmati rice,ITEM-RICE-606,QR_CODE
Dark Chocolate Almond Bar 100g,Amul,Bakery & Snacks,90.00,60,Rich cocoa dark chocolate roasted almonds,8901262010022,EAN_13
Organic Green Tea 25 Bags,Tetley,Beverages,140.00,50,Antioxidant rich pure green tea leaves,ITEM-TEA-808,QR_CODE`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'supermarket_inventory_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExecuteImport = async () => {
    const validItems = parsedItems.filter(i => i.isValid);
    if (validItems.length === 0) {
      alert('No valid products to import.');
      return;
    }

    setIsProcessing(true);
    setImportProgress({ current: 0, total: validItems.length });

    try {
      // 1. Bulk import directly into PostgreSQL (Vercel / Prisma)
      let pgImportedCount = 0;
      try {
        const pgResult = await bulkImportPostgresProducts(validItems);
        pgImportedCount = pgResult.count;
      } catch (pgErr) {
        console.warn('PostgreSQL bulk import error:', pgErr);
      }

      // 2. Sync to Firestore if authenticated
      if (auth.currentUser) {
        try {
          const ownerId = auth.currentUser.uid;
          const batchSize = 300;
          let fsCount = 0;

          for (let i = 0; i < validItems.length; i += batchSize) {
            const chunk = validItems.slice(i, i + batchSize);
            const batch = writeBatch(db);

            chunk.forEach((item) => {
              const docRef = doc(collection(db, 'inventory'));
              batch.set(docRef, {
                name: item.name,
                product_name: item.name,
                brand: item.brand,
                brand_name: item.brand,
                category: item.category,
                category_name: item.category,
                price: item.price,
                retail_price: item.price,
                stock: item.stock,
                stock_quantity: item.stock,
                description: item.description,
                product_description: item.description,
                qrCode: item.qrCode,
                barcode: item.barcode,
                code_payload: item.qrCode,
                code_type: item.codeType,
                ownerId: ownerId,
                updatedAt: new Date().toISOString()
              });
            });

            await batch.commit();
            fsCount += chunk.length;
            setImportProgress({ current: fsCount, total: validItems.length });
          }
        } catch (fsErr) {
          console.warn('Firestore sync optional error:', fsErr);
        }
      }

      setImportProgress({ current: validItems.length, total: validItems.length });
      setImportSuccess(pgImportedCount || validItems.length);
      setIsProcessing(false);
      onSuccess();
    } catch (error: any) {
      setIsProcessing(false);
      alert('Bulk import encountered an issue: ' + (error.message || 'Unknown error'));
    }
  };

  const validCount = parsedItems.filter(i => i.isValid).length;
  const invalidCount = parsedItems.length - validCount;
  const totalStockSum = parsedItems.filter(i => i.isValid).reduce((acc, curr) => acc + curr.stock, 0);
  const totalValueSum = parsedItems.filter(i => i.isValid).reduce((acc, curr) => acc + (curr.price * curr.stock), 0);

  const resetModal = () => {
    setFile(null);
    setParsedItems([]);
    setParseErrors([]);
    setImportProgress(null);
    setImportSuccess(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => !isProcessing && onClose()}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl z-10 text-slate-800 max-h-[92vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-netflix-red/10 text-netflix-red flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Bulk Upload Supermarket Products</h3>
              <p className="text-xs text-slate-500">Import products, categories, stock, and QR/barcodes via CSV</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSampleTemplate}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Download pre-formatted CSV template"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sample CSV Template</span>
            </button>
            <button 
              onClick={() => !isProcessing && onClose()} 
              disabled={isProcessing}
              className="text-slate-400 hover:text-slate-800 p-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {importSuccess !== null ? (
            /* Success View */
            <div className="py-12 px-6 text-center space-y-4 bg-emerald-50/60 border border-emerald-200 rounded-3xl">
              <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <PackageCheck className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-2xl font-bold text-slate-900">Import Completed Successfully!</h4>
                <p className="text-slate-600 text-sm mt-1">
                  Added <strong className="text-emerald-700">{importSuccess} products</strong> to your supermarket catalog with scannable QR tags and inventory counts.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={resetModal}
                  className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Upload Another File
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Drag & Drop Upload Box */}
              {!file && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3",
                    isDragging 
                      ? "border-netflix-red bg-netflix-red/5 scale-[1.01]" 
                      : "border-slate-300 hover:border-netflix-red hover:bg-slate-50/80 bg-slate-50/40"
                  )}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".csv,.txt" 
                    className="hidden" 
                  />
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-netflix-red shadow-xs">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-base">Drag and drop your CSV file here</p>
                    <p className="text-slate-500 text-xs mt-0.5">or <span className="text-netflix-red font-bold underline">browse from your computer</span></p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>Supports standard CSV with UTF-8 encoding</span>
                  </div>
                </div>
              )}

              {/* Parsing Errors Banner */}
              {parseErrors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="font-bold text-xs text-red-800">CSV Parsing Error</h5>
                    {parseErrors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Parsed Preview Table & Statistics */}
              {file && parsedItems.length > 0 && (
                <div className="space-y-4">
                  {/* File Banner & Summary Stats */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200/90 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-700">
                        <FileText className="w-5 h-5 text-netflix-red" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900 truncate max-w-xs">{file.name}</p>
                        <p className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(1)} KB • {parsedItems.length} rows parsed</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <button
                        onClick={resetModal}
                        disabled={isProcessing}
                        className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl font-bold cursor-pointer transition-colors"
                      >
                        Change File
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Valid Items</p>
                      <p className="text-lg font-black text-emerald-600">{validCount}</p>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Invalid Rows</p>
                      <p className={cn("text-lg font-black", invalidCount > 0 ? "text-red-500" : "text-slate-400")}>{invalidCount}</p>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Stock</p>
                      <p className="text-lg font-black text-slate-800">{totalStockSum} units</p>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Catalog Value</p>
                      <p className="text-lg font-black text-slate-900">₹{totalValueSum.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Table className="w-4 h-4 text-slate-400" />
                        Previewing {parsedItems.length} Products
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Missing QR codes will be auto-generated</span>
                    </div>

                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 border-b border-slate-100">
                          <tr>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3">Category / Brand</th>
                            <th className="py-2.5 px-3 text-right">Price</th>
                            <th className="py-2.5 px-3 text-right">Stock</th>
                            <th className="py-2.5 px-3">Code / Payload</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedItems.map((item) => (
                            <tr key={item.id} className={cn("hover:bg-slate-50/60", !item.isValid && "bg-red-50/30")}>
                              <td className="py-2 px-3">
                                {item.isValid ? (
                                  <span className="inline-flex items-center text-emerald-600 font-bold text-[10px] gap-1">
                                    <Check className="w-3.5 h-3.5" /> Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-red-500 font-bold text-[10px] gap-1" title={item.errors.join(', ')}>
                                    <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-900 max-w-[180px] truncate">
                                {item.name || <em className="text-red-400">Missing Name</em>}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                <span className="font-semibold text-slate-800">{item.category}</span>
                                {item.brand && <span className="text-slate-400 text-[10px] ml-1">({item.brand})</span>}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                ₹{item.price.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-medium text-slate-700">
                                {item.stock}
                              </td>
                              <td className="py-2 px-3 font-mono text-[10px] text-slate-600 max-w-[120px] truncate">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded">{item.qrCode}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Progress Bar during import */}
                  {isProcessing && importProgress && (
                    <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-netflix-red animate-spin" />
                          Importing products to database...
                        </span>
                        <span>{importProgress.current} / {importProgress.total}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-netflix-red h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {importSuccess === null && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {parsedItems.length > 0 ? (
              <button
                onClick={handleExecuteImport}
                disabled={isProcessing || validCount === 0}
                className="px-6 py-2.5 bg-netflix-red hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-netflix-red/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span>Import {validCount} Products</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleDownloadSampleTemplate}
                className="px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Get Sample Template</span>
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
