import clipboard from 'clipboardy';
import { readFileSync } from 'fs';

clipboard.writeSync(readFileSync('dist/dnd-plugin.json', 'utf8'));
console.log('Copied dist/dnd-plugin.json to clipboard.');
