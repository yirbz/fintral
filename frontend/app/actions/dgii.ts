"use server";

import { cookies } from "next/headers";
import { dgiiService } from "@/lib/services/dgii";

/**
 * Require authentication for server actions.
 * Throws if no access_token cookie is present.
 */
async function requireAuth(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token");
  if (!token?.value) {
    throw new Error("No autorizado");
  }
}

/**
 * Server Action to lookup taxpayer details by RNC/Cédula on the Node.js server.
 * This bypasses browser CORS restrictions when calling the DGII service.
 */
export async function consultRncAction(rnc: string) {
  try {
    await requireAuth();
    return await dgiiService.consultTaxpayer(rnc);
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado") {
      return null;
    }
    console.error("Error in consultRncAction:", error);
    return null;
  }
}

/**
 * Server Action to search the DGII padrón by business name.
 */
export async function searchByNameAction(name: string) {
  try {
    await requireAuth();
    return await dgiiService.searchByName(name);
  } catch (error) {
    if (error instanceof Error && error.message === "No autorizado") {
      return [];
    }
    console.error("Error in searchByNameAction:", error);
    return [];
  }
}
