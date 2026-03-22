import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  Truck, 
  Package, 
  ShoppingCart, 
  FileText, 
  AlertTriangle,
  TrendingUp,
  DollarSign
} from "lucide-react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get(`${API}/reports/dashboard`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
  };

  const statCards = [
    { title: "Clientes", value: stats?.clients_count || 0, icon: Users, color: "text-blue-500" },
    { title: "Proveedores", value: stats?.suppliers_count || 0, icon: Truck, color: "text-purple-500" },
    { title: "Productos", value: stats?.products_count || 0, icon: Package, color: "text-green-500" },
    { title: "Pedidos", value: stats?.orders_count || 0, icon: ShoppingCart, color: "text-orange-500" },
  ];

  const financialCards = [
    { title: "Ventas Totales", value: formatCurrency(stats?.total_sales), icon: TrendingUp, color: "text-emerald-500" },
    { title: "Compras Totales", value: formatCurrency(stats?.total_purchases), icon: DollarSign, color: "text-red-500" },
    { title: "Facturas Pendientes", value: stats?.pending_invoices || 0, icon: FileText, color: "text-yellow-500" },
    { title: "Stock Bajo", value: stats?.low_stock_count || 0, icon: AlertTriangle, color: "text-red-500" },
  ];

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard">
      <div className="space-y-6" data-testid="dashboard">
        {/* Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <Card key={index} className="card-hover" data-testid={`stat-${stat.title.toLowerCase()}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1 font-mono">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg bg-muted flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Financial Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {financialCards.map((stat, index) => (
            <Card key={index} className="card-hover" data-testid={`financial-${index}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1 font-mono">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg bg-muted flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pedidos Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recent_orders?.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_orders.map((order, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium font-mono text-sm">{order.order_number}</p>
                        <p className="text-sm text-muted-foreground">{order.client_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm">{formatCurrency(order.total)}</p>
                        <span className={`status-badge status-${order.status}`}>{order.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No hay pedidos recientes</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Invoices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Facturas Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recent_invoices?.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_invoices.map((invoice, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium font-mono text-sm">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm">{formatCurrency(invoice.total)}</p>
                        <span className={`status-badge status-${invoice.status}`}>{invoice.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No hay facturas recientes</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
