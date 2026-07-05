"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Fullscreen,
  Minimize2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceImageViewerProps {
  invoiceId: string;
  orgId?: string;
  filename?: string;
  fileType?: string;
  className?: string;
}

export function InvoiceImageViewer({
  invoiceId,
  orgId,
  filename,
  fileType,
  className,
}: InvoiceImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const ext = filename?.split(".").pop()?.toLowerCase() || fileType || "";
  const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext);
  const isPdf = ext === "pdf";

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.4, 10));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = s / 1.4;
      if (next < 0.25) return 0.25;
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [scale, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers for mobile
  const lastTouchRef = useRef<{ dist: number | null; x: number; y: number }>({
    dist: null,
    x: 0,
    y: 0,
  });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        lastTouchRef.current.dist = dist;
      } else if (e.touches.length === 1 && scale > 1) {
        lastTouchRef.current.x = e.touches[0].clientX - position.x;
        lastTouchRef.current.y = e.touches[0].clientY - position.y;
      }
    },
    [scale, position]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchRef.current.dist) {
          const factor = dist / lastTouchRef.current.dist;
          setScale((prev) => Math.min(Math.max(prev * factor, 0.25), 10));
        }
        lastTouchRef.current.dist = dist;
      } else if (e.touches.length === 1 && scale > 1) {
        setPosition({
          x: e.touches[0].clientX - lastTouchRef.current.x,
          y: e.touches[0].clientY - lastTouchRef.current.y,
        });
      }
    },
    [scale]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchRef.current.dist = null;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch {
        // Fullscreen not supported
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // Keep refs in sync so the native wheel listener always has latest values
  const positionRef = useRef(position);
  positionRef.current = position;

  // Native wheel listener with { passive: false } to prevent page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.12 : 1 / 1.12;

      setScale((prev) => {
        const next = Math.min(Math.max(prev * factor, 0.25), 10);
        const pos = positionRef.current;
        const imageCenterX = rect.width / 2 + pos.x;
        const imageCenterY = rect.height / 2 + pos.y;
        const offsetX = (mouseX - imageCenterX) * (1 - next / prev);
        const offsetY = (mouseY - imageCenterY) * (1 - next / prev);

        setPosition((p) => ({
          x: p.x + offsetX,
          y: p.y + offsetY,
        }));

        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const fileUrl = `/invoices/${invoiceId}/file${orgId ? `?org_id=${orgId}` : ""}`;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-xl bg-muted/20 border border-border select-none",
        isFullscreen ? "bg-black/95" : "",
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Toolbar */}
      <div
        className={cn(
          "absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border bg-background/90 backdrop-blur-sm p-1 shadow-sm transition-opacity",
          isDragging ? "opacity-0" : "opacity-100"
        )}
      >
        <button
          type="button"
          onClick={zoomOut}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Alejar"
          aria-label="Alejar"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <span className="min-w-[3ch] text-center text-[10px] font-medium tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Acercar"
          aria-label="Acercar"
        >
          <ZoomIn className="size-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={resetView}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Restablecer zoom"
          aria-label="Restablecer zoom"
        >
          <RotateCw className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          {isFullscreen ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Fullscreen className="size-3.5" />
          )}
        </button>
      </div>

      {/* Zoom indicator */}
      {scale > 1 && (
        <div className="absolute bottom-3 left-3 z-20 rounded-md bg-background/80 backdrop-blur-sm px-2 py-1 text-[10px] font-medium text-muted-foreground border shadow-sm">
          Arrastra para mover
        </div>
      )}

      {/* Content */}
      {isPdf ? (
        <iframe
          src={`${fileUrl}#toolbar=0`}
          className="h-full w-full border-0"
          title="Previsualización PDF"
        />
      ) : isImage ? (
        <>
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {imageError ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Loader2 className="size-5" />
              </div>
              <p className="text-xs font-medium text-foreground">
                No se pudo cargar la imagen
              </p>
              <p className="text-[10px] text-muted-foreground max-w-[200px]">
                El archivo puede haber sido eliminado o el enlace ha expirado.
              </p>
            </div>
          ) : (
            <img
              ref={imageRef}
              src={fileUrl}
              alt={filename || "Previsualización de factura"}
              draggable={false}
              onLoad={(e) => {
                setImageLoaded(true);
                const img = e.currentTarget;
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              onError={() => setImageError(true)}
              className={cn(
                "max-h-full max-w-full transition-transform duration-75",
                imageLoaded ? "opacity-100" : "opacity-0",
                isDragging ? "cursor-grabbing" : scale > 1 ? "cursor-grab" : "cursor-default"
              )}
              style={{
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              }}
            />
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Loader2 className="size-5" />
          </div>
          <p className="text-xs font-medium text-foreground">
            Previsualización no disponible
          </p>
          <p className="text-[10px] text-muted-foreground max-w-[240px]">
            {ext === "xml"
              ? "Documento e-CF digital validado por firma electrónica."
              : "Este tipo de archivo no admite previsualización visual."}
          </p>
        </div>
      )}

      {/* File type badge */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
        {isImage && (
          <span className="rounded-md bg-background/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-muted-foreground border shadow-sm">
            {naturalSize.w > 0
              ? `${naturalSize.w}×${naturalSize.h}`
              : filename?.split(".").pop()?.toUpperCase() || "IMG"}
          </span>
        )}
      </div>
    </div>
  );
}
