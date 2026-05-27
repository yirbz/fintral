"use server";

import { dgiiService } from "@/lib/services/dgii";

/**
 * Server Action to lookup taxpayer details by RNC/Cédula on the Node.js server.
 * This bypasses browser CORS restrictions when calling the DGII service.
 */
export async function consultRncAction(rnc: string) {
  try {
    return await dgiiService.consultTaxpayer(rnc);
  } catch (error) {
    console.error("Error in consultRncAction:", error);
    return null;
  }
}
