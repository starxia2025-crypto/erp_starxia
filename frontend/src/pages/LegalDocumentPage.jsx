import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

import { API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LegalFooter from "@/components/layout/LegalFooter";

const API = API_BASE;

const LegalDocumentPage = () => {
  const { code } = useParams();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await axios.get(`${API}/public/legal-documents`);
        const current = response.data.find((item) => item.code === code);
        setDocument(current || null);
      } catch (error) {
        setDocument(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [code]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{document?.title || "Documento legal"}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : document ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Version {document.version} · Publicado {new Date(document.published_at).toLocaleDateString("es-ES")}
                </p>
                <div className="whitespace-pre-wrap text-sm leading-6">{document.content}</div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">Documento no disponible</div>
            )}
          </CardContent>
        </Card>
      </main>
      <LegalFooter />
    </div>
  );
};

export default LegalDocumentPage;
