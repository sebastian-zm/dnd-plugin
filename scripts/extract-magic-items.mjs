/**
 * Extract Magic Items A–Z from the SRD PDF using DeepSeek to parse entries.
 * Existing hand-edited entries (matched by name) are preserved as-is.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/extract-magic-items.mjs [path-to-pdf]
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import yaml from 'js-yaml';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ITEMS_PATH = path.join(ROOT, 'src', 'srd', 'magic-items.yaml');
const PDF_PATH = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'SRD_CC_v5.2.1.pdf');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error('Set DEEPSEEK_API_KEY env var'); process.exit(1); }

// Magic Items A–Z pages in SRD 5.2.1
const ITEMS_FIRST = 209;
const ITEMS_LAST  = 253;

const CHUNK_CHARS = 12_000;

async function extractPdfText() {
  console.log(`Reading PDF: ${PDF_PATH}`);
  const buf = await fs.readFile(PDF_PATH);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({ first: ITEMS_FIRST, last: ITEMS_LAST });
  await parser.destroy();

  const text = result.pages.map(p => p.text).join('\n');
  const start = text.search(/Magic Items A[–-]Z/);
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
You convert raw D&D 5.2.1 SRD Magic Items A–Z text (extracted from a two-column PDF) into clean YAML.

Each magic item becomes one YAML list item with these fields:

Required fields:
- name: the item's name (string)
- category: one of Armor | Potion | Ring | Rod | Scroll | Staff | Wand | Weapon | Wondrous Item
- rarity: one of Common | Uncommon | Rare | Very Rare | Legendary | Artifact
  If the item has multiple rarities (e.g. "+1, +2, or +3"), use the full string like
  "Uncommon (+1), Rare (+2), or Very Rare (+3)".
- attunement: boolean — true if the item requires attunement
- text: the full item description as a single flowing string (use >- block scalar)

Optional fields (omit if not applicable):
- type_detail: string — the parenthetical type specifier after the category, e.g.
  "Any Medium or Heavy, Except Hide Armor" from "Armor (Any Medium or Heavy, Except Hide Armor)"
- attunement_note: string — any specific attunement requirement, e.g. "by a spellcaster"
  or "by a Cleric, Druid, or Paladin"
- cursed: boolean — true if the item description explicitly calls out a curse

Guidelines:
- The subtitle format in the PDF is: Category (type detail), Rarity (Requires Attunement)
  Parse this carefully — everything before the first comma is the category+type, after is rarity+attunement.
- Fix PDF hyphenation artifacts (e.g. "Dex-\\nterity" → "Dexterity").
- Inline any sub-sections (e.g. "Metal Shell.", "Curse.") directly into text.
- Render tables (like random effect tables) as Markdown pipe tables in the text field.
  Keep them compact: one header row, one separator row, data rows.
- Output only the raw YAML list — no markdown fences, no commentary.
- Use block scalar style (>-) for text values.

Example output:
- name: Adamantine Armor
  category: Armor
  type_detail: Any Medium or Heavy, Except Hide Armor
  rarity: Uncommon
  attunement: false
  text: >-
    This suit of armor is reinforced with adamantine, one of the hardest substances in existence.
    While you're wearing it, any Critical Hit against you becomes a normal hit.
- name: Ammunition, +1, +2, or +3
  category: Weapon
  type_detail: Any Ammunition
  rarity: Uncommon (+1), Rare (+2), or Very Rare (+3)
  attunement: false
  text: >-
    You have a bonus to attack rolls and damage rolls made with this piece of magic ammunition.
    The bonus is determined by the rarity of the ammunition. Once it hits a target, the ammunition
    is no longer magical. This ammunition is typically found or sold in quantities of ten or twenty
    pieces. Ten pieces of this ammunition are equivalent in value to a potion of the same rarity.
- name: Amulet of Health
  category: Wondrous Item
  rarity: Rare
  attunement: true
  text: >-
    Your Constitution score is 19 while you wear this amulet. It has no effect on you if your
    Constitution is 19 or higher without it.
- name: Armor of Vulnerability
  category: Armor
  type_detail: Any Light, Medium, or Heavy
  rarity: Rare
  attunement: true
  cursed: true
  text: >-
    While wearing this armor, you have Resistance to one of the following damage types: Bludgeoning,
    Piercing, or Slashing. The GM chooses the type or determines it randomly. Curse: This armor is
    cursed, a fact that is revealed only when the Identify spell is cast on the armor or you attune
    to it. Attuning to the armor curses you until you are targeted by a Remove Curse spell or
    similar magic; removing the armor fails to end the curse. While cursed, you have Vulnerability
    to two of the three damage types associated with the armor (not the one to which it grants Resistance).
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
  const itemsText = await extractPdfText();
  console.log(`Magic items text: ${itemsText.length} chars`);

  const chunks = chunkText(itemsText, CHUNK_CHARS);
  console.log(`Sending ${chunks.length} chunk(s) to DeepSeek...`);

  const allExtracted = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const raw = await callDeepSeek(SYSTEM_PROMPT, chunks[i]);
    const entries = parseYamlResponse(raw);
    console.log(`    → ${entries.length} entries`);
    allExtracted.push(...entries);
  }
  console.log(`Total extracted: ${allExtracted.length} items`);

  let existing = [];
  try {
    existing = yaml.load(await fs.readFile(ITEMS_PATH, 'utf8')) ?? [];
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

  await fs.mkdir(path.dirname(ITEMS_PATH), { recursive: true });
  await fs.writeFile(ITEMS_PATH, yaml.dump(merged, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    defaultStyle: '>',
  }), 'utf8');

  console.log(`\nWritten ${merged.length} items to ${ITEMS_PATH}`);
  console.log('Sample of new entries:');
  newEntries.slice(0, 15).forEach(e =>
    console.log(`  • ${e.name} (${e.rarity} ${e.category}${e.attunement ? ', Attunement' : ''})`)
  );
}

main().catch(err => { console.error(err); process.exit(1); });
