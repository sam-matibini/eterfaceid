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

/** Store ISO-2 when we can, otherwise keep the typed country name. */
export function normalizeCountry(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  const mapped = COUNTRY_ISO[trimmed.toLowerCase()];
  return mapped ?? trimmed.slice(0, 80);
}
