import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Building2, FileText, Mail, Moon, Shield, Sun, User, Users } from "lucide-react";

import Layout from "@/components/layout/Layout";
import { useAuth, useTheme } from "@/App";
import { API_BASE } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const API = API_BASE;
const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales", label: "Ventas" },
  { value: "warehouse", label: "Almacen" },
  { value: "employee", label: "Empleado" },
  { value: "advisor", label: "Asesoria" },
];

const emptyEmployeeForm = {
  name: "",
  email: "",
  password: "",
  role: "sales",
};

const getInitials = (name) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const cropImageToSquareBlob = (imageSource, zoom = 1.2) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("No se pudo preparar el recorte"));
        return;
      }

      const baseScale = Math.max(size / image.width, size / image.height);
      const scale = baseScale * zoom;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const offsetX = (size - drawWidth) / 2;
      const offsetY = (size - drawHeight) / 2;

      context.clearRect(0, 0, size, size);
      context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("No se pudo generar la imagen"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.92
      );
    };
    image.onerror = reject;
    image.src = imageSource;
  });

const isAnimatedGifFile = (file) =>
  file && ((file.type || "").toLowerCase() === "image/gif" || file.name.toLowerCase().endsWith(".gif"));

const getUploadErrorMessage = (error, fallback) =>
  error?.response?.data?.detail ||
  error?.message ||
  fallback;

const Settings = () => {
  const { user, setUser, checkAuth } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const canEditCompany = hasPermission(user, "settings.write");
  const canViewUsers = hasPermission(user, "users.read");
  const canManageUsers = hasPermission(user, "users.write");

  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [legalDocuments, setLegalDocuments] = useState([]);
  const [legalAcceptances, setLegalAcceptances] = useState([]);
  const [processingActivities, setProcessingActivities] = useState([]);
  const [savingLegalDocument, setSavingLegalDocument] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [uploadingCompanyLogo, setUploadingCompanyLogo] = useState(false);
  const [uploadingProfilePicture, setUploadingProfilePicture] = useState(false);
  const [profileCropOpen, setProfileCropOpen] = useState(false);
  const [profileCropSource, setProfileCropSource] = useState("");
  const [profileCropZoom, setProfileCropZoom] = useState([1.2]);
  const [formData, setFormData] = useState({
    name: "",
    legal_name: "",
    tax_id: "",
    address: "",
    country: "ES",
    phone: "",
    email: "",
    billing_email: "",
    logo_url: "",
    verifactu_enabled: true,
    aeat_submission_enabled: false,
  });
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [activityForm, setActivityForm] = useState({
    code: "",
    title: "",
    purpose: "",
    legal_basis: "",
    retention_period: "",
    security_measures: "",
  });
  const [legalEditor, setLegalEditor] = useState({
    code: "terms",
    version: "",
    title: "",
    content: "",
    requires_acceptance: true,
  });
  const companyLogoInputRef = useRef(null);
  const profilePictureInputRef = useRef(null);

  const roleLabelByValue = useMemo(
    () => Object.fromEntries(ROLE_OPTIONS.map((item) => [item.value, item.label])),
    []
  );

  const loadSettings = useCallback(async () => {
    try {
      const requests = [
        axios.get(`${API}/companies`, { withCredentials: true }),
        axios.get(`${API}/legal-documents`, { withCredentials: true }),
        axios.get(`${API}/legal-acceptances`, { withCredentials: true }),
        axios.get(`${API}/processing-activities`, { withCredentials: true }),
      ];
      if (canViewUsers) {
        requests.push(axios.get(`${API}/users`, { withCredentials: true }));
      }

      const [
        companyResponse,
        legalDocsResponse,
        legalAcceptancesResponse,
        processingActivitiesResponse,
        usersResponse,
      ] = await Promise.all(requests);

      if (companyResponse.data.length > 0) {
        const currentCompany = companyResponse.data[0];
        setCompany(currentCompany);
        setFormData({
          name: currentCompany.name || "",
          legal_name: currentCompany.legal_name || "",
          tax_id: currentCompany.tax_id || "",
          address: currentCompany.address || "",
          country: currentCompany.country || "ES",
          phone: currentCompany.phone || "",
          email: currentCompany.email || "",
          billing_email: currentCompany.billing_email || "",
          logo_url: currentCompany.logo_url || "",
          verifactu_enabled: Boolean(currentCompany.verifactu_enabled),
          aeat_submission_enabled: Boolean(currentCompany.aeat_submission_enabled),
        });
      }

      setLegalDocuments(legalDocsResponse.data);
      setLegalAcceptances(legalAcceptancesResponse.data);
      setProcessingActivities(processingActivitiesResponse.data);

      if (usersResponse) {
        setEmployees(usersResponse.data);
      }
    } catch (error) {
      toast.error("No se pudieron cargar los ajustes");
    } finally {
      setLoading(false);
    }
  }, [canViewUsers]);

  const pendingDocuments = useMemo(
    () => company?.pending_legal_documents || [],
    [company]
  );

  const selectedLegalDocument = useMemo(
    () => legalDocuments.find((document) => document.code === legalEditor.code) || null,
    [legalDocuments, legalEditor.code]
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!selectedLegalDocument) return;
    setLegalEditor({
      code: selectedLegalDocument.code,
      version: selectedLegalDocument.version,
      title: selectedLegalDocument.title,
      content: selectedLegalDocument.content,
      requires_acceptance: Boolean(selectedLegalDocument.requires_acceptance),
    });
  }, [selectedLegalDocument]);

  const handleCompanySubmit = async (event) => {
    event.preventDefault();
    if (!company || !canEditCompany) return;

    setSavingCompany(true);
    try {
      await axios.put(`${API}/companies/${company.company_id}`, formData, { withCredentials: true });
      toast.success("Datos de empresa actualizados");
      await loadSettings();
      await checkAuth();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error al actualizar la empresa");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleEmployeeSubmit = async (event) => {
    event.preventDefault();
    if (!canManageUsers) return;

    setSavingEmployee(true);
    try {
      const response = await axios.post(`${API}/users`, employeeForm, { withCredentials: true });
      setEmployees((current) => [...current, response.data]);
      setEmployeeForm(emptyEmployeeForm);
      toast.success("Empleado creado");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo crear el empleado");
    } finally {
      setSavingEmployee(false);
    }
  };

  const handleCompanyLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !company || !canEditCompany) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5 MB");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    setUploadingCompanyLogo(true);
    try {
      const response = await axios.post(`${API}/companies/${company.company_id}/logo`, form, {
        withCredentials: true,
      });
      setCompany(response.data);
      setFormData((current) => ({ ...current, logo_url: response.data.logo_url || "" }));
      setUser((current) =>
        current
          ? { ...current, company_logo_url: response.data.logo_url || current.company_logo_url }
          : current
      );
      await checkAuth();
      toast.success("Logo de empresa actualizado");
    } catch (error) {
      toast.error(getUploadErrorMessage(error, "No se pudo subir el logo"));
    } finally {
      setUploadingCompanyLogo(false);
    }
  };

  const handleProfilePictureUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no puede superar 5 MB");
      return;
    }

    if (isAnimatedGifFile(file)) {
      const form = new FormData();
      form.append("file", file);
      setUploadingProfilePicture(true);
      try {
        const response = await axios.post(`${API}/users/me/picture`, form, {
          withCredentials: true,
        });
        setUser((current) => (current ? { ...current, ...response.data } : response.data));
        await checkAuth();
        toast.success("GIF de perfil actualizado");
      } catch (error) {
        toast.error(getUploadErrorMessage(error, "No se pudo subir la foto de perfil"));
      } finally {
        setUploadingProfilePicture(false);
      }
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProfileCropSource(dataUrl);
      setProfileCropZoom([1.2]);
      setProfileCropOpen(true);
    } catch (error) {
      toast.error("No se pudo leer la imagen seleccionada");
    }
  };

  const handleConfirmProfileCrop = async () => {
    if (!profileCropSource) return;

    setUploadingProfilePicture(true);
    try {
      const blob = await cropImageToSquareBlob(profileCropSource, profileCropZoom[0]);
      const form = new FormData();
      form.append("file", new File([blob], "profile-photo.jpg", { type: "image/jpeg" }));
      const response = await axios.post(`${API}/users/me/picture`, form, {
        withCredentials: true,
      });
      setUser((current) => (current ? { ...current, ...response.data } : response.data));
      await checkAuth();
      setProfileCropOpen(false);
      setProfileCropSource("");
      toast.success("Foto de perfil actualizada");
    } catch (error) {
      toast.error(getUploadErrorMessage(error, "No se pudo subir la foto de perfil"));
    } finally {
      setUploadingProfilePicture(false);
    }
  };

  const handleRoleChange = async (employeeId, role) => {
    if (!canManageUsers) return;

    const previousEmployees = employees;
    setUpdatingUserId(employeeId);
    setEmployees((current) =>
      current.map((employee) => (employee.user_id === employeeId ? { ...employee, role } : employee))
    );

    try {
      const response = await axios.put(
        `${API}/users/${employeeId}`,
        { role },
        { withCredentials: true }
      );
      setEmployees((current) =>
        current.map((employee) => (employee.user_id === employeeId ? response.data : employee))
      );
      toast.success("Rol actualizado");
    } catch (error) {
      setEmployees(previousEmployees);
      toast.error(error.response?.data?.detail || "No se pudo actualizar el rol");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleProcessingActivitySubmit = async (event) => {
    event.preventDefault();
    if (!canEditCompany) return;

    try {
      await axios.post(`${API}/processing-activities`, activityForm, { withCredentials: true });
      toast.success("Actividad de tratamiento guardada");
      setActivityForm({
        code: "",
        title: "",
        purpose: "",
        legal_basis: "",
        retention_period: "",
        security_measures: "",
      });
      await loadSettings();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo guardar la actividad");
    }
  };

  const handlePrivacyAction = async (action) => {
    try {
      const endpoint =
        action === "export"
          ? `${API}/privacy/export`
          : action === "erase"
            ? `${API}/privacy/erasure-request`
            : `${API}/privacy/deactivate-account`;
      const method = action === "export" ? "get" : "post";
      const response = await axios({ method, url: endpoint, withCredentials: true });
      if (action === "export") {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `privacy-export-${user?.user_id || "user"}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Exportacion generada");
        return;
      }
      toast.success(response.data.message || "Solicitud registrada");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo completar la solicitud");
    }
  };

  const handleLegalDocumentPublish = async (event) => {
    event.preventDefault();
    if (!canEditCompany) return;

    setSavingLegalDocument(true);
    try {
      await axios.post(`${API}/legal-documents/publish`, legalEditor, { withCredentials: true });
      toast.success("Documento legal publicado");
      await loadSettings();
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo publicar el documento");
    } finally {
      setSavingLegalDocument(false);
    }
  };

  const getRoleBadgeVariant = (role) => {
    if (role === "admin") return "default";
    if (role === "manager") return "secondary";
    return "outline";
  };

  if (loading) {
    return (
      <Layout title="Configuracion">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Configuracion">
      <div className="max-w-6xl space-y-6" data-testid="settings-page">
        <Dialog open={profileCropOpen} onOpenChange={setProfileCropOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Ajustar foto de perfil</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="relative h-64 w-64 overflow-hidden rounded-full border border-border bg-muted">
                  {profileCropSource ? (
                    <img
                      src={profileCropSource}
                      alt="Previsualizacion de perfil"
                      className="h-full w-full object-cover"
                      style={{ transform: `scale(${profileCropZoom[0]})` }}
                    />
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Zoom</Label>
                <Slider value={profileCropZoom} min={1} max={2.5} step={0.05} onValueChange={setProfileCropZoom} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setProfileCropOpen(false)} disabled={uploadingProfilePicture}>
                  Cancelar
                </Button>
                <Button onClick={handleConfirmProfileCrop} disabled={uploadingProfilePicture}>
                  {uploadingProfilePicture ? "Subiendo..." : "Guardar foto"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Mi usuario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div className="space-y-3">
                <Label className="text-muted-foreground">Foto de perfil</Label>
                <div className="flex flex-col items-start gap-4">
                  <Avatar className="h-20 w-20 border border-border">
                    <AvatarImage src={user?.picture} alt={user?.name} className="object-cover" />
                    <AvatarFallback className="bg-muted text-lg font-semibold text-muted-foreground">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <input
                    ref={profilePictureInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureUpload}
                    disabled={uploadingProfilePicture}
                    className="hidden"
                  />
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer shadow-sm transition-shadow hover:shadow-md"
                      onClick={() => profilePictureInputRef.current?.click()}
                      disabled={uploadingProfilePicture}
                    >
                      {uploadingProfilePicture ? "Subiendo..." : "Seleccionar archivo"}
                    </Button>
                    <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                      Sube una imagen JPG, PNG, WEBP, GIF o SVG de hasta 5 MB. Las imagenes fijas se pueden ajustar antes de guardarlas; los GIF se conservan animados.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Nombre</Label>
                <p className="font-medium">{user?.name}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{user?.email}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Rol</Label>
                <div className="mt-1">
                  <Badge variant={getRoleBadgeVariant(user?.role)}>{roleLabelByValue[user?.role] || user?.role}</Badge>
                </div>
              </div>
              <div className="space-y-3 md:col-span-4">
                <Label className="text-muted-foreground">Apariencia</Label>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Tema del panel</p>
                    <p className="text-sm text-muted-foreground">
                      Cambia entre modo oscuro y claro. El sistema se abre por defecto en oscuro.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
                    <Moon className={`h-4 w-4 ${theme === "dark" ? "text-primary" : "text-muted-foreground"}`} />
                    <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Cambiar entre tema oscuro y claro" />
                    <Sun className={`h-4 w-4 ${theme === "light" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Configuracion de empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCompanySubmit} className="space-y-4">
              <Tabs defaultValue="fiscal" className="space-y-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
                  <TabsTrigger value="legal">Legal</TabsTrigger>
                  <TabsTrigger value="privacy">Privacidad y datos</TabsTrigger>
                </TabsList>

                <TabsContent value="fiscal" className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Nombre comercial">
                      <Input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Razon social">
                      <Input value={formData.legal_name} onChange={(event) => setFormData({ ...formData, legal_name: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="NIF/CIF">
                      <Input value={formData.tax_id} onChange={(event) => setFormData({ ...formData, tax_id: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Pais">
                      <Input value={formData.country} onChange={(event) => setFormData({ ...formData, country: event.target.value.toUpperCase() })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Direccion" className="md:col-span-2">
                      <Input value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Email empresa">
                      <Input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Email de facturacion">
                      <Input type="email" value={formData.billing_email} onChange={(event) => setFormData({ ...formData, billing_email: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Telefono">
                      <Input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} disabled={!canEditCompany} />
                    </Field>
                    <Field label="Logo de la empresa (URL)" className="md:col-span-2">
                      <div className="space-y-3">
                        <Input
                          type="url"
                          placeholder="https://tudominio.com/logo.png"
                          value={formData.logo_url}
                          onChange={(event) => setFormData({ ...formData, logo_url: event.target.value })}
                          disabled={!canEditCompany}
                        />
                        {formData.logo_url ? (
                          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                            <img
                              src={formData.logo_url}
                              alt={formData.name || "Logo empresa"}
                              className="h-12 w-12 rounded-md border border-border object-cover"
                            />
                            <p className="text-sm text-muted-foreground">
                              Asi se mostrara el logo en el menu lateral.
                            </p>
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <input
                            ref={companyLogoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleCompanyLogoUpload}
                            disabled={!canEditCompany || uploadingCompanyLogo}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer shadow-sm transition-shadow hover:shadow-md"
                            onClick={() => companyLogoInputRef.current?.click()}
                            disabled={!canEditCompany || uploadingCompanyLogo}
                          >
                            {uploadingCompanyLogo ? "Subiendo..." : "Seleccionar archivo"}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Tambien puedes subir el logo directamente desde aqui.
                          </p>
                        </div>
                      </div>
                    </Field>
                    <div className="space-y-3 rounded-lg border border-border p-4 md:col-span-2">
                      <Label className="text-sm font-medium">Cumplimiento fiscal</Label>
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={formData.verifactu_enabled}
                          onChange={(event) => setFormData({ ...formData, verifactu_enabled: event.target.checked })}
                          disabled={!canEditCompany}
                        />
                        VERI*FACTU habilitado
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={formData.aeat_submission_enabled}
                          onChange={(event) => setFormData({ ...formData, aeat_submission_enabled: event.target.checked })}
                          disabled={!canEditCompany}
                        />
                        Remision AEAT preparada
                      </label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="legal" className="space-y-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4" />
                      Documentacion legal aceptada
                    </div>
                    {pendingDocuments.length > 0 && (
                      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950">
                        Hay documentos pendientes de reaceptacion por cambio de version.
                      </div>
                    )}
                    <div className="space-y-2 text-sm">
                      {legalDocuments.map((document) => (
                        <div key={`${document.code}-${document.version}`} className="flex items-center justify-between rounded-md border border-border p-3">
                          <div>
                            <p className="font-medium">{document.title}</p>
                            <p className="text-muted-foreground">Codigo {document.code} · Version {document.version}</p>
                          </div>
                          <Badge variant={pendingDocuments.some((item) => item.code === document.code && item.version === document.version) ? "destructive" : "secondary"}>
                            {pendingDocuments.some((item) => item.code === document.code && item.version === document.version) ? "Pendiente" : "Activa"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {canEditCompany && (
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-3 text-sm font-medium">Editor de documentos legales</div>
                      <form className="space-y-4" onSubmit={handleLegalDocumentPublish}>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <Field label="Documento">
                            <Select
                              value={legalEditor.code}
                              onValueChange={(value) =>
                                setLegalEditor((current) => ({
                                  ...current,
                                  code: value,
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="terms">Terminos</SelectItem>
                                <SelectItem value="privacy">Privacidad</SelectItem>
                                <SelectItem value="dpa">Encargado del tratamiento</SelectItem>
                                <SelectItem value="cookies">Cookies</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Version">
                            <Input
                              value={legalEditor.version}
                              onChange={(event) => setLegalEditor({ ...legalEditor, version: event.target.value })}
                            />
                          </Field>
                          <Field label="Requiere aceptacion">
                            <label className="flex h-10 items-center gap-3 rounded-md border border-input px-3 text-sm">
                              <input
                                type="checkbox"
                                checked={legalEditor.requires_acceptance}
                                onChange={(event) =>
                                  setLegalEditor({ ...legalEditor, requires_acceptance: event.target.checked })
                                }
                              />
                              Si
                            </label>
                          </Field>
                        </div>
                        <Field label="Titulo">
                          <Input
                            value={legalEditor.title}
                            onChange={(event) => setLegalEditor({ ...legalEditor, title: event.target.value })}
                          />
                        </Field>
                        <Field label="Contenido">
                          <Textarea
                            className="min-h-[280px]"
                            value={legalEditor.content}
                            onChange={(event) => setLegalEditor({ ...legalEditor, content: event.target.value })}
                          />
                        </Field>
                        <div className="flex justify-end">
                          <Button type="submit" disabled={savingLegalDocument}>
                            {savingLegalDocument ? "Publicando..." : "Publicar nueva version"}
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3 text-sm font-medium">Historial de aceptaciones</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Documento</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>IP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {legalAcceptances.map((item) => (
                          <TableRow key={item.acceptance_id}>
                            <TableCell>{item.document_code}</TableCell>
                            <TableCell>{item.document_version}</TableCell>
                            <TableCell>{new Date(item.accepted_at).toLocaleString("es-ES")}</TableCell>
                            <TableCell>{item.ip_address || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="privacy" className="space-y-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-4">
                      <p className="mb-1 font-medium text-foreground">Registro de actividades de tratamiento</p>
                      <p className="text-sm text-muted-foreground">
                        Configura finalidades, base juridica, conservacion y medidas de seguridad del tratamiento.
                      </p>
                    </div>
                    <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleProcessingActivitySubmit}>
                      <Field label="Codigo">
                        <Input value={activityForm.code} onChange={(event) => setActivityForm({ ...activityForm, code: event.target.value })} disabled={!canEditCompany} />
                      </Field>
                      <Field label="Titulo">
                        <Input value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} disabled={!canEditCompany} />
                      </Field>
                      <Field label="Finalidad" className="md:col-span-2">
                        <Input value={activityForm.purpose} onChange={(event) => setActivityForm({ ...activityForm, purpose: event.target.value })} disabled={!canEditCompany} />
                      </Field>
                      <Field label="Base juridica">
                        <Input value={activityForm.legal_basis} onChange={(event) => setActivityForm({ ...activityForm, legal_basis: event.target.value })} disabled={!canEditCompany} />
                      </Field>
                      <Field label="Conservacion">
                        <Input value={activityForm.retention_period} onChange={(event) => setActivityForm({ ...activityForm, retention_period: event.target.value })} disabled={!canEditCompany} />
                      </Field>
                      <Field label="Medidas de seguridad" className="md:col-span-2">
                        <Input value={activityForm.security_measures} onChange={(event) => setActivityForm({ ...activityForm, security_measures: event.target.value })} disabled={!canEditCompany} />
                      </Field>
                      {canEditCompany && (
                        <div className="flex justify-end md:col-span-2">
                          <Button type="submit">Guardar actividad</Button>
                        </div>
                      )}
                    </form>
                    <div className="mt-4 space-y-2">
                      {processingActivities.length > 0 ? (
                        processingActivities.map((activity) => (
                          <div key={activity.activity_id} className="rounded-md border border-border p-3 text-sm">
                            <p className="font-medium">{activity.title}</p>
                            <p className="text-muted-foreground">{activity.code}</p>
                            <p className="mt-1 text-muted-foreground">{activity.purpose || "Sin finalidad detallada"}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Todavia no hay actividades registradas.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4 text-sm">
                    <p className="mb-2 font-medium text-foreground">Derechos de los interesados</p>
                    <p className="mb-4 text-muted-foreground">
                      Genera una exportacion de datos, registra una solicitud de supresion o desactiva tu acceso con trazabilidad.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={() => handlePrivacyAction("export")}>
                        Exportar mis datos
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handlePrivacyAction("erase")}>
                        Solicitar supresion
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handlePrivacyAction("deactivate")}>
                        Desactivar cuenta
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between gap-3 pt-4">
                <p className="text-sm text-muted-foreground">
                  {canEditCompany
                    ? "Solo los perfiles con permisos de configuracion pueden modificar estos datos."
                    : "Tu rol puede ver la empresa, pero no modificarla."}
                </p>
                {canEditCompany && (
                  <Button type="submit" disabled={savingCompany} data-testid="save-company-btn">
                    {savingCompany ? "Guardando..." : "Guardar cambios"}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {canViewUsers && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Empleados y roles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {canManageUsers && (
                <form onSubmit={handleEmployeeSubmit} className="space-y-4 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Shield className="h-4 w-4" />
                    Crear empleado
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <Label htmlFor="employee-name">Nombre</Label>
                      <Input
                        id="employee-name"
                        value={employeeForm.name}
                        onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })}
                        required
                        data-testid="employee-name-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="employee-email">Email</Label>
                      <Input
                        id="employee-email"
                        type="email"
                        value={employeeForm.email}
                        onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })}
                        required
                        data-testid="employee-email-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="employee-password">Password</Label>
                      <Input
                        id="employee-password"
                        type="password"
                        value={employeeForm.password}
                        onChange={(event) => setEmployeeForm({ ...employeeForm, password: event.target.value })}
                        minLength={8}
                        required
                        data-testid="employee-password-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="employee-role">Rol</Label>
                      <Select
                        value={employeeForm.role}
                        onValueChange={(value) => setEmployeeForm({ ...employeeForm, role: value })}
                      >
                        <SelectTrigger id="employee-role" data-testid="employee-role-select">
                          <SelectValue placeholder="Selecciona un rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingEmployee} data-testid="create-employee-btn">
                      {savingEmployee ? "Creando..." : "Crear empleado"}
                    </Button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Los empleados entran con su propio email y password. El ERP y el asistente IA les mostraran solo los
                  modulos permitidos por su rol.
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="w-[220px]">Permisos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => {
                      const isCurrentUser = employee.user_id === user?.user_id;
                      return (
                        <TableRow key={employee.user_id}>
                          <TableCell>
                            <div className="font-medium">{employee.name}</div>
                            {isCurrentUser && (
                              <div className="text-xs text-muted-foreground">Tu sesion actual</div>
                            )}
                          </TableCell>
                          <TableCell>{employee.email}</TableCell>
                          <TableCell>
                            {canManageUsers && !isCurrentUser ? (
                              <Select
                                value={employee.role}
                                onValueChange={(value) => handleRoleChange(employee.user_id, value)}
                                disabled={updatingUserId === employee.user_id}
                              >
                                <SelectTrigger data-testid={`employee-role-${employee.user_id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={getRoleBadgeVariant(employee.role)}>
                                {roleLabelByValue[employee.role] || employee.role}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {(employee.permissions || []).includes("*")
                                ? "Acceso completo"
                                : `${(employee.permissions || []).length} permisos activos`}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Emails y automatizaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="py-8 text-center text-muted-foreground">
              <Mail className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="mb-2">Modulo de emails automaticos</p>
              <p className="text-sm">Pendiente de configurar integraciones como Gmail API o SMTP externo.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;

const Field = ({ label, children, className = "" }) => (
  <div className={className}>
    <Label className="mb-2 block">{label}</Label>
    {children}
  </div>
);
