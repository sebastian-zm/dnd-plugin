/**
 * Extract the Rules Glossary from the SRD PDF using DeepSeek to parse entries.
 * Existing hand-edited entries (matched by name) are preserved as-is.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/extract-glossary.mjs [path-to-pdf]
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import yaml from 'js-yaml';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GLOSSARY_PATH = path.join(ROOT, 'src', 'srd', 'glossary.yaml');
const PDF_PATH = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'SRD_CC_v5.2.1.pdf');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error('Set DEEPSEEK_API_KEY env var'); process.exit(1); }

// Rules Glossary pages in SRD 5.2.1
const GLOSS_FIRST = 176;
const GLOSS_LAST  = 203;

// Approximate token limit per chunk (DeepSeek-chat context is 64K, leave room for prompt+response)
const CHUNK_CHARS = 12_000;

async function extractPdfText() {
  console.log(`Reading PDF: ${PDF_PATH}`);
  const buf = await fs.readFile(PDF_PATH);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({ first: GLOSS_FIRST, last: GLOSS_LAST });
  await parser.destroy();

  const text = result.pages.map(p => p.text).join('\n');
  // Trim preamble — entries start at "Ability Check"
  const start = text.indexOf('Ability Check');
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
You convert raw D&D 5.2.1 SRD Rules Glossary text (extracted from a two-column PDF) into clean YAML.

Rules:
- Each glossary entry becomes one YAML list item with fields: name, (optional) category, text.
- name: the entry's name, stripped of any [Tag] suffix.
- category: only present if the entry's name has a tag in brackets — use exactly one of:
  Action | Area of Effect | Attitude | Condition | Hazard
- text: the full definition paragraph(s) joined into a single flowing string.
  - Remove "See also" references that indicate a chapter.
  - Keep "See also" references that indicate another term in the glossary.
  - Remove sub-heading labels like "Can't See." / "Attacks Affected." etc. — inline their content.
  - Remove hyphenation artifacts (e.g. "Dex-\\nterity" → "Dexterity").
  - Tables (like Damage Types, Carrying Capacity) should be rendered as plain prose or a simple
    Markdown table using pipe syntax on one line per row.
  - Do NOT include the word "[Condition]", "[Action]" etc. in the text.
- Output only the raw YAML list — no markdown fences, no commentary.
- Use block scalar style (>-) for multi-line text values.

Example output:
- name: Ability Check
  text: >-
    An ability check is a D20 Test that represents using one of the six abilities, or a specific
    skill associated with an ability, to overcome a challenge.
- name: Blinded
  category: Condition
  text: >-
    While you have the Blinded condition you can't see and automatically fail any ability check
    that requires sight. Attack rolls against you have Advantage, and your attack rolls have
    Disadvantage.
`;

function chunkText(text, size) {
  const chunks = [];
  let pos = 0;
  while (pos < text.length) {
    let end = pos + size;
    if (end < text.length) {
      // Break at a newline so we don't split mid-entry
      const nl = text.lastIndexOf('\n', end);
      if (nl > pos) end = nl;
    }
    chunks.push(text.slice(pos, end));
    pos = end;
  }
  return chunks;
}

function parseYamlResponse(raw) {
  // Strip markdown fences if model wraps output
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
  const glossaryText = await extractPdfText();
  console.log(`Glossary text: ${glossaryText.length} chars`);

  const chunks = chunkText(glossaryText, CHUNK_CHARS);
  console.log(`Sending ${chunks.length} chunk(s) to DeepSeek...`);

  const allExtracted = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const raw = await callDeepSeek(SYSTEM_PROMPT, chunks[i]);
    const entries = parseYamlResponse(raw);
    console.log(`    → ${entries.length} entries`);
    allExtracted.push(...entries);
  }
  console.log(`Total extracted: ${allExtracted.length} entries`);

  // Load existing hand-edited entries; they take precedence
  let existing = [];
  try {
    existing = yaml.load(await fs.readFile(GLOSSARY_PATH, 'utf8')) ?? [];
  } catch { /* file doesn't exist yet */ }

  const existingNames = new Set(existing.map(e => e.name));
  console.log(`Existing hand-edited entries kept: ${existing.length}`);

  // Deduplicate extracted entries (chunk boundaries can produce duplicates); keep first occurrence
  const seen = new Set(existingNames);
  const newEntries = [];
  for (const e of allExtracted) {
    if (e?.name && !seen.has(e.name)) {
      seen.add(e.name);
      newEntries.push(e);
    }
  }
  console.log(`New entries added: ${newEntries.length}`);

  // Merge and sort alphabetically
  const merged = [...existing, ...newEntries].sort((a, b) => a.name.localeCompare(b.name));

  await fs.writeFile(GLOSSARY_PATH, yaml.dump(merged, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    defaultStyle: '>',
  }), 'utf8');

  console.log(`\nWritten ${merged.length} entries to ${GLOSSARY_PATH}`);
  console.log('Sample of new entries:');
  newEntries.slice(0, 15).forEach(e =>
    console.log(`  • ${e.name}${e.category ? ` [${e.category}]` : ''}`)
  );
}

main().catch(err => { console.error(err); process.exit(1); });
