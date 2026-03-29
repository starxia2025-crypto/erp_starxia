import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState, createContext, useContext, useCallback } from "react";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { API_BASE } from "@/lib/api";
import { canAccessAny, hasPermission } from "@/lib/permissions";

// Pages
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientTypes from "@/pages/ClientTypes";
import Suppliers from "@/pages/Suppliers";
import SupplierTypes from "@/pages/SupplierTypes";
import Products from "@/pages/Products";
import ProductTypes from "@/pages/ProductTypes";
import Warehouses from "@/pages/Warehouses";
import Inventory from "@/pages/Inventory";
import Orders from "@/pages/Orders";
import Invoices from "@/pages/Invoices";
import PurchaseOrders from "@/pages/PurchaseOrders";
import PurchaseInvoices from "@/pages/PurchaseInvoices";
import Reports from "@/pages/Reports";
import Returns from "@/pages/Returns";
import Settings from "@/pages/Settings";
import Statistics from "@/pages/Statistics";
import StockTransfers from "@/pages/StockTransfers";
import AIAssistant from "@/pages/AIAssistant";
import LegalDocumentPage from "@/pages/LegalDocumentPage";

const API = API_BASE;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        withCredentials: true
      });
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error("Logout error:", error);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route
const ProtectedRoute = ({ children, permission, anyPermissions }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (anyPermissions && !canAccessAny(user, anyPermissions)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// App Router
const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/legal/:code" element={<LegalDocumentPage />} />
      <Route path="/dashboard" element={<ProtectedRoute permission="dashboard.read"><Dashboard /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute permission="clients.read"><Clients /></ProtectedRoute>} />
      <Route path="/client-types" element={<ProtectedRoute permission="clients.read"><ClientTypes /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute permission="suppliers.read"><Suppliers /></ProtectedRoute>} />
      <Route path="/supplier-types" element={<ProtectedRoute permission="suppliers.read"><SupplierTypes /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute permission="products.read"><Products /></ProtectedRoute>} />
      <Route path="/product-types" element={<ProtectedRoute permission="products.read"><ProductTypes /></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute permission="inventory.read"><Warehouses /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute permission="inventory.read"><Inventory /></ProtectedRoute>} />
      <Route path="/stock-transfers" element={<ProtectedRoute permission="inventory.read"><StockTransfers /></ProtectedRoute>} />
      <Route path="/returns" element={<ProtectedRoute anyPermissions={["sales.read", "purchases.read", "inventory.read"]}><Returns /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute permission="sales.read"><Orders /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute permission="sales.read"><Invoices /></ProtectedRoute>} />
      <Route path="/purchase-orders" element={<ProtectedRoute permission="purchases.read"><PurchaseOrders /></ProtectedRoute>} />
      <Route path="/purchase-invoices" element={<ProtectedRoute permission="purchases.read"><PurchaseInvoices /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute permission="reports.read"><Reports /></ProtectedRoute>} />
      <Route path="/statistics" element={<ProtectedRoute permission="reports.read"><Statistics /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute permission="settings.read"><Settings /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<ProtectedRoute permission="ai.read"><AIAssistant /></ProtectedRoute>} />
    </Routes>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
