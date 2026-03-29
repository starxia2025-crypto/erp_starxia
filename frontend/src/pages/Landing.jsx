import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Bot, Building2, FileText, Package, Shield, Users, BarChart3, KeyRound } from "lucide-react";

import { useAuth, useTheme } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";
import LegalFooter from "@/components/layout/LegalFooter";
import LegalDocumentLink from "@/components/legal/LegalDocumentLink";

const API = API_BASE;

const initialLogin = { email: "", password: "" };
const initialRegister = {
  name: "",
  email: "",
  password: "",
  company_name: "",
  company_tax_id: "",
  company_address: "",
  company_phone: "",
  company_email: "",
};
const initialForgotPassword = { email: "" };
const initialResetPassword = { new_password: "", confirm_password: "" };
const initialConsents = { terms: false, privacy: false };
const features = [
  {
    icon: Users,
    title: "Gestion de clientes",
    description: "Segmenta, registra y consulta toda tu cartera sin salir del ERP.",
  },
  {
    icon: Package,
    title: "Inventario multi-almacen",
    description: "Controla stock, minimos y entradas por almacen con importacion CSV.",
  },
  {
    icon: FileText,
    title: "Ventas y compras",
    description: "Pedidos, facturas y compras en un flujo unico y ordenado.",
  },
  {
    icon: BarChart3,
    title: "Reportes exportables",
    description: "Saca informes en Excel para operativa, ventas y compras.",
  },
  {
    icon: Bot,
    title: "Asistente IA",
    description: "Consulta datos de negocio y recibe ayuda contextual dentro del sistema.",
  },
  {
    icon: Shield,
    title: "Acceso propio",
    description: "Autenticacion interna lista para crecer contigo como SaaS.",
  },
];

const Landing = () => {
  const { user, setUser } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get("reset_token") || "";

  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [forgotPasswordForm, setForgotPasswordForm] = useState(initialForgotPassword);
  const [resetPasswordForm, setResetPasswordForm] = useState(initialResetPassword);
  const [submitting, setSubmitting] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [consents, setConsents] = useState(initialConsents);
  const [legalDocuments, setLegalDocuments] = useState([]);
  const isDark = theme === "dark";
  const authInputClassName = isDark
    ? "border-white/15 bg-white/5 text-white placeholder:text-zinc-500 caret-white autofill:bg-transparent"
    : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 caret-primary";

  const hasResetToken = useMemo(() => Boolean(resetToken), [resetToken]);

  useEffect(() => {
    if (user && !hasResetToken) {
      navigate("/dashboard");
    }
  }, [user, navigate, hasResetToken]);

  useEffect(() => {
    const loadLegalDocuments = async () => {
      try {
        const response = await axios.get(`${API}/public/legal-documents`);
        setLegalDocuments(response.data);
      } catch (error) {
        setLegalDocuments([]);
      }
    };
    loadLegalDocuments();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/auth/login`, loginForm, { withCredentials: true });
      setUser(response.data);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo iniciar sesion");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (!consents.terms || !consents.privacy) {
      toast.error("Debes aceptar terminos y politica de privacidad");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...registerForm,
        company_tax_id: registerForm.company_tax_id || null,
        company_address: registerForm.company_address || null,
        company_phone: registerForm.company_phone || null,
        company_email: registerForm.company_email || null,
        accept_terms: consents.terms,
        accept_privacy: consents.privacy,
      };
      const response = await axios.post(`${API}/auth/register`, payload, { withCredentials: true });
      setUser(response.data);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setRequestingReset(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, forgotPasswordForm, { withCredentials: true });
      toast.success("Si el email existe, te hemos enviado un enlace para cambiar la contrasena");
      setForgotPasswordForm(initialForgotPassword);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo procesar la solicitud");
    } finally {
      setRequestingReset(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (resetPasswordForm.new_password !== resetPasswordForm.confirm_password) {
      toast.error("Las contrasenas no coinciden");
      return;
    }

    setResettingPassword(true);
    try {
      await axios.post(
        `${API}/auth/reset-password`,
        { token: resetToken, new_password: resetPasswordForm.new_password },
        { withCredentials: true }
      );
      toast.success("Contrasena actualizada. Ya puedes iniciar sesion.");
      setResetPasswordForm(initialResetPassword);
      setSearchParams({});
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo actualizar la contrasena");
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className={`flex min-h-screen flex-col overflow-x-hidden ${isDark ? "bg-[#111114]" : "bg-background"}`}>
      <div className="flex-1">
      <div className="relative overflow-hidden border-b border-border">
        <div
          className={`absolute inset-0 ${
            isDark
              ? "bg-[radial-gradient(circle_at_top_left,_rgba(255,85,0,0.16),_transparent_35%),linear-gradient(135deg,#0f0f11_0%,#17171a_60%,#111114_100%)]"
              : "bg-[radial-gradient(circle_at_top_left,_rgba(255,140,72,0.16),_transparent_30%),linear-gradient(135deg,#fffaf5_0%,#fff5ed_45%,#fffdf9_100%)]"
          }`}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm text-primary">
              <Building2 className="h-4 w-4" />
              ERP Starxia para operativa real
            </div>

            <h1 className={`mb-6 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl ${isDark ? "text-white" : "text-zinc-950"}`}>
              Gestiona ventas, compras e inventario desde un unico panel.
            </h1>

            <p className={`mb-8 max-w-2xl text-lg ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
              Esta base ya nace orientada a ERP: multiempresa, multiusuario, almacenes, documentos de venta y compra, reportes y asistente IA.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className={`rounded-2xl border p-4 backdrop-blur-sm ${
                    isDark ? "border-white/10 bg-white/5" : "border-zinc-200/80 bg-white/80 shadow-sm"
                  }`}
                >
                  <feature.icon className="mb-3 h-5 w-5 text-primary" />
                  <h3 className={`mb-1 font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>{feature.title}</h3>
                  <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          <Card
            className={`shadow-2xl ${
              isDark
                ? "border-white/10 bg-zinc-950/80 shadow-black/30"
                : "border-zinc-200/70 bg-white/92 shadow-orange-100/70"
            }`}
          >
            <CardHeader>
              <CardTitle className={`text-2xl ${isDark ? "text-white" : "text-zinc-950"}`}>
                {hasResetToken ? "Restablecer contrasena" : "Acceso privado"}
              </CardTitle>
              <CardDescription>
                {hasResetToken
                  ? "Define una nueva contrasena para tu usuario."
                  : "Entra con tu cuenta o crea la primera empresa administradora."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasResetToken ? (
                <form className="space-y-4" onSubmit={handleResetPassword}>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Nueva contrasena</Label>
                    <Input
                      id="reset-password"
                      type="password"
                      minLength={8}
                      value={resetPasswordForm.new_password}
                      onChange={(event) => setResetPasswordForm({ ...resetPasswordForm, new_password: event.target.value })}
                      placeholder="Minimo 8 caracteres"
                      className={authInputClassName}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password-confirm" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Confirmar contrasena</Label>
                    <Input
                      id="reset-password-confirm"
                      type="password"
                      minLength={8}
                      value={resetPasswordForm.confirm_password}
                      onChange={(event) => setResetPasswordForm({ ...resetPasswordForm, confirm_password: event.target.value })}
                      placeholder="Repite la nueva contrasena"
                      className={authInputClassName}
                      required
                    />
                  </div>
                  <Button className="w-full" type="submit" disabled={resettingPassword}>
                    {resettingPassword ? "Actualizando..." : "Guardar nueva contrasena"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={`w-full ${isDark ? "text-zinc-300" : "text-zinc-600"}`}
                    onClick={() => setSearchParams({})}
                  >
                    Volver al acceso
                  </Button>
                </form>
              ) : (
                <Tabs defaultValue="login" className="space-y-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Iniciar sesion</TabsTrigger>
                    <TabsTrigger value="register">Crear cuenta</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login" className="space-y-6">
                    <form className="space-y-4" onSubmit={handleLogin}>
                      <div className="space-y-2">
                        <Label htmlFor="login-email" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Email</Label>
                        <Input
                          id="login-email"
                          type="email"
                          value={loginForm.email}
                          onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                          placeholder="admin@tuempresa.com"
                          className={authInputClassName}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Contrasena</Label>
                        <Input
                          id="login-password"
                          type="password"
                          value={loginForm.password}
                          onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                          placeholder="Tu contrasena"
                          className={authInputClassName}
                          required
                        />
                      </div>
                      <Button className="w-full" type="submit" disabled={submitting}>
                        {submitting ? "Entrando..." : "Entrar al ERP"}
                      </Button>
                    </form>

                    <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50"}`}>
                      <div className={`mb-3 flex items-center gap-2 text-sm font-medium ${isDark ? "text-white" : "text-zinc-900"}`}>
                        <KeyRound className="h-4 w-4 text-primary" />
                        Olvide mi contrasena
                      </div>
                      <form className="space-y-3" onSubmit={handleForgotPassword}>
                        <Input
                          type="email"
                          value={forgotPasswordForm.email}
                          onChange={(event) => setForgotPasswordForm({ email: event.target.value })}
                          placeholder="Tu email de acceso"
                          className={authInputClassName}
                          required
                        />
                        <Button type="submit" variant="secondary" className="w-full" disabled={requestingReset}>
                          {requestingReset ? "Enviando..." : "Enviar enlace de recuperacion"}
                        </Button>
                      </form>
                    </div>
                  </TabsContent>

                  <TabsContent value="register">
                    <form className="space-y-4" onSubmit={handleRegister}>
                      <div className="space-y-2">
                        <Label htmlFor="register-company" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Empresa</Label>
                        <Input
                          id="register-company"
                          value={registerForm.company_name}
                          onChange={(event) => setRegisterForm({ ...registerForm, company_name: event.target.value })}
                          placeholder="Starxia Operations"
                          className={authInputClassName}
                          required
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="register-company-email" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Email de empresa</Label>
                          <Input
                            id="register-company-email"
                            type="email"
                            value={registerForm.company_email}
                            onChange={(event) => setRegisterForm({ ...registerForm, company_email: event.target.value })}
                            placeholder="info@tuempresa.com"
                            className={authInputClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-company-phone" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Telefono de empresa</Label>
                          <Input
                            id="register-company-phone"
                            value={registerForm.company_phone}
                            onChange={(event) => setRegisterForm({ ...registerForm, company_phone: event.target.value })}
                            placeholder="+34 600 000 000"
                            className={authInputClassName}
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="register-company-tax-id" className={isDark ? "text-zinc-200" : "text-zinc-700"}>NIF/CIF</Label>
                          <Input
                            id="register-company-tax-id"
                            value={registerForm.company_tax_id}
                            onChange={(event) => setRegisterForm({ ...registerForm, company_tax_id: event.target.value })}
                            placeholder="B12345678"
                            className={authInputClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-name" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Nombre del admin</Label>
                          <Input
                            id="register-name"
                            value={registerForm.name}
                            onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
                            placeholder="Tu nombre"
                            className={authInputClassName}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-company-address" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Direccion</Label>
                        <Input
                          id="register-company-address"
                          value={registerForm.company_address}
                          onChange={(event) => setRegisterForm({ ...registerForm, company_address: event.target.value })}
                          placeholder="Calle, ciudad y provincia"
                          className={authInputClassName}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-email" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Email de acceso</Label>
                        <Input
                          id="register-email"
                          type="email"
                          value={registerForm.email}
                          onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                          placeholder="admin@tuempresa.com"
                          className={authInputClassName}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-password" className={isDark ? "text-zinc-200" : "text-zinc-700"}>Contrasena</Label>
                        <Input
                          id="register-password"
                          type="password"
                          minLength={8}
                          value={registerForm.password}
                          onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                          placeholder="Minimo 8 caracteres"
                          className={authInputClassName}
                          required
                        />
                      </div>
                      <div
                        className={`space-y-3 rounded-xl border p-4 text-sm ${
                          isDark ? "border-white/10 bg-white/5 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-700"
                        }`}
                      >
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={consents.terms}
                            onChange={(event) => setConsents((current) => ({ ...current, terms: event.target.checked }))}
                            className="mt-1"
                          />
                          <span>
                            Acepto los{" "}
                            <LegalDocumentLink code="terms" label="terminos y condiciones" className="inline text-primary underline" />{" "}
                            vigentes {versionFor("terms", legalDocuments)}.
                          </span>
                        </label>
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={consents.privacy}
                            onChange={(event) => setConsents((current) => ({ ...current, privacy: event.target.checked }))}
                            className="mt-1"
                          />
                          <span>
                            Acepto la{" "}
                            <LegalDocumentLink code="privacy" label="politica de privacidad" className="inline text-primary underline" />{" "}
                            vigente {versionFor("privacy", legalDocuments)}.
                          </span>
                        </label>
                      </div>
                      <Button className="w-full" type="submit" disabled={submitting}>
                        {submitting ? "Creando..." : "Crear empresa y acceder"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
      <LegalFooter />
    </div>
  );
};

const versionFor = (code, documents) => {
  const item = documents.find((document) => document.code === code);
  return item ? `(v${item.version})` : "";
};

export default Landing;
