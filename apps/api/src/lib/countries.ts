// 21 países disponibles (docs §1). Determinan moneda, zona horaria e impuestos por defecto.

export type Country = {
  code: string;
  name: string;
  currency: string;
  symbol: string;
  timezone: string;
  /** Tarifas de impuesto disponibles para factura electrónica (%) */
  taxRates: number[];
  /** Autoridad tributaria para la factura electrónica */
  taxAuthority: string;
};

export const COUNTRIES: Country[] = [
  { code: "BO", name: "Bolivia", currency: "BOB", symbol: "Bs", timezone: "America/La_Paz", taxRates: [0, 13], taxAuthority: "SIN" },
  { code: "CO", name: "Colombia", currency: "COP", symbol: "$", timezone: "America/Bogota", taxRates: [0, 5, 19], taxAuthority: "DIAN" },
  { code: "MX", name: "México", currency: "MXN", symbol: "$", timezone: "America/Mexico_City", taxRates: [0, 8, 16], taxAuthority: "SAT" },
  { code: "PE", name: "Perú", currency: "PEN", symbol: "S/", timezone: "America/Lima", taxRates: [0, 18], taxAuthority: "SUNAT" },
  { code: "CL", name: "Chile", currency: "CLP", symbol: "$", timezone: "America/Santiago", taxRates: [0, 19], taxAuthority: "SII" },
  { code: "AR", name: "Argentina", currency: "ARS", symbol: "$", timezone: "America/Argentina/Buenos_Aires", taxRates: [0, 10.5, 21], taxAuthority: "AFIP" },
  { code: "EC", name: "Ecuador", currency: "USD", symbol: "$", timezone: "America/Guayaquil", taxRates: [0, 15], taxAuthority: "SRI" },
  { code: "VE", name: "Venezuela", currency: "VES", symbol: "Bs.S", timezone: "America/Caracas", taxRates: [0, 16], taxAuthority: "SENIAT" },
  { code: "PY", name: "Paraguay", currency: "PYG", symbol: "₲", timezone: "America/Asuncion", taxRates: [0, 5, 10], taxAuthority: "DNIT" },
  { code: "UY", name: "Uruguay", currency: "UYU", symbol: "$U", timezone: "America/Montevideo", taxRates: [0, 10, 22], taxAuthority: "DGI" },
  { code: "BR", name: "Brasil", currency: "BRL", symbol: "R$", timezone: "America/Sao_Paulo", taxRates: [0, 17, 18], taxAuthority: "SEFAZ" },
  { code: "CR", name: "Costa Rica", currency: "CRC", symbol: "₡", timezone: "America/Costa_Rica", taxRates: [0, 13], taxAuthority: "Hacienda" },
  { code: "PA", name: "Panamá", currency: "USD", symbol: "$", timezone: "America/Panama", taxRates: [0, 7], taxAuthority: "DGI" },
  { code: "GT", name: "Guatemala", currency: "GTQ", symbol: "Q", timezone: "America/Guatemala", taxRates: [0, 12], taxAuthority: "SAT" },
  { code: "HN", name: "Honduras", currency: "HNL", symbol: "L", timezone: "America/Tegucigalpa", taxRates: [0, 15], taxAuthority: "SAR" },
  { code: "SV", name: "El Salvador", currency: "USD", symbol: "$", timezone: "America/El_Salvador", taxRates: [0, 13], taxAuthority: "MH" },
  { code: "NI", name: "Nicaragua", currency: "NIO", symbol: "C$", timezone: "America/Managua", taxRates: [0, 15], taxAuthority: "DGI" },
  { code: "DO", name: "República Dominicana", currency: "DOP", symbol: "RD$", timezone: "America/Santo_Domingo", taxRates: [0, 18], taxAuthority: "DGII" },
  { code: "PR", name: "Puerto Rico", currency: "USD", symbol: "$", timezone: "America/Puerto_Rico", taxRates: [0, 11.5], taxAuthority: "Hacienda" },
  { code: "US", name: "Estados Unidos", currency: "USD", symbol: "$", timezone: "America/New_York", taxRates: [0], taxAuthority: "—" },
  { code: "ES", name: "España", currency: "EUR", symbol: "€", timezone: "Europe/Madrid", taxRates: [0, 4, 10, 21], taxAuthority: "AEAT" },
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code);
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [string, ...string[]];
