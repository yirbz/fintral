import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Loader2, ShieldCheck, ShieldX, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Invoice } from "@/lib/types";

type ValidationStatus =
  | "unchecked"
  | "accepted"
  | "rejected"
  | "voided"
  | "registered"
  | "pending"
  | "not_found"
  | "error";

const VALIDATION_CONFIG: Record<ValidationStatus, {
  label: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
}> = {
  unchecked: {
    label: "Sin validar",
    description: "Esta factura no ha sido validada contra la DGII",
    icon: <HelpCircle className="size-3" />,
    badge: "bg-slate-100 text-slate-600",
  },
  accepted: {
    label: "Aceptado DGII",
    description: "El comprobante fue recibido y aceptado por la DGII",
    icon: <CheckCircle2 className="size-3" />,
    badge: "bg-emerald-500/10 text-emerald-600",
  },
  rejected: {
    label: "Rechazado DGII",
    description: "El comprobante fue rechazado por la DGII",
    icon: <XCircle className="size-3" />,
    badge: "bg-red-500/10 text-red-600",
  },
  voided: {
    label: "Anulado DGII",
    description: "El comprobante ha sido anulado en la DGII",
    icon: <ShieldX className="size-3" />,
    badge: "bg-red-500/10 text-red-600",
  },
  registered: {
    label: "Registrado DGII",
    description: "El comprobante está registrado en la DGII",
    icon: <ShieldCheck className="size-3" />,
    badge: "bg-sky-500/10 text-sky-600",
  },
  pending: {
    label: "Pendiente DGII",
    description: "El comprobante está pendiente de procesamiento en la DGII",
    icon: <Clock className="size-3" />,
    badge: "bg-amber-500/10 text-amber-600",
  },
  not_found: {
    label: "No encontrado",
    description: "No se encontró el comprobante en la DGII",
    icon: <AlertTriangle className="size-3" />,
    badge: "bg-amber-500/10 text-amber-600",
  },
  error: {
    label: "Error validación",
    description: "Error al consultar la DGII",
    icon: <Loader2 className="size-3" />,
    badge: "bg-red-500/10 text-red-600",
  },
};

export function DgiiValidationBadge({
  status,
  showLabel = true,
}: {
  status: string | null | undefined;
  showLabel?: boolean;
}) {
  const normalizedStatus = (status || "unchecked") as ValidationStatus;
  const config = VALIDATION_CONFIG[normalizedStatus] ?? VALIDATION_CONFIG.unchecked;

  return (
    <Badge variant="outline" className={`gap-1 font-normal ${config.badge}`}>
      {config.icon}
      {showLabel && config.label}
    </Badge>
  );
}

export function DgiiValidationStatusCard({
  invoice,
  onValidate,
  isValidating,
}: {
  invoice: Invoice;
  onValidate?: () => void;
  isValidating?: boolean;
}) {
  const status = (invoice.dgii_validation_status ?? "unchecked") as ValidationStatus;
  const config = VALIDATION_CONFIG[status] ?? VALIDATION_CONFIG.unchecked;

  const detail = invoice.dgii_validation_detail
    ? (() => {
        try {
          return JSON.parse(invoice.dgii_validation_detail) as Record<string, string>;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h3 className="text-sm font-medium">Validación DGII</h3>
        </div>
        <DgiiValidationBadge status={status} />
      </div>

      <p className="text-xs text-muted-foreground">{config.description}</p>

      {detail && (
        <div className="space-y-1 text-xs">
          {detail.razon_social && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Razón Social</span>
              <span className="font-medium">{detail.razon_social}</span>
            </div>
          )}
          {detail.estado_dgii && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado DGII</span>
              <span className="font-medium">{detail.estado_dgii}</span>
            </div>
          )}
          {detail.validated_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Validado</span>
              <span className="font-medium">
                {new Date(detail.validated_at).toLocaleString("es-DO")}
              </span>
            </div>
          )}
        </div>
      )}

      {onValidate && (
        <button
          type="button"
          onClick={onValidate}
          disabled={isValidating}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {isValidating ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ShieldCheck className="size-3" />
          )}
          {isValidating ? "Validando con DGII..." : "Validar ahora con DGII"}
        </button>
      )}
    </div>
  );
}
