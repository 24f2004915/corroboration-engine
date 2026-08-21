'use strict';

const assert = require('assert');
const { corroborate } = require('./corroborate');

let passed = 0;
function check(name, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    console.error('  expected:', JSON.stringify(expected));
    console.error('  actual:  ', JSON.stringify(actual));
    process.exitCode = 1;
  }
}

const claim = { subject: 'agbebk.example', predicate: 'resolves_to', value: '203.0.113.20' };
const asOf = '2026-08-01T00:00:00Z';

// 1. Invalid body shapes
check('non-object body', corroborate('nope'), { verdict: 'invalid', confidence: 'low', corroboratingSources: [] });
check('claim.value not string', corroborate({ claim: { value: 5 }, asOf, stalenessDays: 90, sources: [] }),
  { verdict: 'invalid', confidence: 'low', corroboratingSources: [] });
check('asOf missing', corroborate({ claim, stalenessDays: 90, sources: [] }),
  { verdict: 'invalid', confidence: 'low', corroboratingSources: [] });
check('asOf unparseable', corroborate({ claim, asOf: 'not-a-date', stalenessDays: 90, sources: [] }),
  { verdict: 'invalid', confidence: 'low', corroboratingSources: [] });
check('stalenessDays not number', corroborate({ claim, asOf, stalenessDays: '90', sources: [] }),
  { verdict: 'invalid', confidence: 'low', corroboratingSources: [] });
check('sources not array', corroborate({ claim, asOf, stalenessDays: 90, sources: {} }),
  { verdict: 'invalid', confidence: 'low', corroboratingSources: [] });

// 2. Unverified: no sources / single source / mirrors only / all stale
check('no sources', corroborate({ claim, asOf, stalenessDays: 90, sources: [] }), {
  verdict: 'unverified', confidence: 'low', corroboratingSources: [],
});

check('single independent source', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [{ id: 's1', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' }],
}), { verdict: 'unverified', confidence: 'low', corroboratingSources: [] });

check('two sources but same origin (mirrors) count once -> unverified', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's2', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's1', type: 'ct_log', origin: 'resolver-a', observedAt: '2026-07-29T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'unverified', confidence: 'low', corroboratingSources: [] });

check('agreement entirely stale -> unverified', corroborate({
  claim, asOf, stalenessDays: 10,
  sources: [
    { id: 's1', type: 'dns', origin: 'resolver-a', observedAt: '2026-01-01T00:00:00Z', value: '203.0.113.20' },
    { id: 's2', type: 'ct_log', origin: 'resolver-b', observedAt: '2026-01-01T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'unverified', confidence: 'low', corroboratingSources: [] });

// 3. Supported: medium (single type) vs high (multi type)
check('supported, same type -> medium', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's1', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's2', type: 'dns', origin: 'resolver-b', observedAt: '2026-07-29T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'supported', confidence: 'medium', corroboratingSources: ['s1', 's2'] });

check('supported, mixed types -> high', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's1', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's2', type: 'ct_log', origin: 'resolver-b', observedAt: '2026-07-29T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'supported', confidence: 'high', corroboratingSources: ['s1', 's2'] });

// representative selection: smallest id per origin
check('per-origin representative is smallest id', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's9', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's3', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's5', type: 'ct_log', origin: 'resolver-b', observedAt: '2026-07-29T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'supported', confidence: 'high', corroboratingSources: ['s3', 's5'] });

// 4. Contradicted
check('fresh authoritative disagreement -> contradicted', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's1', type: 'registry', origin: 'iana', observedAt: '2026-07-30T00:00:00Z', value: '198.51.100.1', authoritative: true },
    { id: 's2', type: 'dns', origin: 'resolver-b', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's3', type: 'ct_log', origin: 'resolver-c', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'contradicted', confidence: 'low', corroboratingSources: ['s1'] });

// stale authoritative disagreement must NOT contradict a fresh, well-corroborated claim
check('stale authoritative disagreement does not contradict', corroborate({
  claim, asOf, stalenessDays: 30,
  sources: [
    { id: 's1', type: 'registry', origin: 'iana', observedAt: '2026-01-01T00:00:00Z', value: '198.51.100.1', authoritative: true },
    { id: 's2', type: 'dns', origin: 'resolver-b', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's3', type: 'ct_log', origin: 'resolver-c', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'supported', confidence: 'high', corroboratingSources: ['s2', 's3'] });

// non-authoritative disagreement neither contradicts nor supports
check('non-authoritative disagreement is ignored, not contradiction', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's1', type: 'scan', origin: 'shodan', observedAt: '2026-07-30T00:00:00Z', value: '198.51.100.1', authoritative: false },
    { id: 's2', type: 'dns', origin: 'resolver-b', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's3', type: 'ct_log', origin: 'resolver-c', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'supported', confidence: 'high', corroboratingSources: ['s2', 's3'] });

// malformed sources are dropped silently, not fatal
check('malformed sources ignored, valid ones still evaluated', corroborate({
  claim, asOf, stalenessDays: 90,
  sources: [
    { id: 's1', type: 'bogus-type', origin: 'x', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's2', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' }, // missing type
    { id: 's3', type: 'dns', origin: 'resolver-b', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'unverified', confidence: 'low', corroboratingSources: [] });

// staleness boundary: exactly stalenessDays old is still fresh (<=)
check('exactly at staleness boundary is fresh', corroborate({
  claim, asOf: '2026-08-01T00:00:00Z', stalenessDays: 2,
  sources: [
    { id: 's1', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's2', type: 'ct_log', origin: 'resolver-b', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'supported', confidence: 'high', corroboratingSources: ['s1', 's2'] });

check('one day past staleness boundary is stale', corroborate({
  claim, asOf: '2026-08-01T00:00:00Z', stalenessDays: 1,
  sources: [
    { id: 's1', type: 'dns', origin: 'resolver-a', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
    { id: 's2', type: 'ct_log', origin: 'resolver-b', observedAt: '2026-07-30T00:00:00Z', value: '203.0.113.20' },
  ],
}), { verdict: 'unverified', confidence: 'low', corroboratingSources: [] });

console.log(`\n${passed} test(s) passed.`);
