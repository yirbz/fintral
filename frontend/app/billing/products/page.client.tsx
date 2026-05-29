"use client";

import { useEffect, useState } from "react";
import { billingApi, Product, ProductCreate } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Edit2, Trash2, Tag, Percent, DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
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

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await billingApi.getProducts();
      setProducts(data);
    } catch (err: any) {
      toast.error("Error al cargar catálogo de productos: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

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
      fetchProducts();
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
      fetchProducts();
    } catch (err: any) {
      toast.error("Error al eliminar producto: " + (err.message || "Error desconocido"));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(amount);
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Catálogo de Productos y Servicios
          </h2>
          <p className="text-sm text-muted-foreground">
            Bienes y servicios disponibles para emitir facturas con cálculo automático de tasas fiscales.
          </p>
        </div>
        <div>
          <Button
            onClick={openCreateDialog}
            className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 px-3"
          >
            <PlusCircle className="size-3.5" />
            Agregar Producto/Servicio
          </Button>
        </div>
      </div>

      <Card className="border border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Productos y Servicios</CardTitle>
          <CardDescription className="text-xs">
            Lista de bienes y servicios configurados en el sistema de facturación.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Tag className="size-8 text-muted-foreground/60 mb-2" />
              <p className="text-xs font-medium text-muted-foreground">
                No hay productos en el catálogo de esta organización.
              </p>
              <Button size="xs" variant="outline" className="h-7 text-[11px] mt-3" onClick={openCreateDialog}>
                Crear primer producto
              </Button>
            </div>
          ) : (
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
                  {products.map((product) => (
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
                      <TableCell className="text-xs text-right font-semibold py-3">
                        {formatCurrency(product.price)}
                      </TableCell>
                      <TableCell className="text-xs py-3">
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] h-5 px-2">
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
    </div>
  );
}
