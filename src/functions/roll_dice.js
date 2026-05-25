import { elicit } from '../lib/elicit.js';
import { DiceParser, splitExpressions, formatTransparent } from '../lib/dice.js';

export default async function roll_dice(params, _userSettings) {
  const { expression, mode = 'system', description } = params;

  const parser = new DiceParser();
  const exprs = splitExpressions(expression);
  const multi = exprs.length > 1;

  if (mode === 'system') {
    const lines = [];
    for (const expr of exprs) {
      try {
        const result = parser.parse(expr);
        lines.push(multi ? `${result.expression}: ${result.total}` : String(result.total));
      } catch (err) {
        lines.push(`${expr}: Error: ${err.message}`);
      }
    }
    const header = description ? (multi ? `${description}\n` : `${description}: `) : '';
    return `${header}${lines.join('\n')}`;
  }

  if (mode === 'transparent') {
    const blocks = [];
    for (const expr of exprs) {
      try {
        blocks.push(formatTransparent(parser.parse(expr)));
      } catch (err) {
        blocks.push(`${expr}: Error: ${err.message}`);
      }
    }
    const header = description ? `${description}\n` : '';
    return `${header}${blocks.join('\n\n')}`;
  }

  // mode === 'user': collect physical dice results via elicitation
  const exprInfos = exprs.map(expr => ({ expr, groups: parser.listGroups(expr) }));
  const allValues = [];
  let elicitAvailable = true;

  outer: for (const { groups } of exprInfos) {
    for (const groupExpr of groups) {
      const promptMsg = description
        ? `${description}\nRoll ${groupExpr} and enter your total:`
        : `Roll ${groupExpr} and enter your total:`;
      const { value: input, available } = await elicit(promptMsg);
      if (!available) { elicitAvailable = false; break outer; }
      if (input === null) return 'Roll cancelled.';
      const val = parseInt(input, 10);
      allValues.push(isNaN(val) ? 1 : val);
    }
  }

  // Fallback: no elicitation mechanism available — auto-roll in transparent mode
  if (!elicitAvailable) {
    const blocks = [];
    for (const expr of exprs) {
      try {
        blocks.push(formatTransparent(parser.parse(expr)));
      } catch (err) {
        blocks.push(`${expr}: Error: ${err.message}`);
      }
    }
    const header = description ? `${description}\n` : '';
    return `${header}${blocks.join('\n\n')}\n(Auto-rolled: user input not available on this platform.)`;
  }

  const blocks = [];
  let valueOffset = 0;
  for (const { expr, groups } of exprInfos) {
    const exprValues = allValues.slice(valueOffset, valueOffset + groups.length);
    valueOffset += groups.length;
    let idx = 0;
    try {
      const result = parser.parse(expr, undefined, (_e) => exprValues[idx++] ?? 1);
      const prefix = !multi && description ? `${description}\n` : '';
      blocks.push(`${prefix}${formatTransparent(result)}`);
    } catch (err) {
      blocks.push(`Error: ${err.message}`);
    }
  }

  const header = description && multi ? `${description}\n` : '';
  return `${header}${blocks.join('\n\n')}`;
}
