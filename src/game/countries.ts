export interface Country {
  /** código ISO 3166-1 alfa-2 (usado para a imagem da bandeira) */
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'BR', name: 'Brasil' },
  { code: 'KR', name: 'Coreia do Sul' },
  { code: 'CN', name: 'China' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CA', name: 'Canadá' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colômbia' },
  { code: 'PE', name: 'Peru' },
  { code: 'PT', name: 'Portugal' },
  { code: 'ES', name: 'Espanha' },
  { code: 'FR', name: 'França' },
  { code: 'DE', name: 'Alemanha' },
  { code: 'IT', name: 'Itália' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'NL', name: 'Holanda' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'DK', name: 'Dinamarca' },
  { code: 'SE', name: 'Suécia' },
  { code: 'PL', name: 'Polônia' },
  { code: 'TR', name: 'Turquia' },
  { code: 'VN', name: 'Vietnã' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'JP', name: 'Japão' },
  { code: 'PH', name: 'Filipinas' },
  { code: 'AU', name: 'Austrália' },
  { code: 'NZ', name: 'Nova Zelândia' },
];

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
