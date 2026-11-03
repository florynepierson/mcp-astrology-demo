#!/usr/bin/env node
// MCP server demo: exposes real astronomical calculations as tools for any MCP-compatible
// client (Claude Desktop, Claude Code, etc.). Built on the open-source `astronomy-engine`
// library (cosinekitty/astronomy, MIT) for the raw positions, with a small, independently
// written, standard astrology layer on top (sign boundaries, major aspects with a simplified
// orb). This is a standalone demo, not a repackaging of any production system's private
// interpretation or aspect-orb logic.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'node:module';
// astronomy-engine's package.json points "import" at esm/astronomy.js without a nested
// package.json marking that folder "type": "module", so Node's native ESM resolver loads it
// as CommonJS and chokes on its `export` syntax. require() correctly resolves the "require"
// condition (./astronomy.js, genuine CJS) instead.
const Astronomy = createRequire(import.meta.url)('astronomy-engine');

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const BODIES = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars, jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn, uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune,
  pluto: Astronomy.Body.Pluto,
};

// Standard major-aspect angles. A single 6° orb for all of them (simplified on purpose for a
// demo — production astrology software typically varies the orb per aspect and per body).
const ASPECTS = [
  { type: 'conjunction', angle: 0 },
  { type: 'sextile', angle: 60 },
  { type: 'square', angle: 90 },
  { type: 'trine', angle: 120 },
  { type: 'opposition', angle: 180 },
];
const ORB = 6;

function geocentricEclipticLongitude(body, date) {
  const geoVector = Astronomy.GeoVector(body, date, true);
  const ecliptic = Astronomy.Ecliptic(geoVector);
  return ((ecliptic.elon % 360) + 360) % 360; // normalize to [0, 360)
}

function signAndDegree(longitude) {
  const signIndex = Math.floor(longitude / 30);
  return { sign: SIGNS[signIndex], degree: Math.round((longitude - signIndex * 30) * 10) / 10 };
}

function angularSeparation(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

const server = new McpServer({ name: 'mcp-astrology-demo', version: '1.0.0' });

server.registerTool(
  'get_planet_position',
  {
    title: 'Get planet position',
    description: 'Computes the geocentric ecliptic longitude and zodiac sign of a celestial body at a given date, using real astronomical calculations.',
    inputSchema: {
      body: z.enum(Object.keys(BODIES)).describe('Celestial body'),
      date: z.string().describe('Date in ISO format (YYYY-MM-DD, or a full ISO datetime)'),
    },
  },
  async ({ body, date }) => {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return { content: [{ type: 'text', text: `Invalid date: ${date}` }], isError: true };
    }
    const longitude = geocentricEclipticLongitude(BODIES[body], parsed);
    const { sign, degree } = signAndDegree(longitude);
    return { content: [{ type: 'text', text: JSON.stringify({ body, longitude: Math.round(longitude * 1000) / 1000, sign, degree }, null, 2) }] };
  }
);

server.registerTool(
  'get_natal_chart',
  {
    title: 'Get natal chart',
    description: 'Computes planetary placements (sign, degree) and major aspects (conjunction, sextile, square, trine, opposition) for a given birth date, from real astronomical positions.',
    inputSchema: {
      birthDate: z.string().describe('Birth date in ISO format (YYYY-MM-DD, or a full ISO datetime)'),
    },
  },
  async ({ birthDate }) => {
    const parsed = new Date(birthDate);
    if (isNaN(parsed.getTime())) {
      return { content: [{ type: 'text', text: `Invalid birthDate: ${birthDate}` }], isError: true };
    }
    const longitudes = {};
    for (const [name, body] of Object.entries(BODIES)) {
      longitudes[name] = geocentricEclipticLongitude(body, parsed);
    }
    const placements = Object.entries(longitudes).map(([name, longitude]) => ({
      body: name,
      longitude: Math.round(longitude * 1000) / 1000,
      ...signAndDegree(longitude),
    }));
    const names = Object.keys(longitudes);
    const aspects = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const sep = angularSeparation(longitudes[names[i]], longitudes[names[j]]);
        for (const { type, angle } of ASPECTS) {
          const orb = Math.abs(sep - angle);
          if (orb <= ORB) {
            aspects.push({ between: [names[i], names[j]], type, orb: Math.round(orb * 100) / 100 });
            break;
          }
        }
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify({ date: parsed.toISOString(), placements, aspects }, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
