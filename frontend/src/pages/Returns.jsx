import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Eye, Plus, Search } from "lucide-react";
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
  return_type: "sales",
  source_document_id: "",
  warehouse_id: "",
  reason: "",
  items: [],
};

const getSourceId = (item, type) => (type === "sales" ? item.invoice_id : item.pinv_id);

const Returns = () => {
  const [returnsList, setReturnsList] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewReturn, setViewReturn] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [returnsResponse, invoiceResponse, purchaseInvoiceResponse, warehouseResponse] = await Promise.all([
        axios.get(`${API}/returns`, { withCredentials: true }),
        axios.get(`${API}/invoices`, { withCredentials: true }),
        axios.get(`${API}/purchase-invoices`, { withCredentials: true }),
        axios.get(`${API}/warehouses`, { withCredentials: true }),
      ]);
      setReturnsList(returnsResponse.data);
      setSalesInvoices(invoiceResponse.data);
      setPurchaseInvoices(purchaseInvoiceResponse.data);
      setWarehouses(warehouseResponse.data);
    } catch (error) {
      toast.error("Error al cargar devoluciones");
    } finally {
      setLoading(false);
    }
  };

  const sourceDocuments = useMemo(
    () => (formData.return_type === "sales" ? salesInvoices : purchaseInvoices),
    [formData.return_type, purchaseInvoices, salesInvoices]
  );

  const selectedSource = useMemo(
    () => sourceDocuments.find((item) => getSourceId(item, formData.return_type) === formData.source_document_id) || null,
    [formData.return_type, formData.source_document_id, sourceDocuments]
  );

  const filteredReturns = useMemo(
    () =>
      returnsList.filter((item) => {
        const haystack = [
          item.return_number,
          item.source_document_number,
          item.partner_name,
          item.return_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [returnsList, search]
  );

  const handleSourceChange = (sourceId) => {
    const source = sourceDocuments.find((item) => getSourceId(item, formData.return_type) === sourceId);
    setFormData((current) => ({
      ...current,
      source_document_id: sourceId,
      items: (source?.items || []).map((line) => ({
        product_id: line.product_id,
        product_name: line.product_name,
        quantity: 0,
        max_quantity: line.quantity,
        price: line.price,
      })),
    }));
  };

  const updateLineQuantity = (index, quantity) => {
    setFormData((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, quantity: Math.max(0, Math.min(item.max_quantity, parseInt(quantity || 0, 10) || 0)) }
          : item
      ),
    }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const items = formData.items
      .filter((item) => Number(item.quantity) > 0)
      .map((item) => ({ product_id: item.product_id, quantity: Number(item.quantity) }));

    if (!formData.source_document_id) {
      toast.error("Debes seleccionar un documento origen");
      return;
    }
    if (items.length === 0) {
      toast.error("Debes indicar al menos una linea con cantidad");
      return;
    }

    try {
      await axios.post(
        `${API}/returns`,
        {
          return_type: formData.return_type,
          source_document_id: formData.source_document_id,
          warehouse_id: formData.warehouse_id || undefined,
          reason: formData.reason,
          items,
        },
        { withCredentials: true }
      );
      toast.success("Devolucion registrada");
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al crear devolucion");
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value || 0);

  return (
    <Layout title="Devoluciones">
      <div className="space-y-6" data-testid="returns-page">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar devoluciones..."
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
                Nueva devolucion
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Registrar devolucion</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Tipo de devolucion</Label>
                    <Select
                      value={formData.return_type}
                      onValueChange={(value) => setFormData({ ...emptyForm, return_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Venta</SelectItem>
                        <SelectItem value="purchase">Compra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Documento origen</Label>
                    <Select value={formData.source_document_id} onValueChange={handleSourceChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar documento" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceDocuments.map((item) => (
                          <SelectItem key={getSourceId(item, formData.return_type)} value={getSourceId(item, formData.return_type)}>
                            {item.invoice_number} - {item.client_name || item.supplier_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Almacen destino/origen</Label>
                    <Select
                      value={formData.warehouse_id}
                      onValueChange={(value) => setFormData((current) => ({ ...current, warehouse_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Usar almacen del documento" />
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
                    <Label>Motivo</Label>
                    <Input
                      value={formData.reason}
                      onChange={(event) => setFormData((current) => ({ ...current, reason: event.target.value }))}
                      placeholder="Motivo de la devolucion"
                    />
                  </div>
                </div>

                {selectedSource && (
                  <div className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{selectedSource.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedSource.client_name || selectedSource.supplier_name}
                        </p>
                      </div>
                      <p className="font-mono text-sm">{formatCurrency(selectedSource.total)}</p>
                    </div>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">Producto</th>
                          <th className="py-2 text-right">Maximo</th>
                          <th className="py-2 text-right">Cantidad a devolver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.items.map((item, index) => (
                          <tr key={item.product_id} className="border-b">
                            <td className="py-2">{item.product_name}</td>
                            <td className="py-2 text-right">{item.max_quantity}</td>
                            <td className="py-2 text-right">
                              <Input
                                type="number"
                                min="0"
                                max={item.max_quantity}
                                value={item.quantity}
                                onChange={(event) => updateLineQuantity(index, event.target.value)}
                                className="ml-auto w-28 text-right"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Guardar devolucion</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={!!viewReturn} onOpenChange={() => setViewReturn(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{viewReturn?.return_number}</DialogTitle>
            </DialogHeader>
            {viewReturn && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Info label="Tipo" value={viewReturn.return_type === "sales" ? "Venta" : "Compra"} />
                  <Info label="Documento origen" value={viewReturn.source_document_number} />
                  <Info label="Empresa vinculada" value={viewReturn.partner_name} />
                  <Info label="Total" value={formatCurrency(viewReturn.total)} />
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">Producto</th>
                      <th className="py-2 text-right">Cantidad</th>
                      <th className="py-2 text-right">Precio</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewReturn.items || []).map((item, index) => (
                      <tr key={`${item.product_id}-${index}`} className="border-b">
                        <td className="py-2">{item.product_name}</td>
                        <td className="py-2 text-right">{item.quantity}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(item.price)}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
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
            ) : filteredReturns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Numero</th>
                      <th>Tipo</th>
                      <th>Documento</th>
                      <th>Empresa</th>
                      <th>Fecha</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReturns.map((item) => (
                      <tr key={item.return_id}>
                        <td className="font-mono text-sm">{item.return_number}</td>
                        <td>{item.return_type === "sales" ? "Venta" : "Compra"}</td>
                        <td className="font-mono text-sm">{item.source_document_number}</td>
                        <td>{item.partner_name}</td>
                        <td>{new Date(item.created_at).toLocaleDateString("es-ES")}</td>
                        <td className="text-right font-mono">{formatCurrency(item.total)}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setViewReturn(item)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">No hay devoluciones registradas</div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

const Info = ({ label, value }) => (
  <div>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="font-medium">{value || "-"}</p>
  </div>
);

export default Returns;
