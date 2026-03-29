import { useEffect, useState } from "react";
import axios from "axios";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Layout from "@/components/layout/Layout";
import { API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API = API_BASE;

const Statistics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await axios.get(`${API}/statistics/overview`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error("Error al cargar estadisticas", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value || 0);

  if (loading) {
    return (
      <Layout title="Estadisticas">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Estadisticas">
      <div className="space-y-6" data-testid="statistics-page">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Cuentas por cobrar" value={formatCurrency(stats?.receivables)} />
          <StatCard title="Cuentas por pagar" value={formatCurrency(stats?.payables)} />
          <StatCard title="Meses con ventas" value={stats?.sales_by_month?.length || 0} />
          <StatCard title="Productos con salida" value={stats?.top_products?.length || 0} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard title="Ventas por mes">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stats?.sales_by_month || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#f97316" name="Ventas" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Compras por mes">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stats?.purchases_by_month || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#2563eb" name="Compras" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top productos vendidos">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stats?.top_products || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={160} />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantity" fill="#16a34a" name="Cantidad" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Stock por almacen">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={stats?.stock_by_warehouse || []}
                  dataKey="quantity"
                  nameKey="warehouse"
                  outerRadius={110}
                  fill="#8b5cf6"
                  label
                />
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </Layout>
  );
};

const StatCard = ({ title, value }) => (
  <Card>
    <CardContent className="p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
    </CardContent>
  </Card>
);

const ChartCard = ({ title, children }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

export default Statistics;
