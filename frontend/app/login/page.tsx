"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { login } from "@/lib/api/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acceso al motor IA</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Correo
              </label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contraseña
              </label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? "Validando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
