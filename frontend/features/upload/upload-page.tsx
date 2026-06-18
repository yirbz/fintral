"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";

import {
  createPendingUpload,
  deletePendingUpload,
  listPendingUploads,
  processPendingUpload,
  listInvoices,
  type PendingUpload,
} from "@/lib/api/invoices";
import type { Invoice } from "@/lib/types";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/use-session";
import { getMyPlan } from "@/lib/api/plans";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { UploadNav } from "./upload-nav";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Zap,
  File,
  Image,
  FileCode2,
  Clock,
  FileCheck,
  Link2,
  Camera,
  Bot,
} from "lucide-react";

const FILE_ACCEPT = ".jpg,.jpeg,.png,.pdf,.xml";

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="size-4" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext || "")) return <Image className="size-4" />;
  if (ext === "xml") return <FileCode2 className="size-4 text-amber-600 dark:text-amber-400" />;
  return <File className="size-4" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let uploadKeyCounter = 0;
type UploadStatus = { key: number; name: string; status: "uploading" | "done" | "error"; errorMsg?: string };

export function UploadPage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingAll, setDeletingAll] = useState(false);
  const [processingResults, setProcessingResults] = useState<Record<string, { success: boolean; errorMsg?: string }>>({});
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const [flashActive, setFlashActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
      setCapturedCount(0);
    } catch (err) {
      toast.error("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
      console.error("Camera error:", err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 150);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new window.File([blob], `captura_${Date.now()}.jpg`, { type: "image/jpeg" });
        uploadFiles([file]);
        setCapturedCount((c) => c + 1);
      },
      "image/jpeg",
      0.85
    );
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const session = useSession();

  // Query for invoices in draft state (needing manual review)
  const {data: draftsQuery_data} = useQuery({
    queryKey: ["invoices", "drafts"],
    queryFn: () => listInvoices({ status: "draft" }),
    refetchInterval: 10_000,
  });

  const draftInvoices = (draftsQuery_data?.invoices ?? [])
    .filter((inv) => inv.status === "draft")
    .sort((a, b) => (a.confidence_score ?? 1.0) - (b.confidence_score ?? 1.0));

  const {data: pendingQuery_data, isLoading: pendingQuery_isLoading} = useQuery({
    queryKey: ["pending-uploads"],
    queryFn: () => listPendingUploads(),
    refetchInterval: 30_000,
  });

  const pendings = pendingQuery_data?.pending_uploads ?? [];
  const allSelected = pendings.length > 0 && selectedIds.size === pendings.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendings.map((p) => p.id)));
    }
  }

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pending-uploads"] });
    queryClient.invalidateQueries({ queryKey: ["pending-upload-count"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    // queryClient.invalidateQueries({ queryKey: ["credit-notes"] }); // unified into invoices
    queryClient.invalidateQueries({ queryKey: ["statistics"] });
    queryClient.invalidateQueries({ queryKey: ["plans", "my"] });
  }, [queryClient]);

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) =>
      FILE_ACCEPT.split(",").some((ext) => f.name.toLowerCase().endsWith(ext.replace(".", "")))
    );
    if (files.length === 0) return;

    let successCount = 0;
    let errorCount = 0;
    const keys: number[] = [];
    const newStatuses: UploadStatus[] = files.map((f) => {
      const key = ++uploadKeyCounter;
      keys.push(key);
      return { key, name: f.name, status: "uploading" };
    });
    setUploadStatuses((prev) => [...prev, ...newStatuses]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = keys[i];
      try {
        await createPendingUpload(file);
        successCount++;
        setUploadStatuses((prev) =>
          prev.map((s) => (s.key === key ? { ...s, status: "done" as const } : s))
        );
      } catch (err) {
        errorCount++;
        let errorMsg: string;
        if (err instanceof ApiError) {
          errorMsg = err.message;
        } else if (err instanceof TypeError && err.message === "Failed to fetch") {
          errorMsg = "Error de conexión";
        } else {
          errorMsg = "Error inesperado";
        }
        setUploadStatuses((prev) =>
          prev.map((s) => (s.key === key ? { ...s, status: "error" as const, errorMsg } : s))
        );
      }
    }

    if (successCount > 0) toast.success(`${successCount} factura${successCount !== 1 ? "s" : ""} subida${successCount !== 1 ? "s" : ""}. Ve a "Captura" para procesarlas.`);
    if (errorCount > 0 && successCount === 0) toast.error(`${errorCount} archivo${errorCount !== 1 ? "s" : ""} no se pudieron subir`);
    else if (errorCount > 0) toast.warning(`${successCount} archivo${successCount !== 1 ? "s" : ""} subido${successCount !== 1 ? "s" : ""}, ${errorCount} fallaron`);
    setTimeout(() => setUploadStatuses([]), 6000);
    invalidateAll();
  }, [invalidateAll]);

  function onSelectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      uploadFiles(event.target.files);
      event.target.value = "";
    }
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files) {
      uploadFiles(event.dataTransfer.files);
    }
  }

  function onDragOver(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  async function processAllPending() {
    if (!pendingQuery_data?.pending_uploads.length) return;
    const items = pendingQuery_data.pending_uploads;
    setProcessingResults({});
    setProcessingIds(new Set(items.map((p) => p.id)));
    let success = 0;
    let fail = 0;
    for (const item of items) {
      try {
        await processPendingUpload(item.id);
        success++;
        setProcessingResults((prev) => ({ ...prev, [item.id]: { success: true } }));
        setProcessingIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
      } catch (err) {
        fail++;
        setProcessingResults((prev) => ({
          ...prev,
          [item.id]: { success: false, errorMsg: err instanceof Error ? err.message : "Error desconocido" },
        }));
        setProcessingIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
      }
    }
    setSelectedIds(new Set());
    invalidateAll();
    if (fail === 0) {
      toast.success(
        <div className="flex items-center gap-2">
          <span>{success} factura{success !== 1 ? "s" : ""} procesada{success !== 1 ? "s" : ""}</span>
          <Link href="/dashboard/upload/revisions" className="ml-1 underline underline-offset-2 font-medium">
            Ir a revisiones
          </Link>
        </div>
      );
    } else if (success > 0) {
      toast.warning(`${success} procesada${success !== 1 ? "s" : ""}, ${fail} fallaron`);
    } else {
      toast.error("No se pudieron procesar las facturas");
    }
  }

  async function processOne(id: string) {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await processPendingUpload(id);
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setProcessingResults((prev) => ({ ...prev, [id]: { success: true } }));
      invalidateAll();
      toast.success(
        <div className="flex items-center gap-2">
          <span>Factura procesada</span>
          <Link href="/dashboard/upload/revisions" className="ml-1 underline underline-offset-2 font-medium">
            Ir a revisiones
          </Link>
        </div>
      );
    } catch (err) {
      setProcessingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setProcessingResults((prev) => ({
        ...prev,
        [id]: { success: false, errorMsg: err instanceof Error ? err.message : "Error al procesar factura" },
      }));
      invalidateAll();
    }
  }

  async function deleteSelected() {
    let count = 0;
    for (const id of selectedIds) {
      try {
        await deletePendingUpload(id);
        count++;
      } catch {
        // skip
      }
    }
    setSelectedIds(new Set());
    invalidateAll();
    toast.success(`${count} archivo${count !== 1 ? "s" : ""} eliminado${count !== 1 ? "s" : ""}`);
  }

  async function deleteAll() {
    setDeletingAll(true);
    let count = 0;
    for (const pu of pendings) {
      try {
        await deletePendingUpload(pu.id);
        count++;
      } catch {
        // skip
      }
    }
    setDeletingAll(false);
    invalidateAll();
    toast.success(`${count} archivo${count !== 1 ? "s" : ""} eliminado${count !== 1 ? "s" : ""}`);
  }

  const hasUploadErrors = uploadStatuses.some((s) => s.status === "error");
  const uploadingCount = uploadStatuses.filter((s) => s.status === "uploading").length;
  const doneCount = uploadStatuses.filter((s) => s.status === "done").length;

  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Upload className="size-4" />
        </div>
        <div>
          <h1 className="text-base font-medium text-foreground">Carga de Facturas</h1>
          <p className="text-xs text-muted-foreground">
            Arrastra documentos o haz clic para seleccionar archivos
          </p>
        </div>
      </div>

      <UploadNav active="upload" draftsCount={draftInvoices.length} />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Drop zone */}
          <Card>
              <CardHeader>
                <CardTitle className="text-sm font-heading">Documentos</CardTitle>
                <CardDescription className="text-xs">
                  JPG, PNG, PDF, XML (e-CF) — hasta 10 MB por archivo
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* Mobile camera button */}
                <Button
                  onClick={startCamera}
                  variant="outline"
                  className="sm:hidden w-full h-11 text-xs gap-2 border-primary/25 hover:bg-primary/5 text-primary active:scale-[0.98] transition-all"
                >
                  <Camera className="size-4" />
                  Cámara rápida (Captura múltiple)
                </Button>

                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
                  className={cn(
                    "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-all duration-200",
                    dragOver
                      ? "border-primary bg-primary/5 shadow-inner"
                      : "border-border/70 bg-muted/30 hover:border-primary/40 hover:bg-primary/[0.03]"
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={FILE_ACCEPT}
                    onChange={onSelectFiles}
                    className="hidden"
                    aria-label="Seleccionar archivos"
                  />
                  <div className={cn("flex size-12 items-center justify-center rounded-xl transition-colors", dragOver ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                    <Upload className={cn("size-5 transition-transform", dragOver && "scale-110")} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      {dragOver ? "Suelta los archivos aquí" : "Arrastra archivos o haz clic"}
                    </p>
                  </div>
                </div>

                {/* Upload progress toast */}
                {uploadStatuses.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
                    {uploadStatuses.map((s, i) => (
                      <div key={`${s.name}-${i}`} className="flex items-center gap-2 text-xs">
                        {s.status === "uploading" ? (
                          <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                        ) : s.status === "done" ? (
                          <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="size-3 text-destructive shrink-0" />
                        )}
                        <span className="truncate text-foreground">{s.name}</span>
                        {s.status === "error" && s.errorMsg && (
                          <span className="text-destructive shrink-0 ml-auto">{s.errorMsg}</span>
                        )}
                        {s.status === "done" && (
                          <CheckCircle2 className="size-3 text-emerald-500 shrink-0 ml-auto" />
                        )}
                      </div>
                    ))}
                    {uploadingCount === 0 && doneCount > 0 && (
                      <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {doneCount} factura{doneCount !== 1 ? "s" : ""} procesada{doneCount !== 1 ? "s" : ""}
                        </span>
                        <Button size="sm" variant="link" className="h-auto p-0 text-xs font-medium" asChild>
                          <Link href="/dashboard/upload/revisions">Ir a revisiones</Link>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending uploads */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-heading">Facturas pendientes</CardTitle>
                    <CardDescription className="text-xs">
                      Archivos subidos que aún no se han procesado
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={deletingAll || processingIds.size > 0}
                        onClick={() => void deleteSelected()}
                      >
                        <Trash2 className="size-3" data-icon="inline-start" />
                        Eliminar {selectedIds.size > 1 ? `(${selectedIds.size})` : ""}
                      </Button>
                    )}
                    {(pendingQuery_data?.total ?? 0) > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={deletingAll || processingIds.size > 0}
                          >
                            {deletingAll ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar todas las pendientes</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción eliminará {pendingQuery_data?.total ?? 0} factura{(pendingQuery_data?.total ?? 0) !== 1 ? "s" : ""} pendiente{(pendingQuery_data?.total ?? 0) !== 1 ? "s" : ""}. Los archivos se perderán permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => void deleteAll()}
                            >
                              Eliminar todas
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Badge variant="outline" className="text-xs gap-1">
                      <Clock className="size-3" />
                      {pendingQuery_data?.total ?? 0} pendiente{(pendingQuery_data?.total ?? 0) !== 1 ? "s" : ""}
                    </Badge>
                    {(pendingQuery_data?.total ?? 0) > 0 && (
                      <Button
                        size="sm"
                        onClick={() => void processAllPending()}
                        disabled={processingIds.size > 0 || deletingAll}
                      >
                        {processingIds.size > 0 ? (
                          <Loader2 className="size-3 animate-spin" data-icon="inline-start" />
                        ) : (
                          <Zap className="size-3" data-icon="inline-start" />
                        )}
                        Subir archivos
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Processing results summary */}
                {Object.keys(processingResults).length > 0 && (
                  <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">Resultado del procesamiento</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-auto p-1 text-muted-foreground hover:text-foreground"
                        onClick={() => setProcessingResults({})}
                      >
                        <XCircle className="size-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 mb-2 text-xs">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="size-3" />
                        {Object.values(processingResults).filter((r) => r.success).length} exitosas
                      </span>
                      {Object.values(processingResults).filter((r) => !r.success).length > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                          <XCircle className="size-3" />
                          {Object.values(processingResults).filter((r) => !r.success).length} fallaron
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {Object.entries(processingResults).map(([id, r]) => (
                        <div key={id} className="flex items-center gap-2 text-xs">
                          {r.success ? (
                            <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="size-3 text-destructive shrink-0" />
                          )}
                          <span className="truncate text-foreground">{pendings.find((p) => p.id === id)?.filename ?? id.slice(0, 8)}</span>
                          {!r.success && r.errorMsg && (
                            <span className="shrink-0 text-destructive ml-auto truncate max-w-[200px]">{r.errorMsg}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingQuery_isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : pendings.length > 0 ? (
                  <div className="space-y-4">
                    {/* Desktop table view */}
                    <div className="hidden md:block overflow-auto">
                      <Table className="min-w-[640px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10 px-2 py-2">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={() => toggleSelectAll()}
                                aria-label="Seleccionar todas"
                              />
                            </TableHead>
                            <TableHead className="px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Archivo</TableHead>
                            <TableHead className="px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Subido</TableHead>
                            <TableHead className="px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Tamaño</TableHead>
                            <TableHead className="px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Expira</TableHead>
                            <TableHead className="px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground text-right">Acción</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendings.map((pu) => {
                            const expiresAt = new Date(pu.expires_at);
                            const expiresSoon = expiresAt.getTime() - Date.now() < 3600_000;
                            const isProcessing = processingIds.has(pu.id);
                            const result = processingResults[pu.id];
                            const isSelected = selectedIds.has(pu.id);
                            return (
                              <TableRow
                                key={pu.id}
                                className={cn(
                                  "group hover:bg-primary/[0.02]",
                                  isSelected && "bg-primary/[0.03]",
                                  result && !result.success && "bg-destructive/[0.03]"
                                )}
                              >
                                <TableCell className="w-10 px-2 py-2">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleSelect(pu.id)}
                                    aria-label={`Seleccionar ${pu.filename}`}
                                    disabled={isProcessing}
                                  />
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    {isProcessing ? (
                                      <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                                    ) : result ? (
                                      result.success ? (
                                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                                      ) : (
                                        <XCircle className="size-3.5 text-destructive shrink-0" />
                                      )
                                    ) : (
                                      fileIcon(pu.filename)
                                    )}
                                    <span className="text-xs text-foreground truncate max-w-[200px]">
                                      {pu.filename || pu.id.slice(0, 8)}
                                    </span>
                                    {result && !result.success && result.errorMsg && (
                                      <span className="text-[10px] text-destructive truncate max-w-[160px]" title={result.errorMsg}>
                                        {result.errorMsg}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                                  {new Date(pu.created_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                  <span className="text-xs text-muted-foreground">{formatSize(pu.file_size)}</span>
                                </TableCell>
                                <TableCell className="px-3 py-2">
                                  <span className={cn("text-xs", expiresSoon ? "text-destructive" : "text-muted-foreground")}>
                                    {expiresSoon ? "Pronto" : `${Math.round((expiresAt.getTime() - Date.now()) / 3600_000)}h`}
                                  </span>
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isProcessing}
                                      onClick={() => void processOne(pu.id)}
                                    >
                                      {isProcessing ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <Zap className="size-3" data-icon="inline-start" />
                                      )}
                                      {isProcessing ? "Procesando..." : "Procesar"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={isProcessing}
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={async () => {
                                        try {
                                          await deletePendingUpload(pu.id);
                                          setSelectedIds((prev) => { const n = new Set(prev); n.delete(pu.id); return n; });
                                          invalidateAll();
                                          toast.success("Archivo eliminado");
                                        } catch {
                                          toast.error("Error al eliminar archivo");
                                        }
                                      }}
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile card list view */}
                    <div className="block md:hidden space-y-3">
                      {pendings.map((pu) => {
                        const expiresAt = new Date(pu.expires_at);
                        const expiresSoon = expiresAt.getTime() - Date.now() < 3600_000;
                        const isProcessing = processingIds.has(pu.id);
                        const result = processingResults[pu.id];
                        return (
                          <div key={pu.id} className="p-3 rounded-xl border border-border bg-card/40 hover:bg-card transition-colors flex flex-col gap-2 relative">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {isProcessing ? (
                                  <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                                ) : result ? (
                                  result.success ? (
                                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <XCircle className="size-4 text-destructive shrink-0" />
                                  )
                                ) : (
                                  fileIcon(pu.filename)
                                )}
                                <span className="text-xs font-semibold text-foreground truncate">{pu.filename}</span>
                              </div>
                              <Checkbox
                                checked={selectedIds.has(pu.id)}
                                onCheckedChange={() => toggleSelect(pu.id)}
                                aria-label={`Seleccionar ${pu.filename}`}
                                disabled={isProcessing}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                              <span>Tamaño: {formatSize(pu.file_size)}</span>
                              <span className={cn(expiresSoon ? "text-destructive font-semibold" : "")}>
                                Expira: {expiresSoon ? "Pronto" : `${Math.round((expiresAt.getTime() - Date.now()) / 3600_000)}h`}
                              </span>
                            </div>

                            <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-2 mt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={isProcessing}
                                onClick={() => void processOne(pu.id)}
                              >
                                {isProcessing ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Zap className="size-3" data-icon="inline-start" />
                                )}
                                Procesar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                disabled={isProcessing}
                                onClick={async () => {
                                  try {
                                    await deletePendingUpload(pu.id);
                                    setSelectedIds((prev) => { const n = new Set(prev); n.delete(pu.id); return n; });
                                    invalidateAll();
                                    toast.success("Archivo eliminado");
                                  } catch {
                                    toast.error("Error al eliminar archivo");
                                  }
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <CheckCircle2 className="size-8 text-emerald-500/60" />
                    <p className="text-xs text-muted-foreground">No hay facturas pendientes por procesar</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Arrastra archivos arriba para crear cargas pendientes
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
        </div>

        <div className="space-y-6">
          <PlanLimitsWidget />
        </div>
      </div>

      {cameraActive && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col justify-between select-none">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 text-white z-10">
            <div className="flex items-center gap-2">
              <Camera className="size-4 text-primary animate-pulse" />
              <span className="text-sm font-semibold tracking-tight">Cámara Rápida Fintral</span>
            </div>
            <div className="text-xs font-mono bg-zinc-800 px-2 py-0.5 rounded-full">
              Capturadas: {capturedCount}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={stopCamera}
              className="h-8 text-xs border-zinc-700 bg-transparent text-white hover:bg-zinc-800 hover:text-white"
            >
              Finalizar
            </Button>
          </div>

          {/* Video stream container */}
          <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Visual Flash overlay */}
            <div
              className={cn(
                "absolute inset-0 bg-white z-[110] transition-opacity duration-150 pointer-events-none",
                flashActive ? "opacity-100" : "opacity-0"
              )}
            />
          </div>

          {/* Bottom Shutter Controls */}
          <div className="p-6 bg-zinc-950/90 border-t border-zinc-900 flex flex-col items-center gap-4 text-white z-10">
            <p className="text-[11px] text-zinc-400 text-center max-w-[280px]">
              Apunta a la factura y presiona el botón. Las fotos se subirán en segundo plano sin interrumpirte.
            </p>
            <div className="flex items-center justify-center w-full">
              <button
                type="button"
                onClick={captureFrame}
                className="group relative size-20 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-95 duration-100 bg-transparent"
                aria-label="Capturar factura"
              >
                <span className="absolute size-14 bg-white rounded-full group-active:scale-90 transition-transform duration-100" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function PlanLimitsWidget() {
  const { data: planData, isLoading } = useQuery({
    queryKey: ["plans", "my"],
    queryFn: getMyPlan,
  });

  if (isLoading) {
    return (
      <Card className="border border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-3 w-40 rounded-md mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-2 w-full rounded-full animate-pulse" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-2 w-full rounded-full animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!planData || !planData.subscription) return null;

  const usage = planData.usage;
  const planName = planData.plan?.display_name || "Inicial (Gratis)";
  
  const ocrUsed = usage?.ocr_docs?.used ?? 0;
  const ocrLimit = usage?.ocr_docs?.limit ?? 0;
  const ocrPct = ocrLimit > 0 ? Math.min((ocrUsed / ocrLimit) * 100, 100) : 0;

  const storageUsed = usage?.storage_mb?.used ?? 0;
  const storageLimit = usage?.storage_mb?.limit ?? 0;
  const storagePct = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;

  const aiUsed = usage?.ai_queries?.used ?? 0;
  const aiLimit = usage?.ai_queries?.limit ?? 0;
  const aiPct = aiLimit > 0 ? Math.min((aiUsed / aiLimit) * 100, 100) : 0;

  return (
    <Card className="border border-border/50 bg-card/50 backdrop-blur-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Zap className="size-4 text-primary" />
          Uso del Plan
        </CardTitle>
        <CardDescription className="text-xs">
          Límites del plan <strong className="text-foreground font-medium">{planName}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Processing Limit Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground flex items-center gap-1">
              <FileText className="size-3.5" />
              Procesamiento OCR
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {ocrUsed} / {ocrLimit} docs
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                ocrPct >= 90 ? "bg-destructive" : ocrPct >= 75 ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${ocrPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/80 leading-normal">
            Cantidad de facturas que puedes analizar con IA este mes.
          </p>
        </div>

        {/* Storage Limit Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground flex items-center gap-1">
              <Upload className="size-3.5" />
              Almacenamiento
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {storageUsed.toFixed(1)} MB / {storageLimit} MB
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                storagePct >= 90 ? "bg-destructive" : storagePct >= 75 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${storagePct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/80 leading-normal">
            Espacio en disco para tus facturas y XMLs guardados.
          </p>
        </div>

        {/* AI queries limits if any */}
        {aiLimit > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground flex items-center gap-1">
                <Bot className="size-3.5" />
                Consultas al Asistente
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {aiUsed} / {aiLimit} consultas
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  aiPct >= 90 ? "bg-destructive" : aiPct >= 75 ? "bg-amber-500" : "bg-indigo-500"
                )}
                style={{ width: `${aiPct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
      {ocrUsed >= ocrLimit && ocrLimit > 0 && (
        <CardFooter className="pt-0 border-t border-border/40 mt-3 p-3">
          <div className="w-full text-center p-2 rounded-lg bg-destructive/5 border border-destructive/10">
            <p className="text-[10px] text-destructive leading-normal">
              ⚠️ Has agotado el límite de procesamiento mensual de tu plan. Mejora tu suscripción para seguir procesando facturas.
            </p>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
