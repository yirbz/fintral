"use client";

import { useState, useCallback, useRef } from "react";
import { dgiiService } from "@/lib/services/dgii";
import { consultRncAction } from "@/app/actions/dgii";

export type RncType = "rnc" | "cedula" | "unknown";

export interface RncValidationResult {
  /** Cleaned RNC/Cédula digits */
  clean: string;
  /** Whether it's an RNC (9 digits) or Cédula (11 digits) */
  type: RncType;
  /** Check-digit validation passed */
  isValid: boolean;
  /** Error message if any */
  error: string | null;
  /** DGII lookup result (name, status, etc.) */
  taxpayer: {
    name: string | null;
    tradeName: string | null;
    status: string | null;
    isElectronicBillingRegistered: boolean;
  } | null;
  /** Whether DGII lookup is in progress */
  isLookingUp: boolean;
  /** DGII lookup error */
  lookupError: string | null;
}

const INITIAL: RncValidationResult = {
  clean: "",
  type: "unknown",
  isValid: false,
  error: null,
  taxpayer: null,
  isLookingUp: false,
  lookupError: null,
};

interface UseRNCValidationOptions {
  onLookupComplete?: (data: NonNullable<RncValidationResult["taxpayer"]>) => void;
}

export function useRNCValidation(opts?: UseRNCValidationOptions) {
  const [result, setResult] = useState<RncValidationResult>(INITIAL);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Validate RNC/Cédula from raw input */
  const validate = useCallback(
    (raw: string) => {
      const clean = raw.replace(/\D/g, "");

      if (!clean) {
        setResult(INITIAL);
        return;
      }

      const type: RncType =
        clean.length === 9 ? "rnc" : clean.length === 11 ? "cedula" : "unknown";

      // Validate check digit
      let isValid = false;
      let error: string | null = null;

      if (type === "unknown") {
        error = "Debe tener 9 dígitos (RNC) o 11 dígitos (Cédula)";
      } else {
        try {
          isValid = dgiiService.isValidRNC(clean);
          if (!isValid) {
            error =
              type === "rnc"
                ? "RNC inválido — el dígito verificador no coincide"
                : "Cédula inválida — el dígito verificador no coincide";
          }
        } catch {
          error = "Error al validar";
        }
      }

      setResult({
        clean,
        type,
        isValid,
        error,
        taxpayer: null,
        isLookingUp: false,
        lookupError: null,
      });

      return { clean, type, isValid, error };
    },
    []
  );

  /** Look up taxpayer info from DGII via Server Action (avoids CORS) */
  const lookup = useCallback(
    async (rncValue?: string) => {
      const value = rncValue ?? result.clean;
      if (!value || value.length < 9) return null;

      setResult((prev) => ({ ...prev, isLookingUp: true, lookupError: null }));

      try {
        // Use Server Action to bypass CORS — falls back to client-side if server action fails
        let taxpayer = await consultRncAction(value);

        // If Server Action returns null (e.g. first-time cold start where dgii-utils isn't loaded),
        // fall back to direct client-side DGII scraping
        if (!taxpayer) {
          taxpayer = await dgiiService.consultTaxpayer(value);
        }

        if (taxpayer) {
          setResult((prev) => ({
            ...prev,
            isLookingUp: false,
            taxpayer: {
              name: taxpayer.name,
              tradeName: taxpayer.tradeName ?? null,
              status: taxpayer.status,
              isElectronicBillingRegistered: taxpayer.isElectronicBillingRegistered,
            },
            lookupError: null,
          }));
          opts?.onLookupComplete?.({
            name: taxpayer.name,
            tradeName: taxpayer.tradeName ?? null,
            status: taxpayer.status,
            isElectronicBillingRegistered: taxpayer.isElectronicBillingRegistered,
          });
          return taxpayer;
        } else {
          const msg =
            value.length === 9
              ? "No se encontró información para este RNC en la DGII"
              : "No se encontró información para esta Cédula en la DGII";
          setResult((prev) => ({
            ...prev,
            isLookingUp: false,
            lookupError: msg,
          }));
          return null;
        }
      } catch {
        setResult((prev) => ({
          ...prev,
          isLookingUp: false,
          lookupError: "Error al consultar la DGII. Intenta de nuevo.",
        }));
        return null;
      }
    },
    [result.clean, opts]
  );

  /** Debounced lookup — call on input change */
  const debouncedLookup = useCallback(
    (raw: string) => {
      validate(raw);

      if (lookupTimer.current) clearTimeout(lookupTimer.current);
      const clean = raw.replace(/\D/g, "");
      if (clean.length === 9 || clean.length === 11) {
        lookupTimer.current = setTimeout(() => lookup(clean), 800);
      }
    },
    [validate, lookup]
  );

  const reset = useCallback(() => {
    setResult(INITIAL);
  }, []);

  return {
    ...result,
    validate,
    lookup,
    debouncedLookup,
    reset,
  };
}
