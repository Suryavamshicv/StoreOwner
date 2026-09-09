import React from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate 
} from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Subscription from './components/Subscription';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import QRGenerator from './components/QRGenerator';
import StoreProfile from './components/StoreProfile';
import AdminPortal from './components/AdminPortal';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { user, loading, isSubscribed, isAdmin, refreshAuth } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <div className="background-glow pointer-events-none">
          <div className="glow-red opacity-30"></div>
          <div className="glow-blue opacity-30"></div>
        </div>
        <motion.div
          animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 bg-netflix-red rounded-3xl flex items-center justify-center text-5xl font-black text-white shadow-2xl shadow-netflix-red/15">S</div>
          <div className="text-2xl font-black font-display tracking-tight uppercase text-slate-800">StoreOwner</div>
        </motion.div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-netflix-black">
        <Routes>
          <Route path="/auth" element={!user ? <Login /> : <Navigate to={isSubscribed ? "/dashboard" : "/subscribe"} />} />
          
          <Route 
            path="/subscribe" 
            element={user ? (isSubscribed ? <Navigate to="/dashboard" /> : <Subscription onSuccess={refreshAuth} />) : <Navigate to="/auth" />} 
          />
          
          <Route 
            path="/dashboard" 
            element={user && isSubscribed ? <Dashboard /> : <Navigate to={!user ? "/auth" : "/subscribe"} />} 
          />
          <Route 
            path="/inventory" 
            element={user ? <Inventory /> : <Navigate to="/auth" />} 
          />
          <Route 
            path="/sales" 
            element={user && isSubscribed ? <Sales /> : <Navigate to={!user ? "/auth" : "/subscribe"} />} 
          />
          <Route 
            path="/qr" 
            element={user && isSubscribed ? <QRGenerator /> : <Navigate to={!user ? "/auth" : "/subscribe"} />} 
          />
          <Route 
            path="/profile" 
            element={user ? <StoreProfile /> : <Navigate to="/auth" />} 
          />
          <Route 
            path="/admin" 
            element={user && (isAdmin || isSubscribed) ? <AdminPortal /> : <Navigate to={!user ? "/auth" : "/subscribe"} />} 
          />

          <Route path="/" element={<Navigate to={user ? (isSubscribed ? "/dashboard" : "/inventory") : "/auth"} />} />
        </Routes>
      </div>
    </Router>
  );
}
