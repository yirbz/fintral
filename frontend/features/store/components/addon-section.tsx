"use client";

import React, { useState } from "react";
import { PlanSummary, AddonsSummary } from "@/lib/api/plans";
import { AddonCard, AddonItem } from "./addon-card";
import { ConfirmAddonDialog } from "./confirm-addon-dialog";

interface AddonSectionProps {
  plan: PlanSummary | null;
  addons: AddonsSummary | undefined;
  cartItems: any[];
  onAddPrepayToCart: (quantity: number, pricePerBlockUsd: number) => void;
  onPurchaseDirect: (type: string, label: string, priceDop: number) => Promise<void>;
  isDirectLoading: boolean;
  exchangeRate: number;
}

export function AddonSection({
  plan,
  addons,
  cartItems,
  onAddPrepayToCart,
  onPurchaseDirect,
  isDirectLoading,
  exchangeRate,
}: AddonSectionProps) {
  const [confirmItem, setConfirmItem] = useState<AddonItem | null>(null);

  // Defining USD-first base prices for all addons
  const ecfPriceUsd = 15.99;
  const aiPriceUsd = 10.00;
  const storagePriceUsd = 5.00;
  const entityPriceUsd = 10.00;
  const userPriceUsd = 5.00;

  const list: AddonItem[] = [
    {
      type: "ecf_blocks",
      label: "Bloque 100 ECF",
      description: "100 documentos electrónicos adicionales para tus entidades.",
      priceUsd: ecfPriceUsd,
      priceDop: ecfPriceUsd * exchangeRate,
      isPrepay: true,
    },
    {
      type: "ai",
      label: "Bloques de IA",
      description: `Consultas de IA adicionales. ${addons?.ai_block_size || 500} consultas por bloque.`,
      priceUsd: aiPriceUsd,
      priceDop: aiPriceUsd * exchangeRate,
      isPrepay: false,
      currentCount: addons?.ai_blocks || 0,
    },
    {
      type: "storage",
      label: "Almacenamiento",
      description: `Almacenamiento adicional. ${(addons?.storage_block_mb || 10240) / 1024} GB por bloque.`,
      priceUsd: storagePriceUsd,
      priceDop: storagePriceUsd * exchangeRate,
      isPrepay: false,
      currentCount: addons?.storage_blocks || 0,
    },
    {
      type: "entity_slot",
      label: "Slot de Empresa",
      description: "Invita una empresa o entidad adicional a tu cuenta Fintral.",
      priceUsd: entityPriceUsd,
      priceDop: entityPriceUsd * exchangeRate,
      isPrepay: false,
      currentCount: plan ? (plan as any).addon_entity_slots || 0 : 0, // Fallback check
    },
    {
      type: "user_slot",
      label: "Slot de Usuario",
      description: "Permite que un usuario colaborador adicional acceda a tu cuenta.",
      priceUsd: userPriceUsd,
      priceDop: userPriceUsd * exchangeRate,
      isPrepay: false,
      currentCount: plan ? (plan as any).addon_user_slots || 0 : 0, // Fallback check
    },
  ];

  const handleAction = (item: AddonItem) => {
    if (item.isPrepay) {
      // Add ECF to cart
      onAddPrepayToCart(1, item.priceUsd);
    } else {
      // Open direct purchase confirmation dialog
      setConfirmItem(item);
    }
  };

  const handleConfirmDirect = async () => {
    if (!confirmItem) return;
    const item = confirmItem;
    setConfirmItem(null);
    await onPurchaseDirect(item.type, item.label, item.priceDop);
  };

  // Check if ECF block is currently in the cart
  const isEcfInCart = cartItems.some((i) => i.type === "ecf_blocks");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-medium text-brand-ink dark:text-white">
          Complementos disponibles
        </h3>
        <p className="text-xs text-brand-ink-mute dark:text-slate-400">
          Añade capacidad de facturas, consultas de IA, almacenamiento o usuarios colaboradores a tu plan.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {list.map((addon) => (
          <AddonCard
            key={addon.type}
            addon={addon}
            onAction={() => handleAction(addon)}
            isLoading={isDirectLoading}
            inCart={addon.type === "ecf_blocks" && isEcfInCart}
          />
        ))}
      </div>

      <ConfirmAddonDialog
        open={!!confirmItem}
        onOpenChange={(open) => {
          if (!open) setConfirmItem(null);
        }}
        label={confirmItem?.label || ""}
        priceUsd={confirmItem?.priceUsd || 0}
        priceDop={confirmItem?.priceDop || 0}
        confirmLabel="Comprar complemento"
        onConfirm={handleConfirmDirect}
        isLoading={isDirectLoading}
      />
    </div>
  );
}
