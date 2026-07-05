"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  Building,
  Download,
  Printer,
  X,
  FileText,
  Receipt,
  User,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TransactionItem } from "@/lib/api/plans";

interface TransactionInvoiceModalProps {
  transaction: TransactionItem | null;
  isOpen: boolean;
  onClose: () => void;
  formatDate: (d: string | null) => string;
  formatAmount: (a: number, c: string) => string;
  organizationName: string;
  userEmail: string;
}

export function TransactionInvoiceModal({
  transaction,
  isOpen,
  onClose,
  formatDate,
  formatAmount,
  organizationName,
  userEmail,
}: TransactionInvoiceModalProps) {
  if (!transaction) return null;

  const handlePrint = () => {
    const printContent = document.getElementById("invoice-print-area");
    if (!printContent) return;
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Orden de Pago - ${transaction.id}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              font-feature-settings: 'ss01' on, 'tnum' on;
              background-color: #ffffff;
              color: #0d253d;
              padding: 2.5rem;
            }
            .no-print { display: none !important; }
            .grid { display: grid; grid-template-columns: 1.2fr 1.8fr; gap: 2.5rem; }
            .border-b { border-bottom: 1px solid #e3e8ee; }
            .text-muted { color: #64748d; }
            .font-mono { font-family: monospace; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .space-y-1 > * + * { margin-top: 0.25rem; }
            .space-y-4 > * + * { margin-top: 1rem; }
            .pb-4 { padding-bottom: 1rem; }
            .pt-4 { padding-top: 1rem; }
            .font-semibold { font-weight: 500; }
            .font-light { font-weight: 300; }
            .tracking-tight { letter-spacing: -0.02em; }
            .text-xl { font-size: 1.25rem; }
            .text-xs { font-size: 0.75rem; }
            .text-sm { font-size: 0.875rem; }
            .badge { display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 600; font-size: 0.7rem; border: 1px solid #e3e8ee; text-transform: uppercase; }
            .badge-emerald { background-color: #ecfdf5; color: #047857; border-color: #a7f3d0; }
            .badge-red { background-color: #fef2f2; color: #b91c1c; border-color: #fecaca; }
            .badge-amber { background-color: #fffbeb; color: #b45309; border-color: #fde68a; }
            .item-row { display: flex; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid #f6f9fc; }
            .item-label { font-weight: 500; color: #0d253d; }
            .item-details { font-size: 0.75rem; color: #64748d; margin-top: 0.125rem; }
            .totals-container { margin-left: auto; width: 100%; max-width: 18rem; margin-top: 1.5rem; }
            .total-row { display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: 0.75rem; }
            .grand-total { font-size: 1.125rem; font-weight: 300; color: #0ea5e9; border-top: 1px solid #e3e8ee; padding-top: 0.75rem; margin-top: 0.5rem; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getCleanStatusBadge = (status: string) => {
    const cleanStatus = status.toLowerCase();
    if (cleanStatus === "verified" || cleanStatus === "success" || cleanStatus === "succeeded") {
      return (
        <span className="badge badge-emerald inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 shrink-0">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Completado
        </span>
      );
    }
    if (cleanStatus === "rejected" || cleanStatus === "failed") {
      return (
        <span className="badge badge-red inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30 shrink-0">
          <span className="size-1.5 rounded-full bg-red-500" />
          Rechazado
        </span>
      );
    }
    return (
      <span className="badge badge-amber inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 shrink-0">
        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
        Pendiente
      </span>
    );
  };

  const items = transaction.items || [];
  const hasItems = items.length > 0;
  const refCode = transaction.reference || transaction.id.replace(/^(card_|transfer_)/, "").substring(0, 10).toUpperCase();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl lg:max-w-5xl w-[92vw] bg-white dark:bg-slate-900 border border-brand-hairline dark:border-slate-800 rounded-2xl p-0 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-250 ease-out">
        
        {/* Scrollable grid container for 16:9 and wide viewports */}
        <div id="invoice-print-area" className="p-6 sm:p-10 overflow-y-auto max-h-[82vh] min-w-0">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 min-w-0">
            
            {/* COLUMN 1: Metadata, Status & Reference (Span 5 on Desktop) */}
            <div className="md:col-span-5 flex flex-col justify-between space-y-6 min-w-0 border-b md:border-b-0 pb-6 md:pb-0 md:pr-8 md:border-r border-brand-hairline dark:border-slate-800/60">
              
              <div className="space-y-6 min-w-0">
                {/* Header Title Block */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 text-brand-primary">
                    <Receipt className="size-5" />
                    <span className="text-[10px] font-semibold tracking-widest uppercase">Fintral Hub</span>
                  </div>
                  <h2 className="text-2xl font-light text-brand-ink dark:text-white tracking-tight font-sans">
                    Orden de Facturación<span className="text-brand-primary">.</span>
                  </h2>
                  <p className="text-xs text-brand-ink-mute dark:text-slate-400 font-mono tracking-tight break-all">
                    Ref ID: {refCode}
                  </p>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/40 p-4 rounded-xl border border-brand-hairline/60 dark:border-slate-850">
                  <span className="text-xs font-medium text-brand-ink-mute dark:text-slate-400">Estado:</span>
                  {getCleanStatusBadge(transaction.status)}
                </div>

                {/* Structured Metadata Blocks */}
                <div className="space-y-4 text-xs text-brand-ink-secondary dark:text-slate-350 min-w-0">
                  <div className="p-4 rounded-xl border border-brand-hairline/50 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-950/20 space-y-3 min-w-0">
                    <div className="min-w-0">
                      <span className="text-[9px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider block mb-1">
                        Cliente Facturado
                      </span>
                      <span 
                        className="font-semibold text-brand-ink dark:text-white text-xs block truncate max-w-full" 
                        title={userEmail}
                      >
                        {userEmail}
                      </span>
                    </div>

                    {organizationName && (
                      <div className="min-w-0 pt-2 border-t border-brand-hairline/50 dark:border-slate-800/40">
                        <span className="text-[9px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider block mb-1">
                          Entidad Corporativa
                        </span>
                        <span 
                          className="font-medium text-brand-ink-secondary dark:text-slate-200 block truncate max-w-full" 
                          title={organizationName}
                        >
                          {organizationName}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-brand-hairline/50 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-950/20 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[9px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider block mb-1">
                        Emisión
                      </span>
                      <span className="font-medium text-brand-ink dark:text-slate-250 tabular-nums">
                        {formatDate(transaction.date)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider block mb-1">
                        Vía Liquidación
                      </span>
                      <span className="font-semibold text-brand-ink dark:text-white flex items-center gap-1 max-w-full truncate">
                        {transaction.type === "card" ? (
                          <>
                            <CreditCard className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="truncate">Tarjeta</span>
                          </>
                        ) : (
                          <>
                            <Building className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="truncate">Transferencia</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative Legal Text */}
              <div className="hidden md:block pt-6">
                <p className="text-[10px] text-brand-ink-mute dark:text-slate-500 leading-relaxed font-sans">
                  Fintral está regulado bajo la normativa DGII. Este documento constituye un comprobante digital consolidado del pago efectuado en la plataforma.
                </p>
              </div>
            </div>

            {/* COLUMN 2: Concepts breakdown & Totals (Span 7 on Desktop) */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-6 min-w-0">
              
              {/* Concept items List */}
              <div className="space-y-3 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold text-brand-ink-mute dark:text-slate-400 uppercase tracking-wider">
                    Desglose de Conceptos Adquiridos
                  </h3>
                  {hasItems && items.length > 3 && (
                    <span className="text-[10px] text-brand-ink-mute dark:text-slate-400 font-medium">
                      {items.length} elementos
                    </span>
                  )}
                </div>

                <div 
                  className={cn(
                    "divide-y divide-brand-hairline dark:divide-slate-800/50 border-y border-brand-hairline dark:border-slate-800/60 min-w-0",
                    items.length > 3 ? "max-h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-850" : ""
                  )}
                  style={{
                    maskImage: items.length > 3 ? "linear-gradient(to bottom, black 85%, transparent 100%)" : undefined,
                    WebkitMaskImage: items.length > 3 ? "linear-gradient(to bottom, black 85%, transparent 100%)" : undefined
                  }}
                >
                  {hasItems ? (
                    items.map((item, idx) => (
                      <div key={idx} className="py-3.5 flex justify-between items-start gap-4 text-xs group transition-colors min-w-0">
                        <div className="space-y-1 min-w-0 flex items-start gap-3">
                          <div className="mt-1.5 size-1.5 rounded-full bg-brand-primary/50 group-hover:bg-brand-primary transition-colors shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-brand-ink dark:text-white truncate" title={item.label || item.type}>
                              {item.label || item.type}
                            </p>
                            <p className="text-[11px] text-brand-ink-mute dark:text-slate-400 tabular-nums">
                              Cantidad: {item.quantity || 1} &bull; Precio: {formatAmount(item.price_cents / 100, transaction.currency)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right font-semibold text-brand-ink dark:text-white tabular-nums shrink-0 ml-auto pl-2">
                          {formatAmount((item.price_cents * (item.quantity || 1)) / 100, transaction.currency)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 flex justify-between items-center gap-4 text-xs group transition-colors min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-1.5 rounded-full bg-brand-primary/50 group-hover:bg-brand-primary transition-colors shrink-0" />
                        <p className="font-semibold text-brand-ink dark:text-white truncate" title={transaction.description}>
                          {transaction.description}
                        </p>
                      </div>
                      <div className="text-right font-semibold text-brand-ink dark:text-white tabular-nums shrink-0 ml-auto pl-2">
                        {formatAmount(transaction.amount, transaction.currency)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Widescreen Totals Box */}
              <div className="bg-slate-50/50 dark:bg-slate-950/30 p-4 rounded-xl border border-brand-hairline/60 dark:border-slate-800/40 min-w-0">
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-brand-ink-mute dark:text-slate-400">
                    <span>Subtotal Neto</span>
                    <span className="tabular-nums font-mono">{formatAmount(transaction.amount, transaction.currency)}</span>
                  </div>
                  
                  <div className="flex justify-between border-t border-brand-hairline/80 dark:border-slate-800/60 pt-3 text-sm text-brand-ink dark:text-white items-baseline">
                    <span className="font-semibold flex items-center gap-1.5">
                      Monto Consolidado
                      <ArrowRight className="size-3 text-brand-ink-mute" />
                    </span>
                    <span className="text-brand-primary text-xl font-light tracking-tight tabular-nums">
                      {formatAmount(transaction.amount, transaction.currency)}
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* Footer Actions (Standard styling with press scaling) */}
        <div className="no-print bg-slate-50 dark:bg-slate-950 border-t border-brand-hairline dark:border-slate-800/80 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="w-full sm:w-auto">
            {transaction.receipt_url && (
              <a
                href={transaction.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl border border-brand-hairline dark:border-slate-800 text-xs font-semibold text-brand-ink-secondary dark:text-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 active:scale-[0.97] transition-all duration-150 w-full sm:w-auto @media(hover:hover):hover:shadow-sm"
              >
                <Download className="size-3.5" />
                <span>Descargar Comprobante</span>
              </a>
            )}
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-xl text-xs font-semibold gap-1.5 w-full sm:w-auto bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 active:scale-[0.97] transition-all duration-150"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              Imprimir / PDF
            </Button>
            
            <Button
              size="sm"
              className="h-9 px-5 rounded-xl text-xs font-semibold w-full sm:w-auto bg-brand-primary text-white hover:bg-brand-primary-deep active:scale-[0.97] transition-all duration-150"
              onClick={onClose}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
