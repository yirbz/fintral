"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ShoppingCart, AlertTriangle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { getEcfBalance, getMyPlan } from "@/lib/api/plans";

export function EcfBalanceCard() {
  const { data: session } = useSession();
  const orgId = session?.organization?.id;
  const [buyOpen, setBuyOpen] = useState(false);

  const { data: balanceData } = useQuery({
    queryKey: ["ecf-balance", orgId],
    queryFn: () => getEcfBalance(orgId!),
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  const { data: planData } = useQuery({
    queryKey: ["plans", "my"],
    queryFn: getMyPlan,
    staleTime: 30_000,
  });

  const balance = balanceData?.balance ?? 0;
  const blockPrice = planData?.plan?.addon_ecf_block_price || 950;
  const isLow = balance < 10;

  function handleBuyBlocks(qty: number) {
    const totalPrice = blockPrice * qty;
    window.location.href = `/dashboard/store?add_ecf=${qty}&price=${totalPrice}`;
  }

  return (
    <>
      <div className={`rounded-lg border p-3 ${isLow ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20" : "border-border/60"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className={`size-4 ${isLow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium">Documentos ECF disponibles</span>
          </div>
          <span className={`font-mono text-sm tabular-nums font-semibold ${isLow ? "text-amber-600 dark:text-amber-400" : ""}`}>
            {balance}
          </span>
        </div>
        {isLow && (
          <div className="flex items-center gap-2 mt-2">
            <AlertTriangle className="size-3 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex-1">
              Quedan pocos documentos. Compra m&aacute;s para seguir emitiendo.
            </p>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 h-7 gap-1.5 text-xs"
          onClick={() => setBuyOpen(true)}
        >
          <Plus className="size-3" />
          Comprar m&aacute;s ECF
        </Button>
      </div>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading">Comprar documentos ECF</DialogTitle>
            <DialogDescription className="text-xs">
              Adquiere bloques de 100 documentos electr&oacute;nicos para seguir emitiendo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-between h-12 px-4"
              onClick={() => handleBuyBlocks(1)}
            >
              <span className="text-sm">1 bloque (100 docs)</span>
              <span className="font-mono text-sm tabular-nums">RD$ {blockPrice.toLocaleString("es-DO")}</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-between h-12 px-4"
              onClick={() => handleBuyBlocks(5)}
            >
              <span className="text-sm">5 bloques (500 docs)</span>
              <span className="font-mono text-sm tabular-nums">RD$ {(blockPrice * 5).toLocaleString("es-DO")}</span>
            </Button>
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Ser&aacute;s redirigido a la tienda para completar el pago.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
