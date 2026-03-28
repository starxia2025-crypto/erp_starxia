import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Building2, Mail, Shield, User, Users } from "lucide-react";

import Layout from "@/components/layout/Layout";
import { useAuth } from "@/App";
import { API_BASE } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const API = API_BASE;
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales", label: "Ventas" },
  { value: "warehouse", label: "Almacen" },
];

const emptyEmployeeForm = {
  name: "",
  email: "",
  password: "",
  role: "sales",
};

const Settings = () => {
  const { user, checkAuth } = useAuth();
  const canEditCompany = hasPermission(user, "settings.write");
  const canViewUsers = hasPermission(user, "users.read");
  const canManageUsers = hasPermission(user, "users.write");

  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    tax_id: "",
    address: "",
    phone: "",
    email: "",
  });
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);

  const roleLabelByValue = useMemo(
    () => Object.fromEntries(ROLE_OPTIONS.map((item) => [item.value, item.label])),
    []
  );

  const loadSettings = useCallback(async () => {
    try {
      const requests = [axios.get(`${API}/companies`, { withCredentials: true })];
      if (canViewUsers) {
        requests.push(axios.get(`${API}/users`, { withCredentials: true }));
      }

      const [companyResponse, usersResponse] = await Promise.all(requests);

      if (companyResponse.data.length > 0) {
        const currentCompany = companyResponse.data[0];
        setCompany(currentCompany);
        setFormData({
          name: currentCompany.name || "",
          tax_id: currentCompany.tax_id || "",
          address: currentCompany.address || "",
          phone: currentCompany.phone || "",
          email: currentCompany.email || "",
        });
      }

      if (usersResponse) {
        setEmployees(usersResponse.data);
      }
    } catch (error) {
      toast.error("No se pudieron cargar los ajustes");
    } finally {
      setLoading(false);
    }
  }, [canViewUsers]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Mi usuario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label className="text-muted-foreground">Nombre</Label>
                <p className="font-medium">{user?.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{user?.email}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Rol</Label>
                <div className="mt-1">
                  <Badge variant={getRoleBadgeVariant(user?.role)}>{roleLabelByValue[user?.role] || user?.role}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Datos de la empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCompanySubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="company-name">Nombre de la empresa</Label>
                  <Input
                    id="company-name"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    disabled={!canEditCompany}
                    required
                    data-testid="company-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="company-tax-id">NIF/CIF</Label>
                  <Input
                    id="company-tax-id"
                    value={formData.tax_id}
                    onChange={(event) => setFormData({ ...formData, tax_id: event.target.value })}
                    disabled={!canEditCompany}
                    data-testid="company-tax-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="company-address">Direccion</Label>
                  <Input
                    id="company-address"
                    value={formData.address}
                    onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                    disabled={!canEditCompany}
                  />
                </div>
                <div>
                  <Label htmlFor="company-phone">Telefono</Label>
                  <Input
                    id="company-phone"
                    value={formData.phone}
                    onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                    disabled={!canEditCompany}
                  />
                </div>
                <div>
                  <Label htmlFor="company-email">Email</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    disabled={!canEditCompany}
                  />
                </div>
              </div>

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
