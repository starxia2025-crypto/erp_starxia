import { useEffect, useState } from "react";
import axios from "axios";
import { Edit, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import Layout from "@/components/layout/Layout";
import { API_BASE, getApiErrorMessage } from "@/lib/api";
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

const Products = () => {
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    price: "",
    cost: "",
    type_id: "",
  });

  useEffect(() => {
    fetchProducts();
    fetchProductTypes();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API}/products`, { withCredentials: true });
      setProducts(response.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar productos"));
    } finally {
      setLoading(false);
    }
  };

  const fetchProductTypes = async () => {
    try {
      const response = await axios.get(`${API}/product-types`, { withCredentials: true });
      setProductTypes(response.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar tipos de producto"));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...formData,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0,
      };

      if (editingProduct) {
        await axios.put(`${API}/products/${editingProduct.product_id}`, payload, { withCredentials: true });
        toast.success("Producto actualizado");
      } else {
        await axios.post(`${API}/products`, payload, { withCredentials: true });
        toast.success("Producto creado");
      }

      setDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al guardar producto");
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku || "",
      name: product.name || "",
      description: product.description || "",
      price: product.price?.toString() || "",
      cost: product.cost?.toString() || "",
      type_id: product.type_id || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Estas seguro de eliminar este producto?")) return;
    try {
      await axios.delete(`${API}/products/${productId}`, { withCredentials: true });
      toast.success("Producto eliminado");
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al eliminar producto");
    }
  };

  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const payload = new FormData();
    payload.append("file", file);

    try {
      const response = await axios.post(`${API}/products/import-csv`, payload, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(response.data.message);
      setImportDialogOpen(false);
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al importar CSV");
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      sku: "",
      name: "",
      description: "",
      price: "",
      cost: "",
      type_id: "",
    });
  };

  const getTypeName = (typeId) => {
    const type = productTypes.find((item) => item.type_id === typeId);
    return type?.name || "-";
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value || 0);

  const formatStockBreakdown = (product) => {
    if (!product.stock_by_warehouse?.length) return "Sin stock cargado";
    return product.stock_by_warehouse.map((line) => `${line.warehouse_name}: ${line.quantity}`).join(" | ");
  };

  const filteredProducts = products.filter((product) => {
    const value = search.toLowerCase();
    return product.name?.toLowerCase().includes(value) || product.sku?.toLowerCase().includes(value);
  });

  return (
    <Layout title="Gestion de productos">
      <div className="space-y-6" data-testid="products-page">
        <div className="flex flex-col justify-between gap-4 sm:flex-row">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              placeholder="Buscar productos..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              data-testid="search-products"
            />
          </div>
          <div className="flex gap-2">
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="import-csv-btn">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar CSV
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Importar productos desde CSV</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    El archivo CSV debe tener las columnas: sku, name, description, price, cost
                  </p>
                  <Input type="file" accept=".csv" onChange={handleImportCSV} data-testid="csv-file-input" />
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="add-product-btn">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo producto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Editar producto" : "Nuevo producto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="product-sku">SKU</Label>
                    <Input
                      id="product-sku"
                      value={formData.sku}
                      onChange={(event) => setFormData({ ...formData, sku: event.target.value })}
                      required
                      data-testid="product-sku-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product-name">Nombre</Label>
                    <Input
                      id="product-name"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                      required
                      data-testid="product-name-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="product-description">Descripcion</Label>
                    <Input
                      id="product-description"
                      value={formData.description}
                      onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="product-cost">Coste</Label>
                      <Input
                        id="product-cost"
                        type="number"
                        step="0.01"
                        value={formData.cost}
                        onChange={(event) => setFormData({ ...formData, cost: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-price">Precio venta</Label>
                      <Input
                        id="product-price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(event) => setFormData({ ...formData, price: event.target.value })}
                        data-testid="product-price-input"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="product-type">Tipo de producto</Label>
                    <Select value={formData.type_id} onValueChange={(value) => setFormData({ ...formData, type_id: value })}>
                      <SelectTrigger id="product-type">
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {productTypes.map((type) => (
                          <SelectItem key={type.type_id} value={type.type_id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" data-testid="save-product-btn">Guardar</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th className="text-right">Coste</th>
                      <th className="text-right">Precio</th>
                      <th className="text-right">Stock total</th>
                      <th>Existencias por almacen</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.product_id}>
                        <td className="font-mono text-sm">{product.sku}</td>
                        <td className="font-medium">{product.name}</td>
                        <td>{getTypeName(product.type_id)}</td>
                        <td className="text-right font-mono">{formatCurrency(product.cost)}</td>
                        <td className="text-right font-mono">{formatCurrency(product.price)}</td>
                        <td className="text-right font-mono">{product.stock_total || 0}</td>
                        <td className="max-w-[360px] text-sm text-muted-foreground">{formatStockBreakdown(product)}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(product.product_id)}>
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
                <p>No hay productos registrados</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Products;
