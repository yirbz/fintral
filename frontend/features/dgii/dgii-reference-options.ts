"use client";

import { useMemo } from "react";

import { useReferenceData } from "@/hooks/use-reference-data";
import type { ReferenceDataItem } from "@/lib/api/reference-data";

export type SelectOption = { value: string; label: string };

export type DgiiReferenceOptions = {
  goodsServicesTypes: SelectOption[];
  paymentMethods: SelectOption[];
  isrRetentionTypes: SelectOption[];
  incomeTypes: SelectOption[];
  cancellationTypes: SelectOption[];
};

export type DgiiReferenceLoadingState = {
  goodsServicesTypes: boolean;
  paymentMethods: boolean;
  isrRetentionTypes: boolean;
  incomeTypes: boolean;
  cancellationTypes: boolean;
};

const DGII_REFERENCE_DOMAINS = {
  goodsServicesTypes: "goods_services_types",
  paymentMethods: "payment_methods",
  isrRetentionTypes: "isr_retention_types",
  incomeTypes: "income_types",
} as const;

const CANCELLATION_TYPES: SelectOption[] = [
  { value: "01", label: "01 - Deterioro" },
  { value: "02", label: "02 - Errores de impresión" },
  { value: "03", label: "03 - Impresión defectuosa" },
  { value: "04", label: "04 - Corrección información" },
  { value: "05", label: "05 - Cambio de productos" },
  { value: "06", label: "06 - Devolución de productos" },
  { value: "07", label: "07 - Omisión de productos" },
  { value: "08", label: "08 - Errores en secuencia NCF" },
  { value: "09", label: "09 - Por cese de operaciones" },
  { value: "10", label: "10 - Pérdida o hurto" },
];

function toReferenceOptions(items?: ReferenceDataItem[]): SelectOption[] {
  return (items ?? []).map((item) => ({
    value: item.code,
    label: `${item.code} - ${item.label_es}`,
  }));
}

export function getOptionLabel(
  options: SelectOption[] | undefined,
  value: string | null | undefined,
) {
  if (!value) return "";
  return options?.find((option) => option.value === value)?.label ?? value;
}

export function getResolvedOptions(
  options: SelectOption[] | undefined,
  value: string | null | undefined,
) {
  if (!value) return options ?? [];
  if (options?.some((option) => option.value === value)) return options;
  return [{ value, label: value }, ...(options ?? [])];
}

export function useDgiiReferenceOptions(): {
  options: DgiiReferenceOptions;
  loading: DgiiReferenceLoadingState;
} {
  const goodsServicesTypesQuery = useReferenceData(DGII_REFERENCE_DOMAINS.goodsServicesTypes);
  const paymentMethodsQuery = useReferenceData(DGII_REFERENCE_DOMAINS.paymentMethods);
  const isrRetentionTypesQuery = useReferenceData(DGII_REFERENCE_DOMAINS.isrRetentionTypes);
  const incomeTypesQuery = useReferenceData(DGII_REFERENCE_DOMAINS.incomeTypes);

  const options = useMemo<DgiiReferenceOptions>(() => ({
    goodsServicesTypes: toReferenceOptions(goodsServicesTypesQuery.data),
    paymentMethods: toReferenceOptions(paymentMethodsQuery.data),
    isrRetentionTypes: toReferenceOptions(isrRetentionTypesQuery.data),
    incomeTypes: toReferenceOptions(incomeTypesQuery.data),
    cancellationTypes: CANCELLATION_TYPES,
  }), [
    goodsServicesTypesQuery.data,
    paymentMethodsQuery.data,
    isrRetentionTypesQuery.data,
    incomeTypesQuery.data,
  ]);

  return {
    options,
    loading: {
      goodsServicesTypes: goodsServicesTypesQuery.isLoading,
      paymentMethods: paymentMethodsQuery.isLoading,
      isrRetentionTypes: isrRetentionTypesQuery.isLoading,
      incomeTypes: incomeTypesQuery.isLoading,
      cancellationTypes: false,
    },
  };
}
