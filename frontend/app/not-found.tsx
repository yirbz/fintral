import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <html lang="es">
      <body>
        <main className="flex min-h-screen items-center justify-center p-4">
          <div className="space-y-4 text-center">
            <p className="text-5xl font-bold">404</p>
            <p className="text-sm text-muted-foreground">No encontramos la página solicitada.</p>
            <Link href="/dashboard">
              <Button>Volver al inicio</Button>
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}

