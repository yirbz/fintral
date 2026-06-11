"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast, Toaster } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  File,
  Image,
  FileCode2,
  Lock,
  Clock,
  Check,
  Trash2,
  Eye,
} from "lucide-react";
import {
  getPublicLinkInfo,
  createPublicPendingUpload,
  deletePublicPendingUpload,
  processPublicPendingUploads,
  type PublicLinkInfo,
} from "@/lib/api/invoices";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FILE_ACCEPT = ".jpg,.jpeg,.png,.pdf,.xml";

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="size-5 text-red-400" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext || "")) return <Image className="size-5 text-blue-400" />;
  if (ext === "xml") return <FileCode2 className="size-5 text-amber-400" />;
  return <File className="size-5 text-neutral-400" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  
  if (!url) return <div className="size-10 rounded-lg bg-neutral-900 border border-neutral-800/80 shrink-0 animate-pulse" />;
  return (
    <img
      src={url}
      alt={file.name}
      className="size-10 rounded-lg object-cover border border-neutral-800/80 shrink-0"
    />
  );
}

function FileIconContainer({ name }: { name: string }) {
  return (
    <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-950 border border-neutral-800/80 shrink-0">
      {fileIcon(name)}
    </div>
  );
}

function FileRowThumbnail({ upload }: { upload: UploadStatus }) {
  const ext = upload.name.split(".").pop()?.toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext || "") || (upload.file && upload.file.type?.startsWith("image/"));
  
  if (isImage && upload.status === "done") {
    if (upload.file_url) {
      return (
        <img
          src={upload.file_url}
          alt={upload.name}
          className="size-10 rounded-lg object-cover border border-neutral-800/80 shrink-0"
        />
      );
    }
    if (upload.file) {
      return <ImageThumbnail file={upload.file} />;
    }
  }
  return <FileIconContainer name={upload.name} />;
}

interface UploadStatus {
  id?: string;
  file?: File;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  errorMsg?: string;
  file_url?: string | null;
}

function PublicUploadContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<PublicLinkInfo | null>(null);
  
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewUpload, setPreviewUpload] = useState<UploadStatus | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setError("Token de acceso no proporcionado");
      setLoading(false);
      return;
    }

    async function fetchInfo() {
      try {
        const info = await getPublicLinkInfo(token!);
        setLinkInfo(info);
        setUploadedCount(info.uploaded_count);
        if (info.pending_uploads) {
          const existingUploads: UploadStatus[] = info.pending_uploads.map((p) => ({
            id: p.id,
            name: p.filename,
            size: p.file_size,
            status: "done",
            file_url: p.file_url,
          }));
          setUploads(existingUploads);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "El enlace temporal no es válido o ha expirado");
      } finally {
        setLoading(false);
      }
    }

    fetchInfo();
  }, [token]);

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!token || !linkInfo) return;

    if (uploadedCount >= linkInfo.max_files) {
      toast.error(`Has alcanzado el límite máximo de ${linkInfo.max_files} archivos permitidos.`);
      return;
    }

    const files = Array.from(fileList).filter((f) =>
      FILE_ACCEPT.split(",").some((ext) => f.name.toLowerCase().endsWith(ext.replace(".", "")))
    );

    if (files.length === 0) {
      toast.error("Ninguno de los archivos seleccionados es válido. Formatos permitidos: JPG, PNG, PDF, XML.");
      return;
    }

    const remainingSlots = linkInfo.max_files - uploadedCount;
    if (files.length > remainingSlots) {
      toast.error(`Solo puedes subir hasta ${remainingSlots} archivo(s) más.`);
      return;
    }

    let successCount = 0;
    for (const file of files) {
      if (uploads.some((u) => u.name === file.name && u.status !== "error")) {
        continue;
      }

      const newUpload: UploadStatus = { file, name: file.name, size: file.size, status: "uploading" };
      setUploads((prev) => [newUpload, ...prev]);

      try {
        const res = await createPublicPendingUpload(token, file);
        setUploads((prev) =>
          prev.map((u) => (u.name === file.name ? { ...u, status: "done", id: res.pending_upload.id } : u))
        );
        successCount++;
        setUploadedCount((c) => c + 1);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error al subir";
        setUploads((prev) =>
          prev.map((u) => (u.name === file.name ? { ...u, status: "error", errorMsg } : u))
        );
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} archivo(s) subido(s) correctamente.`);
    }
  };

  const handleRemoveFile = async (upload: UploadStatus) => {
    if (!token || !upload.id) return;
    
    // Store original list in case of rollback
    const originalUploads = [...uploads];
    const originalCount = uploadedCount;

    // Optimistic UI update
    setUploads((prev) => prev.filter((u) => u.name !== upload.name));
    setUploadedCount((c) => Math.max(0, c - 1));
    
    try {
      await deletePublicPendingUpload(token, upload.id);
      toast.success("Archivo eliminado correctamente.");
    } catch {
      toast.error("Error al eliminar el archivo del servidor.");
      // Rollback on failure
      setUploads(originalUploads);
      setUploadedCount(originalCount);
    }
  };

  const handleSendBatch = async () => {
    if (!token || uploads.filter((u) => u.status === "done").length === 0) return;
    
    setSending(true);
    try {
      const result = await processPublicPendingUploads(token);
      if (result.success_count > 0) {
        toast.success(`Envío finalizado: ${result.success_count} factura(s) transmitida(s).`);
        setIsFinished(true);
      } else if (result.errors && result.errors.length > 0) {
        toast.error(`Error al enviar: ${result.errors[0]}`);
      } else {
        toast.error("No se pudieron procesar las facturas enviadas.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error del servidor al procesar el envío.");
    } finally {
      setSending(false);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files) {
      handleUploadFiles(event.dataTransfer.files);
    }
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onSelectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleUploadFiles(event.target.files);
      event.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#060814] flex flex-col items-center justify-center p-4">
        <Loader2 className="size-8 animate-spin text-[#0EA5E9]" />
        <p className="text-sm text-neutral-400 mt-4 font-sans tracking-tight">Cargando portal de subida seguro...</p>
      </div>
    );
  }

  if (error || !linkInfo) {
    return (
      <div className="min-h-dvh bg-[#060814] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[500px] pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,rgba(234,34,97,0.12)_0%,transparent_70%)]" />
        
        <Card className="max-w-md w-full border-[#2e1c24] bg-[#140f13] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#ea2261] to-transparent" />
          <CardHeader className="text-center pt-8">
            <div className="flex size-12 items-center justify-center rounded-full bg-[#ea2261]/10 text-[#ea2261] mx-auto mb-4">
              <XCircle className="size-6" />
            </div>
            <CardTitle className="text-lg font-semibold tracking-tight text-neutral-100 font-sans">Enlace no disponible</CardTitle>
            <CardDescription className="text-xs text-neutral-400 mt-2 leading-relaxed">
              {error || "El enlace de carga temporal ha caducado o ha alcanzado su límite de archivos."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center pb-8 pt-2 px-6">
            <p className="text-xs text-neutral-500 text-center leading-relaxed max-w-[280px]">
              Por favor, ponte en contacto con tu contador o administrador de Fintral para solicitar un nuevo enlace de carga.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="min-h-dvh bg-[#060814] text-neutral-100 flex flex-col relative overflow-y-auto overflow-x-hidden font-sans">
        <Toaster theme="dark" position="top-center" closeButton />
        
        <div className="absolute top-0 inset-x-0 h-[500px] pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,rgba(16,185,129,0.15)_0%,transparent_70%)]" />
        
        <header className="max-w-2xl w-full mx-auto px-4 py-6 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight text-neutral-200">Envío Completado</span>
              <span className="text-[10px] text-neutral-500 font-mono">Fintral Hub</span>
            </div>
          </div>
        </header>

        <main className="max-w-2xl w-full mx-auto px-4 py-4 flex-1 flex flex-col relative z-10">
          <Card className="border-emerald-500/25 bg-[#0c0e22] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
            <CardContent className="p-5 sm:p-8 text-center space-y-5 sm:space-y-6">
              
              <div className="flex size-14 sm:size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mx-auto border border-emerald-500/25 animate-pulse shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="size-8 sm:size-9" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight text-white leading-tight">
                  ¡Documentos Transmitidos con Éxito!
                </h1>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-md mx-auto">
                  Tus comprobantes fiscales han sido enviados de forma segura a la contabilidad de <span className="font-semibold text-white">{linkInfo.organization_name}</span>.
                </p>
              </div>

              <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 text-xs font-semibold leading-relaxed max-w-sm mx-auto flex flex-col items-center gap-1.5">
                <span className="text-emerald-400 font-bold uppercase tracking-wider text-[9px] bg-emerald-500/10 px-2 py-0.5 rounded">Acción Permitida</span>
                Ya puedes salir de esta página y cerrar la pestaña de tu navegador de manera segura.
              </div>

              <div className="text-[10.5px] text-neutral-500 text-center max-w-md mx-auto pt-1 leading-relaxed">
                El sistema de Fintral está preprocesando y ordenando los archivos mediante nuestro pipeline de IA, y ha notificado a tu contador para la validación final. No requieres realizar ninguna acción adicional.
              </div>

              {uploads.length > 0 && (
                <div className="border-t border-neutral-800/80 pt-4 text-left space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Resumen del lote enviado ({uploads.filter(u => u.status === "done").length} archivos)</p>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {uploads.reduce<React.ReactNode[]>((acc, u) => {
                      if (u.status !== "done") return acc;
                      acc.push(
                        <div key={`${u.name}-${acc.length}`} className="flex items-center justify-between p-2 rounded-lg bg-[#090b11] border border-neutral-800/50 text-[11px]">
                          <div className="flex items-center gap-2 truncate">
                            {fileIcon(u.name)}
                            <span className="text-neutral-300 truncate">{u.name}</span>
                          </div>
                          <span className="text-neutral-500 font-mono shrink-0">{formatSize(u.size)}</span>
                        </div>
                      );
                      return acc;
                    }, [])}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        <footer className="max-w-2xl w-full mx-auto px-4 py-6 text-center text-[9px] text-neutral-600 relative z-10">
          <p>Operado bajo cifrado SSL/TLS de Fintral S.A. Santo Domingo, R.D.</p>
        </footer>
      </div>
    );
  }

  const limitReached = uploadedCount >= linkInfo.max_files;
  const progressPercent = Math.min((uploadedCount / linkInfo.max_files) * 100, 100);

  return (
    <div className="min-h-dvh bg-[#060814] text-neutral-100 flex flex-col relative overflow-y-auto overflow-x-hidden font-sans">
      <Toaster theme="dark" position="top-center" closeButton />
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes modal-enter {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-enter {
          animation: modal-enter 220ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }
        @keyframes backdrop-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-backdrop-fade {
          animation: backdrop-fade 200ms ease-out forwards;
        }
      `}} />
      
      <div className="absolute top-0 inset-x-0 h-[500px] pointer-events-none bg-[radial-gradient(circle_at_50%_-20%,rgba(83,58,253,0.18)_0%,rgba(249,107,238,0.03)_50%,transparent_100%)]" />
      <div className="absolute top-1/4 left-0 w-[300px] h-[300px] pointer-events-none bg-[radial-gradient(circle_at_center,rgba(83,58,253,0.04)_0%,transparent_70%)]" />

      {/* Compact header */}
      <header className="max-w-6xl w-full mx-auto px-4 py-4 flex items-center justify-between border-b border-neutral-800/40 relative z-10">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#0EA5E9]/10 text-[#0EA5E9] ring-1 ring-[#0EA5E9]/20 shrink-0">
            <Upload className="size-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs tracking-tight text-neutral-200">Portal de Carga</span>
            <span className="text-[9px] text-neutral-500 font-mono">Fintral Hub</span>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-medium tracking-wide uppercase">
          <Lock className="size-2.5" />
          <span>Encriptado</span>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl w-full mx-auto px-4 py-4 flex-1 flex flex-col relative z-10">
        <div className="grid gap-6 lg:grid-cols-12 items-start flex-1">
          
          {/* Left: Info — compact on mobile, full on lg+ */}
          <div className="lg:col-span-5 space-y-4 lg:space-y-6 lg:sticky lg:top-8">
            {/* Mobile compact row */}
            <div className="lg:hidden flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#0EA5E9]/10 text-[#0EA5E9] ring-1 ring-[#0EA5E9]/20 shrink-0">
                <Upload className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-semibold text-neutral-100 leading-tight">
                  Enviar facturas a <span className="text-[#0EA5E9]">{linkInfo.organization_name}</span>
                </h1>
                <p className="text-[10px] text-neutral-400 mt-0.5">{uploadedCount} / {linkInfo.max_files} archivos &middot; Expira {new Date(linkInfo.expires_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit" })}</p>
                <div className="w-full bg-neutral-900 rounded-full h-1 mt-1.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Desktop full info */}
            <div className="hidden lg:block space-y-6">
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#0EA5E9] bg-[#0EA5E9]/10 px-2.5 py-1 rounded-md">
                  Solicitud Activa
                </span>
                <h1 className="text-2xl md:text-3xl font-light tracking-tight text-neutral-100 leading-tight">
                  Envía tus facturas a <span className="font-semibold text-white">{linkInfo.organization_name}</span>
                </h1>
                <p className="text-neutral-400 text-xs md:text-sm leading-relaxed">
                  Tu contador o gestor ha solicitado comprobantes fiscales. Los archivos subidos aquí se incorporarán directamente para su procesamiento contable asistido por IA.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[#0b0e1f] border border-[#1a203f] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Progreso de carga</span>
                    <span className="font-mono text-neutral-200 font-semibold">{uploadedCount} / {linkInfo.max_files} archivos</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                    <div 
                       className="h-full bg-gradient-to-r from-[#0EA5E9] to-[#38BDF8] rounded-full transition-all duration-500" 
                       style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-4 rounded-xl bg-[#0b0e1f] border border-[#1a203f]">
                    <p className="text-[10px] text-neutral-500 uppercase font-semibold flex items-center gap-1.5">
                      <Clock className="size-3.5 text-[#0EA5E9]" />
                      Expira
                    </p>
                    <p className="font-semibold text-neutral-200 mt-2 font-mono">
                      {new Date(linkInfo.expires_at).toLocaleDateString("es-DO", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0b0e1f] border border-[#1a203f]">
                    <p className="text-[10px] text-neutral-500 uppercase font-semibold flex items-center gap-1.5">
                      <Lock className="size-3.5 text-[#0EA5E9]" />
                      Formatos
                    </p>
                    <p className="font-semibold text-neutral-200 mt-2 font-mono">
                      XML, PDF, JPG, PNG
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Upload card */}
          <div className="lg:col-span-7 flex flex-col">
            <Card className="border-[#1a203f] bg-[#0c0e22] shadow-2xl relative overflow-hidden flex flex-col h-auto">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#0EA5E9] to-transparent" />
              
              <CardContent className="p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 flex flex-col">
                
                {/* Upload Zone */}
                <div
                  onDrop={(e) => {
                    if (uploadedCount >= linkInfo.max_files) {
                      e.preventDefault();
                      toast.error(`Has alcanzado el límite máximo de ${linkInfo.max_files} archivos permitidos.`);
                      return;
                    }
                    onDrop(e);
                  }}
                  onDragOver={(e) => {
                    if (uploadedCount >= linkInfo.max_files) {
                      e.preventDefault();
                      return;
                    }
                    onDragOver(e);
                  }}
                  onDragLeave={onDragLeave}
                  onClick={() => {
                    if (uploadedCount >= linkInfo.max_files) {
                      toast.error(`Has alcanzado el límite máximo de ${linkInfo.max_files} archivos permitidos.`);
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-2 sm:gap-3 rounded-2xl border-2 border-dashed px-4 transition-all duration-200 group",
                    uploads.length > 0 ? "py-6 sm:py-8" : "py-10 sm:py-14",
                    uploadedCount >= linkInfo.max_files
                      ? "border-neutral-800 bg-[#090a18]/40 opacity-60 cursor-not-allowed"
                      : dragOver
                      ? "border-[#0EA5E9] bg-[#0EA5E9]/5 shadow-inner cursor-pointer"
                      : "border-[#202752] bg-[#090a18] hover:border-[#0EA5E9]/40 hover:bg-[#0EA5E9]/[0.02] cursor-pointer"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={FILE_ACCEPT}
                    onChange={onSelectFiles}
                    className="hidden"
                    aria-label="Seleccionar archivos"
                    disabled={uploadedCount >= linkInfo.max_files}
                  />
                  <div className={cn(
                    "flex size-12 sm:size-14 items-center justify-center rounded-2xl transition-all duration-300", 
                    uploadedCount >= linkInfo.max_files
                      ? "bg-neutral-900 text-neutral-600"
                      : dragOver 
                      ? "bg-[#0EA5E9] text-white scale-110 shadow-lg shadow-[#0EA5E9]/20" 
                      : "bg-neutral-900 text-neutral-400 group-hover:scale-105 group-hover:bg-neutral-800"
                  )}>
                    <Upload className={cn("size-5 sm:size-6 transition-transform", uploadedCount < linkInfo.max_files && dragOver && "animate-bounce")} />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs sm:text-sm font-medium text-neutral-200 group-hover:text-white transition-colors">
                      {uploadedCount >= linkInfo.max_files 
                        ? "Límite de archivos alcanzado" 
                        : dragOver 
                        ? "¡Suelta para cargar!" 
                        : "Arrastra o haz clic"}
                    </p>
                    <p className="text-[10px] text-neutral-500 leading-normal max-w-[220px] mx-auto">
                      {uploadedCount >= linkInfo.max_files 
                        ? "Elimina archivos abajo para poder subir nuevos" 
                        : "JPG, PNG, PDF o XML contable"}
                    </p>
                  </div>
                </div>

                {/* Uploads list + Finish button — always visible when items exist */}
                {uploads.length > 0 && (
                  <div className="space-y-3 flex flex-col">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Subidas recientes</span>
                      <span className="text-[10px] font-mono text-neutral-500">{uploads.length} items</span>
                    </div>
                    <div className="space-y-2 max-h-[300px] lg:max-h-[360px] overflow-y-auto pr-1">
                      {uploads.map((u, i) => (
                        <div 
                          key={`${u.name}-${i}`} 
                          className="flex items-center gap-3 p-3 rounded-2xl border border-neutral-800/60 bg-[#090a16]/80 backdrop-blur-sm text-xs transition-all duration-200 hover:border-[#0EA5E9]/40 hover:bg-[#0EA5E9]/5 active:scale-[0.99] group cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => u.status === "done" && setPreviewUpload(u)}
                          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && u.status === "done") { e.preventDefault(); setPreviewUpload(u); } }}
                        >
                          {/* Left: Thumbnail container */}
                          <div className="shrink-0">
                            <FileRowThumbnail upload={u} />
                          </div>
                          
                          {/* Middle: Details */}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-neutral-200 truncate group-hover:text-white transition-colors">{u.name}</p>
                            <p className="text-[10px] text-neutral-500 mt-1 font-mono">{formatSize(u.size)}</p>
                          </div>
                          
                          {/* Right: Actions / Status */}
                          <div className="flex items-center gap-2 shrink-0" role="presentation" onClick={(e) => e.stopPropagation()}>
                            {u.status === "uploading" && (
                              <div className="flex size-8 items-center justify-center rounded-lg bg-[#0EA5E9]/10 text-[#0EA5E9]">
                                <Loader2 className="size-3.5 animate-spin" />
                              </div>
                            )}
                            {u.status === "error" && (
                              <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400" title={u.errorMsg}>
                                <XCircle className="size-3.5" />
                              </div>
                            )}
                            {u.status === "done" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(u)}
                                  className="flex size-8 items-center justify-center rounded-lg text-white/60 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 active:scale-95 transition-all duration-150"
                                  title="Eliminar archivo"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                                <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <Check className="size-3.5" />
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mobile floating Send/Process button */}
                    {uploads.some((u) => u.status === "done") && (
                      <div className="mt-auto pt-2 sm:pt-4 sticky bottom-0 bg-[#0c0e22] pb-1">
                        <Button
                          onClick={handleSendBatch}
                          disabled={sending}
                          className="w-full h-10 sm:h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs tracking-tight rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
                        >
                          {sending ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Transmitiendo documentos...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="size-4" />
                              Finalizar y enviar a contabilidad
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* Preview Modal */}
      {previewUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-backdrop-fade" role="presentation" onClick={() => setPreviewUpload(null)}>
          <div className="relative max-w-lg w-full bg-[#0d0e1c] border border-[#202752] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-modal-enter" role="presentation" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-neutral-800/40">
              <h3 className="text-xs font-semibold text-neutral-200 truncate pr-4">{previewUpload.name}</h3>
              <button type="button" className="text-neutral-400 hover:text-white text-xs font-medium px-2 py-1 rounded hover:bg-neutral-800/40" onClick={() => setPreviewUpload(null)}>
                Cerrar
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-neutral-950/40">
            {(() => {
              const ext = previewUpload.name.split(".").pop()?.toLowerCase();
              const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext || "") || (previewUpload.file && previewUpload.file.type?.startsWith("image/"));
              const isPdf = ext === "pdf" || (previewUpload.file && previewUpload.file.type === "application/pdf");
              
              if (isImage) {
                const src = previewUpload.file_url || (previewUpload.file ? URL.createObjectURL(previewUpload.file) : "");
                return (
                  <img
                    src={src}
                    alt={previewUpload.name}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md"
                  />
                );
              }
              if (isPdf) {
                const href = previewUpload.file_url || (previewUpload.file ? URL.createObjectURL(previewUpload.file) : "#");
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <FileText className="size-16 text-red-500 animate-pulse" />
                    <div className="space-y-1">
                      <p className="text-xs text-neutral-300 font-medium font-sans">Documento PDF</p>
                      <p className="text-[10px] text-neutral-500 font-mono">{formatSize(previewUpload.size)}</p>
                    </div>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-[#0EA5E9] hover:bg-[#38BDF8] text-white text-xs px-4 font-medium transition-colors"
                    >
                      Abrir PDF en pestaña nueva
                    </a>
                  </div>
                );
              }
              return (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <FileCode2 className="size-16 text-amber-500 animate-pulse" />
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-300 font-medium font-sans">Archivo XML Contable</p>
                    <p className="text-[10px] text-neutral-500 font-mono">{formatSize(previewUpload.size)}</p>
                  </div>
                  <p className="text-[10px] text-neutral-500 max-w-[240px] leading-relaxed">
                    Este archivo contiene datos fiscales estructurados listos para ser procesados por la IA.
                  </p>
                </div>
              );
            })()}
            </div>
          </div>
        </div>
      )}

      {/* Footer — compact */}
      <footer className="max-w-6xl w-full mx-auto px-4 py-4 border-t border-neutral-800/40 text-center text-[9px] text-neutral-600 relative z-10 font-sans">
        <p>Transferencia segura SSL/TLS &middot; Fintral S.A. Santo Domingo, R.D.</p>
      </footer>
    </div>
  );
}

export default function PublicUploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-[#060814] flex flex-col items-center justify-center p-4">
        <Loader2 className="size-8 animate-spin text-[#0EA5E9]" />
        <p className="text-sm text-neutral-400 mt-4 font-sans tracking-tight">Cargando portal de subida...</p>
      </div>
    }>
      <PublicUploadContent />
    </Suspense>
  );
}
