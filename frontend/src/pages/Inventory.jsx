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
import { Plus, Search, Edit, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { API_BASE } from "@/lib/api";

const API = API_BASE;

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingInventory, setEditingInventory] = useState(null);
  const [formData, setFormData] = useState({
    product_id: "",
    warehouse_id: "",
    quantity: "",
    min_stock: ""
  });

  useEffect(() => {
    fetchData();
  }, [selectedWarehouse]);

  const fetchData = async () => {
    try {
      const [invRes, prodRes, whRes] = await Promise.all([
        axios.get(
          `${API}/inventory${selectedWarehouse !== "all" ? `?warehouse_id=${selectedWarehouse}` : ""}`,
          { withCredentials: true }
        ),
        axios.get(`${API}/products`, { withCredentials: true }),
        axios.get(`${API}/warehouses`, { withCredentials: true })
      ]);
      setInventory(invRes.data);
      setProducts(prodRes.data);
      setWarehouses(whRes.data);
    } catch (error) {
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        quantity: parseInt(formData.quantity) || 0,
        min_stock: parseInt(formData.min_stock) || 0
      };
      
      if (editingInventory) {
        await axios.put(`${API}/inventory/${editingInventory.inventory_id}`, data, { withCredentials: true });
        toast.success("Stock actualizado");
      } else {
        await axios.post(`${API}/inventory`, data, { withCredentials: true });
        toast.success("Stock añadido");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error("Error al guardar stock");
    }
  };

  const handleEdit = (inv) => {
    setEditingInventory(inv);
    setFormData({
      product_id: inv.product_id || "",
      warehouse_id: inv.warehouse_id || "",
      quantity: inv.quantity?.toString() || "",
      min_stock: inv.min_stock?.toString() || ""
    });
    setDialogOpen(true);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    if (selectedWarehouse !== "all") {
      formData.append("warehouse_id", selectedWarehouse);
    }

    try {
      const response = await axios.post(`${API}/inventory/import-csv`, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success(response.data.message);
      setImportDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Error al importar CSV");
    }
  };

  const resetForm = () => {
    setEditingInventory(null);
    setFormData({ product_id: "", warehouse_id: "", quantity: "", min_stock: "" });
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.product_id === productId);
    return product?.name || "-";
  };

  const getProductSKU = (productId) => {
    const product = products.find(p => p.product_id === productId);
    return product?.sku || "-";
  };

  const getWarehouseName = (warehouseId) => {
    const warehouse = warehouses.find(w => w.warehouse_id === warehouseId);
    return warehouse?.name || "-";
  };

  const filteredInventory = inventory.filter(inv => {
    const productName = getProductName(inv.product_id).toLowerCase();
    const productSKU = getProductSKU(inv.product_id).toLowerCase();
    return productName.includes(search.toLowerCase()) || productSKU.includes(search.toLowerCase());
  });

  return (
    <Layout title="Inventario por Almacén">
      <div className="space-y-6" data-testid="inventory-page">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex flex-col sm:flex-row gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar productos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="search-inventory"
              />
            </div>
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="warehouse-filter">
                <SelectValue placeholder="Todos los almacenes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los almacenes</SelectItem>
                {warehouses.map((wh) => (
                  <SelectItem key={wh.warehouse_id} value={wh.warehouse_id}>{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="import-inventory-btn">
                  <Upload className="w-4 h-4 mr-2" />
                  Importar CSV
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Importar Inventario desde CSV</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    El archivo CSV debe tener las columnas: sku, name, quantity, min_stock, price, cost
                  </p>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={handleImportCSV}
                    data-testid="inventory-csv-input"
                  />
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="add-inventory-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Añadir Stock
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingInventory ? "Editar Stock" : "Añadir Stock"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="product_id">Producto *</Label>
                    <Select 
                      value={formData.product_id} 
                      onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                      disabled={!!editingInventory}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((prod) => (
                          <SelectItem key={prod.product_id} value={prod.product_id}>
                            {prod.sku} - {prod.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="warehouse_id">Almacén *</Label>
                    <Select 
                      value={formData.warehouse_id} 
                      onValueChange={(value) => setFormData({ ...formData, warehouse_id: value })}
                      disabled={!!editingInventory}
                    >
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quantity">Cantidad</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        data-testid="inventory-quantity-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_stock">Stock Mínimo</Label>
                      <Input
                        id="min_stock"
                        type="number"
                        value={formData.min_stock}
                        onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" data-testid="save-inventory-btn">Guardar</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredInventory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Almacén</th>
                      <th className="text-right">Cantidad</th>
                      <th className="text-right">Stock Mín.</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((inv) => {
                      const isLowStock = inv.quantity <= inv.min_stock;
                      return (
                        <tr key={inv.inventory_id}>
                          <td className="font-mono text-sm">{getProductSKU(inv.product_id)}</td>
                          <td className="font-medium">{getProductName(inv.product_id)}</td>
                          <td>{getWarehouseName(inv.warehouse_id)}</td>
                          <td className="text-right font-mono">{inv.quantity}</td>
                          <td className="text-right font-mono">{inv.min_stock}</td>
                          <td>
                            {isLowStock ? (
                              <span className="inline-flex items-center gap-1 text-yellow-500">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-xs">Stock bajo</span>
                              </span>
                            ) : (
                              <span className="text-emerald-500 text-xs">OK</span>
                            )}
                          </td>
                          <td className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(inv)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No hay inventario registrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Inventory;
