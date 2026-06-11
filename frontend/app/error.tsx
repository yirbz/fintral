"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="flex min-h-screen items-center justify-center p-4">
          <div className="flex flex-col gap-4 text-center">
            <p className="text-5xl font-bold">500</p>
            <p className="text-sm text-muted-foreground">Ocurrió un problema interno al cargar esta vista.</p>
            <Button onClick={reset}>Reintentar</Button>
          </div>
        </main>
      </body>
    </html>
  );
}

