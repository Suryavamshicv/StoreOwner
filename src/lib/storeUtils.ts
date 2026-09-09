/**
 * Store ID formatting and compact identifier generator.
 * Enforces maximum 8 alphanumeric characters (e.g. 9QE24TFC) for optimal
 * display and compatibility with the customer scanning mobile application.
 */

export function formatStoreId(raw?: string | null): string {
  if (!raw || raw.trim() === '' || raw === 'anonymous') {
    return '9QE24TFC';
  }
  // Strip special characters, spaces, hyphens, and convert to uppercase
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length === 0) {
    return '9QE24TFC';
  }
  // Enforce max 8 digits/characters (e.g. 9QE24TFC)
  return cleaned.slice(0, 8);
}

export function generateRandomStoreId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
