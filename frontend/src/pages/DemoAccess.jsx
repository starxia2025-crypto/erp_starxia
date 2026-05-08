import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { DoorOpen, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/App";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DemoAccess = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const accessDemo = async () => {
      try {
        const response = await axios.post(`${API_BASE}/auth/demo-access`, {}, { withCredentials: true });
        if (cancelled) return;
        setUser(response.data);
        window.location.replace("/dashboard");
      } catch (error) {
        if (cancelled) return;
        setFailed(true);
        toast.error(error.response?.data?.detail || "No se pudo abrir la demo del ERP");
      }
    };

    accessDemo();
    return () => {
      cancelled = true;
    };
  }, [navigate, setUser]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-lg border-border/70 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {failed ? <DoorOpen className="h-7 w-7" /> : <LoaderCircle className="h-7 w-7 animate-spin" />}
          </div>
          <CardTitle>{failed ? "Demo no disponible" : "Entrando a la demo"}</CardTitle>
          <CardDescription>
            {failed
              ? "No hemos podido abrir la cuenta de demostracion ahora mismo."
              : "Estamos preparando una sesion de acceso directo al dashboard para que puedas probar el ERP sin registro."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {failed ? (
            <Button onClick={() => navigate("/", { replace: true })}>Volver al inicio</Button>
          ) : (
            <p className="text-sm text-muted-foreground">Cargando datos de ejemplo y abriendo el panel...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DemoAccess;
