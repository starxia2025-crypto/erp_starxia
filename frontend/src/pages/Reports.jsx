import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  FileSpreadsheet, 
  Users, 
  Truck, 
  Package, 
  ShoppingCart, 
  FileText, 
  Download 
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { API_BASE } from "@/lib/api";

const API = API_BASE;

const Reports = () => {
  const [exporting, setExporting] = useState(null);

  const reportTypes = [
    { id: "clients", name: "Clientes", icon: Users, description: "Listado completo de clientes" },
    { id: "suppliers", name: "Proveedores", icon: Truck, description: "Listado completo de proveedores" },
    { id: "products", name: "Productos", icon: Package, description: "Catálogo de productos" },
    { id: "inventory", name: "Inventario", icon: FileSpreadsheet, description: "Stock actual por almacén" },
    { id: "orders", name: "Pedidos", icon: ShoppingCart, description: "Historial de pedidos" },
    { id: "invoices", name: "Facturas de Venta", icon: FileText, description: "Facturas emitidas a clientes" },
    { id: "purchase-orders", name: "Órdenes de Compra", icon: ShoppingCart, description: "Órdenes a proveedores" },
    { id: "purchase-invoices", name: "Facturas de Compra", icon: FileText, description: "Facturas de proveedores" },
  ];

  const handleExport = async (reportId) => {
    setExporting(reportId);
    try {
      const response = await axios.get(`${API}/reports/export/${reportId}`, {
        withCredentials: true,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Reporte exportado correctamente");
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error("No hay datos para exportar");
      } else {
        toast.error("Error al exportar reporte");
      }
    } finally {
      setExporting(null);
    }
  };

  return (
    <Layout title="Informes y Reportes">
      <div className="space-y-6" data-testid="reports-page">
        <div className="mb-6">
          <p className="text-muted-foreground">
            Genera y exporta informes de todas las áreas del sistema en formato Excel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {reportTypes.map((report) => (
            <Card key={report.id} className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <report.icon className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{report.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{report.description}</p>
                <Button 
                  onClick={() => handleExport(report.id)}
                  disabled={exporting === report.id}
                  className="w-full"
                  variant="outline"
                  data-testid={`export-${report.id}-btn`}
                >
                  {exporting === report.id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Exportar Excel
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
