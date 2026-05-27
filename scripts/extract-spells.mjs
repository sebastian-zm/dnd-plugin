/**
 * Extract Spell Descriptions from the SRD PDF using DeepSeek to parse entries.
 * Existing hand-edited entries (matched by name) are preserved as-is.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/extract-spells.mjs [path-to-pdf]
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import yaml from 'js-yaml';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SPELLS_PATH = path.join(ROOT, 'src', 'srd', 'spells.yaml');
const PDF_PATH = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'SRD_CC_v5.2.1.pdf');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error('Set DEEPSEEK_API_KEY env var'); process.exit(1); }

// Spell Descriptions pages in SRD 5.2.1
const SPELLS_FIRST = 107;
const SPELLS_LAST  = 175;

// Approximate token limit per chunk
const CHUNK_CHARS = 12_000;

async function extractPdfText() {
  console.log(`Reading PDF: ${PDF_PATH}`);
  const buf = await fs.readFile(PDF_PATH);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({ first: SPELLS_FIRST, last: SPELLS_LAST });
  await parser.destroy();

  const text = result.pages.map(p => p.text).join('\n');
  // Entries start at "Spell Descriptions" heading, first spell is "Acid Arrow"
  const start = text.indexOf('Spell Descriptions');
  return start >= 0 ? text.slice(start) : text;
}

async function callDeepSeek(systemPrompt, userContent) {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DeepSeek API ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}

const SYSTEM_PROMPT = `\
You convert raw D&D 5.2.1 SRD Spell Descriptions text (extracted from a two-column PDF) into clean YAML.

Output a YAML list where each spell is one item with these fields:
- name: the spell's name (string)
- level: integer 0–9 (use 0 for cantrips)
- school: school of magic (Abjuration, Conjuration, Divination, Enchantment, Evocation,
  Illusion, Necromancy, Transmutation)
- classes: array of class names that have this spell on their spell list
- ritual: boolean — true only if the casting time includes "or Ritual"
- concentration: boolean — true only if the duration starts with "Concentration"
- casting_time: string (e.g. "Action", "Bonus Action", "1 minute or Ritual")
- range: string (e.g. "90 feet", "Self", "Touch")
- components: string (e.g. "V, S, M (powdered rhubarb leaf)")
- duration: string (e.g. "Instantaneous", "Concentration, up to 1 minute")
- text: the full spell description as a single flowing string (use >- block scalar)
- higher_level: (optional) text of the "Using a Higher-Level Spell Slot" section only

Guidelines:
- Fix PDF hyphenation artifacts (e.g. "Dex-\\nterity" → "Dexterity").
- Inline sub-sections like "Aquatic Adaptation." directly into text rather than splitting them.
- Do not include the "Using a Higher-Level Spell Slot." label in higher_level — just the text.
- Omit higher_level entirely when absent.
- Output only the raw YAML list — no markdown fences, no commentary.
- Use block scalar style (>-) for text and higher_level.

Example output:
- name: Acid Arrow
  level: 2
  school: Evocation
  classes: [Wizard]
  ritual: false
  concentration: false
  casting_time: Action
  range: 90 feet
  components: V, S, M (powdered rhubarb leaf)
  duration: Instantaneous
  text: >-
    A shimmering green arrow streaks toward a target within range and bursts in a spray of acid.
    Make a ranged spell attack against the target. On a hit, the target takes 4d4 Acid damage and
    2d4 Acid damage at the end of its next turn. On a miss, the arrow splashes the target with acid
    for half as much of the initial damage only.
  higher_level: >-
    The damage (both initial and later) increases by 1d4 for each spell slot level above 2.
- name: Acid Splash
  level: 0
  school: Evocation
  classes: [Sorcerer, Wizard]
  ritual: false
  concentration: false
  casting_time: Action
  range: 60 feet
  components: V, S
  duration: Instantaneous
  text: >-
    You create an acidic bubble at a point within range, where it explodes in a 5-foot-radius
    Sphere. Each creature in that Sphere must succeed on a Dexterity saving throw or take 1d6
    Acid damage. Cantrip Upgrade: The damage increases by 1d6 when you reach levels 5 (2d6),
    11 (3d6), and 17 (4d6).
`;

function chunkText(text, size) {
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    let end = pos + size;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > pos) end = nl;
    }
    chunks.push(text.slice(pos, end));
    pos = end;
  }
  return chunks;
}

function parseYamlResponse(raw) {
  const stripped = raw.replace(/^```ya?ml\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const parsed = yaml.load(stripped);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('YAML parse error in chunk response:', e.message);
    console.warn('Raw response snippet:', stripped.slice(0, 300));
    return [];
  }
}

async function main() {
  const spellText = await extractPdfText();
  console.log(`Spell text: ${spellText.length} chars`);

  const chunks = chunkText(spellText, CHUNK_CHARS);
  console.log(`Sending ${chunks.length} chunk(s) to DeepSeek...`);

  const allExtracted = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const raw = await callDeepSeek(SYSTEM_PROMPT, chunks[i]);
    const entries = parseYamlResponse(raw);
    console.log(`    → ${entries.length} entries`);
    allExtracted.push(...entries);
  }
  console.log(`Total extracted: ${allExtracted.length} spells`);

  let existing = [];
  try {
    existing = yaml.load(await fs.readFile(SPELLS_PATH, 'utf8')) ?? [];
  } catch { /* file doesn't exist yet */ }

  const existingNames = new Set(existing.map(e => e.name));
  console.log(`Existing hand-edited entries kept: ${existing.length}`);

  const seen = new Set(existingNames);
  const newEntries = [];
  for (const e of allExtracted) {
    if (e?.name && !seen.has(e.name)) {
      seen.add(e.name);
      newEntries.push(e);
    }
  }
  console.log(`New entries added: ${newEntries.length}`);

  const merged = [...existing, ...newEntries].sort((a, b) => a.name.localeCompare(b.name));

  await fs.mkdir(path.dirname(SPELLS_PATH), { recursive: true });
  await fs.writeFile(SPELLS_PATH, yaml.dump(merged, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    defaultStyle: '>',
  }), 'utf8');

  console.log(`\nWritten ${merged.length} spells to ${SPELLS_PATH}`);
  console.log('Sample of new entries:');
  newEntries.slice(0, 15).forEach(e =>
    console.log(`  • ${e.name} (Level ${e.level} ${e.school})`)
  );
}

main().catch(err => { console.error(err); process.exit(1); });
