import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { loginWithPostgres, registerWithPostgres, resetPasswordWithPostgres, syncAuthUser } from '../lib/postgresApi';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, 
  Mail, 
  Lock, 
  Building, 
  FileText, 
  MapPin, 
  Hash, 
  CheckCircle2, 
  AlertCircle, 
  Database,
  Eye,
  EyeOff,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  X
} from 'lucide-react';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState(() => localStorage.getItem('last_login_phone') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  // Password Reset Modal State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetAccount, setResetAccount] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetStatus, setResetStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanPhone = (phone || '').replace(/\D/g, '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (authMethod === 'phone') {
      if (!cleanPhone || cleanPhone.length < 10) {
        setAuthError('Please enter a valid 10-digit mobile number.');
        return;
      }
    } else {
      if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        setAuthError('Please enter a valid email address.');
        return;
      }
    }

    if (!password || password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    const emailForAuth = authMethod === 'email' ? cleanEmail : `${cleanPhone}@supermarket.in`;

    setIsAuthenticating(true);

    try {
      if (isRegistering) {
        // Direct Registration into PostgreSQL app_users table
        const regResult = await registerWithPostgres({
          email: emailForAuth,
          password: password,
          full_name: businessName || tradeName || 'Store Owner',
          store_name: tradeName || businessName || 'Retail Store',
          phone: cleanPhone || undefined
        });

        const userUid = regResult.user.firebase_uid || `pg_user_${regResult.user.user_id}`;

        // Save session verified from PostgreSQL app_users
        localStorage.setItem('store_owner_fallback_auth', JSON.stringify({
          uid: userUid,
          userId: regResult.user.user_id,
          email: regResult.user.email,
          phone: regResult.user.phone || cleanPhone,
          role: regResult.role,
          businessName: regResult.user.store_name || regResult.user.full_name || 'Retail Store',
          subscriptionStatus: regResult.isSubscribed ? 'active' : 'inactive'
        }));
        localStorage.setItem('postgres_app_user', JSON.stringify(regResult.user));
        if (cleanPhone) localStorage.setItem('store_owner_phone', cleanPhone);

        // Optional background Firebase Auth user creation
        if (auth) {
          try {
            await createUserWithEmailAndPassword(auth, emailForAuth, password);
          } catch (fbErr) {
            console.warn('Firebase sync notice:', fbErr);
          }
        }

        // Firestore compliance document
        try {
          await setDoc(doc(db, 'owners', userUid), {
            uid: userUid,
            email: emailForAuth,
            phone: cleanPhone,
            businessName: businessName || 'Retail Store',
            tradeName: tradeName || businessName || 'Retail Store',
            gstin: gstin.toUpperCase() || '29AAAAA0000A1Z5',
            pan: pan.toUpperCase() || 'ABCDE1234F',
            fssai: fssai || '10020021000555',
            state: state || 'Karnataka',
            pincode: pincode || '560001',
            address: address || 'Commercial Street, Main Road',
            role: regResult.role,
            subscriptionStatus: 'active',
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (fsErr) {
          console.warn('Firestore profile sync notice:', fsErr);
        }

        window.location.replace(regResult.role === 'admin' ? '/admin' : '/dashboard');
      } else {
        // Direct Login Validation against PostgreSQL app_users table
        const authResult = await loginWithPostgres({
          identifier: authMethod === 'email' ? cleanEmail : cleanPhone,
          email: cleanEmail || undefined,
          phone: cleanPhone || undefined,
          password: password
        });

        const userUid = authResult.user.firebase_uid || `pg_user_${authResult.user.user_id}`;

        // Save authenticated session verified directly from PostgreSQL app_users
        localStorage.setItem('store_owner_fallback_auth', JSON.stringify({
          uid: userUid,
          userId: authResult.user.user_id,
          email: authResult.user.email,
          phone: authResult.user.phone || cleanPhone,
          role: authResult.role,
          businessName: authResult.user.store_name || authResult.user.full_name || 'Retail Merchant Store',
          subscriptionStatus: authResult.isSubscribed ? 'active' : 'inactive'
        }));
        localStorage.setItem('postgres_app_user', JSON.stringify(authResult.user));

        if (cleanPhone || authResult.user.phone) {
          localStorage.setItem('store_owner_phone', authResult.user.phone || cleanPhone);
        }
        if (authResult.isSubscribed) {
          localStorage.setItem('store_subscription_active', JSON.stringify({
            active: true,
            plan_name: authResult.subscription?.plan_name || 'Active Plan',
            plan_tier: authResult.subscription?.plan_tier || 'basic',
            expiresAt: authResult.subscription?.end_date || new Date(Date.now() + 30 * 86400000).toISOString(),
            cachedAt: new Date().toISOString()
          }));
        }

        // Optional background Firebase Auth sign-in
        if (auth) {
          try {
            await signInWithEmailAndPassword(auth, authResult.user.email, password);
          } catch (fbErr) {
            console.warn('Firebase auth notice:', fbErr);
          }
        }

        if (cleanPhone) {
          localStorage.setItem('last_login_phone', cleanPhone);
        }

        // Route to proper view based on role & subscription verified by PostgreSQL
        if (authResult.role === 'admin') {
          window.location.replace('/admin');
        } else if (authResult.isSubscribed) {
          window.location.replace('/dashboard');
        } else {
          window.location.replace('/subscription');
        }
      }
    } catch (err: any) {
      console.error('Authentication error against PostgreSQL app_users:', err);
      setAuthError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    if (!resetAccount.trim()) {
      setResetStatus({ type: 'error', message: 'Please enter your email or mobile number.' });
      return;
    }
    if (newResetPassword.length < 6) {
      setResetStatus({ type: 'error', message: 'New password must be at least 6 characters.' });
      return;
    }
    try {
      setIsResetting(true);
      await resetPasswordWithPostgres({
        identifier: resetAccount.trim(),
        newPassword: newResetPassword.trim()
      });
      setResetStatus({ type: 'success', message: 'Password updated in PostgreSQL app_users table! Signing you in...' });
      
      // Auto populate login form and login
      if (resetAccount.includes('@')) {
        setAuthMethod('email');
        setEmail(resetAccount.trim());
      } else {
        setAuthMethod('phone');
        setPhone(resetAccount.trim());
      }
      setPassword(newResetPassword.trim());

      setTimeout(async () => {
        setIsResetOpen(false);
        try {
          const authResult = await loginWithPostgres({
            identifier: resetAccount.trim(),
            password: newResetPassword.trim()
          });

          const userUid = authResult.user.firebase_uid || `pg_user_${authResult.user.user_id}`;
          localStorage.setItem('store_owner_fallback_auth', JSON.stringify({
            uid: userUid,
            userId: authResult.user.user_id,
            email: authResult.user.email,
            phone: authResult.user.phone,
            role: authResult.role,
            businessName: authResult.user.store_name || authResult.user.full_name || 'Retail Merchant Store',
            subscriptionStatus: authResult.isSubscribed ? 'active' : 'inactive'
          }));
          localStorage.setItem('postgres_app_user', JSON.stringify(authResult.user));
          if (authResult.user.phone) {
            localStorage.setItem('store_owner_phone', authResult.user.phone);
          }
          if (authResult.isSubscribed) {
            localStorage.setItem('store_subscription_active', JSON.stringify({
              active: true,
              plan_name: authResult.subscription?.plan_name || 'Active Plan',
              plan_tier: authResult.subscription?.plan_tier || 'basic',
              expiresAt: authResult.subscription?.end_date || new Date(Date.now() + 30 * 86400000).toISOString(),
              cachedAt: new Date().toISOString()
            }));
          }

          if (authResult.role === 'admin') {
            window.location.replace('/admin');
          } else if (authResult.isSubscribed) {
            window.location.replace('/dashboard');
          } else {
            window.location.replace('/subscription');
          }
        } catch (err: any) {
          setAuthError(err.message || 'Login failed after reset.');
        }
      }, 1000);
    } catch (err: any) {
      setResetStatus({ type: 'error', message: err.message || 'Failed to reset password.' });
    } finally {
      setIsResetting(false);
    }
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

          {/* Production Security Badge */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-slate-600 text-xs font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Encrypted Merchant Access</span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 font-mono">256-Bit SSL</span>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {/* Auth Method Selector */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setAuthMethod('phone')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'phone' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/80' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Phone className="w-3 h-3 text-netflix-red" />
                Mobile (+91)
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('email')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'email' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/80' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Mail className="w-3 h-3 text-netflix-red" />
                Email Address
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {authMethod === 'phone' ? (
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
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-netflix-red" />
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="email"
                      required
                      placeholder="merchant@supermarket.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-black text-slate-600 flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-netflix-red" />
                    Secure Password <span className="text-red-500">*</span>
                  </label>
                  {!isRegistering && (
                    <button
                      type="button"
                      onClick={() => {
                        setResetAccount(authMethod === 'phone' ? phone : email);
                        setNewResetPassword('');
                        setResetStatus(null);
                        setIsResetOpen(true);
                      }}
                      className="text-[10px] text-netflix-red hover:underline font-bold cursor-pointer inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Forgot / Reset?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-4 pr-11 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-netflix-red/30 transition-all placeholder:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
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
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{authError}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-red-200/70 text-[11px]">
                  <span className="text-slate-600 font-normal">Forgot or need to set a new password?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setResetAccount(authMethod === 'phone' ? phone : email);
                      setNewResetPassword('');
                      setResetStatus(null);
                      setIsResetOpen(true);
                    }}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                  >
                    <KeyRound className="w-3 h-3" />
                    Reset Password
                  </button>
                </div>
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

      {/* Reset Password Modal */}
      <AnimatePresence>
        {isResetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-red-50 text-netflix-red flex items-center justify-center">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">Reset Account Password</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Direct update in PostgreSQL app_users table</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResetOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {resetStatus && (
                <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  resetStatus.type === 'success' 
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' 
                    : 'bg-red-50 border border-red-200 text-red-600'
                }`}>
                  {resetStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{resetStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleResetSubmit} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Mobile Number or Email</label>
                  <input
                    type="text"
                    required
                    value={resetAccount}
                    onChange={(e) => setResetAccount(e.target.value)}
                    placeholder="e.g. 9739765357 or suryavamshicv@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-netflix-red/30 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">New Password (min 6 chars)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Enter your new secure password"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-netflix-red/30 outline-none"
                  />
                  <p className="text-[10px] text-slate-400">
                    Will be securely hashed with scrypt and updated directly in PostgreSQL.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsResetOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="flex-1 py-2.5 rounded-xl bg-netflix-red hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isResetting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Update & Sign In</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

