import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

import { useAuth } from "@/App";
import { API_BASE, getApiErrorMessage } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Header from "./Header";
import LegalFooter from "./LegalFooter";
import Sidebar from "./Sidebar";

const Layout = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initializingDemo, setInitializingDemo] = useState(false);
  const location = useLocation();
  const { user, checkAuth } = useAuth();
  const pendingLegalDocuments = user?.pending_legal_documents || [];
  const isPendingDemoSetup = user?.company_account_mode === "demo" && !user?.company_demo_initialized;
  const demoDaysRemaining = useMemo(() => {
    if (!user?.company_demo_expires_at) return null;
    const diff = new Date(user.company_demo_expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [user?.company_demo_expires_at]);

  useEffect(() => {
    if (!isPendingDemoSetup) {
      setInitializingDemo(false);
    }
  }, [isPendingDemoSetup]);

  const handleInitializeDemo = async (useSampleData) => {
    setInitializingDemo(true);
    try {
      await axios.post(
        `${API_BASE}/demo/initialize`,
        { use_sample_data: useSampleData },
        { withCredentials: true }
      );
      await checkAuth();
      toast.success(
        useSampleData
          ? "Demo preparada con datos de ejemplo para que empieces a probar ya."
          : "Demo preparada en blanco. Ya puedes empezar a trabajar."
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo preparar la demo"));
    } finally {
      setInitializingDemo(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 lg:static lg:z-auto lg:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar currentPath={location.pathname} />
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <Header title={title} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        {user?.company_account_mode === "demo" && (
          <div className="border-b border-primary/20 bg-primary/10 px-6 py-3 text-sm font-medium text-foreground">
            Estas usando una cuenta DEMO
            {typeof demoDaysRemaining === "number" ? ` · ${demoDaysRemaining} dias restantes` : ""}
            . El plan demo permite hasta {user?.company_demo_record_limit || 20} registros por modulo.
          </div>
        )}
        {pendingLegalDocuments.length > 0 && (
          <div className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm font-medium text-amber-950">
            Tienes documentos legales pendientes de reaceptacion. Revisalos en Configuracion &gt; Legal.
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">{children}</main>
        <LegalFooter />
      </div>

      <Dialog open={isPendingDemoSetup}>
        <DialogContent
          className="sm:max-w-xl"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          hideCloseButton
        >
          <DialogHeader>
            <DialogTitle>Configura tu cuenta demo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Antes de entrar, elige como quieres arrancar esta demo de 7 dias.
              </p>
              <p>
                En la version demo podras crear hasta {user?.company_demo_record_limit || 20} registros por modulo.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => handleInitializeDemo(true)}
                disabled={initializingDemo}
                className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-60"
              >
                <p className="text-base font-semibold text-foreground">Quiero datos de ejemplo</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cargaremos al menos 10 registros de clientes, proveedores, productos, pedidos y facturas para que pruebes el ERP desde el minuto uno.
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleInitializeDemo(false)}
                disabled={initializingDemo}
                className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-60"
              >
                <p className="text-base font-semibold text-foreground">Prefiero empezar en blanco</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Entraras con un entorno limpio para configurar tu operativa desde cero dentro del limite demo.
                </p>
              </button>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
              Cuando alcances el limite demo, te avisaremos para que puedas mejorar tu plan y seguir creciendo.
            </div>
            {initializingDemo && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Preparando tu espacio demo...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Layout;
