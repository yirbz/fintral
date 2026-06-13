"use client";

import React, { useEffect, useState } from "react";
import { Share, X, Download, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if dismissed recently (within 7 days)
    const dismissedAt = localStorage.getItem("fintral_pwa_dismissed_at");
    if (dismissedAt) {
      const parsed = new Date(dismissedAt);
      const diff = Date.now() - parsed.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      if (days < 7) {
        return;
      }
    }

    // Check if already running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // iOS Safari PWA installation prompt
    if (isIosDevice) {
      // iOS Chrome/Firefox do not support PWA installation, only Safari does
      const isSafari = /safari/.test(userAgent) && !/crios|fxios|optios|fennec|yabrowser/.test(userAgent);
      if (isSafari) {
        setIsVisible(true);
      }
    }

    // Listen for beforeinstallprompt (Android / Desktop Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show banner on mobile screens or if we match mobile UA
      const ua = window.navigator.userAgent.toLowerCase();
      const isMobileDevice = /iphone|ipad|ipod|android|webos|blackberry|iemobile|opera mini/.test(ua);
      const isMobileWidth = window.innerWidth < 1024;
      if (isMobileDevice || isMobileWidth) {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleAction = async () => {
    if (isIos) {
      // Trigger the iOS installation guidance drawer
      setShowIosGuide(true);
    } else if (deferredPrompt) {
      // Trigger Android / Desktop installation prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install prompt outcome: ${outcome}`);
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("fintral_pwa_dismissed_at", new Date().toISOString());
    setIsVisible(false);
  };

  if (!isVisible) return null;

  // Render iOS Smart Banner (Top Banner)
  if (isIos) {
    return (
      <>
        {/* iOS Smart App Banner Style */}
        <div
          className="fixed top-0 left-0 right-0 z-[100] flex w-full items-center justify-between border-b border-black/10 dark:border-white/10 bg-[#f8f8f8]/95 dark:bg-[#1d1d1f]/95 backdrop-blur-md px-3 shadow-xs transition-all duration-300 animate-in fade-in slide-in-from-top-4"
          style={{
            paddingTop: "var(--safe-area-top, 0px)",
            height: "calc(3.75rem + var(--safe-area-top, 0px))",
          }}
        >
          <div className="flex items-center gap-2.5">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-[#8e8e93] transition-colors active:scale-90"
              aria-label="Cerrar banner"
            >
              <X className="h-3 w-3 stroke-[2.5]" />
            </button>

            {/* App Icon with iOS rounded squircle mask */}
            <div className="h-10 w-10 shrink-0 rounded-[9px] bg-white border border-black/5 dark:border-white/5 shadow-xs overflow-hidden flex items-center justify-center">
              <img
                src="/icons/icon-192.png"
                alt="Fintral"
                className="h-8 w-8 object-contain"
              />
            </div>

            {/* App Info */}
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-neutral-900 dark:text-white leading-tight">
                Fintral
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                Fintral, SRL
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="flex text-amber-500">
                  <Star className="h-2 w-2 fill-current" />
                  <Star className="h-2 w-2 fill-current" />
                  <Star className="h-2 w-2 fill-current" />
                  <Star className="h-2 w-2 fill-current" />
                  <Star className="h-2 w-2 fill-current" />
                </div>
                <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-medium">
                  GRATIS
                </span>
              </div>
            </div>
          </div>

          {/* iOS-style OBTENER (GET) button */}
          <button
            onClick={handleAction}
            className="h-7 rounded-full bg-[#007aff]/10 dark:bg-[#0a84ff]/20 text-[#007aff] dark:text-[#0a84ff] hover:bg-[#007aff]/20 dark:hover:bg-[#0a84ff]/30 px-5 text-[11px] font-bold tracking-tight shadow-2xs transition-transform active:scale-95 duration-100"
          >
            OBTENER
          </button>
        </div>

        {/* iOS Installation Guide Drawer */}
        <Drawer open={showIosGuide} onOpenChange={setShowIosGuide}>
          <DrawerContent className="pb-6">
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-base font-bold text-foreground">Instalar Fintral en iOS</DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground">
                Sigue estos sencillos pasos para añadir Fintral a tu pantalla de inicio en Safari.
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex flex-col gap-3 px-6 py-2 text-xs">
              {/* Step 1 */}
              <div className="flex items-start gap-3 bg-muted/40 p-3 rounded-xl border border-border/40">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                  1
                </span>
                <p className="leading-relaxed text-muted-foreground">
                  Toca el botón <strong className="text-foreground">Compartir</strong>{" "}
                  <Share className="inline-block mx-1 h-4 w-4 text-[#007aff]" /> en la barra inferior de Safari.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3 bg-muted/40 p-3 rounded-xl border border-border/40">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                  2
                </span>
                <p className="leading-relaxed text-muted-foreground">
                  Desplázate hacia abajo y selecciona{" "}
                  <strong className="text-foreground">"Agregar a pantalla de inicio"</strong>{" "}
                  <Download className="inline-block mx-1 h-4 w-4 text-foreground" />.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3 bg-muted/40 p-3 rounded-xl border border-border/40">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                  3
                </span>
                <p className="leading-relaxed text-muted-foreground font-medium">
                  Confirma tocando <strong className="text-foreground">"Agregar"</strong> en la esquina superior derecha. ¡Listo!
                </p>
              </div>
            </div>

            <DrawerFooter className="pt-2 px-6">
              <DrawerClose asChild>
                <Button variant="outline" className="w-full text-xs h-9 rounded-lg active:scale-98 transition-transform">
                  Entendido
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Render Android / Desktop PWA Install Prompt (Floating card above bottom navigation)
  return (
    <div
      className="fixed z-[100] left-4 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:left-auto md:right-6 md:w-96 bg-card border border-border/80 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-4 flex flex-col gap-3 animate-in slide-in-from-bottom-8 duration-300 ease-out"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* App Icon */}
          <div className="h-11 w-11 shrink-0 rounded-xl bg-white border border-border flex items-center justify-center p-1.5 shadow-2xs">
            <img
              src="/icons/icon-192.png"
              alt="Fintral Logo"
              className="h-8 w-8 object-contain"
            />
          </div>
          {/* App Info */}
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-foreground leading-tight">
              Instalar Fintral
            </span>
            <span className="text-[11px] text-muted-foreground leading-normal font-medium">
              Fintral, SRL • Finanzas
            </span>
          </div>
        </div>
        
        {/* Dismiss Icon */}
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-full hover:bg-muted/50 active:scale-90"
          aria-label="Cerrar prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-[12px] text-muted-foreground leading-relaxed">
        Agrega Fintral a tu pantalla de inicio para facturar sin conexión y acceder más rápido a tus comprobantes fiscales.
      </p>

      <div className="flex items-center justify-end gap-2 mt-1">
        <button
          onClick={handleDismiss}
          className="h-8 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-lg transition-colors active:scale-95"
        >
          Ahora no
        </button>
        <button
          onClick={handleAction}
          className="h-8 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-xs transition-transform active:scale-95 duration-100"
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
