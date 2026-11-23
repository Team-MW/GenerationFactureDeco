/**
 * Géocodage via OpenStreetMap (Nominatim) : transforme une adresse en coordonnées.
 * Seule l'adresse postale est envoyée, jamais le nom ni le téléphone du client.
 */
export async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  const query = address.trim();
  if (query.length < 5) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "gestion-livraisons/1.0", "Accept-Language": "fr" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const results: { lat: string; lon: string }[] = await response.json();
    const first = results[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}
