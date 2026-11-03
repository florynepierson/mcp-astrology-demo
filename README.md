# mcp-astrology-demo

An [MCP](https://modelcontextprotocol.io) server that exposes real astronomical calculations as
tools for any MCP-compatible client (Claude Desktop, Claude Code, etc.).

Two different computation sources, on purpose:

- **`get_planet_position`** runs on the open-source [`astronomy-engine`](https://github.com/cosinekitty/astronomy)
  library (MIT), with a small, self-contained astrology layer on top (sign boundaries). A
  standalone calculation, not a repackaging of any production system's logic.
- **`get_natal_chart`** calls [Magical Chart](https://magicalchart.com)'s live, public, unauthenticated
  natal-chart API — my production astrology product's real, Swiss Ephemeris-validated engine —
  over HTTP. It exposes the engine's *results*, not its source.

## Why this exists

I run [Magical Chart](https://magicalchart.com), an astrology/tarot product in production with
real paying users, built on a proprietary astronomical engine. This repo demonstrates the MCP
protocol itself (server setup, tool schemas, stdio transport) in front of real computation — one
tool shows the protocol against a from-scratch calculation, the other shows it fronting a live
production API, without exposing that production engine's source.

## Tools

- **`get_planet_position(body, date)`** — geocentric ecliptic longitude and zodiac sign of one
  celestial body at a given date. Computed locally.
- **`get_natal_chart(birthDate, latitude?, longitude?, houseSystem?)`** — placements, houses,
  aspects, and chart angles (Ascendant, Midheaven) for a given birth moment, fetched live from
  `magicalchart.com/api/v1/natal`. Latitude/longitude are optional — houses and angles need a
  real birth location to mean anything, so without them the response carries a `notice` field
  saying they're placeholder (0,0) values. That endpoint is rate-limited server-side (60
  requests/minute for anonymous callers); this tool surfaces a clear error if the limit is hit
  rather than retrying silently.

Both verified against a real MCP client handshake (`initialize` → `tools/list` → `tools/call`)
before publishing — not just a syntax check.

## Run it

```bash
npm install
node index.js
```

It speaks MCP over stdio. Point an MCP client's config at it, e.g. for Claude Desktop:

```json
{
  "mcpServers": {
    "astrology-demo": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-astrology-demo/index.js"]
    }
  }
}
```

## Notes

- `astronomy-engine`'s package.json points its `"import"` condition at an ESM file without a
  nested `package.json` marking that folder `"type": "module"`, so Node's native ESM resolver
  mis-loads it. Worked around with `createRequire` to pull in the CJS build directly — see the
  comment in `index.js`.
- The aspect orb (6°, same for every aspect type) is a simplified default for a demo. Production
  astrology software typically varies the orb per aspect and per body.
