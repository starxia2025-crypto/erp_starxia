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
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Warehouses = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({ name: "", address: "" });

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      const response = await axios.get(`${API}/warehouses`, { withCredentials: true });
      setWarehouses(response.data);
    } catch (error) {
      toast.error("Error al cargar almacenes");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingWarehouse) {
        await axios.put(`${API}/warehouses/${editingWarehouse.warehouse_id}`, formData, { withCredentials: true });
        toast.success("Almacén actualizado");
      } else {
        await axios.post(`${API}/warehouses`, formData, { withCredentials: true });
        toast.success("Almacén creado");
      }
      setDialogOpen(false);
      resetForm();
      fetchWarehouses();
    } catch (error) {
      toast.error("Error al guardar almacén");
    }
  };

  const handleEdit = (warehouse) => {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name || "",
      address: warehouse.address || ""
    });
    setDialogOpen(true);
  };

  const handleDelete = async (warehouseId) => {
    if (window.confirm("¿Estás seguro de eliminar este almacén?")) {
      try {
        await axios.delete(`${API}/warehouses/${warehouseId}`, { withCredentials: true });
        toast.success("Almacén eliminado");
        fetchWarehouses();
      } catch (error) {
        toast.error("Error al eliminar almacén");
      }
    }
  };

  const resetForm = () => {
    setEditingWarehouse(null);
    setFormData({ name: "", address: "" });
  };

  return (
    <Layout title="Gestión de Almacenes">
      <div className="space-y-6" data-testid="warehouses-page">
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-warehouse-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Almacén
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingWarehouse ? "Editar Almacén" : "Nuevo Almacén"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    data-testid="warehouse-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" data-testid="save-warehouse-btn">Guardar</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : warehouses.length > 0 ? (
            warehouses.map((warehouse) => (
              <Card key={warehouse.warehouse_id} className="card-hover">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <WarehouseIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{warehouse.name}</h3>
                        <p className="text-sm text-muted-foreground">{warehouse.address || "Sin dirección"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(warehouse)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(warehouse.warehouse_id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <p>No hay almacenes registrados</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Warehouses;
