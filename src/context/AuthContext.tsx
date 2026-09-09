import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { AppUser, StoreSubscription, UserRole } from '../types';
import { AuthResponse, getCurrentPostgresSession, setGlobalAuthContext } from '../lib/postgresApi';

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
  refreshAuth: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole>('store_owner');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<StoreSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);

  const applyAuthResponse = (authResponse: AuthResponse) => {
    const postgresUser = authResponse.user;
    const sessionUser = {
      uid: postgresUser.firebase_uid || String(postgresUser.user_id || ''),
      email: postgresUser.email,
      displayName: postgresUser.full_name || 'Store Owner',
      phoneNumber: postgresUser.phone || null
    } as User;
    setUser(sessionUser);
    setAppUser(postgresUser);
    setRole(authResponse.role);
    setIsSubscribed(authResponse.isSubscribed);
    setSubscription(authResponse.subscription);
    setGlobalAuthContext({
      role: authResponse.role,
      isSubscribed: authResponse.isSubscribed,
      email: postgresUser.email,
      phone: postgresUser.phone || '',
      uid: postgresUser.firebase_uid || String(postgresUser.user_id || '')
    });
  };

  const clearAuth = () => {
    setUser(null);
    setAppUser(null);
    setRole('store_owner');
    setIsSubscribed(false);
    setSubscription(null);
    setGlobalAuthContext({ role: 'store_owner', isSubscribed: false, email: '', phone: '', uid: '' });
  };

  const syncUserData = async () => {
    try {
      applyAuthResponse(await getCurrentPostgresSession());
    } catch {
      clearAuth();
    }
    setLoading(false);
  };

  useEffect(() => {
    void syncUserData();
  }, []);

  const refreshAuth = async () => {
    setLoading(true);
    await syncUserData();
  };

  const effectiveRole = simulatedRole || role;
  const effectiveIsAdmin = effectiveRole === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        role: effectiveRole,
        isAdmin: effectiveIsAdmin,
        isSubscribed,
        subscription,
        loading,
        simulatedRole,
        setSimulatedRole,
        refreshAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
