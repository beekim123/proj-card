const key = 'nightwood.profile.v1';
const VALID_SUITES = ['mist', 'strings', 'drums', 'chimes'];
let data = { music: 0.58, sfx: 0.72, mute: false, musicSuite: 'mist', cards: [] };
try {
  const s = JSON.parse(localStorage.getItem(key));
  if (s) {
    for (const k of ['music', 'sfx']) if (Number.isFinite(s[k])) data[k] = Math.max(0, Math.min(1, s[k]));
    data.mute = s.mute === true;
    if (VALID_SUITES.includes(s.musicSuite)) data.musicSuite = s.musicSuite;
    if (Array.isArray(s.cards)) data.cards = [...new Set(s.cards.filter((c) => typeof c === 'string'))];
  }
} catch {}
export const profile = data;
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}
export function changeVolume(k, delta) {
  if (k === 'mute') data.mute = !data.mute;
  else if (['music', 'sfx'].includes(k))
    data[k] = Math.round(10 * Math.max(0, Math.min(1, data[k] + delta))) / 10;
  save();
}
export function changeMusicSuite(suiteId) {
  if (VALID_SUITES.includes(suiteId)) {
    data.musicSuite = suiteId;
    save();
  }
}
export function collect(id) {
  if (id && !data.cards.includes(id)) {
    data.cards.push(id);
    save();
  }
}
