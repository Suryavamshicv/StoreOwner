import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, X, RefreshCw, AlertCircle, Check } from 'lucide-react';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (code: string) => void;
  title?: string;
  subtitle?: string;
  targetFieldLabel?: string;
}

export default function ScannerModal({ 
  isOpen, 
  onClose, 
  onScanSuccess, 
  title = "Scan Product QR / Barcode", 
  subtitle = "Align code inside the viewfinder",
  targetFieldLabel
}: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scanningRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  async function startCamera() {
    setErrorMsg('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera access is not supported in this browser. Please type the code below.');
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setIsScanning(true);
      scanningRef.current = true;
      detectBarcodeLoop(mediaStream);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setErrorMsg('Camera unavailable or permission denied. You can manually enter the code below.');
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    setIsScanning(false);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }

  async function detectBarcodeLoop(mediaStream: MediaStream) {
    // Check if BarcodeDetector is supported in browser
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e']
        });
        
        const detectFrame = async () => {
          if (!scanningRef.current || !videoRef.current) return;
          try {
            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                const detected = barcodes[0].rawValue;
                handleCodeCaptured(detected);
                return;
              }
            }
          } catch (e) {
            // frame detection error or unsupported frame
          }
          if (scanningRef.current) {
            requestAnimationFrame(detectFrame);
          }
        };
        requestAnimationFrame(detectFrame);
      } catch (e) {
        console.warn('BarcodeDetector initialization failed', e);
      }
    }
  }

  const handleCodeCaptured = (code: string) => {
    stopCamera();
    onScanSuccess(code);
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleCodeCaptured(manualCode.trim());
  };

  if (!isOpen) return null;

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
        className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 space-y-5 shadow-2xl z-10 text-slate-800"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-netflix-red/10 text-netflix-red rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">{title}</h3>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>

        {targetFieldLabel && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200/80 px-3 py-1.5 rounded-xl text-xs text-blue-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <span>Targeting field: <strong className="font-bold text-blue-900">{targetFieldLabel}</strong></span>
          </div>
        )}

        {/* Video Viewfinder Area */}
        <div className="relative w-full aspect-4/3 bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
          <video 
            ref={videoRef} 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />

          {/* Viewfinder Target Overlays */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-dashed border-netflix-red rounded-2xl relative shadow-lg">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-netflix-red rounded-tl-md" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-netflix-red rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-netflix-red rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-netflix-red rounded-br-md" />
              <div className="w-full h-0.5 bg-netflix-red/80 absolute top-1/2 -translate-y-1/2 animate-pulse shadow-sm shadow-netflix-red" />
            </div>
          </div>

          {errorMsg && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center text-white space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-xs text-slate-300 font-medium">{errorMsg}</p>
              <button 
                onClick={startCamera} 
                className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 text-slate-200"
              >
                <RefreshCw className="w-3 h-3" /> Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Manual Barcode / Code fallback input */}
        <form onSubmit={handleManualSubmit} className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">
            Or Type Barcode / QR String
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 8901030382910 or ITEM-001"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2.5 bg-netflix-red hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-4 h-4" /> Use Code
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
