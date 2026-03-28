import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Bot, Building2, FileText, Package, Shield, Users, BarChart3 } from "lucide-react";

import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const initialLogin = { email: "", password: "" };
const initialRegister = { name: "", email: "", password: "", company_name: "" };

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
  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

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
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/auth/register`, registerForm, { withCredentials: true });
      setUser(response.data);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,85,0,0.16),_transparent_35%),linear-gradient(135deg,#0f0f11_0%,#17171a_60%,#111114_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm text-primary">
              <Building2 className="h-4 w-4" />
              ERP Starxia para operativa real
            </div>

            <h1 className="mb-6 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Gestiona ventas, compras e inventario desde un unico panel.
            </h1>

            <p className="mb-8 max-w-2xl text-lg text-zinc-300">
              Esta base ya nace orientada a ERP: multiempresa, multiusuario, almacenes, documentos de venta y compra, reportes y asistente IA.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <feature.icon className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="mb-1 font-semibold text-white">{feature.title}</h3>
                  <p className="text-sm text-zinc-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="border-white/10 bg-zinc-950/80 shadow-2xl shadow-black/30">
            <CardHeader>
              <CardTitle className="text-2xl text-white">Acceso privado</CardTitle>
              <CardDescription>Entra con tu cuenta o crea la primera empresa administradora.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Iniciar sesion</TabsTrigger>
                  <TabsTrigger value="register">Crear cuenta</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        value={loginForm.email}
                        onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                        placeholder="admin@tuempresa.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Contrasena</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginForm.password}
                        onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                        placeholder="Tu contrasena"
                        required
                      />
                    </div>
                    <Button className="w-full" type="submit" disabled={submitting}>
                      {submitting ? "Entrando..." : "Entrar al ERP"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form className="space-y-4" onSubmit={handleRegister}>
                    <div className="space-y-2">
                      <Label htmlFor="register-company">Empresa</Label>
                      <Input
                        id="register-company"
                        value={registerForm.company_name}
                        onChange={(event) => setRegisterForm({ ...registerForm, company_name: event.target.value })}
                        placeholder="Starxia Operations"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Nombre</Label>
                      <Input
                        id="register-name"
                        value={registerForm.name}
                        onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
                        placeholder="Tu nombre"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        value={registerForm.email}
                        onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                        placeholder="admin@tuempresa.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Contrasena</Label>
                      <Input
                        id="register-password"
                        type="password"
                        minLength={8}
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                        placeholder="Minimo 8 caracteres"
                        required
                      />
                    </div>
                    <Button className="w-full" type="submit" disabled={submitting}>
                      {submitting ? "Creando..." : "Crear empresa y acceder"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Landing;
