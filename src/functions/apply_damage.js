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

    // Immunity: no HP change, no patch needed
    if (damage_type && effective === 0) {
      return `${record.name} is immune to ${damage_type} damage — no damage taken.`;
    }

    const tempAbsorbed = Math.min(record.temporary_hp, effective);
    const remaining = effective - tempAbsorbed;
    const new_temporary_hp = record.temporary_hp - tempAbsorbed;
    const new_current_hp = Math.max(0, record.current_hp - remaining);
    const hp_lost = record.current_hp - new_current_hp;

    // Instant death: excess damage past 0 HP equals or exceeds max HP
    const excessDamage = remaining - record.current_hp;
    const instantDeath = entity_type === 'character'
      && new_current_hp === 0
      && record.max_hp != null
      && excessDamage >= record.max_hp;

    const patch = {
      current_hp: new_current_hp,
      temporary_hp: new_temporary_hp,
    };

    // Auto-apply Unconscious when character drops to 0 HP
    if (new_current_hp === 0 && entity_type === 'character') {
      const conditions = record.conditions ?? [];
      const condImmunities = record.condition_immunities ?? [];
      if (!conditions.includes('Unconscious') && !condImmunities.includes('Unconscious')) {
        patch.conditions = [...conditions, 'Unconscious'];
      }
    }

    // Auto-break concentration at 0 HP (characters and NPCs)
    if (new_current_hp === 0 && record.concentration) {
      patch.concentration = null;
    }

    const updated = await store.patch(table, record.id, patch, record.updated_at);
    if (updated === null) continue;

    const parts = [];

    if (damage_type && effective !== amount) {
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
      if (entity_type === 'character') {
        if (instantDeath) {
          parts.push(`Instant death — excess damage (${excessDamage}) equals or exceeds maximum HP (${record.max_hp}).`);
        } else {
          parts.push('Unconscious — rolling death saves.');
        }
      } else {
        parts.push('Dead.');
      }
      if (record.concentration) {
        parts.push(`Concentration on ${record.concentration.spell} broken.`);
      }
    } else if (hp_lost > 0 && record.concentration) {
      const concDC = Math.max(10, Math.ceil(hp_lost / 2));
      parts.push(`Concentration check required! DC ${concDC} Constitution save to maintain ${record.concentration.spell}.`);
    }

    return parts.join(' ');
  }

  return `Could not apply damage to "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
