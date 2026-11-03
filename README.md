# mcp-astrology-demo

An [MCP](https://modelcontextprotocol.io) server that exposes real astronomical calculations as
tools for any MCP-compatible client (Claude Desktop, Claude Code, etc.).

Built on the open-source [`astronomy-engine`](https://github.com/cosinekitty/astronomy) library
(MIT) for the raw planetary positions, with a small, self-contained astrology layer on top: sign
boundaries and major aspects (conjunction, sextile, square, trine, opposition). Standalone demo —
not a repackaging of any production system's proprietary interpretation logic.

## Why this exists

I run [Magical Chart](https://magicalchart.com), an astrology/tarot product in production with
real paying users, built on a proprietary astronomical engine. This repo is a small, public,
from-scratch companion: it demonstrates the MCP protocol itself (server setup, tool schemas,
stdio transport) against real computation, without exposing that production engine's source.

## Tools

- **`get_planet_position(body, date)`** — geocentric ecliptic longitude and zodiac sign of one
  celestial body at a given date.
- **`get_natal_chart(birthDate)`** — placements for all 10 bodies plus major aspects between
  them, for a given birth date.

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
