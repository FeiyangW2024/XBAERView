import type { LayerInfo } from '../types';
const ascii = (value: string) => value.normalize('NFKC').replace(/[^a-zA-Z0-9]/g, '');
/** Stable across locales. An explicit product badge takes precedence. */
export function layerBadge(layer: LayerInfo): string {
  const badge = ascii(layer.badge?.trim() ?? '');
  if (badge) return badge.length <= 4 ? badge : badge.replace(/[^a-zA-Z]/g, '').slice(0, 2) || badge.slice(0, 2);
  const name = (layer.name?.en || '').normalize('NFKC');
  const identity = `${name} ${layer.id || ''}`;
  const aliases: [RegExp, string][] = [
    [/\baerosol\b|aerosol_type|气溶胶/i, 'Ae'],
    [/\bno2\b|(?:^|_)no2(?:_|$)/i, 'NO2'],
    [/\bpm\s*2\.?5\b|(?:^|_)pm25(?:_|$)/i, 'PM25'],
    [/\bco2\b|(?:^|_)co2(?:_|$)/i, 'CO2'],
    [/\blst\b|land surface temperature/i, 'LST'],
    [/\blcc\b|land[ _-]cover|地物分类/i, 'LCC'],
    [/\bcloud\b|(?:^|_)cloud(?:_|$)/i, 'Cl'],
  ];
  for (const [pattern, abbreviation] of aliases) if (pattern.test(identity)) return abbreviation;
  const token = ascii(name.split(/\s+/)[0] || layer.id?.split(':').at(-1) || 'Var');
  return token.length <= 4 ? token || 'Var' : token.replace(/[^a-zA-Z]/g, '').slice(0, 2) || token.slice(0, 2);
}
export function layerSourceLabel(layer: LayerInfo): string {
  return layer.sourceLabel?.trim() || layer.source?.trim() || '';
}
