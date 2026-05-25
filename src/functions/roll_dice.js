import { elicit } from '../lib/elicit.js';

export default async function roll_dice(params, _userSettings) {
  const { expression, mode = 'system', description } = params;

  class DiceParser {
    constructor() {
      this.position = 0;
      this.input = '';
      this.rollFn = (sides) => Math.floor(Math.random() * sides) + 1;
      this.groupRollFn = undefined;
      this.groups_ = [];
      this.MAX_NUMBER = 1000000;
      this.MAX_DICE_COUNT = 1000;
      this.MAX_DICE_SIDES = 10000;
    }

    parse(expression, rollFn, groupRollFn) {
      this.input = expression.toLowerCase().replace(/\s+/g, '');
      this.position = 0;
      this.rollFn = rollFn ?? ((sides) => Math.floor(Math.random() * sides) + 1);
      this.groupRollFn = groupRollFn;
      this.groups_ = [];
      try {
        const result = this.parseExpression();
        if (this.position < this.input.length) {
          throw new Error(`Unexpected character at position ${this.position}: '${this.input[this.position]}'`);
        }
        return { ...result, groups: [...this.groups_] };
      } catch (error) {
        throw new Error(`Parse error: ${error.message}`);
      }
    }

    listGroups(expression) {
      const groups = [];
      try {
        this.parse(expression, undefined, (expr) => { groups.push(expr); return 1; });
      } catch { }
      return groups;
    }

    parseExpression() {
      let left = this.parseTerm();
      while (this.position < this.input.length) {
        const operator = this.input[this.position];
        if (operator === '+' || operator === '-') {
          this.position++;
          const right = this.parseTerm();
          left = this.combineResults(left, right, operator);
        } else {
          break;
        }
      }
      return left;
    }

    parseTerm() {
      let left = this.parseFactor();
      while (this.position < this.input.length) {
        const char = this.peek();
        if (char === '*' || char === '×' || char === '·') {
          this.position++;
          const right = this.parseFactor();
          left = this.multiplyResults(left, right);
        } else {
          break;
        }
      }
      return left;
    }

    parseFactor() {
      if (this.peek() === '-') {
        const after = this.input.slice(this.position + 1);
        if (after.startsWith('(') || after.startsWith('min(') || after.startsWith('max(')) {
          this.position++;
          const inner = this.parseFactor();
          return { ...inner, total: -inner.total, simplified: `-${inner.simplified}`, expression: `-${inner.expression}` };
        }
      }
      const remaining = this.input.slice(this.position);
      if (remaining.startsWith('min(') || remaining.startsWith('max(')) {
        const fn = remaining.startsWith('min(') ? 'min' : 'max';
        this.position += fn.length + 1;
        const args = this.parseFunctionArgs(fn);
        if (this.peek() !== ')') throw new Error(`Missing closing parenthesis after ${fn}()`);
        this.position++;
        const totals = args.map(a => a.total);
        const total = fn === 'min' ? Math.min(...totals) : Math.max(...totals);
        return {
          total,
          groups: [],
          expression: `${fn}(${args.map(a => a.expression).join(', ')})`,
          simplified: `${fn}(${args.map(a => a.simplified).join(', ')})`,
        };
      }
      if (this.peek() === '(') {
        this.position++;
        const result = this.parseExpression();
        if (this.peek() !== ')') throw new Error('Missing closing parenthesis');
        this.position++;
        return { ...result, simplified: `(${result.simplified})`, expression: `(${result.expression})` };
      }
      return this.parseDiceOrNumber();
    }

    parseFunctionArgs(fn) {
      const args = [this.parseExpression()];
      while (this.peek() === ',') { this.position++; args.push(this.parseExpression()); }
      if (args.length < 2) throw new Error(`${fn}() requires at least 2 arguments`);
      return args;
    }

    parseDiceOrNumber() {
      const start = this.position;
      let negative = false;
      if (this.peek() === '-') { negative = true; this.position++; }
      const count = this.parseNumber();
      if (this.peek() === 'd') {
        this.position++;
        if (this.peek() === '%') { this.position++; return this.rollDice(count || 1, 100, { negative }); }
        if (this.peek() === 'f') { this.position++; return this.rollFudgeDice(count || 1, { negative }); }
        const sides = this.parseNumber();
        if (!sides) throw new Error("Missing number of sides after 'd'");
        const modifiers = this.parseModifiers();
        return this.rollDice(count || 1, sides, { ...modifiers, negative });
      }
      if (count === null) throw new Error(`Expected number or dice notation at position ${start}`);
      const value = negative ? -count : count;
      return { total: value, groups: [], expression: String(value), simplified: String(value) };
    }

    parseModifiers() {
      const modifiers = {};
      while (this.position < this.input.length) {
        const char = this.peek();
        if (char === 'k') {
          if (modifiers.keep !== undefined) throw new Error("Duplicate 'k' modifier");
          this.position++;
          modifiers.keep = this.parseNumber();
          if (!modifiers.keep) throw new Error("Missing number after 'k'");
        } else if (char === 'd' && /\d/.test(this.peek(1))) {
          if (modifiers.drop !== undefined) throw new Error("Duplicate 'd' modifier");
          this.position++;
          modifiers.drop = this.parseNumber();
          if (!modifiers.drop) throw new Error("Missing number after 'd'");
        } else if (char === '!' || char === 'e') {
          if (modifiers.explode) throw new Error("Duplicate explode modifier");
          this.position++;
          modifiers.explode = true;
          if (char === '!' && this.peek() === '!') { this.position++; modifiers.compound = true; }
          if (/\d/.test(this.peek())) modifiers.explodeOn = this.parseNumber();
        } else if (char === 'r') {
          if (modifiers.reroll !== undefined) throw new Error("Duplicate 'r' modifier");
          this.position++;
          modifiers.reroll = this.parseNumber();
          if (!modifiers.reroll) throw new Error("Missing number after 'r'");
        } else {
          break;
        }
      }
      return modifiers;
    }

    parseNumber() {
      const start = this.position;
      while (this.position < this.input.length && /\d/.test(this.input[this.position])) this.position++;
      if (start === this.position) return null;
      const num = parseInt(this.input.slice(start, this.position));
      if (num > this.MAX_NUMBER) throw new Error(`Number too large (max ${this.MAX_NUMBER.toLocaleString()})`);
      return num;
    }

    peek(offset = 0) { return this.input[this.position + offset] || ''; }

    rollDice(count, sides, options = {}) {
      if (count <= 0 || count > this.MAX_DICE_COUNT) throw new Error(`Dice count must be between 1 and ${this.MAX_DICE_COUNT}`);
      if (sides <= 0 || sides > this.MAX_DICE_SIDES) throw new Error(`Dice sides must be between 1 and ${this.MAX_DICE_SIDES}`);
      if (count * sides > this.MAX_NUMBER) throw new Error('Total possible outcomes too large');

      let absExpr = `${count}d${sides}`;
      if (options.keep) absExpr += `k${options.keep}`;
      if (options.drop) absExpr += `d${options.drop}`;
      if (options.explode) {
        if (options.compound) {
          absExpr += options.explodeOn ? `!!${options.explodeOn}` : '!!';
        } else {
          absExpr += options.explodeOn ? `e${options.explodeOn}` : '!';
        }
      }
      if (options.reroll) absExpr += `r${options.reroll}`;
      const expr = options.negative ? `-${absExpr}` : absExpr;

      if (this.groupRollFn) {
        const userTotal = this.groupRollFn(absExpr);
        const total = options.negative ? -userTotal : userTotal;
        this.groups_.push({ expression: absExpr, display: String(userTotal), total: userTotal });
        return { total, groups: [], expression: expr, simplified: String(total) };
      }

      const dieTotals = [];
      const dieDisplays = [];
      for (let i = 0; i < count; i++) {
        let roll = this.rollFn(sides);
        let rerollPrefix = '';
        if (options.reroll && roll <= options.reroll) {
          const newRoll = this.rollFn(sides);
          rerollPrefix = `${roll}→`;
          roll = newRoll;
        }
        let display = `${rerollPrefix}${roll}`;
        let dieTotal = roll;
        if (options.explode) {
          const explodeThreshold = options.explodeOn || sides;
          let explodeCount = 0;
          let capped = false;
          if (options.compound) {
            let currentRoll = roll;
            while (currentRoll >= explodeThreshold) {
              if (explodeCount >= 100) { capped = true; break; }
              currentRoll = this.rollFn(sides);
              dieTotal += currentRoll;
              explodeCount++;
            }
            if (explodeCount > 0) display = `${rerollPrefix}${dieTotal}${capped ? '…' : ''}`;
          } else {
            const explosions = [];
            while (roll >= explodeThreshold) {
              if (explodeCount >= 100) { capped = true; break; }
              roll = this.rollFn(sides);
              dieTotal += roll;
              explosions.push(roll);
              explodeCount++;
            }
            if (explosions.length > 0) display += `!${explosions.join('!')}${capped ? '…' : ''}`;
          }
        }
        dieTotals.push(dieTotal);
        dieDisplays.push(display);
      }

      let finalTotals = [...dieTotals];
      let finalDisplays = [...dieDisplays];
      if (options.keep) {
        const indexed = dieTotals.map((v, i) => ({ v, display: dieDisplays[i] }));
        indexed.sort((a, b) => b.v - a.v);
        const kept = indexed.slice(0, options.keep);
        finalTotals = kept.map(x => x.v);
        finalDisplays = kept.map(x => x.display);
      } else if (options.drop) {
        const indexed = dieTotals.map((v, i) => ({ v, display: dieDisplays[i] }));
        indexed.sort((a, b) => a.v - b.v);
        const remaining = indexed.slice(options.drop);
        finalTotals = remaining.map(x => x.v);
        finalDisplays = remaining.map(x => x.display);
      }

      const sum = finalTotals.reduce((s, r) => s + r, 0);
      const total = options.negative ? -sum : sum;
      let groupDisplay = `[${dieDisplays.join(', ')}]`;
      if (options.keep || options.drop) groupDisplay += ` → [${finalDisplays.join(', ')}]`;
      groupDisplay += ` = ${sum}`;
      this.groups_.push({ expression: absExpr, display: groupDisplay, total: sum });
      return { total, groups: [], expression: expr, simplified: String(total) };
    }

    rollFudgeDice(count, options = {}) {
      if (count <= 0 || count > this.MAX_DICE_COUNT) throw new Error(`Dice count must be between 1 and ${this.MAX_DICE_COUNT}`);
      const absExpr = `${count}dF`;
      const expr = options.negative ? `-${absExpr}` : absExpr;
      if (this.groupRollFn) {
        const userTotal = this.groupRollFn(absExpr);
        const total = options.negative ? -userTotal : userTotal;
        this.groups_.push({ expression: absExpr, display: String(userTotal), total: userTotal });
        return { total, groups: [], expression: expr, simplified: String(total) };
      }
      const rolls = [];
      for (let i = 0; i < count; i++) rolls.push(this.rollFn(3) - 2);
      const sum = rolls.reduce((s, r) => s + r, 0);
      const total = options.negative ? -sum : sum;
      const symbols = rolls.map(r => (r === -1 ? '[-]' : r === 0 ? '[ ]' : '[+]'));
      this.groups_.push({ expression: absExpr, display: `${symbols.join(' ')} = ${sum}`, total: sum });
      return { total, groups: [], expression: expr, simplified: String(total) };
    }

    combineResults(left, right, operator) {
      const total = operator === '+' ? left.total + right.total : left.total - right.total;
      return {
        total, groups: [],
        expression: `${left.expression}${operator}${right.expression}`,
        simplified: `${left.simplified} ${operator} ${right.simplified}`,
      };
    }

    multiplyResults(left, right) {
      return {
        total: left.total * right.total, groups: [],
        expression: `${left.expression}×${right.expression}`,
        simplified: `${left.simplified} × ${right.simplified}`,
      };
    }
  }

  function splitExpressions(expr) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      else if (expr[i] === ',' && depth === 0) {
        const part = expr.slice(start, i).trim();
        if (part) parts.push(part);
        start = i + 1;
      }
    }
    const last = expr.slice(start).trim();
    if (last) parts.push(last);
    return parts.length ? parts : [expr.trim()];
  }

  function formatTransparent(result) {
    const lines = result.groups.map(g => `${g.expression}: ${g.display}`);
    const isSimple = result.simplified === String(result.total);
    lines.push(isSimple
      ? `${result.expression} = ${result.total}`
      : `${result.expression} = ${result.simplified} = ${result.total}`);
    return lines.join('\n');
  }

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
