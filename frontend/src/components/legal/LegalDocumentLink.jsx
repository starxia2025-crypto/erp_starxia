import { useState } from "react";
import axios from "axios";

import { API_BASE } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const API = API_BASE;

const LegalDocumentLink = ({ code, label, className = "" }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadDocument = async (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen || document || loading) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/public/legal-documents`);
      const item = response.data.find((entry) => entry.code === code);
      setDocument(item || null);
    } catch (error) {
      setDocument(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={loadDocument}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={className}
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{document?.title || label}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : document ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Version {document.version} · Publicado {new Date(document.published_at).toLocaleDateString("es-ES")}
            </p>
            <div className="whitespace-pre-wrap text-sm leading-6">{document.content}</div>
          </div>
        ) : (
          <div className="py-8 text-sm text-muted-foreground">Documento no disponible.</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LegalDocumentLink;
