import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

function resolveDamage(amount, damageType, record) {
  if (!damageType || amount === 0) return amount;
  const immunities = record.damage_immunities ?? [];
  const resistances = record.damage_resistances ?? [];
  const vulnerabilities = record.damage_vulnerabilities ?? [];
  if (immunities.includes(damageType)) return 0;
  if (resistances.includes(damageType)) return Math.floor(amount / 2);
  if (vulnerabilities.includes(damageType)) return amount * 2;
  return amount;
}

export default async function apply_damage_bulk(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, damage_type, base_amount, targets } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const typeStr = damage_type ? ` ${damage_type}` : '';
  const lines = [`Bulk${typeStr} damage (base ${base_amount}):`];

  for (const target of targets) {
    const table = target.entity_type === 'character' ? 'characters' : 'npcs';
    const afterSave = Math.floor(base_amount * target.multiplier);

    let handled = false;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const record = await store.get(table, target.entity, game);
      if (!record || record.game_slug !== game) {
        lines.push(`  ${target.entity}: not found.`);
        handled = true;
        break;
      }

      // Zero-damage case (multiplier = 0 or immunity)
      const effective = resolveDamage(afterSave, damage_type, record);
      if (effective === 0) {
        const reason = afterSave === 0 ? 'no damage (save)' : `immune to ${damage_type}`;
        lines.push(`  ${record.name}: ${reason}. HP: ${record.current_hp}/${record.max_hp}.`);
        handled = true;
        break;
      }

      const tempAbsorbed = Math.min(record.temporary_hp, effective);
      const remaining = effective - tempAbsorbed;
      const new_temporary_hp = record.temporary_hp - tempAbsorbed;
      const new_current_hp = Math.max(0, record.current_hp - remaining);
      const hp_lost = record.current_hp - new_current_hp;

      const excessDamage = remaining - record.current_hp;
      const instantDeath = target.entity_type === 'character'
        && new_current_hp === 0
        && record.max_hp != null
        && excessDamage >= record.max_hp;

      const patch = {
        current_hp: new_current_hp,
        temporary_hp: new_temporary_hp,
      };

      if (new_current_hp === 0 && target.entity_type === 'character') {
        const conditions = record.conditions ?? [];
        const condImmunities = record.condition_immunities ?? [];
        if (!conditions.includes('Unconscious') && !condImmunities.includes('Unconscious')) {
          patch.conditions = [...conditions, 'Unconscious'];
        }
      }

      if (new_current_hp === 0 && record.concentration) {
        patch.concentration = null;
      }

      const updated = await store.patch(table, record.id, patch, record.updated_at);
      if (updated === null) continue;

      const resultParts = [];
      const saveNote = target.multiplier === 0.5 ? ' [save: half]' : target.multiplier === 0 ? ' [immune]' : '';

      if (afterSave !== effective) {
        resultParts.push(`${afterSave}→${effective} damage`);
      } else {
        resultParts.push(`${effective} damage`);
      }

      if (tempAbsorbed > 0) resultParts.push(`${tempAbsorbed} absorbed by temp HP`);

      const tempStr = new_temporary_hp > 0 ? `, Temp HP: ${new_temporary_hp}` : '';
      resultParts.push(`HP: ${new_current_hp}/${record.max_hp}${tempStr}`);

      if (new_current_hp === 0) {
        if (target.entity_type === 'character') {
          resultParts.push(instantDeath ? 'INSTANT DEATH' : 'UNCONSCIOUS');
        } else {
          resultParts.push('DEAD');
        }
        if (record.concentration) {
          resultParts.push(`concentration on ${record.concentration.spell} broken`);
        }
      } else if (hp_lost > 0 && record.concentration) {
        const concDC = Math.max(10, Math.ceil(hp_lost / 2));
        resultParts.push(`Concentration DC ${concDC} Con save`);
      }

      lines.push(`  ${record.name}${saveNote}: ${resultParts.join(', ')}.`);
      handled = true;
      break;
    }

    if (!handled) {
      lines.push(`  ${target.entity}: failed after ${MAX_RETRIES} retries — please retry.`);
    }
  }

  return lines.join('\n');
}
