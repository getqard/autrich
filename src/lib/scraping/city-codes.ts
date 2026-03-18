// Maps German Bundesland names to GMaps Extractor state codes
const BUNDESLAND_CODES: Record<string, string> = {
  'Baden-Württemberg': 'BADEN_WURTTEMBERG',
  'Bayern': 'BAYERN',
  'Berlin': 'BERLIN',
  'Brandenburg': 'BRANDENBURG',
  'Bremen': 'BREMEN',
  'Hamburg': 'HAMBURG',
  'Hessen': 'HESSEN',
  'Mecklenburg-Vorpommern': 'MECKLENBURG_VORPOMMERN',
  'Niedersachsen': 'NIEDERSACHSEN',
  'Nordrhein-Westfalen': 'NORDRHEIN_WESTFALEN',
  'Rheinland-Pfalz': 'RHEINLAND_PFALZ',
  'Saarland': 'SAARLAND',
  'Sachsen': 'SACHSEN',
  'Sachsen-Anhalt': 'SACHSEN_ANHALT',
  'Schleswig-Holstein': 'SCHLESWIG_HOLSTEIN',
  'Thüringen': 'THURINGEN',
}

/**
 * Build GMaps city code from city name and bundesland.
 * Format: DE__STATE__CITY (e.g. DE__BAYERN__NURNBERG)
 */
export function buildCityCode(cityName: string, bundesland: string): string {
  const stateCode = BUNDESLAND_CODES[bundesland] || bundesland.toUpperCase().replace(/[^A-Z]/g, '_')
  const cityCode = cityName
    .toUpperCase()
    .replace(/Ä/g, 'A').replace(/Ö/g, 'O').replace(/Ü/g, 'U').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  return `DE__${stateCode}__${cityCode}`
}
