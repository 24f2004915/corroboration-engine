# corroboration-engine

OSINT claim corroboration service. `POST /corroborate` — no dependencies, no wall-clock reads.

## Run locally

```bash
node test.js      # run the test suite
node server.js     # start on :8787 (or $PORT)
```

## Example request

```bash
curl -s -X POST localhost:8787/corroborate \
  -H 'Content-Type: application/json' \
  -d '{
    "claim": {"subject":"agbebk.example","predicate":"resolves_to","value":"203.0.113.20"},
    "asOf": "2026-08-01T00:00:00Z",
    "stalenessDays": 90,
    "sources": [
      {"id":"s1","type":"dns","origin":"resolver-a","observedAt":"2026-07-30T00:00:00Z","value":"203.0.113.20","authoritative":false}
    ]
  }'
```

## Deploy (Render)

1. Push this repo to GitHub.
2. Render dashboard → New → Web Service → connect this repo.
3. Build command: (leave empty)
4. Start command: `node server.js`
5. Render sets `$PORT` automatically; `server.js` already reads it.
