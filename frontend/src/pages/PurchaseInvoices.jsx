import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
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

const PurchaseInvoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [formData, setFormData] = useState({
    supplier_id: "",
    po_id: "",
    due_date: "",
    items: [],
  });
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1, price: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [invoiceResponse, supplierResponse, productResponse, purchaseOrderResponse] = await Promise.all([
        axios.get(`${API}/purchase-invoices`, { withCredentials: true }),
        axios.get(`${API}/suppliers`, { withCredentials: true }),
        axios.get(`${API}/products`, { withCredentials: true }),
        axios.get(`${API}/purchase-orders`, { withCredentials: true }),
      ]);
      setInvoices(invoiceResponse.data);
      setSuppliers(supplierResponse.data);
      setProducts(productResponse.data);
      setPurchaseOrders(purchaseOrderResponse.data);
    } catch (error) {
      toast.error("Error al cargar facturas de compra");
    } finally {
      setLoading(false);
    }
  };

  const invoicedPurchaseOrderIds = useMemo(
    () => new Set(invoices.map((invoice) => invoice.po_id).filter(Boolean)),
    [invoices]
  );

  const availablePurchaseOrders = useMemo(
    () => purchaseOrders.filter((order) => !invoicedPurchaseOrderIds.has(order.po_id)),
    [purchaseOrders, invoicedPurchaseOrderIds]
  );

  const selectedPurchaseOrder = useMemo(
    () => availablePurchaseOrders.find((order) => order.po_id === formData.po_id) || null,
    [availablePurchaseOrders, formData.po_id]
  );

  const pendingPayables = useMemo(
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
          price: parseFloat(newItem.price) || product.cost,
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

  const handlePurchaseOrderChange = (poId) => {
    if (poId === "manual") {
      setFormData((current) => ({ ...current, po_id: "", supplier_id: "", items: [] }));
      return;
    }

    const purchaseOrder = availablePurchaseOrders.find((item) => item.po_id === poId);
    if (!purchaseOrder) return;
    setFormData((current) => ({
      ...current,
      po_id: purchaseOrder.po_id,
      supplier_id: purchaseOrder.supplier_id,
      items: (purchaseOrder.items || []).map((line) => ({
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
      await axios.post(`${API}/purchase-invoices`, formData, { withCredentials: true });
      toast.success("Factura de compra creada");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear factura de compra");
    }
  };

  const handleUpdateStatus = async (invoiceId, status) => {
    try {
      await axios.put(`${API}/purchase-invoices/${invoiceId}`, { status }, { withCredentials: true });
      toast.success("Estado actualizado");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al actualizar estado");
    }
  };

  const handleDelete = async (invoiceId) => {
    if (!window.confirm("Estas seguro de eliminar esta factura de compra?")) return;
    try {
      await axios.delete(`${API}/purchase-invoices/${invoiceId}`, { withCredentials: true });
      toast.success("Factura eliminada y stock revertido");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al eliminar factura");
    }
  };

  const resetForm = () => {
    setFormData({ supplier_id: "", po_id: "", due_date: "", items: [] });
    setNewItem({ product_id: "", quantity: 1, price: 0 });
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const value = search.toLowerCase();
    return invoice.invoice_number?.toLowerCase().includes(value) || invoice.supplier_name?.toLowerCase().includes(value);
  });

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value || 0);

  const statusOptions = [
    { value: "pending", label: "Pendiente" },
    { value: "paid", label: "Pagada" },
    { value: "overdue", label: "Vencida" },
  ];

  return (
    <Layout title="Facturas de compra">
      <div className="space-y-6" data-testid="purchase-invoices-page">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Facturas recibidas</p>
              <p className="mt-2 text-3xl font-bold font-mono">{invoices.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Cuentas por pagar</p>
              <p className="mt-2 text-2xl font-bold font-mono">{formatCurrency(pendingPayables)}</p>
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
              data-testid="search-purchase-invoices"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-purchase-invoice-btn">
                <Plus className="mr-2 h-4 w-4" />
                Nueva factura
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva factura de compra</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Origen del documento</Label>
                    <Select value={formData.po_id || "manual"} onValueChange={handlePurchaseOrderChange}>
                      <SelectTrigger data-testid="pinv-po-select">
                        <SelectValue placeholder="Seleccionar orden o manual" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Factura manual</SelectItem>
                        {availablePurchaseOrders.map((purchaseOrder) => (
                          <SelectItem key={purchaseOrder.po_id} value={purchaseOrder.po_id}>
                            {purchaseOrder.po_number} - {purchaseOrder.supplier_name}
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
                  <Label>Proveedor</Label>
                  <Select
                    value={formData.supplier_id}
                    onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
                    disabled={Boolean(formData.po_id)}
                  >
                    <SelectTrigger data-testid="pinv-supplier-select">
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.supplier_id} value={supplier.supplier_id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Lineas de factura</h4>
                    {selectedPurchaseOrder && (
                      <span className="text-sm text-muted-foreground">
                        Cargada desde {selectedPurchaseOrder.po_number}
                      </span>
                    )}
                  </div>

                  {!selectedPurchaseOrder && (
                    <div className="grid grid-cols-4 gap-2">
                      <Select
                        value={newItem.product_id}
                        onValueChange={(value) => {
                          const product = products.find((item) => item.product_id === value);
                          setNewItem({ ...newItem, product_id: value, price: product?.cost || 0 });
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
                          {!selectedPurchaseOrder && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {formData.items.map((item, index) => (
                          <tr key={`${item.product_id}-${index}`} className="border-b">
                            <td className="py-2">{item.product_name}</td>
                            <td className="py-2 text-right">{item.quantity}</td>
                            <td className="py-2 text-right font-mono">{formatCurrency(item.price)}</td>
                            <td className="py-2 text-right font-mono">{formatCurrency(item.quantity * item.price)}</td>
                            {!selectedPurchaseOrder && (
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
                  <Button type="submit" data-testid="save-pinv-btn">Crear factura</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Factura {viewInvoice?.invoice_number}</DialogTitle>
            </DialogHeader>
            {viewInvoice && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Proveedor</p>
                    <p className="font-medium">{viewInvoice.supplier_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <span className={`status-badge status-${viewInvoice.status}`}>{viewInvoice.status}</span>
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
                      <th>Proveedor</th>
                      <th>Origen</th>
                      <th>Fecha</th>
                      <th>Vencimiento</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Pendiente</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.pinv_id}>
                        <td className="font-mono text-sm">{invoice.invoice_number}</td>
                        <td className="font-medium">{invoice.supplier_name}</td>
                        <td className="text-sm text-muted-foreground">{invoice.po_id || "-"}</td>
                        <td className="text-sm text-muted-foreground">
                          {new Date(invoice.created_at).toLocaleDateString("es-ES")}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("es-ES") : "-"}
                        </td>
                        <td className="text-right font-mono">{formatCurrency(invoice.total)}</td>
                        <td className="text-right font-mono">{formatCurrency(invoice.outstanding_amount)}</td>
                        <td>
                          <Select value={invoice.status} onValueChange={(value) => handleUpdateStatus(invoice.pinv_id, value)}>
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
                          <Button variant="ghost" size="icon" onClick={() => setViewInvoice(invoice)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(invoice.pinv_id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <p>No hay facturas de compra registradas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default PurchaseInvoices;
