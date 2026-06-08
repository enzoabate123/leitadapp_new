export function safeParse(str, fallback = []) {
  if (typeof str !== 'string') return str || fallback;
  if (!str.trim()) return fallback;
  try {
    return JSON.parse(str) || fallback;
  } catch (e) {
    return fallback;
  }
}
