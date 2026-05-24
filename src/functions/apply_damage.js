import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

function resolveDamage(amount, damageType, record) {
  if (!damageType) return amount;

  const immunities = record.damage_immunities ?? [];
  const resistances = record.damage_resistances ?? [];
  const vulnerabilities = record.damage_vulnerabilities ?? [];

  if (immunities.includes(damageType)) return 0;
  if (resistances.includes(damageType)) return Math.floor(amount / 2);
  if (vulnerabilities.includes(damageType)) return amount * 2;
  return amount;
}

export default async function apply_damage(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, amount, damage_type } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const effective = resolveDamage(amount, damage_type, record);

    const tempAbsorbed = Math.min(record.temporary_hp, effective);
    const remaining = effective - tempAbsorbed;
    const new_temporary_hp = record.temporary_hp - tempAbsorbed;
    const new_current_hp = Math.max(0, record.current_hp - remaining);

    const updated = await store.patch(table, record.id, {
      current_hp: new_current_hp,
      temporary_hp: new_temporary_hp,
    }, record.updated_at);

    if (updated === null) continue;

    const parts = [];

    if (damage_type && effective !== amount) {
      if (effective === 0) {
        parts.push(`${record.name} is immune to ${damage_type} damage — no damage taken.`);
        return parts.join(' ');
      }
      const modifier = effective < amount ? 'resistant' : 'vulnerable';
      parts.push(`${record.name} is ${modifier} to ${damage_type}: ${amount} → ${effective} damage.`);
    } else {
      const typeStr = damage_type ? ` ${damage_type}` : '';
      parts.push(`${record.name} takes ${effective}${typeStr} damage.`);
    }

    if (tempAbsorbed > 0) {
      parts.push(`(${tempAbsorbed} absorbed by temporary HP)`);
    }

    const tempStr = new_temporary_hp > 0 ? `, Temp HP: ${new_temporary_hp}` : '';
    parts.push(`HP: ${new_current_hp}/${record.max_hp}${tempStr}.`);

    if (new_current_hp === 0) {
      parts.push(entity_type === 'character'
        ? 'Unconscious — rolling death saves.'
        : 'Dead.');
    }

    return parts.join(' ');
  }

  return `Could not apply damage to "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
