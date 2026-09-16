import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { AppUser, StoreSubscription, UserRole } from '../types';
import { syncAuthUser, setGlobalAuthContext } from '../lib/postgresApi';

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  role: UserRole;
  isAdmin: boolean;
  isSubscribed: boolean;
  subscription: StoreSubscription | null;
  loading: boolean;
  simulatedRole: UserRole | null;
  setSimulatedRole: (role: UserRole | null) => void;
  refreshAuth: () => Promise<void>;
  markSubscribed: (subData?: any) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  role: 'store_owner',
  isAdmin: false,
  isSubscribed: false,
  subscription: null,
  loading: true,
  simulatedRole: null,
  setSimulatedRole: () => {},
  refreshAuth: async () => {},
  markSubscribed: () => {},
  signOut: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getInitialFallback = () => {
    try {
      const fallbackStr = localStorage.getItem('store_owner_fallback_auth');
      if (fallbackStr) {
        const data = JSON.parse(fallbackStr);
        if (data && (data.uid || data.email || data.userId || data.phone)) {
          return data;
        }
      }
    } catch {}
    return null;
  };

  const checkLocalSubscription = (): boolean => {
    try {
      const activeStr = localStorage.getItem('store_subscription_active');
      if (activeStr) {
        const data = JSON.parse(activeStr);
        if (data.active === true) {
          if (!data.expiresAt || new Date(data.expiresAt) > new Date()) {
            return true;
          }
        }
      }
    } catch {}
    return false;
  };

  const initialFallback = getInitialFallback();

  const [user, setUser] = useState<User | null>(() => {
    if (initialFallback) {
      return {
        uid: initialFallback.uid || `pg_user_${initialFallback.userId || 1}`,
        email: initialFallback.email || '',
        phoneNumber: initialFallback.phone || '',
        displayName: initialFallback.businessName || 'Store Owner'
      } as User;
    }
    return null;
  });

  const [appUser, setAppUser] = useState<AppUser | null>(() => {
    try {
      const pgAppUserStr = localStorage.getItem('postgres_app_user');
      if (pgAppUserStr) {
        return JSON.parse(pgAppUserStr);
      }
    } catch {}
    return null;
  });

  const [role, setRole] = useState<UserRole>(() => {
    if (initialFallback) {
      const email = initialFallback.email || '';
      const phone = initialFallback.phone || '';
      if (
        initialFallback.role === 'admin' ||
        email.toLowerCase() === 'suryavamshicv@gmail.com' ||
        email.toLowerCase() === 'admin@supermarket.com' ||
        phone.includes('9739765357')
      ) {
        return 'admin';
      }
      return initialFallback.role || 'store_owner';
    }
    return 'store_owner';
  });

  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    if (initialFallback) {
      const email = initialFallback.email || '';
      const phone = initialFallback.phone || '';
      if (
        initialFallback.role === 'admin' ||
        email.toLowerCase() === 'suryavamshicv@gmail.com' ||
        phone.includes('9739765357') ||
        initialFallback.subscriptionStatus === 'active'
      ) {
        return true;
      }
    }
    return checkLocalSubscription();
  });

  const [subscription, setSubscription] = useState<StoreSubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !initialFallback);
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);

  const markSubscribed = (subData?: any) => {
    setIsSubscribed(true);
    if (subData) {
      setSubscription(subData);
      localStorage.setItem('store_subscription_active', JSON.stringify({
        active: true,
        plan_name: subData.plan_name || 'Active Plan',
        plan_tier: subData.plan_tier || 'pro',
        expiresAt: subData.end_date || new Date(Date.now() + 30 * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      }));
    } else {
      localStorage.setItem('store_subscription_active', JSON.stringify({
        active: true,
        plan_name: 'StoreOwner Pro',
        plan_tier: 'pro',
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      }));
    }
  };

  const syncUserData = async (currentUser: User | null) => {
    // 1. If Firebase Auth has a signed-in user
    if (currentUser) {
      setUser(currentUser);
      const email = currentUser.email || '';
      const phone = (currentUser.phoneNumber || '').replace(/\D/g, '');
      const storedPhone = (localStorage.getItem('store_owner_phone') || '').replace(/\D/g, '');

      const isAdminUser = 
        email.toLowerCase() === 'suryavamshicv@gmail.com' || 
        email.toLowerCase() === 'admin@supermarket.com' ||
        email.toLowerCase().includes('9739765357') ||
        phone.includes('9739765357') ||
        storedPhone.includes('9739765357') ||
        currentUser.uid.includes('9739765357');

      let userRole: UserRole = isAdminUser ? 'admin' : 'store_owner';
      let subscribed = isAdminUser || checkLocalSubscription();
      const effectivePhone = phone || storedPhone || '';

      // Sync with PostgreSQL backend database
      try {
        const syncRes = await syncAuthUser({
          firebase_uid: currentUser.uid,
          email: email || `user_${effectivePhone || 'owner'}@supermarket.com`,
          full_name: currentUser.displayName || (isAdminUser ? 'Admin' : 'Store Owner'),
          phone: effectivePhone || undefined,
          store_name: 'Store ' + currentUser.uid.slice(0, 6).toUpperCase()
        });

        if (syncRes.user) {
          setAppUser(syncRes.user);
          userRole = (isAdminUser ? 'admin' : (syncRes.role || userRole));
          subscribed = isAdminUser || syncRes.isSubscribed || checkLocalSubscription();
          if (syncRes.subscription) {
            setSubscription(syncRes.subscription);
            if (syncRes.subscription.status === 'active' && syncRes.subscription.is_enabled !== false) {
              subscribed = true;
            }
          }
        }
      } catch (e) {
        console.warn('Postgres auth sync notice:', e);
      }

      // Check Firestore profile fallback
      try {
        const ownerDocRef = doc(db, 'owners', currentUser.uid);
        const ownerSnap = await getDoc(ownerDocRef);
        if (ownerSnap.exists()) {
          const ownerData = ownerSnap.data();
          const ownerPhone = (ownerData.phone || ownerData.phoneNumber || '').replace(/\D/g, '');
          if (ownerData.role === 'admin' || isAdminUser || ownerPhone.includes('9739765357')) {
            userRole = 'admin';
            subscribed = true;
          } else if (ownerData.subscriptionStatus === 'active') {
            subscribed = true;
          }
        }
      } catch (fsErr) {
        console.warn('Firestore profile check notice:', fsErr);
      }

      setRole(userRole);
      setIsSubscribed(subscribed);
      setGlobalAuthContext({
        role: userRole,
        isSubscribed: subscribed,
        email: currentUser.email || '',
        phone: effectivePhone,
        uid: currentUser.uid
      });
      setLoading(false);
      return;
    }

    // 2. If no Firebase currentUser, check if we have a valid PostgreSQL login session!
    const fallbackStr = localStorage.getItem('store_owner_fallback_auth');
    if (fallbackStr) {
      try {
        const fallbackData = JSON.parse(fallbackStr);
        if (fallbackData && (fallbackData.uid || fallbackData.email || fallbackData.userId || fallbackData.phone)) {
          const email = fallbackData.email || '';
          const phone = (fallbackData.phone || '').replace(/\D/g, '');
          const isAdminUser = 
            fallbackData.role === 'admin' ||
            email.toLowerCase() === 'suryavamshicv@gmail.com' || 
            email.toLowerCase() === 'admin@supermarket.com' ||
            email.toLowerCase().includes('9739765357') ||
            phone.includes('9739765357');

          const userRole: UserRole = isAdminUser ? 'admin' : (fallbackData.role || 'store_owner');
          const subscribed = isAdminUser || fallbackData.subscriptionStatus === 'active' || checkLocalSubscription();

          const syntheticUser = {
            uid: fallbackData.uid || `pg_user_${fallbackData.userId || 1}`,
            email: fallbackData.email || (phone ? `${phone}@supermarket.in` : 'owner@supermarket.in'),
            phoneNumber: fallbackData.phone || '',
            displayName: fallbackData.businessName || 'Store Owner'
          } as User;

          setUser(syntheticUser);
          setRole(userRole);
          setIsSubscribed(subscribed);
          setGlobalAuthContext({
            role: userRole,
            isSubscribed: subscribed,
            email: syntheticUser.email || '',
            phone: fallbackData.phone || '',
            uid: syntheticUser.uid
          });

          // Sync background data with PostgreSQL app_users if needed
          const pgAppUserStr = localStorage.getItem('postgres_app_user');
          if (pgAppUserStr) {
            try {
              setAppUser(JSON.parse(pgAppUserStr));
            } catch {}
          }

          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Fallback session read notice:', err);
      }
    }

    // 3. Truly no authenticated user
    setUser(null);
    setAppUser(null);
    setRole('store_owner');
    setIsSubscribed(false);
    setSubscription(null);
    setGlobalAuthContext({ role: 'store_owner', isSubscribed: false, email: '', uid: '' });
    setLoading(false);
  };

  useEffect(() => {
    // Listen for custom subscription event
    const handleSubUpdated = (e: any) => {
      setIsSubscribed(true);
      if (e.detail?.subscription) {
        setSubscription(e.detail.subscription);
      }
      refreshAuth();
    };
    window.addEventListener('subscriptionUpdated', handleSubUpdated);

    // Check fallback auth and optimistically populate while background syncing with PostgreSQL
    const fallbackStr = localStorage.getItem('store_owner_fallback_auth');
    if (fallbackStr) {
      try {
        const fallbackData = JSON.parse(fallbackStr);
        const isAdminUser = 
          fallbackData.phone?.includes('9739765357') || 
          fallbackData.role === 'admin' ||
          fallbackData.email?.toLowerCase() === 'suryavamshicv@gmail.com' ||
          fallbackData.email?.toLowerCase() === 'admin@supermarket.com';
        
        setUser({
          uid: fallbackData.uid,
          email: fallbackData.email,
          phoneNumber: fallbackData.phone,
          displayName: fallbackData.businessName
        } as User);
        setRole(isAdminUser ? 'admin' : (fallbackData.role || 'store_owner'));
        setIsSubscribed(true);
        setGlobalAuthContext({
          role: isAdminUser ? 'admin' : (fallbackData.role || 'store_owner'),
          isSubscribed: true,
          email: fallbackData.email || '',
          phone: fallbackData.phone || '',
          uid: fallbackData.uid || ''
        });

        // Background sync to ensure record exists in PostgreSQL app_users table
        syncAuthUser({
          firebase_uid: fallbackData.uid,
          email: fallbackData.email || `user_${fallbackData.phone || 'owner'}@supermarket.in`,
          full_name: fallbackData.businessName || (isAdminUser ? 'Supermarket Admin' : 'Store Owner'),
          phone: fallbackData.phone,
          store_name: fallbackData.businessName || 'Retail Store'
        }).then((syncRes) => {
          if (syncRes?.user) {
            setAppUser(syncRes.user);
            if (syncRes.subscription) {
              setSubscription(syncRes.subscription);
            }
          }
        }).catch((err) => {
          console.warn('Background PostgreSQL app_users sync notice:', err);
        });

        setLoading(false);
      } catch (e) {
        console.warn('Fallback auth parse notice:', e);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      await syncUserData(currentUser);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('subscriptionUpdated', handleSubUpdated);
    };
  }, []);

  const refreshAuth = async () => {
    if (auth?.currentUser) {
      await syncUserData(auth.currentUser);
    } else {
      await syncUserData(null);
    }
  };

  const signOut = async () => {
    try {
      // Clear all local session tokens and caches
      localStorage.removeItem('store_owner_fallback_auth');
      localStorage.removeItem('postgres_app_user');
      localStorage.removeItem('store_owner_phone');
      localStorage.removeItem('store_subscription_active');
      localStorage.removeItem('auth_user');
      sessionStorage.clear();

      setUser(null);
      setAppUser(null);
      setIsSubscribed(false);
      setSubscription(null);
      setRole('store_owner');
      setGlobalAuthContext({ role: 'store_owner', isSubscribed: false, email: '', uid: '' });

      if (auth?.currentUser) {
        await auth.signOut();
      }
    } catch (e) {
      console.warn('Signout notice:', e);
    } finally {
      window.location.replace('/auth');
    }
  };

  // Effective role considering simulation for demo/testing
  const storedPhone = localStorage.getItem('store_owner_phone') || '';
  const fallbackAuth = localStorage.getItem('store_owner_fallback_auth') || '';
  const isForceAdmin = storedPhone.includes('9739765357') || fallbackAuth.includes('9739765357');

  const effectiveRole = isForceAdmin ? 'admin' : (simulatedRole || role);
  const effectiveIsAdmin = isForceAdmin || effectiveRole === 'admin';
  const localHasActive = checkLocalSubscription();
  const effectiveIsSubscribed = effectiveIsAdmin || localHasActive || Boolean(isSubscribed || (subscription && (subscription.status === 'active' || subscription.status === 'trial') && subscription.is_enabled !== false));

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        role: effectiveRole,
        isAdmin: effectiveIsAdmin,
        isSubscribed: effectiveIsSubscribed,
        subscription,
        loading,
        simulatedRole,
        setSimulatedRole,
        refreshAuth,
        markSubscribed,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
