export type CityData = {
  name: string
  bundesland: string
  lat: number
  lng: number
  population: number
  is_major_city: boolean
}

export const GERMAN_CITIES: CityData[] = [
  // Berlin
  { name: 'Berlin', bundesland: 'Berlin', lat: 52.52, lng: 13.405, population: 3677472, is_major_city: true },
  // Hamburg
  { name: 'Hamburg', bundesland: 'Hamburg', lat: 53.5511, lng: 9.9937, population: 1906411, is_major_city: true },
  // Bayern
  { name: 'München', bundesland: 'Bayern', lat: 48.1351, lng: 11.582, population: 1487708, is_major_city: true },
  { name: 'Nürnberg', bundesland: 'Bayern', lat: 49.4521, lng: 11.0767, population: 518370, is_major_city: true },
  { name: 'Augsburg', bundesland: 'Bayern', lat: 48.3705, lng: 10.8978, population: 304017, is_major_city: true },
  { name: 'Regensburg', bundesland: 'Bayern', lat: 49.0134, lng: 12.1016, population: 157440, is_major_city: true },
  { name: 'Ingolstadt', bundesland: 'Bayern', lat: 48.7665, lng: 11.4258, population: 140920, is_major_city: true },
  { name: 'Würzburg', bundesland: 'Bayern', lat: 49.7913, lng: 9.9534, population: 131492, is_major_city: true },
  { name: 'Fürth', bundesland: 'Bayern', lat: 49.4774, lng: 10.9887, population: 131002, is_major_city: true },
  { name: 'Erlangen', bundesland: 'Bayern', lat: 49.5897, lng: 11.0078, population: 114162, is_major_city: true },
  { name: 'Bamberg', bundesland: 'Bayern', lat: 49.8988, lng: 10.9028, population: 78064, is_major_city: true },
  { name: 'Bayreuth', bundesland: 'Bayern', lat: 49.9427, lng: 11.5761, population: 75592, is_major_city: true },
  { name: 'Passau', bundesland: 'Bayern', lat: 48.5748, lng: 13.4609, population: 53532, is_major_city: true },
  { name: 'Rosenheim', bundesland: 'Bayern', lat: 47.8561, lng: 12.1289, population: 65374, is_major_city: true },
  // Baden-Württemberg
  { name: 'Stuttgart', bundesland: 'Baden-Württemberg', lat: 48.7758, lng: 9.1829, population: 635911, is_major_city: true },
  { name: 'Mannheim', bundesland: 'Baden-Württemberg', lat: 49.4875, lng: 8.466, population: 311831, is_major_city: true },
  { name: 'Karlsruhe', bundesland: 'Baden-Württemberg', lat: 49.0069, lng: 8.4037, population: 313092, is_major_city: true },
  { name: 'Freiburg', bundesland: 'Baden-Württemberg', lat: 47.999, lng: 7.8421, population: 231195, is_major_city: true },
  { name: 'Heidelberg', bundesland: 'Baden-Württemberg', lat: 49.3988, lng: 8.6724, population: 163170, is_major_city: true },
  { name: 'Ulm', bundesland: 'Baden-Württemberg', lat: 48.4011, lng: 9.9876, population: 128928, is_major_city: true },
  { name: 'Heilbronn', bundesland: 'Baden-Württemberg', lat: 49.1427, lng: 9.2109, population: 128334, is_major_city: true },
  { name: 'Pforzheim', bundesland: 'Baden-Württemberg', lat: 48.8922, lng: 8.6947, population: 128678, is_major_city: true },
  { name: 'Reutlingen', bundesland: 'Baden-Württemberg', lat: 48.4914, lng: 9.2042, population: 117027, is_major_city: true },
  { name: 'Esslingen', bundesland: 'Baden-Württemberg', lat: 48.7395, lng: 9.3049, population: 94309, is_major_city: true },
  { name: 'Ludwigsburg', bundesland: 'Baden-Württemberg', lat: 48.8979, lng: 9.1925, population: 94181, is_major_city: true },
  { name: 'Tübingen', bundesland: 'Baden-Württemberg', lat: 48.5216, lng: 9.0576, population: 91195, is_major_city: true },
  { name: 'Konstanz', bundesland: 'Baden-Württemberg', lat: 47.6603, lng: 9.1753, population: 85524, is_major_city: true },
  // Nordrhein-Westfalen
  { name: 'Köln', bundesland: 'Nordrhein-Westfalen', lat: 50.9375, lng: 6.9603, population: 1073096, is_major_city: true },
  { name: 'Düsseldorf', bundesland: 'Nordrhein-Westfalen', lat: 51.2277, lng: 6.7735, population: 625853, is_major_city: true },
  { name: 'Dortmund', bundesland: 'Nordrhein-Westfalen', lat: 51.5136, lng: 7.4653, population: 593317, is_major_city: true },
  { name: 'Essen', bundesland: 'Nordrhein-Westfalen', lat: 51.4556, lng: 7.0116, population: 582415, is_major_city: true },
  { name: 'Duisburg', bundesland: 'Nordrhein-Westfalen', lat: 51.4344, lng: 6.7623, population: 502211, is_major_city: true },
  { name: 'Bochum', bundesland: 'Nordrhein-Westfalen', lat: 51.4818, lng: 7.2162, population: 365587, is_major_city: true },
  { name: 'Wuppertal', bundesland: 'Nordrhein-Westfalen', lat: 51.2562, lng: 7.1508, population: 359013, is_major_city: true },
  { name: 'Bielefeld', bundesland: 'Nordrhein-Westfalen', lat: 52.0302, lng: 8.5325, population: 338332, is_major_city: true },
  { name: 'Bonn', bundesland: 'Nordrhein-Westfalen', lat: 50.7374, lng: 7.0982, population: 333598, is_major_city: true },
  { name: 'Münster', bundesland: 'Nordrhein-Westfalen', lat: 51.9607, lng: 7.6261, population: 320946, is_major_city: true },
  { name: 'Mönchengladbach', bundesland: 'Nordrhein-Westfalen', lat: 51.1805, lng: 6.4428, population: 268465, is_major_city: true },
  { name: 'Gelsenkirchen', bundesland: 'Nordrhein-Westfalen', lat: 51.5177, lng: 7.0857, population: 265014, is_major_city: true },
  { name: 'Aachen', bundesland: 'Nordrhein-Westfalen', lat: 50.7753, lng: 6.0839, population: 252786, is_major_city: true },
  { name: 'Krefeld', bundesland: 'Nordrhein-Westfalen', lat: 51.3388, lng: 6.5853, population: 229274, is_major_city: true },
  { name: 'Oberhausen', bundesland: 'Nordrhein-Westfalen', lat: 51.4963, lng: 6.8518, population: 211382, is_major_city: true },
  { name: 'Hagen', bundesland: 'Nordrhein-Westfalen', lat: 51.3671, lng: 7.4633, population: 191846, is_major_city: true },
  { name: 'Hamm', bundesland: 'Nordrhein-Westfalen', lat: 51.6739, lng: 7.815, population: 182176, is_major_city: true },
  { name: 'Herne', bundesland: 'Nordrhein-Westfalen', lat: 51.5369, lng: 7.2, population: 159258, is_major_city: true },
  { name: 'Neuss', bundesland: 'Nordrhein-Westfalen', lat: 51.1984, lng: 6.6918, population: 154477, is_major_city: true },
  { name: 'Paderborn', bundesland: 'Nordrhein-Westfalen', lat: 51.7189, lng: 8.7544, population: 155134, is_major_city: true },
  { name: 'Leverkusen', bundesland: 'Nordrhein-Westfalen', lat: 51.0459, lng: 6.9842, population: 164905, is_major_city: true },
  { name: 'Solingen', bundesland: 'Nordrhein-Westfalen', lat: 51.1652, lng: 7.0671, population: 162950, is_major_city: true },
  { name: 'Recklinghausen', bundesland: 'Nordrhein-Westfalen', lat: 51.6141, lng: 7.1979, population: 113034, is_major_city: true },
  { name: 'Bottrop', bundesland: 'Nordrhein-Westfalen', lat: 51.5247, lng: 6.9293, population: 118463, is_major_city: true },
  { name: 'Remscheid', bundesland: 'Nordrhein-Westfalen', lat: 51.1787, lng: 7.1896, population: 112930, is_major_city: true },
  { name: 'Bergisch Gladbach', bundesland: 'Nordrhein-Westfalen', lat: 50.9924, lng: 7.132, population: 113549, is_major_city: true },
  { name: 'Moers', bundesland: 'Nordrhein-Westfalen', lat: 51.4528, lng: 6.6225, population: 105718, is_major_city: true },
  { name: 'Siegen', bundesland: 'Nordrhein-Westfalen', lat: 50.8748, lng: 8.0244, population: 104116, is_major_city: true },
  // Niedersachsen
  { name: 'Hannover', bundesland: 'Niedersachsen', lat: 52.3759, lng: 9.732, population: 545049, is_major_city: true },
  { name: 'Braunschweig', bundesland: 'Niedersachsen', lat: 52.2689, lng: 10.5268, population: 252768, is_major_city: true },
  { name: 'Oldenburg', bundesland: 'Niedersachsen', lat: 53.1435, lng: 8.2146, population: 172709, is_major_city: true },
  { name: 'Osnabrück', bundesland: 'Niedersachsen', lat: 52.2799, lng: 8.0472, population: 167998, is_major_city: true },
  { name: 'Wolfsburg', bundesland: 'Niedersachsen', lat: 52.4227, lng: 10.7865, population: 128227, is_major_city: true },
  { name: 'Göttingen', bundesland: 'Niedersachsen', lat: 51.5328, lng: 9.9353, population: 119529, is_major_city: true },
  { name: 'Salzgitter', bundesland: 'Niedersachsen', lat: 52.1547, lng: 10.3632, population: 107112, is_major_city: true },
  { name: 'Hildesheim', bundesland: 'Niedersachsen', lat: 52.1508, lng: 9.9517, population: 104284, is_major_city: true },
  // Hessen
  { name: 'Frankfurt', bundesland: 'Hessen', lat: 50.1109, lng: 8.6821, population: 773068, is_major_city: true },
  { name: 'Wiesbaden', bundesland: 'Hessen', lat: 50.0782, lng: 8.2398, population: 283083, is_major_city: true },
  { name: 'Kassel', bundesland: 'Hessen', lat: 51.3127, lng: 9.4797, population: 204857, is_major_city: true },
  { name: 'Darmstadt', bundesland: 'Hessen', lat: 49.8728, lng: 8.6512, population: 162610, is_major_city: true },
  { name: 'Offenbach', bundesland: 'Hessen', lat: 50.0956, lng: 8.7761, population: 133975, is_major_city: true },
  { name: 'Gießen', bundesland: 'Hessen', lat: 50.5841, lng: 8.6784, population: 92249, is_major_city: true },
  { name: 'Marburg', bundesland: 'Hessen', lat: 50.81, lng: 8.77, population: 77291, is_major_city: true },
  { name: 'Fulda', bundesland: 'Hessen', lat: 50.5503, lng: 9.6757, population: 69005, is_major_city: true },
  // Sachsen
  { name: 'Leipzig', bundesland: 'Sachsen', lat: 51.3397, lng: 12.3731, population: 616093, is_major_city: true },
  { name: 'Dresden', bundesland: 'Sachsen', lat: 51.0504, lng: 13.7373, population: 563311, is_major_city: true },
  { name: 'Chemnitz', bundesland: 'Sachsen', lat: 50.8278, lng: 12.9214, population: 249922, is_major_city: true },
  { name: 'Zwickau', bundesland: 'Sachsen', lat: 50.7189, lng: 12.4964, population: 89254, is_major_city: true },
  // Rheinland-Pfalz
  { name: 'Mainz', bundesland: 'Rheinland-Pfalz', lat: 49.9929, lng: 8.2473, population: 221868, is_major_city: true },
  { name: 'Ludwigshafen', bundesland: 'Rheinland-Pfalz', lat: 49.4774, lng: 8.4452, population: 174284, is_major_city: true },
  { name: 'Koblenz', bundesland: 'Rheinland-Pfalz', lat: 50.3569, lng: 7.589, population: 114024, is_major_city: true },
  { name: 'Trier', bundesland: 'Rheinland-Pfalz', lat: 49.749, lng: 6.6371, population: 111528, is_major_city: true },
  { name: 'Kaiserslautern', bundesland: 'Rheinland-Pfalz', lat: 49.4401, lng: 7.7491, population: 101544, is_major_city: true },
  // Schleswig-Holstein
  { name: 'Kiel', bundesland: 'Schleswig-Holstein', lat: 54.3233, lng: 10.1228, population: 249023, is_major_city: true },
  { name: 'Lübeck', bundesland: 'Schleswig-Holstein', lat: 53.8655, lng: 10.6866, population: 217233, is_major_city: true },
  { name: 'Flensburg', bundesland: 'Schleswig-Holstein', lat: 54.7937, lng: 9.4469, population: 91033, is_major_city: true },
  { name: 'Neumünster', bundesland: 'Schleswig-Holstein', lat: 54.0713, lng: 9.9848, population: 80925, is_major_city: true },
  // Thüringen
  { name: 'Erfurt', bundesland: 'Thüringen', lat: 50.9787, lng: 11.0328, population: 215523, is_major_city: true },
  { name: 'Jena', bundesland: 'Thüringen', lat: 50.9272, lng: 11.5892, population: 113392, is_major_city: true },
  { name: 'Gera', bundesland: 'Thüringen', lat: 50.8803, lng: 12.0833, population: 93125, is_major_city: true },
  { name: 'Weimar', bundesland: 'Thüringen', lat: 50.9795, lng: 11.3235, population: 65764, is_major_city: true },
  // Brandenburg
  { name: 'Potsdam', bundesland: 'Brandenburg', lat: 52.3906, lng: 13.0645, population: 185750, is_major_city: true },
  { name: 'Cottbus', bundesland: 'Brandenburg', lat: 51.7606, lng: 14.3325, population: 102091, is_major_city: true },
  { name: 'Brandenburg an der Havel', bundesland: 'Brandenburg', lat: 52.4085, lng: 12.5316, population: 73480, is_major_city: true },
  { name: 'Frankfurt (Oder)', bundesland: 'Brandenburg', lat: 52.347, lng: 14.5506, population: 57873, is_major_city: true },
  // Sachsen-Anhalt
  { name: 'Magdeburg', bundesland: 'Sachsen-Anhalt', lat: 52.1205, lng: 11.6276, population: 240547, is_major_city: true },
  { name: 'Halle', bundesland: 'Sachsen-Anhalt', lat: 51.4828, lng: 11.97, population: 242167, is_major_city: true },
  { name: 'Dessau-Roßlau', bundesland: 'Sachsen-Anhalt', lat: 51.8357, lng: 12.2441, population: 82187, is_major_city: true },
  // Mecklenburg-Vorpommern
  { name: 'Rostock', bundesland: 'Mecklenburg-Vorpommern', lat: 54.0924, lng: 12.0991, population: 209920, is_major_city: true },
  { name: 'Schwerin', bundesland: 'Mecklenburg-Vorpommern', lat: 53.6355, lng: 11.4015, population: 100051, is_major_city: true },
  { name: 'Greifswald', bundesland: 'Mecklenburg-Vorpommern', lat: 54.0865, lng: 13.3923, population: 59382, is_major_city: true },
  { name: 'Stralsund', bundesland: 'Mecklenburg-Vorpommern', lat: 54.3094, lng: 13.0818, population: 59544, is_major_city: true },
  // Bremen
  { name: 'Bremen', bundesland: 'Bremen', lat: 53.0793, lng: 8.8017, population: 569352, is_major_city: true },
  { name: 'Bremerhaven', bundesland: 'Bremen', lat: 53.5396, lng: 8.5809, population: 119755, is_major_city: true },
  // Saarland
  { name: 'Saarbrücken', bundesland: 'Saarland', lat: 49.2401, lng: 6.9969, population: 183010, is_major_city: true },
  { name: 'Neunkirchen', bundesland: 'Saarland', lat: 49.346, lng: 7.171, population: 48750, is_major_city: false },
  { name: 'Homburg', bundesland: 'Saarland', lat: 49.3196, lng: 7.3355, population: 43494, is_major_city: false },
]
