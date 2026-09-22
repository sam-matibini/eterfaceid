export const COUNTRY_OPTIONS = [
  { code: "CA", name: "Canada" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IE", name: "Ireland" },
  { code: "IN", name: "India" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "NZ", name: "New Zealand" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "CH", name: "Switzerland" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "AE", name: "United Arab Emirates" },
] as const;

const COUNTRY_ISO: Record<string, string> = {
  canada: "CA",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  england: "GB",
  australia: "AU",
  germany: "DE",
  france: "FR",
  ireland: "IE",
  india: "IN",
  nigeria: "NG",
  kenya: "KE",
  "south africa": "ZA",
  mexico: "MX",
  brazil: "BR",
  singapore: "SG",
  "hong kong": "HK",
  "new zealand": "NZ",
  netherlands: "NL",
  spain: "ES",
  italy: "IT",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  switzerland: "CH",
  japan: "JP",
  "south korea": "KR",
  korea: "KR",
  china: "CN",
  uae: "AE",
  "united arab emirates": "AE",
};

for (const option of COUNTRY_OPTIONS) {
  COUNTRY_ISO[option.name.toLowerCase()] = option.code;
  COUNTRY_ISO[option.code.toLowerCase()] = option.code;
}

/** Store ISO-2 when we can, otherwise keep the typed country name. */
export function normalizeCountry(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  const mapped = COUNTRY_ISO[trimmed.toLowerCase()];
  return mapped ?? trimmed.slice(0, 80);
}

export function countrySelectValue(value: string | null | undefined, fallback = "CA") {
  const normalized = normalizeCountry(value);
  if (normalized && COUNTRY_OPTIONS.some((option) => option.code === normalized)) return normalized;
  return fallback;
}
