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
import { Plus, Search, Edit, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
    type_id: ""
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
      toast.error("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  const fetchProductTypes = async () => {
    try {
      const response = await axios.get(`${API}/product-types`, { withCredentials: true });
      setProductTypes(response.data);
    } catch (error) {
      console.error("Error fetching product types:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0
      };
      
      if (editingProduct) {
        await axios.put(`${API}/products/${editingProduct.product_id}`, data, { withCredentials: true });
        toast.success("Producto actualizado");
      } else {
        await axios.post(`${API}/products`, data, { withCredentials: true });
        toast.success("Producto creado");
      }
      setDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error) {
      toast.error("Error al guardar producto");
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
      type_id: product.type_id || ""
    });
    setDialogOpen(true);
  };

  const handleDelete = async (productId) => {
    if (window.confirm("¿Estás seguro de eliminar este producto?")) {
      try {
        await axios.delete(`${API}/products/${productId}`, { withCredentials: true });
        toast.success("Producto eliminado");
        fetchProducts();
      } catch (error) {
        toast.error("Error al eliminar producto");
      }
    }
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API}/products/import-csv`, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success(response.data.message);
      setImportDialogOpen(false);
      fetchProducts();
    } catch (error) {
      toast.error("Error al importar CSV");
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({ sku: "", name: "", description: "", price: "", cost: "", type_id: "" });
  };

  const filteredProducts = products.filter(product =>
    product.name?.toLowerCase().includes(search.toLowerCase()) ||
    product.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const getTypeName = (typeId) => {
    const type = productTypes.find(t => t.type_id === typeId);
    return type?.name || "-";
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
  };

  return (
    <Layout title="Gestión de Productos">
      <div className="space-y-6" data-testid="products-page">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar productos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="search-products"
            />
          </div>
          <div className="flex gap-2">
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="import-csv-btn">
                  <Upload className="w-4 h-4 mr-2" />
                  Importar CSV
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Importar Productos desde CSV</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    El archivo CSV debe tener las columnas: sku, name, description, price, cost
                  </p>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={handleImportCSV}
                    data-testid="csv-file-input"
                  />
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="add-product-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="sku">SKU *</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      required
                      data-testid="product-sku-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name">Nombre *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      data-testid="product-name-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Descripción</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Precio Venta</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        data-testid="product-price-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cost">Coste</Label>
                      <Input
                        id="cost"
                        type="number"
                        step="0.01"
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="type_id">Tipo de Producto</Label>
                    <Select value={formData.type_id} onValueChange={(value) => setFormData({ ...formData, type_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {productTypes.map((type) => (
                          <SelectItem key={type.type_id} value={type.type_id}>{type.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
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
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
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
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(product.product_id)}>
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
