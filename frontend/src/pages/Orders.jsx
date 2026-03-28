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
import { API_BASE } from "@/lib/api";

const API = API_BASE;

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [formData, setFormData] = useState({
    client_id: "",
    warehouse_id: "",
    items: []
  });
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1, price: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ordRes, cliRes, prodRes, whRes] = await Promise.all([
        axios.get(`${API}/orders`, { withCredentials: true }),
        axios.get(`${API}/clients`, { withCredentials: true }),
        axios.get(`${API}/products`, { withCredentials: true }),
        axios.get(`${API}/warehouses`, { withCredentials: true })
      ]);
      setOrders(ordRes.data);
      setClients(cliRes.data);
      setProducts(prodRes.data);
      setWarehouses(whRes.data);
    } catch (error) {
      toast.error("Error al cargar pedidos");
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
        price: parseFloat(newItem.price) || product.price
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
      await axios.post(`${API}/orders`, formData, { withCredentials: true });
      toast.success("Pedido creado");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error("Error al crear pedido");
    }
  };

  const handleUpdateStatus = async (orderId, status) => {
    try {
      await axios.put(`${API}/orders/${orderId}`, { status }, { withCredentials: true });
      toast.success("Estado actualizado");
      fetchData();
    } catch (error) {
      toast.error("Error al actualizar estado");
    }
  };

  const handleDelete = async (orderId) => {
    if (window.confirm("¿Estás seguro de eliminar este pedido?")) {
      try {
        await axios.delete(`${API}/orders/${orderId}`, { withCredentials: true });
        toast.success("Pedido eliminado");
        fetchData();
      } catch (error) {
        toast.error("Error al eliminar pedido");
      }
    }
  };

  const resetForm = () => {
    setFormData({ client_id: "", warehouse_id: "", items: [] });
    setNewItem({ product_id: "", quantity: 1, price: 0 });
  };

  const filteredOrders = orders.filter(order =>
    order.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    order.client_name?.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
  };

  const statusOptions = [
    { value: "pending", label: "Pendiente" },
    { value: "confirmed", label: "Confirmado" },
    { value: "shipped", label: "Enviado" },
    { value: "delivered", label: "Entregado" },
    { value: "cancelled", label: "Cancelado" }
  ];

  return (
    <Layout title="Pedidos / Albaranes">
      <div className="space-y-6" data-testid="orders-page">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pedidos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="search-orders"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-order-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Pedido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo Pedido</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cliente *</Label>
                    <Select value={formData.client_id} onValueChange={(value) => setFormData({ ...formData, client_id: value })}>
                      <SelectTrigger data-testid="order-client-select">
                        <SelectValue placeholder="Seleccionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((cli) => (
                          <SelectItem key={cli.client_id} value={cli.client_id}>{cli.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Almacén</Label>
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
                      setNewItem({ ...newItem, product_id: value, price: product?.price || 0 });
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
                  <Button type="submit" data-testid="save-order-btn">Crear Pedido</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* View Order Dialog */}
        <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Pedido {viewOrder?.order_number}</DialogTitle>
            </DialogHeader>
            {viewOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-medium">{viewOrder.client_name}</p>
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
                      <th>Nº Pedido</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th className="text-right">Total</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.order_id}>
                        <td className="font-mono text-sm">{order.order_number}</td>
                        <td className="font-medium">{order.client_name}</td>
                        <td className="text-muted-foreground text-sm">
                          {new Date(order.created_at).toLocaleDateString('es-ES')}
                        </td>
                        <td className="text-right font-mono">{formatCurrency(order.total)}</td>
                        <td>
                          <Select value={order.status} onValueChange={(value) => handleUpdateStatus(order.order_id, value)}>
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
                          <Button variant="ghost" size="icon" onClick={() => setViewOrder(order)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(order.order_id)}>
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
                <p>No hay pedidos registrados</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Orders;
