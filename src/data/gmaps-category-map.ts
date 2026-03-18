/**
 * Google Maps Category → Industry Slug Mapping
 *
 * Maps ~100 Google Maps categories (case-insensitive) to our 20 industry slugs.
 * Used for instant, free industry classification before AI fallback.
 */

const EXACT_MAP: Record<string, string> = {
  // doener
  'döner restaurant': 'doener',
  'turkish restaurant': 'doener',
  'kebab shop': 'doener',
  'shawarma restaurant': 'doener',
  'middle eastern restaurant': 'doener',
  'falafel restaurant': 'doener',
  'pita restaurant': 'doener',
  'lebanese restaurant': 'doener',
  'syrian restaurant': 'doener',
  'persian restaurant': 'doener',

  // barber
  'barber shop': 'barber',
  'hair salon': 'barber',
  "men's hair salon": 'barber',
  'beauty salon': 'barber',
  'hairdresser': 'barber',

  // cafe
  'cafe': 'cafe',
  'café': 'cafe',
  'coffee shop': 'cafe',
  'espresso bar': 'cafe',
  'tea house': 'cafe',
  'internet cafe': 'cafe',

  // baeckerei
  'bakery': 'baeckerei',
  'pastry shop': 'baeckerei',
  'cake shop': 'baeckerei',

  // pizzeria
  'pizza restaurant': 'pizzeria',
  'pizza delivery': 'pizzeria',
  'pizza takeaway': 'pizzeria',

  // restaurant (generic + specific cuisine)
  'restaurant': 'restaurant',
  'fine dining restaurant': 'restaurant',
  'german restaurant': 'restaurant',
  'italian restaurant': 'restaurant',
  'asian restaurant': 'restaurant',
  'indian restaurant': 'restaurant',
  'chinese restaurant': 'restaurant',
  'vietnamese restaurant': 'restaurant',
  'thai restaurant': 'restaurant',
  'greek restaurant': 'restaurant',
  'mexican restaurant': 'restaurant',
  'spanish restaurant': 'restaurant',
  'french restaurant': 'restaurant',
  'korean restaurant': 'restaurant',
  'american restaurant': 'restaurant',
  'brunch restaurant': 'restaurant',
  'buffet restaurant': 'restaurant',
  'seafood restaurant': 'restaurant',
  'steak house': 'restaurant',
  'vegan restaurant': 'restaurant',
  'vegetarian restaurant': 'restaurant',
  'family restaurant': 'restaurant',

  // shisha
  'hookah bar': 'shisha',
  'shisha bar': 'shisha',
  'hookah store': 'shisha',

  // nagelstudio
  'nail salon': 'nagelstudio',

  // kosmetik
  'skin care clinic': 'kosmetik',
  'beauty school': 'kosmetik',
  'spa': 'kosmetik',
  'day spa': 'kosmetik',
  'facial spa': 'kosmetik',
  'waxing hair removal service': 'kosmetik',
  'cosmetics store': 'kosmetik',
  'beauty supply store': 'kosmetik',

  // fitnessstudio
  'gym': 'fitnessstudio',
  'fitness center': 'fitnessstudio',
  'health club': 'fitnessstudio',
  'sports club': 'fitnessstudio',
  'personal trainer': 'fitnessstudio',
  'crossfit gym': 'fitnessstudio',
  'boxing gym': 'fitnessstudio',
  'martial arts school': 'fitnessstudio',

  // waschanlage
  'car wash': 'waschanlage',
  'car detailing service': 'waschanlage',

  // eisdiele
  'ice cream shop': 'eisdiele',
  'frozen yogurt shop': 'eisdiele',
  'gelato shop': 'eisdiele',

  // sushi
  'sushi restaurant': 'sushi',
  'japanese restaurant': 'sushi',
  'ramen restaurant': 'sushi',

  // burger
  'hamburger restaurant': 'burger',
  'fast food restaurant': 'burger',

  // blumenladen
  'florist': 'blumenladen',
  'flower shop': 'blumenladen',
  'flower delivery service': 'blumenladen',

  // imbiss
  'meal takeaway': 'imbiss',
  'meal delivery': 'imbiss',
  'food court': 'imbiss',
  'snack bar': 'imbiss',

  // tattoo
  'tattoo shop': 'tattoo',
  'tattoo and piercing shop': 'tattoo',
  'piercing shop': 'tattoo',

  // yogastudio
  'yoga studio': 'yogastudio',
  'pilates studio': 'yogastudio',
  'meditation center': 'yogastudio',

  // tierhandlung
  'pet store': 'tierhandlung',
  'pet groomer': 'tierhandlung',
  'veterinarian': 'tierhandlung',

  // reinigung
  'dry cleaner': 'reinigung',
  'laundry': 'reinigung',
  'laundromat': 'reinigung',
  'tailor': 'reinigung',
}

/**
 * Fuzzy keyword patterns: if the category CONTAINS this keyword, map to industry.
 * Checked in order — first match wins.
 */
const KEYWORD_MAP: Array<{ keyword: string; industry: string }> = [
  { keyword: 'döner', industry: 'doener' },
  { keyword: 'kebab', industry: 'doener' },
  { keyword: 'kebap', industry: 'doener' },
  { keyword: 'shawarma', industry: 'doener' },
  { keyword: 'falafel', industry: 'doener' },
  { keyword: 'barber', industry: 'barber' },
  { keyword: 'friseur', industry: 'barber' },
  { keyword: 'hair', industry: 'barber' },
  { keyword: 'coffee', industry: 'cafe' },
  { keyword: 'café', industry: 'cafe' },
  { keyword: 'cafe', industry: 'cafe' },
  { keyword: 'bakery', industry: 'baeckerei' },
  { keyword: 'bäckerei', industry: 'baeckerei' },
  { keyword: 'pastry', industry: 'baeckerei' },
  { keyword: 'pizza', industry: 'pizzeria' },
  { keyword: 'shisha', industry: 'shisha' },
  { keyword: 'hookah', industry: 'shisha' },
  { keyword: 'nail', industry: 'nagelstudio' },
  { keyword: 'kosmetik', industry: 'kosmetik' },
  { keyword: 'beauty', industry: 'kosmetik' },
  { keyword: 'spa', industry: 'kosmetik' },
  { keyword: 'fitness', industry: 'fitnessstudio' },
  { keyword: 'gym', industry: 'fitnessstudio' },
  { keyword: 'car wash', industry: 'waschanlage' },
  { keyword: 'wasch', industry: 'waschanlage' },
  { keyword: 'ice cream', industry: 'eisdiele' },
  { keyword: 'eis', industry: 'eisdiele' },
  { keyword: 'gelato', industry: 'eisdiele' },
  { keyword: 'sushi', industry: 'sushi' },
  { keyword: 'japanese', industry: 'sushi' },
  { keyword: 'ramen', industry: 'sushi' },
  { keyword: 'burger', industry: 'burger' },
  { keyword: 'florist', industry: 'blumenladen' },
  { keyword: 'flower', industry: 'blumenladen' },
  { keyword: 'blumen', industry: 'blumenladen' },
  { keyword: 'tattoo', industry: 'tattoo' },
  { keyword: 'piercing', industry: 'tattoo' },
  { keyword: 'yoga', industry: 'yogastudio' },
  { keyword: 'pilates', industry: 'yogastudio' },
  { keyword: 'pet', industry: 'tierhandlung' },
  { keyword: 'tier', industry: 'tierhandlung' },
  { keyword: 'dry clean', industry: 'reinigung' },
  { keyword: 'reinigung', industry: 'reinigung' },
  { keyword: 'laundry', industry: 'reinigung' },
  { keyword: 'imbiss', industry: 'imbiss' },
  { keyword: 'snack', industry: 'imbiss' },
  { keyword: 'takeaway', industry: 'imbiss' },
  { keyword: 'fast food', industry: 'burger' },
]

/**
 * Map a Google Maps category to an industry slug.
 *
 * Strategy:
 * 1. Exact match on main category (case-insensitive)
 * 2. Exact match in all categories
 * 3. Fuzzy keyword match on any category
 * 4. null → AI Classifier takes over
 */
export function mapGmapsCategory(
  mainCategory: string | null,
  allCategories: string[]
): string | null {
  // 1. Exact match on main category
  if (mainCategory) {
    const key = mainCategory.toLowerCase().trim()
    if (EXACT_MAP[key]) return EXACT_MAP[key]
  }

  // 2. Exact match in all categories
  for (const cat of allCategories) {
    const key = cat.toLowerCase().trim()
    if (EXACT_MAP[key]) return EXACT_MAP[key]
  }

  // 3. Fuzzy keyword match
  const allText = [mainCategory, ...allCategories]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  for (const { keyword, industry } of KEYWORD_MAP) {
    if (allText.includes(keyword)) return industry
  }

  // 4. No match
  return null
}
