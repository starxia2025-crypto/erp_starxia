import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, createContext, useContext, useCallback } from "react";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

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
import Settings from "@/pages/Settings";
import AIAssistant from "@/pages/AIAssistant";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    
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

// Auth Callback Component
const AuthCallback = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = window.location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch) {
        const sessionId = sessionIdMatch[1];
        try {
          const response = await axios.get(`${API}/auth/session?session_id=${sessionId}`, {
            withCredentials: true
          });
          setUser(response.data);
          navigate('/dashboard', { replace: true, state: { user: response.data } });
        } catch (error) {
          console.error("Auth error:", error);
          navigate('/', { replace: true });
        }
      } else {
        navigate('/', { replace: true });
      }
    };

    processAuth();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Autenticando...</p>
      </div>
    </div>
  );
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user && !location.state?.user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user && !location.state?.user) {
    return null;
  }

  return children;
};

// App Router
const AppRouter = () => {
  const location = useLocation();

  // Check URL fragment for session_id synchronously during render
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/client-types" element={<ProtectedRoute><ClientTypes /></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
      <Route path="/supplier-types" element={<ProtectedRoute><SupplierTypes /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/product-types" element={<ProtectedRoute><ProductTypes /></ProtectedRoute>} />
      <Route path="/warehouses" element={<ProtectedRoute><Warehouses /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
      <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
      <Route path="/purchase-invoices" element={<ProtectedRoute><PurchaseInvoices /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
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
