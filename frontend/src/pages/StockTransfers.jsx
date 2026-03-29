import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowRightLeft, Plus, Search } from "lucide-react";
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

const emptyForm = {
  source_warehouse_id: "",
  target_warehouse_id: "",
  notes: "",
  items: [],
};

const StockTransfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [newItem, setNewItem] = useState({ product_id: "", quantity: 1 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [transferResponse, productResponse, warehouseResponse] = await Promise.all([
        axios.get(`${API}/stock-transfers`, { withCredentials: true }),
        axios.get(`${API}/products`, { withCredentials: true }),
        axios.get(`${API}/warehouses`, { withCredentials: true }),
      ]);
      setTransfers(transferResponse.data);
      setProducts(productResponse.data);
      setWarehouses(warehouseResponse.data);
    } catch (error) {
      toast.error("Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  };

  const filteredTransfers = useMemo(
    () =>
      transfers.filter((item) => {
        const haystack = [item.transfer_number, item.source_warehouse_id, item.target_warehouse_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [search, transfers]
  );

  const handleAddItem = () => {
    if (!newItem.product_id) return;
    const product = products.find((item) => item.product_id === newItem.product_id);
    if (!product) return;

    setFormData((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          product_id: product.product_id,
          product_name: product.name,
          quantity: parseInt(newItem.quantity, 10) || 1,
        },
      ],
    }));
    setNewItem({ product_id: "", quantity: 1 });
  };

  const handleRemoveItem = (index) => {
    setFormData((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setNewItem({ product_id: "", quantity: 1 });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.source_warehouse_id || !formData.target_warehouse_id) {
      toast.error("Selecciona origen y destino");
      return;
    }
    if (formData.items.length === 0) {
      toast.error("Debes anadir al menos un producto");
      return;
    }

    try {
      await axios.post(
        `${API}/stock-transfers`,
        {
          source_warehouse_id: formData.source_warehouse_id,
          target_warehouse_id: formData.target_warehouse_id,
          notes: formData.notes,
          items: formData.items.map((item) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity),
          })),
        },
        { withCredentials: true }
      );
      toast.success("Transferencia creada");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear transferencia");
    }
  };

  return (
    <Layout title="Transferencias de stock">
      <div className="space-y-6" data-testid="stock-transfers-page">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar transferencias..."
              className="pl-10"
            />
          </div>

          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nueva transferencia
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear transferencia</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Almacen origen</Label>
                    <Select
                      value={formData.source_warehouse_id}
                      onValueChange={(value) => setFormData((current) => ({ ...current, source_warehouse_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar almacen" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.warehouse_id} value={warehouse.warehouse_id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Almacen destino</Label>
                    <Select
                      value={formData.target_warehouse_id}
                      onValueChange={(value) => setFormData((current) => ({ ...current, target_warehouse_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar almacen" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.warehouse_id} value={warehouse.warehouse_id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Notas</Label>
                  <Input
                    value={formData.notes}
                    onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Observaciones de la transferencia"
                  />
                </div>

                <div className="rounded-lg border p-4">
                  <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="md:col-span-2">
                      <Select
                        value={newItem.product_id}
                        onValueChange={(value) => setNewItem((current) => ({ ...current, product_id: value }))}
                      >
                        <SelectTrigger>
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
                    </div>
                    <Input
                      type="number"
                      min="1"
                      value={newItem.quantity}
                      onChange={(event) => setNewItem((current) => ({ ...current, quantity: event.target.value }))}
                      placeholder="Cantidad"
                    />
                    <Button type="button" onClick={handleAddItem}>
                      Anadir
                    </Button>
                  </div>

                  {formData.items.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">Producto</th>
                          <th className="py-2 text-right">Cantidad</th>
                          <th className="py-2 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.items.map((item, index) => (
                          <tr key={`${item.product_id}-${index}`} className="border-b">
                            <td className="py-2">{item.product_name}</td>
                            <td className="py-2 text-right">{item.quantity}</td>
                            <td className="py-2 text-right">
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(index)}>
                                Quitar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Guardar transferencia</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredTransfers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Numero</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Lineas</th>
                      <th>Fecha</th>
                      <th className="text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransfers.map((item) => (
                      <tr key={item.transfer_id}>
                        <td className="font-mono text-sm">{item.transfer_number}</td>
                        <td>{item.source_warehouse_id}</td>
                        <td>{item.target_warehouse_id}</td>
                        <td>{item.items_count}</td>
                        <td>{new Date(item.created_at).toLocaleDateString("es-ES")}</td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <ArrowRightLeft className="h-4 w-4" />
                            {item.notes || "Sin notas"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">No hay transferencias registradas</div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default StockTransfers;
