"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { billingApi, Client, Product, InvoiceCreate, InvoiceLineItem } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus, ShoppingCart, User, Send, Save, CreditCard, Sparkles, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  discount: number;
}

export default function QuickBillingPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form selections
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [paymentType, setPaymentType] = useState<number>(1); // 1: Contado, 2: Crédito
  const [paymentMethod, setPaymentMethod] = useState<number>(2); // 1: Efectivo, 2: Transf, 3: Tarjeta
  const [ecfType, setEcfType] = useState<number>(31); // 31: Crédito Fiscal, 32: Consumo
  const [isEcfAuthorized, setIsEcfAuthorized] = useState<boolean>(true);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Current item being added
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [addQty, setAddQty] = useState<number>(1);
  const [addPrice, setAddPrice] = useState<number>(0);
  const [addDiscount, setAddDiscount] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [cList, pList, status] = await Promise.all([
          billingApi.getClients(),
          billingApi.getProducts(),
          billingApi.getVerificationStatus(),
        ]);
        setClients(cList);
        setProducts(pList);
        setIsEcfAuthorized(status.is_ecf_authorized);

        if (cList.length > 0) setSelectedClientId(cList[0].id);
        if (pList.length > 0) {
          setSelectedProductId(pList[0].id);
          setAddPrice(pList[0].price);
        }

        // Set initial type based on authorization
        setEcfType(status.is_ecf_authorized ? 31 : 1);
      } catch (err: any) {
        toast.error("Error al cargar datos: " + (err.message || "Error desconocido"));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setAddPrice(prod.price);
    }
  };

  const addToCart = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    if (addQty <= 0) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }

    const existingIndex = cart.findIndex((item) => item.product.id === prod.id);
    if (existingIndex > -1) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += addQty;
      newCart[existingIndex].price = addPrice;
      newCart[existingIndex].discount = addDiscount;
      setCart(newCart);
    } else {
      setCart([...cart, { product: prod, quantity: addQty, price: addPrice, discount: addDiscount }]);
    }

    toast.success(`${prod.name} agregado a la factura`);
    setAddQty(1);
    setAddDiscount(0);
  };

  const removeFromCart = (index: number) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
  };

  // Calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let discountAmount = 0;
    let taxAmount = 0;

    cart.forEach((item) => {
      const base = item.quantity * item.price;
      const disc = base * (item.discount / 100);
      const taxable = base - disc;
      const tax = taxable * (item.product.tax_rate / 100);

      subtotal += base;
      discountAmount += disc;
      taxAmount += tax;
    });

    const total = subtotal - discountAmount + taxAmount;

    return { subtotal, discountAmount, taxAmount, total };
  };

  const totals = calculateTotals();

  const handleSaveInvoice = async (transmitImmediately: boolean) => {
    if (cart.length === 0) {
      toast.error("Debe agregar al menos un producto a la factura");
      return;
    }

    const isEcf = [31, 32, 34, 43].includes(ecfType);
    if (isEcf && !isEcfAuthorized) {
      toast.error("Tu organización debe estar certificada ante la DGII para emitir comprobantes electrónicos.");
      return;
    }

    const payload: InvoiceCreate = {
      client_id: selectedClientId || undefined,
      ecf_type: ecfType,
      payment_type: paymentType,
      payment_method: paymentMethod,
      items: cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.price,
        discount_rate: item.discount,
      })),
    };

    try {
      setSubmitting(true);
      toast.info("Creando borrador de factura...");
      const invoice = await billingApi.createInvoice(payload);

      if (transmitImmediately) {
        toast.info("Comprobante creado. Certificando ante la DGII...");
        const result = await billingApi.transmitInvoice(invoice.id);
        if (isEcf) {
          toast.success(`Factura e-CF emitida y certificada: ${result.invoice.invoice_number}`);
        } else {
          toast.success(`Factura física registrada con éxito. NCF asignado: ${result.invoice.invoice_number}`);
        }
        router.push("/billing");
      } else {
        toast.success("Borrador de factura guardado exitosamente");
        router.push("/billing");
      }
    } catch (err: any) {
      toast.error("Error al emitir factura: " + (err.message || "Error desconocido"));
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96 md:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Nueva Factura de Venta</h2>
        <p className="text-sm text-muted-foreground">
          Cree comprobantes fiscales electrónicos autorizados con timbrado en tiempo real.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Side: Invoice details + Product selector */}
        <div className="lg:col-span-8 space-y-6">
          {/* General Invoicing Configuration */}
          <Card className="border border-border/50 bg-card/50">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <User className="size-4 text-primary" />
                Datos de Emisión
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Cliente / Razón Social</label>
                {clients.length === 0 ? (
                  <p className="text-xs text-rose-500 font-medium">Debe registrar un cliente en la sección de Clientes</p>
                ) : (
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.tax_id})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Tipo Comprobante</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={ecfType}
                  onChange={(e) => setEcfType(parseInt(e.target.value) || (isEcfAuthorized ? 31 : 1))}
                >
                  <optgroup label="Facturación Electrónica (e-CF)">
                    <option value="31" disabled={!isEcfAuthorized}>
                      Crédito Fiscal (31) {!isEcfAuthorized ? " (Requiere Certificación)" : ""}
                    </option>
                    <option value="32" disabled={!isEcfAuthorized}>
                      Consumidor Final (32) {!isEcfAuthorized ? " (Requiere Certificación)" : ""}
                    </option>
                  </optgroup>
                  <optgroup label="Facturación Tradicional / Física">
                    <option value="1">Crédito Fiscal Físico (01)</option>
                    <option value="2">Consumidor Final Físico (02)</option>
                  </optgroup>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Condición Pago</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={paymentType}
                  onChange={(e) => setPaymentType(parseInt(e.target.value) || 1)}
                >
                  <option value="1">Contado</option>
                  <option value="2">Crédito</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Método Pago</label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(parseInt(e.target.value) || 2)}
                >
                  <option value="1">Efectivo</option>
                  <option value="2">Cheque / Transferencia</option>
                  <option value="3">Tarjeta de Crédito/Débito</option>
                  <option value="4">A Plazo</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Add Item Panel */}
          <Card className="border border-border/50 bg-card/50">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <ShoppingCart className="size-4 text-primary" />
                Agregar Concepto / Servicio
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-6 items-end">
              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <label className="text-xs font-semibold text-muted-foreground">Producto o Servicio</label>
                {products.length === 0 ? (
                  <p className="text-xs text-rose-500 font-medium">Debe registrar productos en el Catálogo</p>
                ) : (
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedProductId}
                    onChange={(e) => handleProductChange(e.target.value)}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.internal_code})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground">Precio Unit.</label>
                <input
                  type="number"
                  step="0.01"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={addPrice || ""}
                  onChange={(e) => setAddPrice(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground">Cantidad</label>
                <input
                  type="number"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={addQty || ""}
                  onChange={(e) => setAddQty(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground">Desc %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={addDiscount}
                  onChange={(e) => setAddDiscount(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="sm:col-span-6 flex justify-end">
                <Button
                  onClick={addToCart}
                  disabled={products.length === 0}
                  className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
                >
                  <Plus className="size-3.5" />
                  Añadir Línea
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Cart Table */}
          <Card className="border border-border/50 bg-card/50 overflow-hidden">
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-semibold">Detalle del Documento</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cart.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Añada conceptos o servicios para confeccionar la factura.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Concepto / Servicio</TableHead>
                      <TableHead className="text-xs text-right">Cant.</TableHead>
                      <TableHead className="text-xs text-right">Precio Unit.</TableHead>
                      <TableHead className="text-xs text-right">Descto %</TableHead>
                      <TableHead className="text-xs">ITBIS Tasa</TableHead>
                      <TableHead className="text-xs text-right">Importe</TableHead>
                      <TableHead className="text-xs text-right pr-6"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item, index) => {
                      const base = item.quantity * item.price;
                      const disc = base * (item.discount / 100);
                      const total = base - disc;
                      return (
                        <TableRow key={index}>
                          <TableCell className="text-xs font-semibold py-2">
                            {item.product.name}
                          </TableCell>
                          <TableCell className="text-xs text-right py-2">{item.quantity}</TableCell>
                          <TableCell className="text-xs text-right py-2">
                            {formatCurrency(item.price)}
                          </TableCell>
                          <TableCell className="text-xs text-right py-2">
                            {item.discount > 0 ? `${item.discount}%` : "-"}
                          </TableCell>
                          <TableCell className="text-xs py-2">
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] h-4">
                              {item.product.tax_rate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-semibold py-2">
                            {formatCurrency(total)}
                          </TableCell>
                          <TableCell className="text-right pr-6 py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                              onClick={() => removeFromCart(index)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Total calculations & Transmission actions */}
        <div className="lg:col-span-4">
          <Card className="border border-border bg-primary/5 relative overflow-hidden backdrop-blur-xs">
            <div className="absolute top-0 right-0 p-3 opacity-15">
              <Sparkles className="size-24 text-primary" />
            </div>

            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <CreditCard className="size-4 text-primary" />
                Resumen de Totales
              </CardTitle>
              <CardDescription className="text-xs">
                Cálculos en pesos dominicanos (DOP).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 py-6">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Descuento</span>
                <span className="font-semibold text-rose-500">
                  {totals.discountAmount > 0 ? `- ${formatCurrency(totals.discountAmount)}` : formatCurrency(0)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">ITBIS Total</span>
                <span className="font-semibold">{formatCurrency(totals.taxAmount)}</span>
              </div>

              <div className="border-t border-border/50 pt-3 flex justify-between items-baseline">
                <span className="text-xs font-bold text-foreground">Total Factura</span>
                <span className="text-lg font-extrabold text-primary">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => handleSaveInvoice(true)}
                disabled={submitting || cart.length === 0}
                className="w-full h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3 gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {[31, 32].includes(ecfType) ? "Transmitir y Emitir e-CF" : "Emitir Comprobante Físico"}
              </Button>
              <Button
                onClick={() => handleSaveInvoice(false)}
                disabled={submitting || cart.length === 0}
                variant="outline"
                className="w-full h-9 rounded-md border-border text-foreground hover:bg-muted text-xs gap-1.5"
              >
                <Save className="size-3.5" />
                Guardar Borrador
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
