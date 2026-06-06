/**
 * División política de República Dominicana.
 * 31 provincias + Distrito Nacional = 32 demarcaciones.
 * Cada una con su municipio cabecera (primero) y demás municipios.
 */
export interface RDProvince {
  id: string;
  name: string;
  municipalities: string[];
}

export const RD_PROVINCES: RDProvince[] = [
  {
    id: "DN",
    name: "Distrito Nacional",
    municipalities: ["Santo Domingo"],
  },
  {
    id: "AZ",
    name: "Azua",
    municipalities: [
      "Azua de Compostela",
      "Estebanía",
      "Guayabal",
      "Las Charcas",
      "Las Yayas de Viajama",
      "Padre Las Casas",
      "Peralta",
      "Pueblo Viejo",
      "Sabana Yegua",
      "Tábara Arriba",
    ],
  },
  {
    id: "BR",
    name: "Bahoruco",
    municipalities: [
      "Neiba",
      "Galván",
      "Los Ríos",
      "Tamayo",
      "Villa Jaragua",
    ],
  },
  {
    id: "BH",
    name: "Barahona",
    municipalities: [
      "Barahona",
      "Cabral",
      "El Peñón",
      "Enriquillo",
      "Fundación",
      "Jaquimeyes",
      "La Ciénaga",
      "Las Salinas",
      "Paraíso",
      "Polo",
      "Vicente Noble",
    ],
  },
  {
    id: "DA",
    name: "Dajabón",
    municipalities: [
      "Dajabón",
      "El Pino",
      "Loma de Cabrera",
      "Partido",
      "Restauración",
    ],
  },
  {
    id: "DU",
    name: "Duarte",
    municipalities: [
      "San Francisco de Macorís",
      "Arenoso",
      "Castillo",
      "Eugenio María de Hostos",
      "Las Guáranas",
      "Pimentel",
      "Villa Riva",
    ],
  },
  {
    id: "SE",
    name: "El Seibo",
    municipalities: [
      "Santa Cruz de El Seibo",
      "Miches",
    ],
  },
  {
    id: "EP",
    name: "Elías Piña",
    municipalities: [
      "Comendador",
      "Bánica",
      "El Llano",
      "Hondo Valle",
      "Juan Santiago",
      "Pedro Santana",
    ],
  },
  {
    id: "ES",
    name: "Espaillat",
    municipalities: [
      "Moca",
      "Cayetano Germosén",
      "Gaspar Hernández",
      "Jamao al Norte",
      "San Víctor",
    ],
  },
  {
    id: "HM",
    name: "Hato Mayor",
    municipalities: [
      "Hato Mayor del Rey",
      "El Valle",
      "Sabana de la Mar",
    ],
  },
  {
    id: "HR",
    name: "Hermanas Mirabal",
    municipalities: [
      "Salcedo",
      "Tenares",
      "Villa Tapia",
    ],
  },
  {
    id: "IN",
    name: "Independencia",
    municipalities: [
      "Jimaní",
      "Cristóbal",
      "Duvergé",
      "La Descubierta",
      "Mella",
      "Postrer Río",
    ],
  },
  {
    id: "AL",
    name: "La Altagracia",
    municipalities: [
      "Higüey",
      "San Rafael del Yuma",
    ],
  },
  {
    id: "RO",
    name: "La Romana",
    municipalities: [
      "La Romana",
      "Guaymate",
      "Villa Hermosa",
    ],
  },
  {
    id: "VE",
    name: "La Vega",
    municipalities: [
      "Concepción de La Vega",
      "Constanza",
      "Jarabacoa",
      "Jima Abajo",
    ],
  },
  {
    id: "MT",
    name: "María Trinidad Sánchez",
    municipalities: [
      "Nagua",
      "Cabrera",
      "El Factor",
      "Río San Juan",
    ],
  },
  {
    id: "MN",
    name: "Monseñor Nouel",
    municipalities: [
      "Bonao",
      "Maimón",
      "Piedra Blanca",
    ],
  },
  {
    id: "MC",
    name: "Monte Cristi",
    municipalities: [
      "San Fernando de Monte Cristi",
      "Castañuela",
      "Guayubín",
      "Las Matas de Santa Cruz",
      "Pepillo Salcedo",
      "Villa Vásquez",
    ],
  },
  {
    id: "MP",
    name: "Monte Plata",
    municipalities: [
      "Monte Plata",
      "Bayaguana",
      "Peralvillo",
      "Sabana Grande de Boyá",
      "Yamasá",
    ],
  },
  {
    id: "PN",
    name: "Pedernales",
    municipalities: [
      "Pedernales",
      "Oviedo",
    ],
  },
  {
    id: "PV",
    name: "Peravia",
    municipalities: [
      "Baní",
      "Nizao",
    ],
  },
  {
    id: "PP",
    name: "Puerto Plata",
    municipalities: [
      "San Felipe de Puerto Plata",
      "Altamira",
      "Guananico",
      "Imbert",
      "Los Hidalgos",
      "Luperón",
      "Sosúa",
      "Villa Isabela",
      "Villa Montellano",
    ],
  },
  {
    id: "SM",
    name: "Samaná",
    municipalities: [
      "Santa Bárbara de Samaná",
      "Las Terrenas",
      "Sánchez",
    ],
  },
  {
    id: "SC",
    name: "San Cristóbal",
    municipalities: [
      "San Cristóbal",
      "Bajos de Haina",
      "Cambita Garabito",
      "Los Cacaos",
      "Sabana Grande de Palenque",
      "San Gregorio de Nigua",
      "Villa Altagracia",
      "Yaguate",
    ],
  },
  {
    id: "JO",
    name: "San José de Ocoa",
    municipalities: [
      "San José de Ocoa",
      "Rancho Arriba",
      "Sabana Larga",
    ],
  },
  {
    id: "SJ",
    name: "San Juan",
    municipalities: [
      "San Juan de la Maguana",
      "Bohechío",
      "El Cercado",
      "Juan de Herrera",
      "Las Matas de Farfán",
      "Vallejuelo",
    ],
  },
  {
    id: "SP",
    name: "San Pedro de Macorís",
    municipalities: [
      "San Pedro de Macorís",
      "Consuelo",
      "Guayacanes",
      "Los Llanos",
      "Quisqueya",
      "Ramón Santana",
      "San José de los Llanos",
    ],
  },
  {
    id: "SR",
    name: "Sánchez Ramírez",
    municipalities: [
      "Cotuí",
      "Cevicos",
      "Fantino",
      "La Mata",
    ],
  },
  {
    id: "ST",
    name: "Santiago",
    municipalities: [
      "Santiago de los Caballeros",
      "Bisonó",
      "Jánico",
      "Licey al Medio",
      "Puñal",
      "Sabana Iglesia",
      "San José de las Matas",
      "Tamboril",
      "Villa González",
    ],
  },
  {
    id: "SV",
    name: "Santiago Rodríguez",
    municipalities: [
      "San Ignacio de Sabaneta",
      "Monción",
      "Villa Los Almácigos",
    ],
  },
  {
    id: "SD",
    name: "Santo Domingo",
    municipalities: [
      "Santo Domingo Este",
      "Boca Chica",
      "Los Alcarrizos",
      "Pedro Brand",
      "San Antonio de Guerra",
      "Santo Domingo Norte",
      "Santo Domingo Oeste",
    ],
  },
  {
    id: "VA",
    name: "Valverde",
    municipalities: [
      "Mao",
      "Esperanza",
      "Laguna Salada",
    ],
  },
];

/** Provincias indexadas por nombre normalizado (búsqueda rápida) */
export function findProvince(name: string): RDProvince | undefined {
  const normalized = name.toLowerCase().trim();
  return RD_PROVINCES.find(
    (p) =>
      p.name.toLowerCase().includes(normalized) ||
      normalized.includes(p.name.toLowerCase()) ||
      p.municipalities.some((m) => m.toLowerCase().includes(normalized))
  );
}

/** Municipios de una provincia por nombre o id */
export function getMunicipalities(provinceName: string): string[] {
  const province = RD_PROVINCES.find(
    (p) => p.name.toLowerCase() === provinceName.toLowerCase()
  );
  return province?.municipalities ?? [];
}

/** Lista de nombres de provincias */
export const RD_PROVINCE_NAMES = RD_PROVINCES.map((p) => p.name);

/** Todos los municipios de RD */
export const RD_ALL_MUNICIPALITIES = RD_PROVINCES.flatMap(
  (p) => p.municipalities
).sort();
