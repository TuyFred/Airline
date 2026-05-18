export const PMC_STANDARD_KG = 5000;
export const PMC_STANDARD_SKIDS = 4;

export const AIRLINE_DIRECTION_OPTIONS = {
  ETHIOPIAN: ['FRANKFURT', 'DUBAI', 'GUANGZHOU'],
  'ETHIOPIAN AIRLINES': ['FRANKFURT', 'DUBAI', 'GUANGZHOU'],
  KLM: ['AMSTERDAM', 'PARIS'],
  QATAR: ['DOHA', 'JEDDAH'],
  BRUSSELS: ['BRUSSELS', 'LIEGE'],
  TURKISH: ['ISTANBUL', 'FRANKFURT'],
  EGYPTAIR: ['CAIRO', 'JEDDAH']
};

export function normalizeAirlineKey(name) {
  return String(name || '').trim().toUpperCase();
}

export function getDirectionOptions(airlineName, fallback = []) {
  const key = normalizeAirlineKey(airlineName);
  const mapped = AIRLINE_DIRECTION_OPTIONS[key] || [];
  const fallbackNormalized = (fallback || []).map((item) => String(item || '').trim().toUpperCase()).filter(Boolean);
  return Array.from(new Set([...mapped, ...fallbackNormalized]));
}

export function toPmcTotals(pmcCount) {
  const count = Number(pmcCount || 0);
  if (!Number.isFinite(count) || count <= 0) {
    return { skids: 0, kg: 0 };
  }
  return {
    skids: Number((count * PMC_STANDARD_SKIDS).toFixed(2)),
    kg: Number((count * PMC_STANDARD_KG).toFixed(2))
  };
}
