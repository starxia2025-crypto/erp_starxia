import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Download, FileText, Filter, Mail, Printer, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import Layout from "@/components/layout/Layout";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API = API_BASE;

const reportTypes = [
  { id: "invoices", name: "Facturas de venta" },
  { id: "purchase-invoices", name: "Facturas de compra" },
  { id: "orders", name: "Pedidos de venta" },
  { id: "purchase-orders", name: "Ordenes de compra" },
  { id: "inventory", name: "Inventario" },
  { id: "clients", name: "Clientes" },
  { id: "suppliers", name: "Proveedores" },
  { id: "products", name: "Productos" },
  { id: "returns", name: "Devoluciones" },
  { id: "stock-transfers", name: "Transferencias" },
];

const sortOptions = [
  { value: "created_at", label: "Fecha" },
  { value: "client_name", label: "Cliente" },
  { value: "supplier_name", label: "Proveedor" },
  { value: "invoice_number", label: "Numero factura" },
  { value: "order_number", label: "Numero pedido" },
  { value: "po_number", label: "Numero orden compra" },
  { value: "quantity", label: "Cantidad" },
  { value: "total", label: "Importe total" },
  { value: "status", label: "Estado" },
];

const Reports = () => {
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [preview, setPreview] = useState({ rows: [], totals: { rows: 0, total_amount: 0, outstanding_amount: 0 } });
  const [loading, setLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [filters, setFilters] = useState({
    reportType: "invoices",
    dateFrom: "",
    dateTo: "",
    clientId: "all",
    supplierId: "all",
    status: "all",
    sortBy: "created_at",
    sortDirection: "desc",
    recipient: "",
  });

  useEffect(() => {
    fetchFilterData();
  }, []);

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.reportType]);

  const columns = useMemo(() => {
    if (!preview.rows.length) return [];
    return Object.keys(preview.rows[0]).filter((key) => !["company_id"].includes(key)).slice(0, 8);
  }, [preview.rows]);

  const fetchFilterData = async () => {
    try {
      const [clientResponse, supplierResponse] = await Promise.all([
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/suppliers`, { withCredentials: true }),
      ]);
      setClients(clientResponse.data);
      setSuppliers(supplierResponse.data);
    } catch (error) {
      toast.error("Error al cargar filtros de informes");
    }
  };

  const getParams = () => {
    const params = {};
    if (filters.dateFrom) params.date_from = filters.dateFrom;
    if (filters.dateTo) params.date_to = filters.dateTo;
    if (filters.clientId !== "all") params.client_id = filters.clientId;
    if (filters.supplierId !== "all") params.supplier_id = filters.supplierId;
    if (filters.status !== "all") params.status = filters.status;
    if (filters.sortBy) params.sort_by = filters.sortBy;
    if (filters.sortDirection) params.sort_direction = filters.sortDirection;
    return params;
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/reports/query/${filters.reportType}`, {
        params: getParams(),
        withCredentials: true,
      });
      setPreview(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al cargar el informe");
      setPreview({ rows: [], totals: { rows: 0, total_amount: 0, outstanding_amount: 0 } });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const response = await axios.get(`${API}/reports/export/${filters.reportType}/${format}`, {
        params: getParams(),
        withCredentials: true,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${filters.reportType}.${format === "pdf" ? "pdf" : "xlsx"}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Informe exportado en ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al exportar");
    }
  };

  const handleEmail = async (format) => {
    if (!filters.recipient) {
      toast.error("Indica un email destinatario");
      return;
    }
    setEmailSending(true);
    try {
      await axios.post(
        `${API}/reports/email/${filters.reportType}`,
        {
          recipient: filters.recipient,
          format,
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
          client_id: filters.clientId !== "all" ? filters.clientId : undefined,
          supplier_id: filters.supplierId !== "all" ? filters.supplierId : undefined,
          status: filters.status !== "all" ? filters.status : undefined,
          sort_by: filters.sortBy,
          sort_direction: filters.sortDirection,
        },
        { withCredentials: true }
      );
      toast.success("Informe enviado por email");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al enviar por email");
    } finally {
      setEmailSending(false);
    }
  };

  const handlePrint = () => {
    const printableContent = document.getElementById("report-preview-table");
    if (!printableContent) return;

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    printWindow.document.write(`
      <html>
        <head>
          <title>Informe ${filters.reportType}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Informe ${reportTypes.find((item) => item.id === filters.reportType)?.name || filters.reportType}</h1>
          ${printableContent.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") {
      return Number.isInteger(value)
        ? value.toLocaleString("es-ES")
        : new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <Layout title="Informes">
      <div className="space-y-6" data-testid="reports-page">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros del informe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Tipo de informe">
                <Select
                  value={filters.reportType}
                  onValueChange={(value) => setFilters((current) => ({ ...current, reportType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Fecha desde">
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                />
              </Field>

              <Field label="Fecha hasta">
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                />
              </Field>

              <Field label="Estado">
                <Input
                  placeholder="pending, paid, confirmed..."
                  value={filters.status === "all" ? "" : filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      status: event.target.value ? event.target.value : "all",
                    }))
                  }
                />
              </Field>

              <Field label="Cliente">
                <Select
                  value={filters.clientId}
                  onValueChange={(value) => setFilters((current) => ({ ...current, clientId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.client_id} value={client.client_id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Proveedor">
                <Select
                  value={filters.supplierId}
                  onValueChange={(value) => setFilters((current) => ({ ...current, supplierId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.supplier_id} value={supplier.supplier_id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Ordenar por">
                <Select
                  value={filters.sortBy}
                  onValueChange={(value) => setFilters((current) => ({ ...current, sortBy: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Direccion">
                <Select
                  value={filters.sortDirection}
                  onValueChange={(value) => setFilters((current) => ({ ...current, sortDirection: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descendente</SelectItem>
                    <SelectItem value="asc">Ascendente</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-end">
              <Field label="Enviar por email" className="flex-1">
                <Input
                  type="email"
                  placeholder="destinatario@empresa.com"
                  value={filters.recipient}
                  onChange={(event) => setFilters((current) => ({ ...current, recipient: event.target.value }))}
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button onClick={loadPreview}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Aplicar filtros
                </Button>
                <Button variant="outline" onClick={() => handleExport("excel")}>
                  <Download className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button variant="outline" onClick={() => handleExport("pdf")}>
                  <FileText className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button variant="outline" onClick={() => handleEmail("excel")} disabled={emailSending}>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar
                </Button>
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard title="Filas" value={preview.totals.rows} />
          <SummaryCard title="Importe total" value={formatValue(preview.totals.total_amount)} />
          <SummaryCard title="Pendiente" value={formatValue(preview.totals.outstanding_amount)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : preview.rows.length > 0 ? (
              <div className="overflow-x-auto" id="report-preview-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, rowIndex) => (
                      <tr key={row.id || row.invoice_id || rowIndex}>
                        {columns.map((column) => (
                          <td key={`${rowIndex}-${column}`}>{formatValue(row[column])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">No hay datos para los filtros seleccionados</div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

const Field = ({ label, children, className = "" }) => (
  <div className={className}>
    <Label className="mb-2 block">{label}</Label>
    {children}
  </div>
);

const SummaryCard = ({ title, value }) => (
  <Card>
    <CardContent className="p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
    </CardContent>
  </Card>
);

export default Reports;
