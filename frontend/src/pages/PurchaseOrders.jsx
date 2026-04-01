import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Search, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { API_BASE, getApiErrorMessage } from "@/lib/api";

const API = API_BASE;

const PurchaseOrders = () => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [formData, setFormData] = useState({
    supplier_id: "",
    warehouse_id: "",
    items: []
  });
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1, price: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [poRes, supRes, prodRes, whRes] = await Promise.all([
        axios.get(`${API}/purchase-orders`, { withCredentials: true }),
        axios.get(`${API}/suppliers`, { withCredentials: true }),
        axios.get(`${API}/products`, { withCredentials: true }),
        axios.get(`${API}/warehouses`, { withCredentials: true })
      ]);
      setPurchaseOrders(poRes.data);
      setSuppliers(supRes.data);
      setProducts(prodRes.data);
      setWarehouses(whRes.data);
    } catch (error) {
      toast.error("Error al cargar órdenes de compra");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (!newItem.product_id) return;
    const product = products.find(p => p.product_id === newItem.product_id);
    if (!product) return;
    
    setFormData({
      ...formData,
      items: [...formData.items, {
        product_id: newItem.product_id,
        product_name: product.name,
        quantity: parseInt(newItem.quantity) || 1,
        price: parseFloat(newItem.price) || product.cost
      }]
    });
    setNewItem({ product_id: "", quantity: 1, price: 0 });
  };

  const handleRemoveItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      toast.error("Debe añadir al menos un producto");
      return;
    }
    try {
      await axios.post(`${API}/purchase-orders`, formData, { withCredentials: true });
      toast.success("Orden de compra creada");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al crear orden de compra"));
    }
  };

  const handleUpdateStatus = async (poId, status) => {
    try {
      await axios.put(`${API}/purchase-orders/${poId}`, { status }, { withCredentials: true });
      toast.success("Estado actualizado");
      fetchData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al actualizar estado"));
    }
  };

  const handleDelete = async (poId) => {
    if (window.confirm("¿Estás seguro de eliminar esta orden de compra?")) {
      try {
        await axios.delete(`${API}/purchase-orders/${poId}`, { withCredentials: true });
        toast.success("Orden de compra eliminada");
        fetchData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Error al eliminar orden de compra"));
      }
    }
  };

  const resetForm = () => {
    setFormData({ supplier_id: "", warehouse_id: "", items: [] });
    setNewItem({ product_id: "", quantity: 1, price: 0 });
  };

  const filteredOrders = purchaseOrders.filter(po =>
    po.po_number?.toLowerCase().includes(search.toLowerCase()) ||
    po.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
  };

  const statusOptions = [
    { value: "pending", label: "Pendiente" },
    { value: "confirmed", label: "Confirmada" },
    { value: "received", label: "Recibida" },
    { value: "cancelled", label: "Cancelada" }
  ];

  return (
    <Layout title="Órdenes de Compra">
      <div className="space-y-6" data-testid="purchase-orders-page">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar órdenes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="search-purchase-orders"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-purchase-order-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Orden
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva Orden de Compra</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Proveedor *</Label>
                    <Select value={formData.supplier_id} onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}>
                      <SelectTrigger data-testid="po-supplier-select">
                        <SelectValue placeholder="Seleccionar proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((sup) => (
                          <SelectItem key={sup.supplier_id} value={sup.supplier_id}>{sup.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Almacén Destino</Label>
                    <Select value={formData.warehouse_id} onValueChange={(value) => setFormData({ ...formData, warehouse_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar almacén" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((wh) => (
                          <SelectItem key={wh.warehouse_id} value={wh.warehouse_id}>{wh.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium">Añadir Productos</h4>
                  <div className="grid grid-cols-4 gap-2">
                    <Select value={newItem.product_id} onValueChange={(value) => {
                      const product = products.find(p => p.product_id === value);
                      setNewItem({ ...newItem, product_id: value, price: product?.cost || 0 });
                    }}>
                      <SelectTrigger className="col-span-2">
                        <SelectValue placeholder="Producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((prod) => (
                          <SelectItem key={prod.product_id} value={prod.product_id}>{prod.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Cant."
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    />
                    <Button type="button" onClick={handleAddItem}>Añadir</Button>
                  </div>

                  {formData.items.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Producto</th>
                          <th className="text-right py-2">Cant.</th>
                          <th className="text-right py-2">Precio</th>
                          <th className="text-right py-2">Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.items.map((item, index) => (
                          <tr key={index} className="border-b">
                            <td className="py-2">{item.product_name}</td>
                            <td className="text-right py-2">{item.quantity}</td>
                            <td className="text-right py-2 font-mono">{formatCurrency(item.price)}</td>
                            <td className="text-right py-2 font-mono">{formatCurrency(item.quantity * item.price)}</td>
                            <td className="text-right py-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(index)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" data-testid="save-po-btn">Crear Orden</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* View PO Dialog */}
        <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Orden {viewOrder?.po_number}</DialogTitle>
            </DialogHeader>
            {viewOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Proveedor</p>
                    <p className="font-medium">{viewOrder.supplier_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <span className={`status-badge status-${viewOrder.status}`}>{viewOrder.status}</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Producto</th>
                      <th className="text-right py-2">Cant.</th>
                      <th className="text-right py-2">Precio</th>
                      <th className="text-right py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewOrder.items?.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2">{item.product_name}</td>
                        <td className="text-right py-2">{item.quantity}</td>
                        <td className="text-right py-2 font-mono">{formatCurrency(item.price)}</td>
                        <td className="text-right py-2 font-mono">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" className="text-right py-2 font-medium">Subtotal:</td>
                      <td className="text-right py-2 font-mono">{formatCurrency(viewOrder.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3" className="text-right py-2 font-medium">IVA (21%):</td>
                      <td className="text-right py-2 font-mono">{formatCurrency(viewOrder.tax)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3" className="text-right py-2 font-bold">Total:</td>
                      <td className="text-right py-2 font-mono font-bold">{formatCurrency(viewOrder.total)}</td>
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
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nº Orden</th>
                      <th>Proveedor</th>
                      <th>Fecha</th>
                      <th className="text-right">Total</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((po) => (
                      <tr key={po.po_id}>
                        <td className="font-mono text-sm">{po.po_number}</td>
                        <td className="font-medium">{po.supplier_name}</td>
                        <td className="text-muted-foreground text-sm">
                          {new Date(po.created_at).toLocaleDateString('es-ES')}
                        </td>
                        <td className="text-right font-mono">{formatCurrency(po.total)}</td>
                        <td>
                          <Select value={po.status} onValueChange={(value) => handleUpdateStatus(po.po_id, value)}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setViewOrder(po)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(po.po_id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No hay órdenes de compra registradas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default PurchaseOrders;
