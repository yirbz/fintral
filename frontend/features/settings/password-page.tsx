"use client";

import { KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-heading">Contraseña</CardTitle>
        <CardDescription className="text-xs">Cambia tu contraseña de acceso a Fintral.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Para cambiar tu contraseña, serás redirigido a la página de restablecimiento donde
          podrás ingresar un código de verificación enviado a tu correo electrónico.
        </p>
        <a
          href="/forgot-password"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 transition-colors self-start"
        >
          <KeyRound className="size-4" />
          Cambiar contraseña
        </a>
      </CardContent>
    </Card>
  );
}
