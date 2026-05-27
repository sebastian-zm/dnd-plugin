/**
 * Extract Monster and Animal stat blocks from the SRD PDF using DeepSeek to parse entries.
 * Covers "Monsters A–Z" (pp. 258–343) and "Animals" (pp. 344–365).
 * Existing hand-edited entries (matched by name) are preserved as-is.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/extract-bestiary.mjs [path-to-pdf]
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import yaml from 'js-yaml';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BESTIARY_PATH = path.join(ROOT, 'src', 'srd', 'bestiary.yaml');
const PDF_PATH = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'SRD_CC_v5.2.1.pdf');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error('Set DEEPSEEK_API_KEY env var'); process.exit(1); }

// Monsters A–Z + Animals pages in SRD 5.2.1
const BESTIARY_FIRST = 258;
const BESTIARY_LAST  = 365;

// Smaller chunks for stat blocks — they're dense but short
const CHUNK_CHARS = 10_000;

async function extractPdfText() {
  console.log(`Reading PDF: ${PDF_PATH}`);
  const buf = await fs.readFile(PDF_PATH);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({ first: BESTIARY_FIRST, last: BESTIARY_LAST });
  await parser.destroy();

  const text = result.pages.map(p => p.text).join('\n');
  // Entries start at "Monsters A–Z"
  const start = text.search(/Monsters A[–-]Z/);
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
You convert raw D&D 5.2.1 SRD monster stat block text (extracted from a two-column PDF) into
clean YAML. The PDF extraction scrambles the two-column layout — use context to reconstruct each
stat block correctly.

Output a YAML list. Each creature is one item with these fields:

Required fields:
- name: string — the creature's name
- size: one of Tiny | Small | Medium | Large | Huge | Gargantuan
  (use "Medium or Small" or similar when the stat block lists options)
- type: creature type (e.g. Aberration, Beast, Celestial, Construct, Dragon, Elemental,
  Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant, Undead)
- tags: array of strings for parenthetical subtypes, e.g. ["Demon"] for "Fiend (Demon)".
  Omit or use [] if none.
- alignment: string (e.g. "Lawful Evil", "Neutral", "Unaligned", "Any Alignment")
- ac: integer — the Armor Class number
- hp: integer — average Hit Points
- hp_dice: string — the Hit Dice expression, e.g. "20d10 + 40"
- speed: string — full speed entry, e.g. "30 ft." or "10 ft., Fly 90 ft. (hover)"
- str: integer  - dex: integer  - con: integer
- int: integer  - wis: integer  - cha: integer
- cr: string — Challenge Rating, e.g. "10", "1/2", "0"
- xp: integer — XP value

Optional fields (omit if not present in the stat block):
- str_save / dex_save / con_save / int_save / wis_save / cha_save: integer saving throw
  bonuses (only include when explicitly listed in the stat block)
- skills: string — e.g. "History +12, Perception +10"
- resistances: array of damage type strings
- vulnerabilities: array of damage type strings
- immunities: array of damage type strings (damage types only)
- condition_immunities: array of condition name strings
- senses: string — e.g. "Darkvision 120 ft.; Passive Perception 20"
- languages: string — e.g. "Common, Elvish" or "None"
- pb: integer — Proficiency Bonus (the number, e.g. 4 for PB +4)
- xp_in_lair: integer — alternate XP when fought in lair (e.g. Aboleth 7200 in lair)
- gear: string — equipment listed in the Gear entry
- initiative: integer — initiative modifier (the number before the score in parentheses)
- traits: array of {name, text} objects
- actions: array of {name, text} objects
- bonus_actions: array of {name, text} objects
- reactions: array of {name, text} objects
- legendary_actions: object with:
    uses: integer (actions per turn)
    lair_uses: integer (optional, if the lair count differs)
    intro: string (optional flavour intro text)
    actions: array of {name, text} objects

Guidelines:
- Fix PDF hyphenation artifacts (e.g. "Bludgeon-\\ning" → "Bludgeoning").
- Preserve italic/bold markers as plain text — do not use markdown bold/italic.
- Keep all mechanical text verbatim (attack rolls, damage expressions, saving throw DCs, etc.).
- Use block scalar >- for any multi-sentence text field.
- Output only the raw YAML list — no markdown fences, no commentary.

Example output:
- name: Aboleth
  size: Large
  type: Aberration
  tags: []
  alignment: Lawful Evil
  ac: 17
  hp: 150
  hp_dice: 20d10 + 40
  speed: 10 ft., Swim 40 ft.
  str: 21
  dex: 9
  con: 15
  int: 18
  wis: 15
  cha: 18
  str_save: 5
  con_save: 6
  int_save: 8
  wis_save: 6
  skills: History +12, Perception +10
  senses: Darkvision 120 ft.; Passive Perception 20
  languages: Deep Speech; telepathy 120 ft.
  cr: "10"
  xp: 5900
  xp_in_lair: 7200
  pb: 4
  traits:
    - name: Amphibious
      text: The aboleth can breathe air and water.
    - name: Legendary Resistance (3/Day, or 4/Day in Lair)
      text: If the aboleth fails a saving throw, it can choose to succeed instead.
  actions:
    - name: Multiattack
      text: The aboleth makes two Tentacle attacks and uses either Consume Memories or Dominate Mind if available.
    - name: Tentacle
      text: >-
        Melee Attack Roll: +9, reach 15 ft. Hit: 12 (2d6 + 5) Bludgeoning damage. If the target is
        a Large or smaller creature, it has the Grappled condition (escape DC 14) from one of four tentacles.
  legendary_actions:
    uses: 3
    lair_uses: 4
    actions:
      - name: Lash
        text: The aboleth makes one Tentacle attack.
      - name: Psychic Drain
        text: >-
          If the aboleth has at least one creature Charmed or Grappled, it uses Consume Memories
          and regains 5 (1d10) Hit Points.
- name: Air Elemental
  size: Large
  type: Elemental
  tags: []
  alignment: Neutral
  ac: 15
  hp: 90
  hp_dice: 12d10 + 24
  speed: 10 ft., Fly 90 ft. (hover)
  str: 14
  dex: 20
  con: 14
  int: 6
  wis: 10
  cha: 6
  immunities: [Poison, Thunder]
  condition_immunities: [Exhaustion, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained, Unconscious]
  senses: Darkvision 60 ft.; Passive Perception 10
  languages: Primordial (Auran)
  cr: "5"
  xp: 1800
  pb: 3
  traits:
    - name: Air Form
      text: The elemental can enter a creature's space and stop there. It can move through a space as narrow as 1 inch without expending extra movement to do so.
  actions:
    - name: Multiattack
      text: The elemental makes two Thunderous Slam attacks.
    - name: Thunderous Slam
      text: Melee Attack Roll: +8, reach 10 ft. Hit: 14 (2d8 + 5) Thunder damage.
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
  const bestiaryText = await extractPdfText();
  console.log(`Bestiary text: ${bestiaryText.length} chars`);

  const chunks = chunkText(bestiaryText, CHUNK_CHARS);
  console.log(`Sending ${chunks.length} chunk(s) to DeepSeek...`);

  const allExtracted = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const raw = await callDeepSeek(SYSTEM_PROMPT, chunks[i]);
    const entries = parseYamlResponse(raw);
    console.log(`    → ${entries.length} entries`);
    allExtracted.push(...entries);
  }
  console.log(`Total extracted: ${allExtracted.length} creatures`);

  let existing = [];
  try {
    existing = yaml.load(await fs.readFile(BESTIARY_PATH, 'utf8')) ?? [];
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

  await fs.mkdir(path.dirname(BESTIARY_PATH), { recursive: true });
  await fs.writeFile(BESTIARY_PATH, yaml.dump(merged, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    defaultStyle: '>',
  }), 'utf8');

  console.log(`\nWritten ${merged.length} creatures to ${BESTIARY_PATH}`);
  console.log('Sample of new entries:');
  newEntries.slice(0, 15).forEach(e =>
    console.log(`  • ${e.name} (CR ${e.cr}, ${e.size} ${e.type})`)
  );
}

main().catch(err => { console.error(err); process.exit(1); });
