/** Supported YAML schema: a quoted hex-color sequence, or name + colors sequence.
 * Deliberately rejects tags, aliases, nested values and executable extensions.
 */
export function parsePaletteYaml(text: string): { name: string; colors: string[] } {
 if(text.length > 65536) throw Error('Palette YAML exceeds 64 KB');
 const colors: string[] = []; let name = '', mapping = false;
 for(const original of text.replace(/^\uFEFF/,'').split(/\r?\n/)) {
  const line = original.trim(); if(!line || line.startsWith('#') || line === '---' || line === '...') continue;
  const n = line.match(/^name:\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^#"'{}\[\]&*!]+))\s*(?:#.*)?$/);
  if(n) {if(name || colors.length) throw Error('Place one name before colors'); name = (n[1] ?? n[2] ?? n[3] ?? '').trim().slice(0,60);continue;}
  if(line === 'colors:') {if(mapping || colors.length) throw Error('Duplicate colors');mapping = true;continue;}
  const color = line.match(/^-\s*["'](#[0-9a-fA-F]{6})["']\s*(?:#.*)?$/);
  if(!color) throw Error('Use YAML colors as quoted "#RRGGBB" list items');
  colors.push(color[1]!.toLowerCase());
 }
 if(colors.length < 2 || colors.length > 256) throw Error('Palette needs 2–256 colors');
 return {name, colors};
}
