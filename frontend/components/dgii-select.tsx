"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferenceData } from "@/hooks/use-reference-data";

interface DgiiSelectProps {
  domain: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  includeNone?: boolean;
  noneLabel?: string;
}

export function DgiiSelect({
  domain,
  value,
  onChange,
  placeholder = "Seleccionar",
  disabled = false,
  includeNone = true,
  noneLabel = "Sin especificar",
}: DgiiSelectProps) {
  const { data: items, isLoading } = useReferenceData(domain);
  const selectValue = includeNone ? value : value === "none" ? undefined : value;

  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }

  return (
    <Select value={selectValue} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && (
          <SelectItem value="none">{noneLabel}</SelectItem>
        )}
        {(items ?? []).map((item) => (
          <SelectItem key={item.code} value={item.code}>
            {item.code} — {item.label_es}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
