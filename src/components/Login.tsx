import React, { useState } from 'react';
import { loginWithPostgres, registerWithPostgres } from '../lib/postgresApi';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Lock, Building, FileText, MapPin, Hash, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [fssai, setFssai] = useState('');
  const [state, setState] = useState('Karnataka');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');

  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanPhone = (phone || '').replace(/\D/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!password || password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    const emailForAuth = `${cleanPhone}@supermarket.in`;

    setIsAuthenticating(true);

    try {
      if (isRegistering) {
        await registerWithPostgres({
          email: emailForAuth,
          password,
          full_name: businessName || 'Retail Merchant',
          phone: cleanPhone,
          store_name: tradeName || businessName || 'Retail Store'
        });
      } else {
        await loginWithPostgres(emailForAuth, password);
      }

      window.location.reload();

    } catch (err: any) {
      console.warn('Authentication notice:', err);
      setAuthError(err?.message || 'Authentication failed.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const fillAdminCredentials = () => {
    setPhone('9739765357');
    setPassword('AdminStore#9739765357');
    setBusinessName('Supermarket Central Operations Admin');
    setTradeName('StoreOwner Admin HQ');
    setGstin('29ADMIN0000A1Z9');
    setPan('AAAPA9999K');
    setFssai('10019022009999');
    setState('Karnataka');
    setPincode('560001');
    setAddress('MG Road, Central Business District');
    setIsRegistering(false);
  };

  return (
    <div className="relative min-h-screen w-full overflow-y-auto flex flex-col items-center justify-center p-6 bg-netflix-black py-12">
      {/* Background Glows */}
      <div className="background-glow pointer-events-none fixed inset-0">
        <div className="glow-red opacity-30"></div>
        <div className="glow-blue opacity-30"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg z-10 space-y-8 my-auto"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-netflix-red rounded-2xl flex items-center justify-center font-black text-4xl shadow-2xl shadow-netflix-red/30 mb-4 text-white">S</div>
          <h1 className="text-slate-800 text-4xl font-black font-display tracking-tight mb-1 uppercase">StoreOwner India</h1>
          <p className="text-slate-500 text-xs font-bold tracking-wider uppercase">GST, PAN & FSSAI Compliant Supermarket POS</p>
        </div>

        <div className="glass backdrop-blur-xl p-8 rounded-[2.5rem] border-slate-200/60 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-2xl font-black text-slate-800">{isRegistering ? 'Merchant Registration' : 'Merchant Sign In'}</h2>
              <p className="text-slate-500 text-xs font-medium">{isRegistering ? 'Enter business details as per Indian retail tax law' : 'Access your secure store portal with mobile number'}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs font-black text-netflix-red hover:underline cursor-pointer bg-red-50 px-3 py-1.5 rounded-xl border border-red-200"
            >
              {isRegistering ? 'Existing User? Sign In' : 'New Merchant? Register'}
            </button>
          </div>

          {/* Instant Admin Fill Banner */}
          <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between border border-slate-800 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <p className="text-xs font-black">Super Admin Access</p>
                <p className="text-[10px] text-slate-400 font-mono">Mobile: 9739765357 (Unrestricted Admin)</p>
              </div>
            </div>
            <button
              type="button"
              onClick={fillAdminCredentials}
              className="px-3.5 py-2 bg-netflix-red hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            >
              Fill Admin 9739765357
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-netflix-red" />
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-xs font-bold text-slate-500">+91</span>
                  <input 
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30 transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-netflix-red" />
                  Secure Password <span className="text-red-500">*</span>
                </label>
                <input 
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30 transition-all placeholder:text-slate-300"
                />
              </div>
            </div>

            {isRegistering && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 pt-2 border-t border-slate-100"
              >
                <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-netflix-red" />
                  Indian Merchant & Tax Compliance Details
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600">Legal Business Name <span className="text-red-500">*</span></label>
                    <input 
                      required={isRegistering}
                      placeholder="e.g. Sharma Retail Pvt Ltd"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-slate-800 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600">Trade / Brand Name</label>
                    <input 
                      placeholder="e.g. Fresh Mart Supermarket"
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-slate-800 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-netflix-red" />
                      GSTIN (15 Chars)
                    </label>
                    <input 
                      maxLength={15}
                      placeholder="29AAAAA0000A1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-mono font-bold text-xs uppercase focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1">
                      <Hash className="w-3 h-3 text-netflix-red" />
                      PAN (10 Chars)
                    </label>
                    <input 
                      maxLength={10}
                      placeholder="ABCDE1234F"
                      value={pan}
                      onChange={(e) => setPan(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-mono font-bold text-xs uppercase focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600">FSSAI License (14 Digits)</label>
                    <input 
                      maxLength={14}
                      placeholder="10020021000555"
                      value={fssai}
                      onChange={(e) => setFssai(e.target.value.replace(/\D/g, '').slice(0, 14))}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-netflix-red" />
                      State
                    </label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
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
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-600">Pincode</label>
                    <input 
                      maxLength={6}
                      placeholder="560001"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800 font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-600">Full Store Address</label>
                  <input 
                    placeholder="Shop No. 14, Market Complex, Main Road"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-slate-800 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-netflix-red/30"
                  />
                </div>
              </motion.div>
            )}

            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs text-center font-medium flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-netflix-red hover:bg-red-700 text-white py-4 rounded-2xl font-black shadow-xl shadow-netflix-red/25 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {isAuthenticating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Verifying Merchant Credentials...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{isRegistering ? 'Complete Registration & Login' : 'Secure Login'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center text-[10px] text-slate-400 font-medium space-y-1">
          <p>© 2026 StoreOwner India. GST, PAN & FSSAI Compliant Supermarket POS.</p>
          <div className="flex justify-center gap-4">
            <span className="hover:text-slate-800 cursor-pointer">Tax Compliance</span>
            <span>•</span>
            <span className="hover:text-slate-800 cursor-pointer">Data Privacy</span>
            <span>•</span>
            <span className="hover:text-slate-800 cursor-pointer">Secure 256-bit SSL</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

