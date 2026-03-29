import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Eye, FileDown, FileText, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import Layout from "@/components/layout/Layout";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [invoiceRecords, setInvoiceRecords] = useState([]);
  const [invoiceEvents, setInvoiceEvents] = useState([]);
  const [formData, setFormData] = useState({
    client_id: "",
    order_id: "",
    series: "F",
    invoice_type: "complete",
    simplified: false,
    due_date: "",
    items: [],
  });
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1, price: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [invoiceResponse, clientResponse, productResponse, orderResponse] = await Promise.all([
        axios.get(`${API}/invoices`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/products`, { withCredentials: true }),
        axios.get(`${API}/orders`, { withCredentials: true }),
      ]);
      setInvoices(invoiceResponse.data);
      setClients(clientResponse.data);
      setProducts(productResponse.data);
      setOrders(orderResponse.data);
    } catch (error) {
      toast.error("Error al cargar facturas");
    } finally {
      setLoading(false);
    }
  };

  const invoicedOrderIds = useMemo(
    () => new Set(invoices.map((invoice) => invoice.order_id).filter(Boolean)),
    [invoices]
  );

  const availableOrders = useMemo(
    () => orders.filter((order) => !invoicedOrderIds.has(order.order_id)),
    [orders, invoicedOrderIds]
  );

  const selectedOrder = useMemo(
    () => availableOrders.find((order) => order.order_id === formData.order_id) || null,
    [availableOrders, formData.order_id]
  );

  const pendingReceivables = useMemo(
    () => invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + (invoice.outstanding_amount || 0), 0),
    [invoices]
  );

  const overdueCount = useMemo(() => {
    const today = new Date();
    return invoices.filter((invoice) => {
      if (invoice.status === "paid" || !invoice.due_date) return false;
      return new Date(invoice.due_date) < today;
    }).length;
  }, [invoices]);

  const handleAddItem = () => {
    if (!newItem.product_id) return;
    const product = products.find((item) => item.product_id === newItem.product_id);
    if (!product) return;

    setFormData((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          product_id: newItem.product_id,
          product_name: product.name,
          quantity: parseInt(newItem.quantity, 10) || 1,
          price: parseFloat(newItem.price) || product.price,
        },
      ],
    }));
    setNewItem({ product_id: "", quantity: 1, price: 0 });
  };

  const handleRemoveItem = (index) => {
    setFormData((current) => ({
      ...current,
      items: current.items.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleOrderChange = (orderId) => {
    if (orderId === "manual") {
      setFormData((current) => ({ ...current, order_id: "", client_id: "", items: [] }));
      return;
    }

    const order = availableOrders.find((item) => item.order_id === orderId);
    if (!order) return;
    setFormData((current) => ({
      ...current,
      order_id: order.order_id,
      client_id: order.client_id,
      items: (order.items || []).map((line) => ({
        product_id: line.product_id,
        product_name: line.product_name,
        quantity: line.quantity,
        price: line.price,
      })),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formData.items.length === 0) {
      toast.error("Debes anadir al menos un producto");
      return;
    }

    try {
      await axios.post(`${API}/invoices`, formData, { withCredentials: true });
      toast.success("Factura creada");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear factura");
    }
  };

  const handleUpdateStatus = async (invoiceId, status) => {
    try {
      await axios.put(`${API}/invoices/${invoiceId}`, { status }, { withCredentials: true });
      toast.success("Estado actualizado");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al actualizar estado");
    }
  };

  const handleCancelInvoice = async (invoiceId) => {
    try {
      await axios.post(`${API}/invoices/${invoiceId}/cancel`, {}, { withCredentials: true });
      toast.success("Factura anulada");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo anular la factura");
    }
  };

  const handleRectifyInvoice = async (invoiceId) => {
    try {
      await axios.post(`${API}/invoices/${invoiceId}/rectify`, {}, { withCredentials: true });
      toast.success("Factura rectificativa generada");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo crear la rectificativa");
    }
  };

  const handleExportFiscalRecord = async (invoiceId) => {
    try {
      const response = await axios.get(`${API}/invoices/${invoiceId}/record-export`, {
        withCredentials: true,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `invoice-records-${invoiceId}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Registro fiscal exportado");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo exportar el registro fiscal");
    }
  };

  const handleViewInvoice = async (invoice) => {
    setViewInvoice(invoice);
    try {
      const [recordsResponse, eventsResponse] = await Promise.all([
        axios.get(`${API}/invoices/${invoice.invoice_id}/records`, { withCredentials: true }),
        axios.get(`${API}/system-events`, {
          withCredentials: true,
          params: { entity_type: "invoice", entity_id: invoice.invoice_id },
        }),
      ]);
      setInvoiceRecords(recordsResponse.data);
      setInvoiceEvents(eventsResponse.data);
    } catch (error) {
      setInvoiceRecords([]);
      setInvoiceEvents([]);
    }
  };

  const resetForm = () => {
    setFormData({ client_id: "", order_id: "", series: "F", invoice_type: "complete", simplified: false, due_date: "", items: [] });
    setNewItem({ product_id: "", quantity: 1, price: 0 });
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const value = search.toLowerCase();
    return invoice.invoice_number?.toLowerCase().includes(value) || invoice.client_name?.toLowerCase().includes(value);
  });

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value || 0);

  const statusOptions = [
    { value: "pending", label: "Pendiente" },
    { value: "paid", label: "Pagada" },
    { value: "overdue", label: "Vencida" },
    { value: "cancelled", label: "Cancelada" },
  ];

  return (
    <Layout title="Facturas de venta">
      <div className="space-y-6" data-testid="invoices-page">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Facturas emitidas</p>
              <p className="mt-2 text-3xl font-bold font-mono">{invoices.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Cuentas por cobrar</p>
              <p className="mt-2 text-2xl font-bold font-mono">{formatCurrency(pendingReceivables)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Pendientes</p>
              <p className="mt-2 text-3xl font-bold font-mono">
                {invoices.filter((invoice) => invoice.status === "pending").length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Vencidas</p>
              <p className="mt-2 text-3xl font-bold font-mono">{overdueCount}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              placeholder="Buscar facturas..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              data-testid="search-invoices"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-invoice-btn">
                <Plus className="mr-2 h-4 w-4" />
                Nueva factura
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva factura de venta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Serie</Label>
                    <Input value={formData.series} onChange={(event) => setFormData({ ...formData, series: event.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={formData.invoice_type} onValueChange={(value) => setFormData({ ...formData, invoice_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="complete">Completa</SelectItem>
                        <SelectItem value="simplified">Simplificada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Origen del documento</Label>
                    <Select value={formData.order_id || "manual"} onValueChange={handleOrderChange}>
                      <SelectTrigger data-testid="invoice-order-select">
                        <SelectValue placeholder="Seleccionar pedido o manual" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Factura manual</SelectItem>
                        {availableOrders.map((order) => (
                          <SelectItem key={order.order_id} value={order.order_id}>
                            {order.order_number} - {order.client_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fecha de vencimiento</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(event) => setFormData({ ...formData, due_date: event.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Cliente</Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                    disabled={Boolean(formData.order_id)}
                  >
                    <SelectTrigger data-testid="invoice-client-select">
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.client_id} value={client.client_id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Lineas de factura</h4>
                    {selectedOrder && (
                      <span className="text-sm text-muted-foreground">
                        Cargada desde {selectedOrder.order_number}
                      </span>
                    )}
                  </div>

                  {!selectedOrder && (
                    <div className="grid grid-cols-4 gap-2">
                      <Select
                        value={newItem.product_id}
                        onValueChange={(value) => {
                          const product = products.find((item) => item.product_id === value);
                          setNewItem({ ...newItem, product_id: value, price: product?.price || 0 });
                        }}
                      >
                        <SelectTrigger className="col-span-2">
                          <SelectValue placeholder="Producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.product_id} value={product.product_id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Cant."
                        value={newItem.quantity}
                        onChange={(event) => setNewItem({ ...newItem, quantity: event.target.value })}
                      />
                      <Button type="button" onClick={handleAddItem}>Anadir</Button>
                    </div>
                  )}

                  {formData.items.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">Producto</th>
                          <th className="py-2 text-right">Cant.</th>
                          <th className="py-2 text-right">Precio</th>
                          <th className="py-2 text-right">Total</th>
                          {!selectedOrder && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {formData.items.map((item, index) => (
                          <tr key={`${item.product_id}-${index}`} className="border-b">
                            <td className="py-2">{item.product_name}</td>
                            <td className="py-2 text-right">{item.quantity}</td>
                            <td className="py-2 text-right font-mono">{formatCurrency(item.price)}</td>
                            <td className="py-2 text-right font-mono">{formatCurrency(item.quantity * item.price)}</td>
                            {!selectedOrder && (
                              <td className="py-2 text-right">
                                <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(index)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" data-testid="save-invoice-btn">Crear factura</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog
          open={!!viewInvoice}
          onOpenChange={(open) => {
            if (!open) {
              setViewInvoice(null);
              setInvoiceRecords([]);
              setInvoiceEvents([]);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Factura {viewInvoice?.invoice_number}</DialogTitle>
            </DialogHeader>
            {viewInvoice && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-medium">{viewInvoice.client_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado fiscal</p>
                    <span className={`status-badge status-${viewInvoice.status}`}>{viewInvoice.status}</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo</p>
                    <p className="font-medium">{viewInvoice.invoice_type || "complete"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Inmutable desde</p>
                    <p className="font-medium">
                      {viewInvoice.immutable_at ? new Date(viewInvoice.immutable_at).toLocaleString("es-ES") : "-"}
                    </p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">Producto</th>
                      <th className="py-2 text-right">Cant.</th>
                      <th className="py-2 text-right">Precio</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.items?.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2">{item.product_name}</td>
                        <td className="py-2 text-right">{item.quantity}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(item.price)}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" className="py-2 text-right font-medium">Subtotal:</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(viewInvoice.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3" className="py-2 text-right font-medium">IVA:</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(viewInvoice.tax)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3" className="py-2 text-right font-bold">Total:</td>
                      <td className="py-2 text-right font-mono font-bold">{formatCurrency(viewInvoice.total)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Historial fiscal / VERI*FACTU</p>
                    <Button variant="outline" size="sm" onClick={() => handleExportFiscalRecord(viewInvoice.invoice_id)}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Exportar registro
                    </Button>
                  </div>
                  {invoiceRecords.length > 0 ? (
                    <div className="space-y-2 text-sm">
                      {invoiceRecords.map((record) => (
                        <div key={record.record_id} className="rounded-md border border-border p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{record.record_type}</span>
                            <span className="text-muted-foreground">
                              {new Date(record.generated_at).toLocaleString("es-ES")}
                            </span>
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{record.hash_current}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin registros disponibles</p>
                  )}
                </div>
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="font-medium">Historial de eventos</p>
                  {invoiceEvents.length > 0 ? (
                    <div className="space-y-2 text-sm">
                      {invoiceEvents.map((event) => (
                        <div key={event.event_id} className="rounded-md border border-border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{event.event_type}</span>
                            <span className="text-muted-foreground">
                              {new Date(event.created_at).toLocaleString("es-ES")}
                            </span>
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{event.hash_current}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin eventos disponibles</p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredInvoices.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Numero</th>
                      <th>Cliente</th>
                      <th>Origen</th>
                      <th>Fecha</th>
                      <th>Vencimiento</th>
                      <th>Serie</th>
                      <th>Fiscal</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Pendiente</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.invoice_id}>
                        <td className="font-mono text-sm">{invoice.invoice_number}</td>
                        <td className="font-medium">{invoice.client_name}</td>
                        <td className="text-sm text-muted-foreground">{invoice.order_id || "-"}</td>
                        <td className="text-sm text-muted-foreground">
                          {new Date(invoice.created_at).toLocaleDateString("es-ES")}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("es-ES") : "-"}
                        </td>
                        <td className="font-mono text-sm">{invoice.series || "F"}</td>
                        <td>
                          <div className="inline-flex items-center gap-2 text-xs">
                            <ShieldAlert className="h-4 w-4 text-primary" />
                            <span>{invoice.fiscal_record_status || "alta"}</span>
                          </div>
                        </td>
                        <td className="text-right font-mono">{formatCurrency(invoice.total)}</td>
                        <td className="text-right font-mono">{formatCurrency(invoice.outstanding_amount)}</td>
                        <td>
                          <Select value={invoice.status} onValueChange={(value) => handleUpdateStatus(invoice.invoice_id, value)}>
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => window.open(`${API}/invoices/${invoice.invoice_id}/pdf`, "_blank")}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleRectifyInvoice(invoice.invoice_id)}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleCancelInvoice(invoice.invoice_id)}>
                            <ShieldAlert className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <p>No hay facturas registradas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Invoices;
