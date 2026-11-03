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

// Unlike get_planet_position above (local astronomy-engine math), this tool calls Magical
// Chart's live, public, unauthenticated natal-chart API (magicalchart.com/for-agents) instead
// of recomputing locally. That API is backed by the production astronomical engine (Swiss
// Ephemeris-validated), not the open-source astronomy-engine library — it exposes the real
// computation results over HTTP without exposing the engine's source. Houses, Ascendant and
// Midheaven require a birth location, which this local demo doesn't otherwise need; location
// defaults to 0,0 (equator/prime meridian) when omitted, so houses and angles are placeholder
// in that case — pass latitude/longitude for a real chart.
const NATAL_API_URL = 'https://www.magicalchart.com/api/v1/natal';

server.registerTool(
  'get_natal_chart',
  {
    title: 'Get natal chart',
    description: "Fetches planetary placements (sign, degree, house), major aspects, house cusps and chart angles (Ascendant, Midheaven) for a given birth moment and place, from Magical Chart's live production astrology API (not a local recomputation).",
    inputSchema: {
      birthDate: z.string().describe('Birth moment in ISO format (YYYY-MM-DD, or a full ISO datetime, UTC)'),
      latitude: z.number().min(-90).max(90).optional().describe('Birth latitude in degrees. Omit for planet signs/degrees only — houses and angles need a real location.'),
      longitude: z.number().min(-180).max(180).optional().describe('Birth longitude in degrees. Omit for planet signs/degrees only — houses and angles need a real location.'),
      houseSystem: z.enum(['whole-sign', 'equal']).optional().describe('House system. Defaults to whole-sign.'),
    },
  },
  async ({ birthDate, latitude, longitude, houseSystem }) => {
    const parsed = new Date(birthDate);
    if (isNaN(parsed.getTime())) {
      return { content: [{ type: 'text', text: `Invalid birthDate: ${birthDate}` }], isError: true };
    }
    const hadLocation = latitude !== undefined && longitude !== undefined;
    const body = {
      timestamp: parsed.toISOString(),
      latitude: hadLocation ? latitude : 0,
      longitude: hadLocation ? longitude : 0,
      ...(houseSystem ? { houseSystem } : {}),
    };
    let res;
    try {
      res = await fetch(NATAL_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return { content: [{ type: 'text', text: `Could not reach the Magical Chart natal API: ${err.message}` }], isError: true };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { content: [{ type: 'text', text: `Magical Chart natal API returned ${res.status}: ${detail}` }], isError: true };
    }
    const payload = await res.json();
    if (!hadLocation) {
      payload.notice = 'No birth location was given — latitude/longitude defaulted to 0,0, so houses, Ascendant and Midheaven in this response are placeholder values, not a real chart. Pass latitude/longitude for a real chart.';
    }
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
