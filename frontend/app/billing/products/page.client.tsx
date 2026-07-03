"use client";

import { useEffect, useState, useRef, useCallback, type DragEvent } from "react";
import { billingApi, Product, ProductCreate, ProductListResponse, BulkProductImportResponse, BulkImportRowError } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Edit2, Trash2, Tag, Percent, DollarSign, Loader2, FileSpreadsheet, Upload, Download, AlertTriangle, CheckCircle2, XCircle, Eye, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ImportState = "idle" | "upload" | "preview" | "results";

export default function ProductsPage() {
  const [productList, setProductList] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [taxRateFilter, setTaxRateFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState<ProductCreate>({
    name: "",
    internal_code: "",
    description: "",
    price: 0,
    tax_rate: 18.0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Import State
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConflictMode, setImportConflictMode] = useState<"skip" | "overwrite">("skip");
  const [importResult, setImportResult] = useState<BulkProductImportResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importPreview, setImportPreview] = useState<Record<string, string>[] | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(5);
  const previewTableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchProducts = useCallback(async (pageNum = 1) => {
    try {
      setLoading(true);
      const data = await billingApi.getProducts({
        search: debouncedSearch || undefined,
        tax_rate: taxRateFilter ?? undefined,
        is_active: activeFilter ?? undefined,
        page: pageNum,
        page_size: pageSize,
      });
      setProductList(data.products);
      setTotalProducts(data.total);
      setCurrentPage(data.page);
    } catch (err: any) {
      toast.error("Error al cargar catálogo de productos: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, taxRateFilter, activeFilter, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchProducts(1);
  }, [debouncedSearch, taxRateFilter, activeFilter, pageSize]);

  const openCreateDialog = () => {
    setIsEdit(false);
    setSelectedProductId(null);
    setForm({ name: "", internal_code: "", description: "", price: 0, tax_rate: 18.0 });
    setDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setIsEdit(true);
    setSelectedProductId(product.id);
    setForm({
      name: product.name,
      internal_code: product.internal_code || "",
      description: product.description || "",
      price: product.price,
      tax_rate: product.tax_rate,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("El nombre del producto/servicio es obligatorio");
      return;
    }
    if (form.price < 0) {
      toast.error("El precio no puede ser negativo");
      return;
    }

    try {
      setSubmitting(true);
      if (isEdit && selectedProductId) {
        await billingApi.updateProduct(selectedProductId, form);
        toast.success("Catálogo actualizado exitosamente");
      } else {
        await billingApi.createProduct(form);
        toast.success("Producto registrado exitosamente en el catálogo");
      }
      setDialogOpen(false);
      fetchProducts(currentPage);
    } catch (err: any) {
      toast.error("Error al guardar producto: " + (err.message || "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Está seguro que desea eliminar el producto "${name}" del catálogo?`)) return;

    try {
      await billingApi.deleteProduct(id);
      toast.success("Producto eliminado del catálogo");
      fetchProducts(currentPage);
    } catch (err: any) {
      toast.error("Error al eliminar producto: " + (err.message || "Error desconocido"));
    }
  };

  // Import handlers
  const resetImportState = () => {
    setImportState("idle");
    setImportFile(null);
    setImportResult(null);
    setImportPreview(null);
    setImportConflictMode("skip");
    setPreviewPage(1);
    setPreviewPageSize(5);
    setImporting(false);
    setParsing(false);
  };

  const openImportDialog = () => {
    setImportDialogOpen(true);
    setImportState("upload");
    setImportFile(null);
    setImportResult(null);
    setImportPreview(null);
    setImportConflictMode("skip");
    setPreviewPage(1);
  };

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx") {
      toast.error("Formato no soportado. Use archivos .csv o .xlsx");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo excede el tamaño máximo de 5MB");
      return;
    }
    setImportFile(file);
    setParsing(true);

    if (ext === "csv") {
      setPreviewPage(1);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transform: (value: string) => value.trim(),
        complete: (results) => {
          setImportPreview(results.data as Record<string, string>[]);
          setParsing(false);
          setImportState("preview");
        },
        error: () => {
          toast.error("Error al leer el archivo CSV");
          setParsing(false);
        },
      });
    } else {
      setPreviewPage(1);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          if (!rows || rows.length < 2) {
            toast.error("El archivo XLSX no contiene datos suficientes");
            setParsing(false);
            return;
          }
          const headers = (rows[0] || []).map((h: any) => String(h ?? ""));
          const allRows = rows.slice(1).map((row: any[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((h: string, i: number) => { obj[h] = String(row[i] ?? ""); });
            return obj;
          });
          setImportPreview(allRows);
          setParsing(false);
          setImportState("preview");
        } catch {
          toast.error("Error al leer el archivo XLSX");
          setParsing(false);
        }
      };
      reader.onerror = () => {
        toast.error("Error al leer el archivo");
        setParsing(false);
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const handleImport = async () => {
    if (!importFile) return;
    try {
      setImporting(true);
      const result = await billingApi.importProducts(importFile, importConflictMode);
      setImportResult(result);
      setImportState("results");
      fetchProducts(currentPage);
    } catch (err: any) {
      toast.error("Error al importar productos: " + (err.message || "Error desconocido"));
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const productCount = productList.length;
  const maxProducts = 200;
  const usagePct = maxProducts > 0 ? (productCount / maxProducts) * 100 : 0;
  const usageColor = usagePct >= 85 ? "text-rose-500" : usagePct >= 60 ? "text-amber-500" : "text-emerald-500";
  const usageBgColor = usagePct >= 85 ? "bg-rose-500" : usagePct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  const isNearLimit = usagePct > 80;
  const isAtLimit = productCount >= maxProducts && maxProducts > 0;

  const startItem = totalProducts === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalProducts);
  const totalPages = Math.ceil(totalProducts / pageSize);

  // Auto-scroll table to top on page change
  useEffect(() => {
    previewTableRef.current?.scrollTo(0, 0);
  }, [previewPage]);

  const previewTotalRows = importPreview?.length ?? 0;
  const previewStartItem = previewTotalRows === 0 ? 0 : (previewPage - 1) * previewPageSize + 1;
  const previewEndItem = Math.min(previewPage * previewPageSize, previewTotalRows);
  const previewTotalPages = Math.ceil(previewTotalRows / previewPageSize);
  const previewCurrentRows = importPreview?.slice(previewStartItem - 1, previewEndItem) ?? [];

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              Catálogo de Productos y Servicios
            </h2>
            {productCount > 0 && (
              <Badge
                className={`text-[11px] h-5 px-2 font-mono ${usageColor}`}
                variant="outline"
              >
                {productCount} / {maxProducts > 0 ? maxProducts : "∞"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Bienes y servicios disponibles para emitir facturas con cálculo automático de tasas fiscales.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={openImportDialog}
            variant="outline"
            className="h-8 rounded-md text-xs gap-1.5 px-3 border-border/80"
          >
            <FileSpreadsheet className="size-3.5" />
            Importar Productos
          </Button>
          <Button
            onClick={openCreateDialog}
            className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3"
          >
            <PlusCircle className="size-3.5" />
            Agregar Producto/Servicio
          </Button>
        </div>
      </div>

      {/* Limit Warning Banner */}
      {isAtLimit && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
          <AlertTriangle className="size-5 text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
              Límite de productos alcanzado
            </p>
            <p className="text-[11px] text-rose-600/80 dark:text-rose-500/80">
              Has alcanzado el máximo de {maxProducts} productos en tu plan actual. Mejora tu plan para agregar más.
            </p>
          </div>
          <Button size="xs" variant="outline" className="h-7 text-[11px] border-rose-200 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-400">
            Mejorar Plan
          </Button>
        </div>
      )}

      {isNearLimit && !isAtLimit && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle className="size-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Límite de productos próximo
            </p>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-500/80">
              Has utilizado el {Math.round(usagePct)}% de tu límite de {maxProducts} productos. Considera mejorar tu plan.
            </p>
          </div>
          <Button size="xs" variant="outline" className="h-7 text-[11px] border-amber-200 text-amber-600 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400">
            Mejorar Plan
          </Button>
        </div>
      )}

      <Card className="border border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Productos y Servicios</CardTitle>
              <CardDescription className="text-xs">
                Lista de bienes y servicios configurados en el sistema de facturación.
              </CardDescription>
            </div>
            {productCount > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium">{productCount}</span>
                <span className="text-muted-foreground/50">/</span>
                <span>{maxProducts > 0 ? maxProducts : "∞"}</span>
                {maxProducts > 0 && (
                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden ml-1">
                    <div
                      className={`h-full rounded-full transition-all ${usageBgColor}`}
                      style={{ width: `${Math.min(usagePct, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        {/* Search & Filters */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-y border-border/50 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o código..."
              className="h-8 pl-8 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={taxRateFilter === null ? "" : String(taxRateFilter)} onValueChange={(v) => setTaxRateFilter(v ? Number(v) : null)}>
            <SelectTrigger className="h-8 w-[120px] sm:w-[130px] text-xs">
              <SelectValue placeholder="ITBIS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas las tasas</SelectItem>
              <SelectItem value="0">0% (Exento)</SelectItem>
              <SelectItem value="9">9%</SelectItem>
              <SelectItem value="16">16%</SelectItem>
              <SelectItem value="18">18%</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activeFilter === null ? "" : String(activeFilter)} onValueChange={(v) => setActiveFilter(v === "" ? null : v === "true")}>
            <SelectTrigger className="h-8 w-[120px] sm:w-[130px] text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          {(searchQuery || taxRateFilter !== null || activeFilter !== null) && (
            <Button
              variant="ghost"
              size="xs"
              className="h-8 text-xs gap-1 text-muted-foreground"
              onClick={() => {
                setSearchQuery("");
                setTaxRateFilter(null);
                setActiveFilter(null);
              }}
            >
              <X className="size-3" />
              Limpiar filtros
            </Button>
          )}
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : productList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Tag className="size-8 text-muted-foreground/60 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                {searchQuery || taxRateFilter !== null || activeFilter !== null
                  ? "No se encontraron productos con los filtros seleccionados."
                  : "No hay productos en el catálogo de esta organización."}
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="xs" variant="outline" className="h-7 text-[11px]" onClick={openImportDialog}>
                  <FileSpreadsheet className="size-3 mr-1" />
                  Importar desde archivo
                </Button>
                <Button size="xs" variant="outline" className="h-7 text-[11px]" onClick={openCreateDialog}>
                  Crear primer producto
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Código Interno</TableHead>
                      <TableHead className="text-xs">Nombre / Descripción</TableHead>
                      <TableHead className="text-xs text-right">Precio</TableHead>
                      <TableHead className="text-xs">Tasa de ITBIS</TableHead>
                      <TableHead className="text-xs text-right pr-6">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productList.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-mono text-xs py-3 font-semibold text-primary">
                          {product.internal_code || "-"}
                        </TableCell>
                        <TableCell className="text-xs py-3">
                          <div className="font-semibold">{product.name}</div>
                          {product.description && (
                            <div className="text-[11px] text-muted-foreground line-clamp-1">
                              {product.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold py-3 tabular-nums">
                          {formatCurrency(product.price)}
                        </TableCell>
                        <TableCell className="text-xs py-3">
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] h-5 px-2 tabular-nums">
                            <Percent className="size-2.5 mr-0.5" />
                            {product.tax_rate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              className="h-7 text-[11px] border-border/80 text-foreground hover:bg-muted rounded-md px-2"
                              size="xs"
                              onClick={() => openEditDialog(product)}
                            >
                              <Edit2 className="size-3 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              className="h-7 text-[11px] border-border/80 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500 rounded-md px-2"
                              size="xs"
                              onClick={() => handleDelete(product.id, product.name)}
                            >
                              <Trash2 className="size-3 mr-1" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Mostrando {startItem}-{endItem} de {totalProducts} productos
                </p>
                <div className="flex items-center gap-3">
                  <select
                    className="h-7 rounded-md border border-input bg-background px-2 py-0 text-xs"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7 w-7 p-0"
                      disabled={currentPage <= 1}
                      onClick={() => fetchProducts(currentPage - 1)}
                    >
                      <ChevronLeft className="size-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground px-1 tabular-nums">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7 w-7 p-0"
                      disabled={currentPage >= totalPages}
                      onClick={() => fetchProducts(currentPage + 1)}
                    >
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border border-border bg-card/95 backdrop-blur-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">
                {isEdit ? "Editar Producto" : "Registrar Producto/Servicio"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Ingrese la información para el catálogo de facturación.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label htmlFor="product-name" className="text-xs font-semibold text-muted-foreground">Nombre *</label>
                  <input
                    id="product-name"
                    aria-label="Nombre del producto"
                    type="text"
                    required
                    placeholder="Ej. Servicio Consultoría"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-sku" className="text-xs font-semibold text-muted-foreground">Código SKU</label>
                  <input
                    id="product-sku"
                    aria-label="Código SKU"
                    type="text"
                    placeholder="Ej. SERV-01"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.internal_code}
                    onChange={(e) => setForm({ ...form, internal_code: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-price" className="text-xs font-semibold text-muted-foreground">Precio Unitario (DOP) *</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                    <input
                      id="product-price"
                      aria-label="Precio unitario"
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      className="flex h-8 w-full rounded-md border border-input bg-background pl-7 pr-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                      value={form.price || ""}
                      onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-tax-rate" className="text-xs font-semibold text-muted-foreground">Tasa de ITBIS *</label>
                  <select
                    id="product-tax-rate"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })}
                  >
                    <option value="18">18% (Tasa Estándar)</option>
                    <option value="16">16% (Tasa Reducida)</option>
                    <option value="9">9% (Tasa Reducida II)</option>
                    <option value="0">0% (Exento)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-desc" className="text-xs font-semibold text-muted-foreground">Descripción del Producto</label>
                  <textarea
                    id="product-desc"
                    aria-label="Descripción del producto"
                    placeholder="Detalle de las características o alcance del servicio..."
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs rounded-md border-border/80 text-foreground hover:bg-muted"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
              >
                {submitting && <Loader2 className="size-3 animate-spin" />}
                {isEdit ? "Guardar Cambios" : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        if (!open && importing) return;
        if (!open) resetImportState();
        setImportDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-[580px] border border-border bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {importState === "upload" && "Importar Productos"}
              {importState === "preview" && "Confirmar Importación"}
              {importState === "results" && "Resultado de Importación"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {importState === "upload" && "Sube un archivo CSV o XLSX con el catálogo de productos."}
              {importState === "preview" && importFile && `Archivo: ${importFile.name} (${formatFileSize(importFile.size)})`}
              {importState === "results" && "Resumen de la importación."}
            </DialogDescription>
          </DialogHeader>

          {importState === "upload" && (
            <div className="space-y-4">
              {parsing ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Leyendo archivo...</span>
                </div>
              ) : (
                <>
                  {/* Download template */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span>¿No tienes un archivo listo?</span>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={() => billingApi.downloadImportTemplate("csv")}
                    >
                      <Download className="size-3 mr-1" />
                      Descargar plantilla CSV
                    </Button>
                    <span className="text-muted-foreground/50">|</span>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={() => billingApi.downloadImportTemplate("xlsx")}
                    >
                      <Download className="size-3 mr-1" />
                      XLSX
                    </Button>
                  </div>

                  {/* Drop zone */}
                  <div
                    role="button"
                    tabIndex={0}
                    className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                      dragOver
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                  >
                    <Upload className="size-8 text-muted-foreground/60 mb-3" />
                    <p className="text-sm font-medium text-foreground">Arrastra tu archivo aquí</p>
                    <p className="text-[11px] text-muted-foreground mt-1">o haz clic para seleccionar</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">CSV o XLSX — Máximo 5MB — 500 filas</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                    />
                  </div>

                  {/* Conflict mode */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-muted-foreground shrink-0">Si hay duplicados:</label>
                    <select
                      className="flex h-7 rounded-md border border-input bg-background px-2 py-0 text-xs"
                      value={importConflictMode}
                      onChange={(e) => setImportConflictMode(e.target.value as "skip" | "overwrite")}
                    >
                      <option value="skip">Omitir (no importar)</option>
                      <option value="overwrite">Sobrescribir</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {importState === "preview" && importPreview && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Se encontraron <span className="font-semibold">{previewTotalRows}</span> filas. Revisa los datos antes de importar.
              </p>

              {/* Paginated preview table */}
              <div ref={previewTableRef} className="overflow-x-auto overflow-y-auto rounded-md border border-border max-h-[55vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase w-10 text-muted-foreground/60">#</TableHead>
                      {Object.keys(importPreview[0] || {}).map((key) => (
                        <TableHead key={key} className="text-[10px] uppercase whitespace-nowrap">
                          {key}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewCurrentRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-[10px] py-1.5 text-muted-foreground/50 font-mono tabular-nums text-right pr-1">
                          {previewStartItem + idx}
                        </TableCell>
                        {Object.keys(importPreview[0] || {}).map((key) => (
                          <TableCell key={key} className="text-[11px] py-1.5 whitespace-nowrap max-w-[120px] truncate">
                            {row[key] || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Preview pagination */}
              {previewTotalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Mostrando {previewStartItem}-{previewEndItem} de {previewTotalRows} filas
                  </p>
                  <div className="flex items-center gap-3">
                    <select
                      className="h-7 rounded-md border border-input bg-background px-2 py-0 text-[11px]"
                      value={previewPageSize}
                      onChange={(e) => { setPreviewPageSize(Number(e.target.value)); setPreviewPage(1); }}
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="25">25</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="xs"
                        className="h-7 w-7 p-0"
                        disabled={previewPage <= 1}
                        onClick={() => setPreviewPage(previewPage - 1)}
                      >
                        <ChevronLeft className="size-3" />
                      </Button>
                      <span className="text-[11px] text-muted-foreground px-1 tabular-nums">
                        {previewPage} / {previewTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        className="h-7 w-7 p-0"
                        disabled={previewPage >= previewTotalPages}
                        onClick={() => setPreviewPage(previewPage + 1)}
                      >
                        <ChevronRight className="size-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="h-8 text-xs rounded-md border-border/80 text-foreground hover:bg-muted"
                  onClick={() => { setImportState("upload"); setImportFile(null); setImportPreview(null); }}
                >
                  Cambiar archivo
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
                >
                  {importing ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                  {importing ? "Importando..." : "Importar Productos"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {importState === "results" && importResult && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{importResult.imported}</span>
                  <span className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70">Importados</span>
                </div>
                <div className="flex flex-col items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <AlertTriangle className="size-5 text-amber-500" />
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">{importResult.skipped}</span>
                  <span className="text-[10px] text-amber-600/70 dark:text-amber-500/70">Omitidos</span>
                </div>
                <div className="flex flex-col items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
                  <XCircle className="size-5 text-rose-500" />
                  <span className="text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">{importResult.errors.length}</span>
                  <span className="text-[10px] text-rose-600/70 dark:text-rose-500/70">Errores</span>
                </div>
              </div>

              {/* Error details */}
              {importResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] w-12">Fila</TableHead>
                        <TableHead className="text-[10px]">Código</TableHead>
                        <TableHead className="text-[10px]">Razón</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.errors.map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-[11px] py-1.5 font-mono">{err.row || "-"}</TableCell>
                          <TableCell className="text-[11px] py-1.5 font-mono">{err.internal_code || "-"}</TableCell>
                          <TableCell className="text-[11px] py-1.5 text-rose-600">{err.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  className="h-8 text-xs rounded-md border-border/80 text-foreground hover:bg-muted"
                  onClick={() => setImportDialogOpen(false)}
                >
                  Cerrar
                </Button>
                <Button
                  className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
                  onClick={() => { setImportDialogOpen(false); }}
                >
                  <Eye className="size-3" />
                  Ver catálogo actualizado
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
