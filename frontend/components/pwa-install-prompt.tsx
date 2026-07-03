"use client";

import { PWAInstallElement } from "@khmyznikov/pwa-install";
import { useEffect, useRef, useState, useCallback } from "react";

function isAndroid() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Mac/.test(ua) && navigator.maxTouchPoints > 2)
  );
}

const DISMISS_KEY = "fintral_pwa_banner_dismissed";
const BANNER_HEIGHT = 64;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-[1px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill={i <= Math.floor(rating) ? "#f59e0b" : "none"}
          stroke="#f59e0b"
          strokeWidth="1"
        >
          <path d="M6 1l1.545 3.13L11 4.635 8.5 7.07l.59 3.44L6 8.885 2.91 10.51l.59-3.44L1 4.635l3.455-.505z" />
        </svg>
      ))}
    </div>
  );
}

function AndroidManualSteps({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[99998] bg-black/40 animate-fade-in"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[99999] animate-sheet-up"
        style={{
          fontFamily: "Roboto, 'Segoe UI', system-ui, sans-serif",
          background: "#fff",
          color: "#212121",
          borderTopLeftRadius: "28px",
          borderTopRightRadius: "28px",
          boxShadow: "0 -2px 20px rgba(0, 0, 0, 0.15)",
          maxWidth: "414px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "rgba(0, 0, 0, 0.15)" }}
          />
        </div>

        <div className="px-6 pb-8">
          <p
            className="text-[22px] font-medium mb-1"
            style={{ fontFamily: "'Google Sans', Roboto, sans-serif", color: "#1f1f1f" }}
          >
            Instalar app
          </p>
          <p className="text-[14px] mb-6" style={{ color: "#5f6368" }}>
            Añade Fintral a tu pantalla de inicio para acceso rápido
          </p>

          <div className="space-y-5 mb-8">
            <ManualStep
              icon={
                <svg height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
                  <path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z" />
                </svg>
              }
              text='Toca el menú de Chrome (⋮) en la esquina superior derecha'
            />
            <ManualStep
              icon={
                <svg height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
                  <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
                </svg>
              }
              text='Selecciona "Añadir a pantalla de inicio"'
            />
            <ManualStep
              icon={
                <svg height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
                  <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
                </svg>
              }
              text='Confirma tocando "Añadir"'
            />
          </div>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-full text-[14px] font-medium transition-colors active:opacity-80"
            style={{
              background: "#1a73e8",
              color: "#fff",
              fontFamily: "'Google Sans', Roboto, sans-serif",
            }}
          >
            Entendido
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        @keyframes sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-sheet-up {
          animation: sheet-up 0.35s cubic-bezier(0.2, 0, 0, 1) forwards;
        }
      `}</style>
    </>
  );
}

function ManualStep({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "#f1f3f4" }}
      >
        {icon}
      </div>
      <p
        className="text-[14px] leading-snug"
        style={{ color: "#3c4043", fontFamily: "Roboto, sans-serif" }}
      >
        {text}
      </p>
    </div>
  );
}

export function PwaInstallPrompt() {
  const pwaRef = useRef<any>(null);
  const deferredPromptRef = useRef<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showAndroidBar, setShowAndroidBar] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowAndroidBar(false);
    setShowManualSteps(false);
    document.body.style.paddingTop = "";
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }, []);

  const handleIOSInstall = useCallback(() => {
    const el = pwaRef.current;
    if (!el) return;

    try {
      el.isAppleMobilePlatform = true;
      el.isApple26Plus = true;
      el.isLiquidGlassSupported = true;
      el.showDialog(true);
    } catch (e) {
      console.error("[PWA] showDialog failed:", e);
    }
  }, []);

  const handleAndroidInstall = useCallback(async () => {
    const el = pwaRef.current;

    if (el && deferredPromptRef.current) {
      try {
        el.externalPromptEvent = deferredPromptRef.current;
        await new Promise((r) => setTimeout(r, 350));
        el.showDialog(true);
      } catch (e) {
        console.error("[PWA] showDialog failed:", e);
      }
      return;
    }

    if (deferredPromptRef.current) {
      try {
        deferredPromptRef.current.prompt();
        const { outcome } = await deferredPromptRef.current.userChoice;
        if (outcome === "accepted") {
          setInstalled(true);
          handleDismiss();
        }
      } catch (e) {
        console.error("[PWA] native prompt failed:", e);
      }
      deferredPromptRef.current = null;
      return;
    }

    setShowAndroidBar(false);
    setShowManualSteps(true);
  }, [handleDismiss]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (installed) return;

    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {}

    if (isIOS()) {
      if (!customElements.get("pwa-install")) {
        customElements.define("pwa-install", PWAInstallElement);
      }

      const el = document.createElement("pwa-install") as any;
      el.setAttribute("manifest-url", "/manifest.json");
      el.setAttribute("manual-apple", "");
      el.setAttribute("styles", JSON.stringify({ "--tint-color": "#0ea5e9" }));
      document.body.appendChild(el);
      pwaRef.current = el;

      const timer = setTimeout(() => {
        setShowBanner(true);
        document.body.style.paddingTop = `${BANNER_HEIGHT}px`;
      }, 2000);

      return () => {
        clearTimeout(timer);
        el.remove();
        pwaRef.current = null;
        document.body.style.paddingTop = "";
      };
    }

    if (isAndroid()) {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPromptRef.current = e;

        const el = pwaRef.current;
        if (el) {
          el.externalPromptEvent = e;
        }
      };

      window.addEventListener("beforeinstallprompt", handler);

      if (!customElements.get("pwa-install")) {
        customElements.define("pwa-install", PWAInstallElement);
      }

      const el = document.createElement("pwa-install") as any;
      el.setAttribute("manifest-url", "/manifest.json");
      el.setAttribute("manual-chrome", "");
      document.body.appendChild(el);
      pwaRef.current = el;

      const timer = setTimeout(() => {
        setShowAndroidBar(true);
      }, 2000);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
        el.remove();
        pwaRef.current = null;
      };
    }
  }, [installed]);

  return (
    <>
      {isIOS() && showBanner && !installed && (
        <div
          className="fixed top-0 left-0 right-0 z-[99999] animate-slide-down"
          style={{
            height: BANNER_HEIGHT,
            background: "#fff",
            borderBottom: "0.5px solid rgba(0, 0, 0, 0.12)",
          }}
        >
          <div className="flex items-center gap-3 px-4 py-2 mx-auto max-w-lg h-full">
            <img
              src="/icons/icon-192.png"
              alt="Fintral"
              width={40}
              height={40}
              className="rounded-[10px] shrink-0"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[15px] font-semibold truncate"
                  style={{
                    fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
                    color: "#000",
                  }}
                >
                  Fintral
                </span>
                <Stars rating={5} />
              </div>
              <p
                className="text-[11px] leading-tight truncate mt-0.5"
                style={{
                  fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
                  color: "#6b7280",
                }}
              >
                Facturación Electrónica RD
              </p>
            </div>

            <button
              onClick={handleIOSInstall}
              className="shrink-0 px-4 py-1.5 rounded-full text-[14px] font-semibold transition-colors active:opacity-80"
              style={{
                fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif",
                background: "#0ea5e9",
                color: "#fff",
              }}
            >
              OBTENER
            </button>

            <button
              onClick={handleDismiss}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full"
              style={{ color: "#9ca3af" }}
              aria-label="Cerrar"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {isAndroid() && (
        <>
          <div
            className="fixed bottom-0 left-0 right-0 z-[99999] animate-android-bar"
            style={{
              fontFamily: "Roboto, 'Segoe UI', system-ui, sans-serif",
              background: "#fff",
              boxShadow: "0 -1px 6px rgba(0, 0, 0, 0.1)",
              display: showAndroidBar && !installed ? "block" : "none",
            }}
          >
            <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
              <img
                src="/icons/icon-192.png"
                alt="Fintral"
                width={36}
                height={36}
                className="rounded-[8px] shrink-0"
              />

              <div className="flex-1 min-w-0">
                <p
                  className="text-[14px] font-medium truncate"
                  style={{ color: "#1f1f1f" }}
                >
                  Instalar Fintral
                </p>
                <p className="text-[12px] truncate" style={{ color: "#5f6368" }}>
                  App de facturación electrónica
                </p>
              </div>

              <button
                onClick={handleAndroidInstall}
                className="shrink-0 px-5 py-2 rounded-full text-[13px] font-medium transition-colors active:opacity-80"
                style={{ background: "#1a73e8", color: "#fff" }}
              >
                Instalar
              </button>

              <button
                onClick={handleDismiss}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full"
                style={{ color: "#5f6368" }}
                aria-label="Cerrar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <style>{`
            @keyframes android-bar-up {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            .animate-android-bar {
              animation: android-bar-up 0.3s cubic-bezier(0.2, 0, 0, 1) forwards;
            }
          `}</style>
        </>
      )}

      <AndroidManualSteps
        open={showManualSteps}
        onClose={() => setShowManualSteps(false)}
      />

      <style>{`
        @keyframes slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-down {
          animation: slide-down 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </>
  );
}
