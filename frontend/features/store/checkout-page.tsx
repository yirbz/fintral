"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Banknote, Loader2, Info, Upload, CheckCircle2, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useCart } from "./cart-context";
import { useSession } from "@/hooks/use-session";
import { calculateCart, uploadPaymentProof, getBankDetails, getExchangeRate, type CartItem as ApiCartItem } from "@/lib/api/plans";
import { PriceDisplay } from "@/components/ui/price-display";
import { PaddleCheckoutButton } from "@/components/billing/paddle-checkout";
import { cn } from "@/lib/utils";

export function CheckoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, clearCart, isEmpty } = useCart();
  const { data: session, isLoading: sessionLoading } = useSession();
  const orgId = session?.organization?.id;
  const role = session?.role;
  const canManage = role === "owner" || role === "admin";

  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "transfer">("card");

  const cartItems: ApiCartItem[] = useMemo(
    () =>
      items.map((i) => ({
        type: i.type,
        plan_name: i.plan_name,
        addon_type: i.addon_type,
        quantity: i.quantity,
        months: i.months,
        price_cents: i.price_cents,
        label: i.label,
      })),
    [items]
  );

  const { data: cartCalc, isLoading: calcLoading } = useQuery({
    queryKey: ["cart-calc", cartItems],
    queryFn: () => calculateCart(cartItems),
    enabled: !isEmpty,
  });

  const { data: rateData } = useQuery({
    queryKey: ["exchange-rate"],
    queryFn: getExchangeRate,
    staleTime: 1000 * 60 * 60 * 12,
  });
  const exchangeRate = rateData?.rate ?? 59.0;

  const usdTotal = cartCalc?.total ?? 0;
  const dopTotal = usdTotal * exchangeRate;
  const total = usdTotal; // baseline total is USD
  const currency = "USD";
  const months = cartCalc?.months ?? 1;
  const discount = cartCalc?.discount ?? 0;
  const monthlyTotal = cartCalc?.monthly_total ?? 0;

  const planChangeItem = items.find((i) => i.type === "plan_change");
  const hasPlanChange = !!planChangeItem;
  const ecfBlockItem = items.find((i) => i.type === "ecf_blocks");
  const hasEcfBlocks = !!ecfBlockItem;
  const showCardPayment = hasPlanChange || hasEcfBlocks;

  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const { data: bankDetails } = useQuery({
    queryKey: ["bank-details"],
    queryFn: getBankDetails,
    staleTime: 1000 * 60 * 30,
  });

  async function handleCardPayment() {
    if (!orgId) return;
    setLoadingCheckout(true);
    try {
      let res;
      if (hasPlanChange && planChangeItem) {
        res = await fetch("/api/plans/checkout/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_name: planChangeItem.plan_name?.toLowerCase() || "",
            payment_method: "card",
          }),
        });
      } else if (hasEcfBlocks && ecfBlockItem) {
        // Map quantity of 100-doc blocks to block code
        const quantity = ecfBlockItem.quantity || 1;
        const block_type =
          quantity >= 10
            ? "ecf_block_1000"
            : quantity >= 5
              ? "ecf_block_500"
              : "ecf_block_100";

        res = await fetch("/api/plans/checkout/prepaid-ecf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            block_type,
            payment_method: "card",
          }),
        });
      }

      if (!res || !res.ok) {
        const errData = await res?.json().catch(() => ({}));
        throw new Error(errData?.detail || "Error al procesar pago");
      }

      const data = await res.json();
      if (data.checkout_url) {
        clearCart();
        window.location.href = data.checkout_url;
      } else {
        throw new Error("No se recibió la URL de pago de MIO");
      }
    } catch (err: any) {
      toast.error("Error al iniciar pago", {
        description: err.message,
      });
    } finally {
      setLoadingCheckout(false);
    }
  }

  // Adjust payment method state if card payment option is not available
  React.useEffect(() => {
    if (!showCardPayment) {
      setPaymentMethod("transfer");
    }
  }, [showCardPayment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Debes adjuntar el comprobante de transferencia");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append(
        "plan_name",
        items.find((i) => i.type === "plan_change")?.plan_name || "Personalizado"
      );
      formData.append("amount", String(dopTotal));
      formData.append("currency", "DOP");
      formData.append("exchange_rate", String(exchangeRate));
      formData.append("usd_amount", String(usdTotal));
      formData.append("notes", notes);
      formData.append("items", JSON.stringify(items));
      formData.append("file", file);

      await uploadPaymentProof(formData);
      toast.success("Comprobante subido correctamente. Recibirás una notificación cuando sea verificado.");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      clearCart();
      router.push("/dashboard/cuenta?comprobante=enviado");
    } catch (err: any) {
      toast.error("Error al subir comprobante", {
        description: err.message,
      });
    } finally {
      setUploading(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="size-8 animate-spin text-brand-primary" />
        <p className="text-xs text-brand-ink-mute dark:text-slate-400">Cargando sesión...</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 text-center border border-brand-hairline dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs space-y-4">
        <div className="p-3 bg-red-500/10 text-red-500 rounded-full size-12 mx-auto flex items-center justify-center">
          <Lock className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-brand-ink dark:text-white">Acceso restringido</h2>
          <p className="text-xs text-brand-ink-mute dark:text-slate-400">
            Solo los dueños y administradores de la organización pueden realizar compras o modificar la cuenta.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard")} className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100">
          Volver al inicio
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 text-center border border-brand-hairline dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-xs space-y-4">
        <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-full size-12 mx-auto flex items-center justify-center">
          <CreditCard className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-brand-ink dark:text-white">Tu carrito está vacío</h2>
          <p className="text-xs text-brand-ink-mute dark:text-slate-400">
            No tienes planes ni complementos agregados al carrito para realizar el pago.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/tienda")} className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-100">
          Ir a la Tienda
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4 sm:p-6 animate-in fade-in duration-300">
      {/* Back to store navigation */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/tienda")}
          className="gap-1.5 text-xs text-brand-ink-mute hover:text-brand-ink dark:text-slate-400 dark:hover:text-white pl-0 hover:bg-transparent"
        >
          <ArrowLeft className="size-4" />
          Volver a la Tienda
        </Button>
      </div>

      {/* Header section */}
      <div className="space-y-1 border-b border-brand-hairline dark:border-slate-800/60 pb-5">
        <h1 className="text-3xl font-light text-brand-ink dark:text-white leading-tight">
          Confirmar pago
        </h1>
        <p className="text-sm text-brand-ink-mute dark:text-slate-400">
          Revisa tu pedido y elige la forma de pago más conveniente.
        </p>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Order Summary */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-brand-canvas-soft/30 dark:bg-slate-900/50 border border-brand-hairline dark:border-slate-800/80 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-ink-secondary dark:text-slate-300">
              Resumen de tu compra
            </h3>

            {calcLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-brand-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start gap-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-brand-ink dark:text-white">
                          {item.label || item.type}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                            Cantidad: {item.quantity}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-mono font-medium text-brand-ink dark:text-white tabular-nums shrink-0">
                        {((item.price_cents * item.quantity * (item.months || 1)) / 100).toLocaleString("es-DO", {
                          style: "currency",
                          currency,
                        })}
                      </span>
                    </div>
                  ))}
                </div>

                {months > 1 && (
                  <div className="flex items-center justify-between text-[10px] text-brand-ink-mute dark:text-slate-400 pt-1 border-t border-brand-hairline dark:border-slate-800/40">
                    <span>
                      Suscripción por {months} meses
                      {discount > 0 ? ` (${(discount * 100).toFixed(0)}% de descuento)` : ""}
                    </span>
                    <span className="font-mono tabular-nums">
                      {monthlyTotal.toLocaleString("es-DO", { style: "currency", currency })}/mes
                    </span>
                  </div>
                )}

                <Separator className="bg-brand-hairline dark:bg-slate-800/60" />

                <div className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-brand-ink dark:text-white">Total a pagar</span>
                    <PriceDisplay amountDop={dopTotal} amountUsd={usdTotal} size="lg" className="items-end" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Secure transaction notice */}
          <div className="flex gap-3 p-4 rounded-xl bg-brand-canvas-soft/10 dark:bg-slate-900/20 border border-brand-hairline dark:border-slate-800/40">
            <Lock className="size-5 text-brand-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-brand-ink dark:text-white">Pago 100% seguro</h4>
              <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 leading-normal">
                Todas las transacciones de tarjeta son encriptadas y procesadas por Paddle.com, nuestro socio de facturación oficial de conformidad con los estándares PCI-DSS.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Payment Options */}
        <div className="lg:col-span-7">
          {showCardPayment ? (
            <Tabs
              value={paymentMethod}
              onValueChange={(val) => setPaymentMethod(val as "card" | "transfer")}
              className="w-full space-y-6"
            >
              <TabsList className="grid w-full grid-cols-2 p-1 bg-brand-canvas-soft dark:bg-slate-950/40 border border-brand-hairline dark:border-slate-800/80 rounded-xl h-11">
                <TabsTrigger
                  value="card"
                  className="text-xs font-medium gap-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs"
                >
                  <CreditCard className="size-4" />
                  Pagar con Tarjeta
                </TabsTrigger>
                <TabsTrigger
                  value="transfer"
                  className="text-xs font-medium gap-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs"
                >
                  <Banknote className="size-4" />
                  Transferencia
                </TabsTrigger>
              </TabsList>

              {/* CARD PAYMENT TAB */}
              <TabsContent value="card" className="space-y-4 outline-none border-0 p-0 m-0">
                <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800/80 rounded-2xl p-6 space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-brand-ink dark:text-white">Tarjeta de Crédito o Débito</h3>
                    <p className="text-xs text-brand-ink-mute dark:text-slate-400">
                      Paga de forma segura utilizando tu tarjeta de crédito o débito a través de MIO, la pasarela oficial dominicana.
                    </p>
                  </div>

                  <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 dark:border-sky-500/20 dark:bg-sky-950/10 p-5 text-center space-y-4">
                    <div className="flex justify-center">
                      <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-full size-12 flex items-center justify-center">
                        <CreditCard className="size-6" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-2xl font-light font-mono text-brand-ink dark:text-white tracking-tight">
                        {dopTotal.toLocaleString("es-DO", { style: "currency", currency: "DOP" })}
                      </p>
                      <p className="text-[11px] text-brand-ink-mute dark:text-slate-400">
                        Equivale a ~${usdTotal.toFixed(2)} USD
                      </p>
                    </div>

                    <div className="max-w-xs mx-auto">
                      <Button
                        onClick={handleCardPayment}
                        className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
                        disabled={loadingCheckout}
                      >
                        {loadingCheckout ? (
                          <>
                            <Loader2 className="size-4 animate-spin mr-2" />
                            Redirigiendo a MIO...
                          </>
                        ) : (
                          "Proceder al Pago Seguro"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TRANSFER PAYMENT TAB */}
              <TabsContent value="transfer" className="space-y-4 outline-none border-0 p-0 m-0">
                <TransferForm
                  bankDetails={bankDetails}
                  total={dopTotal}
                  currency="DOP"
                  uploading={uploading}
                  file={file}
                  setFile={setFile}
                  notes={notes}
                  setNotes={setNotes}
                  handleSubmit={handleSubmit}
                />
              </TabsContent>
            </Tabs>
          ) : (
            /* ONLY TRANSFER FORM AVAILABLE */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs flex gap-2.5">
                <Info className="size-4 shrink-0 mt-0.5" />
                <p>
                  Tu pedido contiene complementos que no implican una suscripción de plan ni compras prepagadas de e-CF. Los pagos con tarjeta están disponibles únicamente al suscribir planes de HUB o comprar bloques de e-CFs. Por favor realiza el pago vía transferencia.
                </p>
              </div>

              <TransferForm
                bankDetails={bankDetails}
                total={dopTotal}
                currency="DOP"
                uploading={uploading}
                file={file}
                setFile={setFile}
                notes={notes}
                setNotes={setNotes}
                handleSubmit={handleSubmit}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TransferFormProps {
  bankDetails: any;
  total: number;
  currency: string;
  uploading: boolean;
  file: File | null;
  setFile: (file: File | null) => void;
  notes: string;
  setNotes: (notes: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
}

function TransferForm({
  bankDetails,
  total,
  currency,
  uploading,
  file,
  setFile,
  notes,
  setNotes,
  handleSubmit,
}: TransferFormProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800/80 rounded-2xl p-6 space-y-6">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-brand-ink dark:text-white">Pago por Transferencia</h3>
        <p className="text-xs text-brand-ink-mute dark:text-slate-400">
          Transfiere a una de nuestras cuentas bancarias e ingresa los detalles del comprobante para activar tus recursos.
        </p>
      </div>

      {/* Bank Account info card */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/40 dark:border-sky-950/20 dark:bg-sky-950/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">Cuentas Destinatarias</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <p className="font-semibold text-brand-ink dark:text-white">
              {bankDetails?.bank_name || "Banco Popular Dominicano"}
            </p>
            <p className="text-brand-ink-secondary dark:text-slate-350">
              Titular: {bankDetails?.account_holder || "Fintral SRL"}
            </p>
            <p className="text-brand-ink-secondary dark:text-slate-350 font-mono font-medium">
              Cuenta: {bankDetails?.account_number || "123-456789-01"}
            </p>
          </div>
          <div className="text-[11px] text-brand-ink-mute dark:text-slate-400 flex items-end">
            Transfiere el monto exacto de{" "}
            <span className="font-bold text-brand-ink dark:text-white ml-1">
              {total.toLocaleString("es-DO", { style: "currency", currency })}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Upload field */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-brand-ink dark:text-white">
            Comprobante de transferencia
          </Label>
          <div
            className={cn(
              "relative rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
              file
                ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-800/40 dark:bg-emerald-950/10"
                : "border-brand-hairline hover:border-brand-primary/50 dark:border-slate-800 dark:hover:border-sky-400/50 bg-brand-canvas-soft/10 dark:bg-slate-950/20"
            )}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="size-6 text-emerald-500" />
                <p className="text-xs font-medium text-brand-ink dark:text-white truncate max-w-[300px]">
                  {file.name}
                </p>
                <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-7 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg mt-1"
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                  }}
                >
                  <X className="size-3.5 mr-1" />
                  Quitar archivo
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2.5 cursor-pointer w-full h-full py-2">
                <Upload className="size-6 text-brand-ink-mute dark:text-slate-400" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-brand-ink dark:text-slate-200">
                    Haz clic para seleccionar el comprobante
                  </p>
                  <p className="text-[10px] text-brand-ink-mute dark:text-slate-400">
                    Formatos soportados: PNG, JPG, PDF (Máx. 10MB)
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>
        </div>

        {/* Notes area */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-brand-ink dark:text-white">
            Notas (opcional)
          </Label>
          <Textarea
            placeholder="Introduce el banco de origen o número de referencia de la transferencia..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs min-h-[70px] rounded-xl border-brand-hairline focus:border-brand-primary dark:border-slate-800"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 py-3 px-7 min-w-[120px] rounded-xl text-sm font-semibold gap-2 bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.98] transition-all duration-100"
          disabled={uploading || !file}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Banknote className="size-4" />
          )}
          {uploading ? "Enviando comprobante..." : `Enviar comprobante de ${total.toLocaleString("es-DO", { style: "currency", currency })}`}
        </Button>
      </form>
    </div>
  );
}
