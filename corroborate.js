'use strict';

/**
 * Pure decision function. Never reads Date.now() / the wall clock —
 * every notion of "now" comes from the request's own `asOf` field.
 */
const VALID_TYPES = new Set(['dns', 'ct_log', 'registry', 'archive', 'scan']);

const INVALID_RESULT = Object.freeze({
  verdict: 'invalid',
  confidence: 'low',
  corroboratingSources: [],
});

const UNVERIFIED_RESULT = Object.freeze({
  verdict: 'unverified',
  confidence: 'low',
  corroboratingSources: [],
});

function isPlainObject(x) {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseIsoDate(s) {
  if (typeof s !== 'string' || s.trim() === '') return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

function isValidSourceShape(src) {
  if (!isPlainObject(src)) return false;
  const { id, origin, value, observedAt, type } = src;
  return (
    typeof id === 'string' &&
    typeof origin === 'string' &&
    typeof value === 'string' &&
    typeof observedAt === 'string' &&
    VALID_TYPES.has(type)
  );
}

/**
 * @param {object} body - the parsed request body
 * @returns {{verdict: string, confidence: string, corroboratingSources: string[]}}
 */
function corroborate(body) {
  // --- Rule 1: structural validity -------------------------------------
  if (!isPlainObject(body)) return INVALID_RESULT;

  const { claim, asOf, stalenessDays, sources } = body;

  if (!isPlainObject(claim) || typeof claim.value !== 'string') return INVALID_RESULT;

  const asOfMs = parseIsoDate(asOf);
  if (asOfMs === null) return INVALID_RESULT;

  if (typeof stalenessDays !== 'number' || !Number.isFinite(stalenessDays)) {
    return INVALID_RESULT;
  }

  if (!Array.isArray(sources)) return INVALID_RESULT;

  // --- Drop malformed sources entirely (they don't invalidate the request) ---
  const validSources = sources.filter(isValidSourceShape);

  // --- Determine freshness relative to asOf (never the wall clock) ----
  const stalenessMs = stalenessDays * 24 * 60 * 60 * 1000;
  const withFreshness = validSources
    .map((src) => {
      const observedMs = parseIsoDate(src.observedAt);
      const fresh = observedMs !== null && (asOfMs - observedMs) <= stalenessMs;
      return { ...src, __fresh: fresh };
    })
    // sources whose observedAt itself doesn't parse are unusable
    .filter((src) => parseIsoDate(src.observedAt) !== null);

  // --- Rule 2: contradiction --------------------------------------------
  const contradicting = withFreshness
    .filter((s) => s.__fresh && s.authoritative === true && s.value !== claim.value)
    .map((s) => s.id)
    .sort();

  if (contradicting.length > 0) {
    return {
      verdict: 'contradicted',
      confidence: 'low',
      corroboratingSources: contradicting,
    };
  }

  // --- Rule 3: support ----------------------------------------------------
  const agreeing = withFreshness.filter((s) => s.__fresh && s.value === claim.value);

  // Reduce to one representative per origin: smallest id (lexicographic).
  const byOrigin = new Map();
  for (const s of agreeing) {
    const current = byOrigin.get(s.origin);
    if (!current || s.id < current.id) {
      byOrigin.set(s.origin, s);
    }
  }
  const representatives = [...byOrigin.values()];

  if (representatives.length >= 2) {
    const distinctTypes = new Set(representatives.map((s) => s.type));
    const confidence = distinctTypes.size >= 2 ? 'high' : 'medium';
    return {
      verdict: 'supported',
      confidence,
      corroboratingSources: representatives.map((s) => s.id).sort(),
    };
  }

  // --- Rule 4: fallback -----------------------------------------------
  return UNVERIFIED_RESULT;
}

module.exports = { corroborate, VALID_TYPES };
