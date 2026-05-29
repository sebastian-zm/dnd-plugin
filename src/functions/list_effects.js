import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_effects(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const filters = { game_slug: game };
  if (entity_type) filters.target_type = entity_type;
  if (entity) filters.target = entity;

  const effects = await store.list('active_effects', filters, { order: 'created_at' });

  if (effects.length === 0) {
    const scope = entity ? `on "${entity}"` : `in game "${game}"`;
    return `No active effects ${scope}.`;
  }

  const lines = [`Active effects in "${game}":`];
  for (const e of effects) {
    let durStr;
    if (e.duration_rounds === -1) {
      durStr = 'indefinite';
    } else if (e.expires_at_round != null) {
      durStr = `${e.duration_rounds}r (expires after round ${e.expires_at_round})`;
    } else {
      durStr = `${e.duration_rounds}r (timer starts when combat begins)`;
    }

    const concStr = e.concentration
      ? (e.concentration_owner ? ` [conc: ${e.concentration_owner}]` : ' [conc]')
      : '';
    const sourceStr = e.source ? ` from ${e.source}` : '';

    lines.push(`  [${e.id.slice(0, 8)}] ${e.target} (${e.target_type}) <- ${e.name}${sourceStr}${concStr}: ${durStr}`);

    for (const m of e.modifiers ?? []) {
      const dice = m.dice ? ` ${m.dice}` : '';
      const val = m.value != null ? ` ${m.value}` : '';
      const dt = m.damage_type ? ` [${m.damage_type}]` : '';
      const ab = m.ability ? ` (${m.ability} only)` : '';
      lines.push(`    * ${m.type}${dice}${val}${dt}${ab} -> [${(m.roll_types ?? []).join(', ')}]`);
    }
  }

  return lines.join('\n');
}
