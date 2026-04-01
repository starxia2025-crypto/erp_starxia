import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { API_BASE, getApiErrorMessage } from "@/lib/api";

const API = API_BASE;

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [clientTypes, setClientTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    tax_id: "",
    type_id: ""
  });

  useEffect(() => {
    fetchClients();
    fetchClientTypes();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  const fetchClientTypes = async () => {
    try {
      const response = await axios.get(`${API}/client-types`, { withCredentials: true });
      setClientTypes(response.data);
    } catch (error) {
      console.error("Error fetching client types:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await axios.put(`${API}/clients/${editingClient.client_id}`, formData, { withCredentials: true });
        toast.success("Cliente actualizado");
      } else {
        await axios.post(`${API}/clients`, formData, { withCredentials: true });
        toast.success("Cliente creado");
      }
      setDialogOpen(false);
      resetForm();
      fetchClients();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar cliente"));
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      tax_id: client.tax_id || "",
      type_id: client.type_id || ""
    });
    setDialogOpen(true);
  };

  const handleDelete = async (clientId) => {
    if (window.confirm("¿Estás seguro de eliminar este cliente?")) {
      try {
        await axios.delete(`${API}/clients/${clientId}`, { withCredentials: true });
        toast.success("Cliente eliminado");
        fetchClients();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Error al eliminar cliente"));
      }
    }
  };

  const resetForm = () => {
    setEditingClient(null);
    setFormData({ name: "", email: "", phone: "", address: "", tax_id: "", type_id: "" });
  };

  const filteredClients = clients.filter(client =>
    client.name?.toLowerCase().includes(search.toLowerCase()) ||
    client.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getTypeName = (typeId) => {
    const type = clientTypes.find(t => t.type_id === typeId);
    return type?.name || "-";
  };

  return (
    <Layout title="Gestión de Clientes">
      <div className="space-y-6" data-testid="clients-page">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="search-clients"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-client-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingClient ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    data-testid="client-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="client-email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    data-testid="client-phone-input"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="client-address-input"
                  />
                </div>
                <div>
                  <Label htmlFor="tax_id">NIF/CIF</Label>
                  <Input
                    id="tax_id"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    data-testid="client-tax-input"
                  />
                </div>
                <div>
                  <Label htmlFor="type_id">Tipo de Cliente</Label>
                  <Select value={formData.type_id} onValueChange={(value) => setFormData({ ...formData, type_id: value })}>
                    <SelectTrigger data-testid="client-type-select">
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientTypes.map((type) => (
                        <SelectItem key={type.type_id} value={type.type_id}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" data-testid="save-client-btn">Guardar</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filteredClients.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th>NIF/CIF</th>
                      <th>Tipo</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr key={client.client_id} data-testid={`client-row-${client.client_id}`}>
                        <td className="font-medium">{client.name}</td>
                        <td className="text-muted-foreground">{client.email || "-"}</td>
                        <td className="font-mono text-sm">{client.phone || "-"}</td>
                        <td className="font-mono text-sm">{client.tax_id || "-"}</td>
                        <td>{getTypeName(client.type_id)}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(client)} data-testid={`edit-client-${client.client_id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(client.client_id)} data-testid={`delete-client-${client.client_id}`}>
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
                <p>No hay clientes registrados</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Clients;
