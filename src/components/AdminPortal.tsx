import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { useAuth } from '../context/AuthContext';
import { 
  fetchAppUsers, 
  createAppUser, 
  updateAppUser, 
  fetchVendors, 
  createVendor, 
  updateVendor, 
  deleteVendor, 
  fetchSubscriptions, 
  createSubscription, 
  updateSubscription,
  getPostgresStatus,
  PostgresStatus
} from '../lib/postgresApi';
import { AppUser, Vendor, StoreSubscription, UserRole } from '../types';
import { 
  ShieldCheck, 
  Users, 
  Truck, 
  CreditCard, 
  Database, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Plus, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Search, 
  Key, 
  Layers, 
  Server, 
  Copy, 
  Check, 
  ShieldAlert,
  ArrowUpRight,
  Clock,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminPortal() {
  const { isAdmin, role, simulatedRole, setSimulatedRole, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'db' | 'users' | 'vendors' | 'subscriptions'>('db');

  // Data states
  const [pgStatus, setPgStatus] = useState<PostgresStatus | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [subscriptions, setSubscriptions] = useState<StoreSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSchema, setCopiedSchema] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // User form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('store_owner');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserStore, setNewUserStore] = useState('');

  // Vendor form state
  const [vendorForm, setVendorForm] = useState({
    vendor_name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    supplied_categories: 'Produce, Dairy',
    payment_terms: 'Net 30',
    lead_time_days: 3,
    status: 'active' as 'active' | 'inactive' | 'suspended'
  });

  // Subscription form state
  const [subForm, setSubForm] = useState({
    user_id: 1,
    plan_name: 'Store Owner Pro',
    plan_tier: 'pro' as 'basic' | 'pro' | 'enterprise',
    price: 2499,
    status: 'active' as 'active' | 'inactive' | 'trial',
    is_enabled: true,
    inventory_limit: 1000,
    days: 30
  });

  const loadAllAdminData = async () => {
    setLoading(true);
    try {
      const [statusData, userData, vendorData, subData] = await Promise.all([
        getPostgresStatus(),
        fetchAppUsers().catch(() => []),
        fetchVendors().catch(() => []),
        fetchSubscriptions().catch(() => [])
      ]);
      setPgStatus(statusData);
      setUsers(userData);
      setVendors(vendorData);
      setSubscriptions(subData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, []);

  // Handler: Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim()) return;
    try {
      await createAppUser({
        email: newUserEmail.trim(),
        full_name: newUserName.trim(),
        role: newUserRole,
        phone: newUserPhone.trim(),
        store_name: newUserStore.trim()
      });
      setIsUserModalOpen(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPhone('');
      setNewUserStore('');
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    }
  };

  // Handler: Update User Role
  const handleRoleChange = async (userId: number, newRole: UserRole) => {
    try {
      await updateAppUser(userId, { role: newRole });
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      alert(err.message || 'Failed to update user role');
    }
  };

  // Handler: Toggle User Active
  const handleToggleUserActive = async (userItem: AppUser) => {
    try {
      const updatedStatus = !userItem.is_active;
      await updateAppUser(userItem.user_id, { is_active: updatedStatus });
      setUsers(prev => prev.map(u => u.user_id === userItem.user_id ? { ...u, is_active: updatedStatus } : u));
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  // Handler: Save Vendor
  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorForm.vendor_name.trim()) return;
    try {
      if (editingVendor) {
        await updateVendor(editingVendor.vendor_id, vendorForm);
      } else {
        await createVendor(vendorForm);
      }
      setIsVendorModalOpen(false);
      setEditingVendor(null);
      setVendorForm({
        vendor_name: '',
        contact_person: '',
        email: '',
        phone: '',
        address: '',
        tax_id: '',
        supplied_categories: 'Produce, Dairy',
        payment_terms: 'Net 30',
        lead_time_days: 3,
        status: 'active'
      });
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to save vendor');
    }
  };

  // Handler: Delete Vendor
  const handleDeleteVendor = async (vendorId: number) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;
    try {
      await deleteVendor(vendorId);
      setVendors(prev => prev.filter(v => v.vendor_id !== vendorId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete vendor');
    }
  };

  // Handler: Toggle Subscription Enabled
  const handleToggleSubscriptionEnabled = async (sub: StoreSubscription) => {
    try {
      const nextEnabled = !sub.is_enabled;
      await updateSubscription(sub.subscription_id, { 
        is_enabled: nextEnabled,
        status: nextEnabled ? 'active' : 'inactive'
      });
      setSubscriptions(prev => prev.map(s => s.subscription_id === sub.subscription_id ? { 
        ...s, 
        is_enabled: nextEnabled,
        status: nextEnabled ? 'active' : 'inactive'
      } : s));
    } catch (err: any) {
      alert(err.message || 'Failed to update subscription status');
    }
  };

  // Handler: Extend Subscription
  const handleExtendSubscription = async (subId: number, days: number) => {
    try {
      await updateSubscription(subId, { extend_days: days, status: 'active', is_enabled: true });
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to extend subscription');
    }
  };

  // Handler: Create Subscription
  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSubscription(subForm);
      setIsSubModalOpen(false);
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to create subscription');
    }
  };

  const copySchemaSql = () => {
    const sqlText = `-- PostgreSQL Production Database Schema
CREATE TABLE IF NOT EXISTS supermarket_products (
  product_id SERIAL PRIMARY KEY,
  category_id INT REFERENCES product_categories(category_id),
  product_name VARCHAR(255) NOT NULL,
  brand_name VARCHAR(255),
  retail_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  stock_quantity INT NOT NULL DEFAULT 0,
  product_description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scannable_codes (
  code_id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES supermarket_products(product_id) ON DELETE CASCADE,
  code_payload VARCHAR(255) UNIQUE NOT NULL,
  code_type VARCHAR(50) DEFAULT 'QR_CODE',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  user_id SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'store_owner',
  phone VARCHAR(50),
  store_name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  vendor_id SERIAL PRIMARY KEY,
  vendor_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  tax_id VARCHAR(100),
  supplied_categories TEXT,
  payment_terms VARCHAR(100) DEFAULT 'Net 30',
  lead_time_days INT DEFAULT 3,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES app_users(user_id) ON DELETE CASCADE,
  firebase_uid VARCHAR(128),
  plan_name VARCHAR(100) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'basic',
  billing_cycle VARCHAR(50) DEFAULT 'monthly',
  price NUMERIC(10, 2) NOT NULL DEFAULT 2499.00,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  is_enabled BOOLEAN DEFAULT TRUE,
  inventory_limit INT DEFAULT 500,
  features_enabled JSONB,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
  last_payment_reference VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`;
    navigator.clipboard.writeText(sqlText);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  if (!isAdmin && simulatedRole !== 'admin') {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto mt-16 p-8 bg-white rounded-3xl border border-red-200 shadow-sm text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Admin Access Restricted</h2>
          <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
            Only system administrators can access technical schema, database details, user management, vendor management, and subscription configurations.
          </p>
          <div className="mt-6">
            <button 
              onClick={() => setSimulatedRole('admin')}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
            >
              Switch Role to Admin (Demo)
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 pb-16 text-slate-800">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 text-white rounded-2xl shadow-sm">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Admin Console</h1>
                <p className="text-xs text-slate-500">
                  PostgreSQL Active • Database Schema • User & Vendor Management • Subscription Controls
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Simulation Role Switcher for testing */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 text-xs shadow-xs">
              <span className="text-slate-500 font-medium">Viewing as:</span>
              <select
                value={simulatedRole || role}
                onChange={(e) => setSimulatedRole(e.target.value as UserRole)}
                className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="admin">Administrator (Full Access)</option>
                <option value="store_owner">Store Owner (Standard)</option>
              </select>
            </div>

            <button
              onClick={loadAllAdminData}
              disabled={loading}
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl text-slate-700 transition-all cursor-pointer"
              title="Refresh all admin data"
            >
              <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('db')}
            className={cn(
              "px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer",
              activeTab === 'db'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <Database className="w-4 h-4" />
            <span>Database & Schema</span>
            <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-mono">
              Live
            </span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer",
              activeTab === 'users'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <Users className="w-4 h-4" />
            <span>User Management</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('vendors')}
            className={cn(
              "px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer",
              activeTab === 'vendors'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <Truck className="w-4 h-4" />
            <span>Vendor Management</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
              {vendors.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('subscriptions')}
            className={cn(
              "px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer",
              activeTab === 'subscriptions'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <CreditCard className="w-4 h-4" />
            <span>Subscription Management</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
              {subscriptions.length}
            </span>
          </button>
        </div>

        {/* TAB 1: DATABASE & SCHEMA STATUS (ADMIN ONLY) */}
        {activeTab === 'db' && (
          <div className="space-y-6">
            {/* Live Connection Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">PostgreSQL Status</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
                  <span>Connected</span>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 inline" />
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">db.prisma.io:5432/postgres</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Products & Codes</span>
                  <Database className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {pgStatus?.counts?.products ?? 0}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {pgStatus?.counts?.scannableCodes ?? 0} scannable codes active
                </p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Registered Users</span>
                  <Users className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {users.length}
                </div>
                <p className="text-xs text-slate-400 mt-1">In app_users PostgreSQL table</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Vendors & Subs</span>
                  <Truck className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {vendors.length} / {subscriptions.length}
                </div>
                <p className="text-xs text-slate-400 mt-1">Active supplier & store relations</p>
              </div>
            </div>

            {/* Database Architecture & Table Details */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Database Schema & Relational Tables</h3>
                  <p className="text-xs text-slate-500">PostgreSQL Schema (Strictly Hidden from standard Store Owners)</p>
                </div>
                <button
                  onClick={copySchemaSql}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSchema ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                  <span>{copiedSchema ? 'Copied SQL!' : 'Copy SQL Schema'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">supermarket_products</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {pgStatus?.counts?.products ?? 0} rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Stores catalog inventory, pricing, stock count, and brand information.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">scannable_codes</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {pgStatus?.counts?.scannableCodes ?? 0} rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Indexes unique barcode & QR payload mappings with foreign key to products.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">app_users</span>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      {users.length} rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    User role-based access control (admin, store_owner, vendor, cashier).
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">vendors</span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {vendors.length} rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Vendor supply management, payment terms, and delivery lead times.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">store_subscriptions</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {subscriptions.length} rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Subscription active status, features enabled, and inventory limits.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900">product_categories</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {pgStatus?.counts?.categories ?? 0} rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Taxonomy classifications for fast categorization and analytics.
                  </p>
                </div>
              </div>

              {/* Code block */}
              <div className="bg-slate-900 text-emerald-400 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-72">
                <pre>{`-- Active Connection Parameters
HOST: db.prisma.io:5432
DATABASE: postgres
SSL: required (rejectUnauthorized: false)
DRIVER: pg (node-postgres v8.13.3)
RBAC RULES:
 - Admin: View schema, DB connection details, user/vendor management, modify subscriptions.
 - Store Owner: Manage inventory ONLY when store_subscriptions.is_enabled = true AND status = 'active'.`}</pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT (ADMIN ONLY) */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">User Management ({users.length})</h3>
                <p className="text-xs text-slate-500">Configure roles, permissions, and active store accounts.</p>
              </div>
              <button
                onClick={() => setIsUserModalOpen(true)}
                className="px-4 py-2.5 bg-netflix-red hover:bg-red-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add User to DB</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">User</th>
                      <th className="py-3.5 px-4">Role</th>
                      <th className="py-3.5 px-4">Store Name</th>
                      <th className="py-3.5 px-4">Subscription</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {users.map((u) => {
                      const isSubActive = u.subscription_status === 'active' && u.subscription_enabled;
                      return (
                        <tr key={u.user_id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{u.full_name || 'Anonymous User'}</div>
                            <div className="text-slate-400 font-mono text-[11px]">{u.email}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.user_id, e.target.value as UserRole)}
                              className={cn(
                                "text-xs font-bold rounded-xl px-2.5 py-1 border outline-none cursor-pointer",
                                u.role === 'admin' && "bg-purple-50 text-purple-700 border-purple-200",
                                u.role === 'store_owner' && "bg-blue-50 text-blue-700 border-blue-200",
                                u.role === 'vendor' && "bg-amber-50 text-amber-700 border-amber-200",
                                u.role === 'cashier' && "bg-slate-50 text-slate-700 border-slate-200"
                              )}
                            >
                              <option value="admin">Admin</option>
                              <option value="store_owner">Store Owner</option>
                              <option value="vendor">Vendor</option>
                              <option value="cashier">Cashier</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-600">
                            {u.store_name || 'Standard Store'}
                          </td>
                          <td className="py-3.5 px-4">
                            {u.role === 'admin' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                                Admin (All Access)
                              </span>
                            ) : isSubActive ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Active ({u.plan_tier || 'Basic'})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200">
                                <XCircle className="w-3 h-3 text-red-500" />
                                Inactive (Locked)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => handleToggleUserActive(u)}
                              className={cn(
                                "px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all border",
                                u.is_active
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                              )}
                            >
                              {u.is_active ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                const nextRole = u.role === 'admin' ? 'store_owner' : 'admin';
                                handleRoleChange(u.user_id, nextRole);
                              }}
                              className="text-xs text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
                            >
                              {u.role === 'admin' ? 'Make Store Owner' : 'Make Admin'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: VENDOR MANAGEMENT (ADMIN ONLY) */}
        {activeTab === 'vendors' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Vendor Management ({vendors.length})</h3>
                <p className="text-xs text-slate-500">Manage suppliers, procurement lead times, and payment terms in DB.</p>
              </div>
              <button
                onClick={() => {
                  setEditingVendor(null);
                  setVendorForm({
                    vendor_name: '',
                    contact_person: '',
                    email: '',
                    phone: '',
                    address: '',
                    tax_id: '',
                    supplied_categories: 'Produce, Dairy',
                    payment_terms: 'Net 30',
                    lead_time_days: 3,
                    status: 'active'
                  });
                  setIsVendorModalOpen(true);
                }}
                className="px-4 py-2.5 bg-netflix-red hover:bg-red-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Vendor</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">Vendor Name</th>
                      <th className="py-3.5 px-4">Contact</th>
                      <th className="py-3.5 px-4">Categories</th>
                      <th className="py-3.5 px-4">Terms</th>
                      <th className="py-3.5 px-4">Lead Time</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {vendors.map((v) => (
                      <tr key={v.vendor_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{v.vendor_name}</div>
                          <div className="text-slate-400 text-[11px]">{v.tax_id ? `GST: ${v.tax_id}` : v.address}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div>{v.contact_person || 'N/A'}</div>
                          <div className="text-slate-400 text-[11px] font-mono">{v.phone || v.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                            {v.supplied_categories || 'General'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">{v.payment_terms}</td>
                        <td className="py-3.5 px-4">{v.lead_time_days} days</td>
                        <td className="py-3.5 px-4">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            v.status === 'active' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                            v.status === 'inactive' && "bg-slate-100 text-slate-600 border border-slate-200",
                            v.status === 'suspended' && "bg-red-50 text-red-700 border border-red-200"
                          )}>
                            {v.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingVendor(v);
                                setVendorForm({
                                  vendor_name: v.vendor_name,
                                  contact_person: v.contact_person || '',
                                  email: v.email || '',
                                  phone: v.phone || '',
                                  address: v.address || '',
                                  tax_id: v.tax_id || '',
                                  supplied_categories: v.supplied_categories || '',
                                  payment_terms: v.payment_terms || 'Net 30',
                                  lead_time_days: v.lead_time_days || 3,
                                  status: v.status || 'active'
                                });
                                setIsVendorModalOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                              title="Edit Vendor"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteVendor(v.vendor_id)}
                              className="p-1.5 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 cursor-pointer"
                              title="Delete Vendor"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {vendors.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                          No vendors found. Click "Add New Vendor" to register a supplier.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SUBSCRIPTION ENABLED MANAGEMENT (ADMIN ONLY) */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Subscription Enabled Management</h3>
                <p className="text-xs text-slate-500">
                  Control which store owners have subscription privileges to modify and access inventory.
                </p>
              </div>
              <button
                onClick={() => setIsSubModalOpen(true)}
                className="px-4 py-2.5 bg-netflix-red hover:bg-red-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Provision Subscription</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5">
                <div className="text-xs font-bold uppercase text-emerald-800 tracking-wider">Active Subscriptions</div>
                <div className="text-3xl font-black text-emerald-900 mt-1">
                  {subscriptions.filter(s => s.is_enabled && s.status === 'active').length}
                </div>
                <p className="text-xs text-emerald-700 mt-1">Stores with full catalog & DB write access</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
                <div className="text-xs font-bold uppercase text-amber-800 tracking-wider">Total Subscribed Stores</div>
                <div className="text-3xl font-black text-amber-900 mt-1">
                  {subscriptions.length}
                </div>
                <p className="text-xs text-amber-700 mt-1">Registered in store_subscriptions table</p>
              </div>

              <div className="bg-slate-900 text-white rounded-3xl p-5">
                <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Access Control Rule</div>
                <div className="text-sm font-bold text-white mt-1">
                  Unsubscribed Stores = Locked
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Non-admin store owners without an active subscription cannot add, modify, or view items.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4">Store / Account</th>
                      <th className="py-3.5 px-4">Plan & Tier</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Inventory Limit</th>
                      <th className="py-3.5 px-4">Subscription Enabled</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {subscriptions.map((s) => (
                      <tr key={s.subscription_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{s.store_name || s.user_name || 'Store Owner'}</div>
                          <div className="text-slate-400 font-mono text-[11px]">{s.user_email || `User #${s.user_id}`}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800">{s.plan_name}</div>
                          <span className="text-[10px] uppercase font-mono font-bold text-slate-500">Tier: {s.plan_tier}</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          ₹{Number(s.price).toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">/{s.billing_cycle || 'mo'}</span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {s.inventory_limit} Items
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleToggleSubscriptionEnabled(s)}
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                              s.is_enabled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            )}
                          >
                            {s.is_enabled ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>ENABLED</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-red-600" />
                                <span>DISABLED</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            s.status === 'active' && "bg-emerald-100 text-emerald-800",
                            s.status === 'trial' && "bg-blue-100 text-blue-800",
                            s.status === 'expired' && "bg-slate-100 text-slate-700",
                            s.status === 'inactive' && "bg-red-100 text-red-800"
                          )}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleExtendSubscription(s.subscription_id, 30)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              title="Extend subscription by 30 days"
                            >
                              +30d
                            </button>
                            <button
                              onClick={() => handleExtendSubscription(s.subscription_id, 365)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              title="Extend subscription by 1 year"
                            >
                              +1yr
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD USER */}
        {isUserModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Add User to PostgreSQL</h3>
                <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="store.owner@supermarket.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    >
                      <option value="store_owner">Store Owner</option>
                      <option value="admin">Administrator</option>
                      <option value="vendor">Vendor</option>
                      <option value="cashier">Cashier</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Store Name</label>
                  <input
                    type="text"
                    value={newUserStore}
                    onChange={(e) => setNewUserStore(e.target.value)}
                    placeholder="Mega Mart Bangalore"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsUserModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                  >
                    Save User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ADD / EDIT VENDOR */}
        {isVendorModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">
                  {editingVendor ? 'Edit Vendor Details' : 'Register New Vendor'}
                </h3>
                <button onClick={() => setIsVendorModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <form onSubmit={handleSaveVendor} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={vendorForm.vendor_name}
                    onChange={(e) => setVendorForm({ ...vendorForm, vendor_name: e.target.value })}
                    placeholder="AgroFresh Supply Corp"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={vendorForm.contact_person}
                      onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
                      placeholder="Ramesh Gupta"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={vendorForm.phone}
                      onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                      placeholder="+91 98765 01234"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={vendorForm.email}
                      onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                      placeholder="orders@agrofresh.com"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tax ID / GST</label>
                    <input
                      type="text"
                      value={vendorForm.tax_id}
                      onChange={(e) => setVendorForm({ ...vendorForm, tax_id: e.target.value })}
                      placeholder="29AAAAA0000A1Z5"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Supplied Categories</label>
                  <input
                    type="text"
                    value={vendorForm.supplied_categories}
                    onChange={(e) => setVendorForm({ ...vendorForm, supplied_categories: e.target.value })}
                    placeholder="Fresh Produce, Dairy & Bakery"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Payment Terms</label>
                    <select
                      value={vendorForm.payment_terms}
                      onChange={(e) => setVendorForm({ ...vendorForm, payment_terms: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    >
                      <option value="Immediate">Immediate</option>
                      <option value="Net 15">Net 15</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 60">Net 60</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Lead Time (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={vendorForm.lead_time_days}
                      onChange={(e) => setVendorForm({ ...vendorForm, lead_time_days: Number(e.target.value) })}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                    <select
                      value={vendorForm.status}
                      onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value as any })}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsVendorModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                  >
                    {editingVendor ? 'Save Changes' : 'Register Vendor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: PROVISION SUBSCRIPTION */}
        {isSubModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Provision Store Subscription</h3>
                <button onClick={() => setIsSubModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <form onSubmit={handleCreateSubscription} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assign to User</label>
                  <select
                    value={subForm.user_id}
                    onChange={(e) => setSubForm({ ...subForm, user_id: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                  >
                    {users.map(u => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.full_name || u.email} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Plan Tier</label>
                    <select
                      value={subForm.plan_tier}
                      onChange={(e) => setSubForm({ ...subForm, plan_tier: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    >
                      <option value="basic">Basic (500 items)</option>
                      <option value="pro">Pro (1,000 items)</option>
                      <option value="enterprise">Enterprise (Unlimited)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Price (₹)</label>
                    <input
                      type="number"
                      value={subForm.price}
                      onChange={(e) => setSubForm({ ...subForm, price: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      value={subForm.days}
                      onChange={(e) => setSubForm({ ...subForm, days: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Inventory Limit</label>
                    <input
                      type="number"
                      value={subForm.inventory_limit}
                      onChange={(e) => setSubForm({ ...subForm, inventory_limit: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="sub-is-enabled"
                    checked={subForm.is_enabled}
                    onChange={(e) => setSubForm({ ...subForm, is_enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="sub-is-enabled" className="text-xs font-bold text-slate-700">
                    Enable Subscription Immediately
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsSubModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                  >
                    Provision Subscription
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
