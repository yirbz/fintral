/**
 * Datos geográficos de República Dominicana (provincias y municipios).
 *
 * Usa la librería `geo-rd` en vez de hardcodear los datos manualmente.
 * Referencia: https://www.npmjs.com/package/geo-rd
 */
import {
  provinceAll,
  municipalitiesByProvince,
} from "geo-rd";

/** Lista de nombres de provincias (para selects) */
export const RD_PROVINCE_NAMES: string[] = provinceAll()
  .map((p) => p.Name)
  .sort((a, b) => a.localeCompare(b));

/** Municipios de una provincia por nombre */
export function getMunicipalities(provinceName: string): string[] {
  const province = provinceAll().find(
    (p) => p.Name.toLowerCase() === provinceName.toLowerCase()
  );
  if (!province) return [];
  return municipalitiesByProvince(province.Code).map((m) => m.Name);
}
