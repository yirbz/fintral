"use client";

import Link from "next/link";
import { Upload, Link2, ScanSearch } from "lucide-react";

interface UploadNavProps {
  active: "upload" | "links" | "revisions";
  draftsCount?: number;
}

export function UploadNav({ active, draftsCount = 0 }: UploadNavProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link
        href="/dashboard/upload"
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-all ${
          active === "upload"
            ? "border border-border/40 bg-background shadow-sm text-foreground"
            : "border border-transparent text-muted-foreground hover:text-foreground hover:border-border/40 hover:bg-background"
        }`}
      >
        <Upload className="size-3.5" />
        Cargar Archivos
      </Link>
      <Link
        href="/dashboard/upload/temporary-links"
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-all ${
          active === "links"
            ? "border border-border/40 bg-background shadow-sm text-foreground"
            : "border border-transparent text-muted-foreground hover:text-foreground hover:border-border/40 hover:bg-background"
        }`}
      >
        <Link2 className="size-3.5" />
        Enviar Enlace
      </Link>
      <Link
        href="/dashboard/upload/revisions"
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-all relative ${
          active === "revisions"
            ? "border border-border/40 bg-background shadow-sm text-foreground"
            : "border border-transparent text-muted-foreground hover:text-foreground hover:border-border/40 hover:bg-background"
        }`}
      >
        <ScanSearch className="size-3.5" />
        Revisiones
        {draftsCount > 0 && (
          <span className="flex h-4 min-w-4 px-1.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {draftsCount}
          </span>
        )}
      </Link>
    </div>
  );
}
