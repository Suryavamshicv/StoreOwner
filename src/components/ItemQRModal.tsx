import React, { useState } from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download, Printer, Copy, Check, QrCode, Tag } from 'lucide-react';

interface ItemQRModalProps {
  item: any;
  storeName?: string;
  onClose: () => void;
}

export default function ItemQRModal({ item, storeName = 'Supermarket Store', onClose }: ItemQRModalProps) {
  const [copied, setCopied] = useState(false);
  if (!item) return null;

  const qrValue = item.qrCode || item.barcode || item.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(qrValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svg = document.getElementById(`item-qr-svg-${item.id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = 320;
      canvas.height = 380;
      if (ctx) {
        // Background card
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Border
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

        // Store header
        ctx.fillStyle = '#e50914';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(storeName.toUpperCase(), canvas.width / 2, 35);

        // Product Name
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(item.name.length > 22 ? item.name.slice(0, 20) + '...' : item.name, canvas.width / 2, 65);

        // Price
        ctx.fillStyle = '#16a34a';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`₹${item.price}`, canvas.width / 2, 95);

        // Draw QR Image
        ctx.drawImage(img, (canvas.width - 160) / 2, 115, 160, 160);

        // Code and instructions
        ctx.fillStyle = '#64748b';
        ctx.font = 'mono 11px monospace';
        ctx.fillText(`CODE: ${qrValue}`, canvas.width / 2, 305);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText('Scan to add to mobile cart', canvas.width / 2, 335);

        const a = document.createElement('a');
        a.download = `QR_${item.name.replace(/\s+/g, '_')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Shelf Tag - ${item.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f8fafc; }
            .tag { width: 300px; padding: 24px; border: 2px dashed #0f172a; border-radius: 16px; background: #fff; text-align: center; box-sizing: border-box; }
            .store { font-size: 11px; font-weight: 800; color: #e50914; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
            .title { font-size: 20px; font-weight: 900; color: #0f172a; margin: 4px 0; }
            .category { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
            .price { font-size: 28px; font-weight: 900; color: #16a34a; margin: 6px 0 16px; }
            .qr-box { display: inline-block; padding: 8px; border: 4px solid #0f172a; border-radius: 12px; background: #fff; }
            .code { font-family: monospace; font-size: 11px; font-weight: bold; color: #334155; margin-top: 12px; }
            .hint { font-size: 10px; color: #94a3b8; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="tag">
            <div class="store">${storeName}</div>
            <div class="title">${item.name}</div>
            <div class="category">${item.category || 'General Item'}</div>
            <div class="price">₹${item.price}</div>
            <div class="qr-box">
              ${document.getElementById(`item-qr-svg-${item.id}`)?.outerHTML || ''}
            </div>
            <div class="code">CODE: ${qrValue}</div>
            <div class="hint">Scan with Customer App to Add Item</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-2xl z-10 text-slate-800"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-netflix-red/10 text-netflix-red rounded-xl">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Product QR Shelf Tag</h3>
              <p className="text-xs text-slate-500">For customer self-scanning in-store</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Printable Preview Card */}
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-5 flex flex-col items-center text-center space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-netflix-red">{storeName}</p>
          <div>
            <h4 className="font-extrabold text-xl text-slate-900 leading-tight">{item.name}</h4>
            <p className="text-xs text-slate-500">{item.category || 'General Product'}</p>
          </div>
          
          <p className="text-2xl font-black text-emerald-600">₹{item.price}</p>

          <div className="p-3 bg-white border-4 border-slate-900 rounded-2xl shadow-xs">
            <QRCodeSVG 
              id={`item-qr-svg-${item.id}`}
              value={qrValue}
              size={140}
              level="H"
              includeMargin={false}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md select-all">
                {qrValue}
              </span>
              <button 
                onClick={handleCopy}
                className="text-xs text-slate-500 hover:text-netflix-red p-1 cursor-pointer"
                title="Copy code string"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Scan at pedestal or mobile camera to add to bill</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" /> Download Tag
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-netflix-red hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" /> Print Label
          </button>
        </div>
      </motion.div>
    </div>
  );
}
