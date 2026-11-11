import type { ArtDefinition, ArtManifest, GemColor, Palette } from './types';
import { dimensions } from './types';

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

function shape(color: GemColor, fill: string, stroke: string, size = 100, opacity = 1): string {
  const common = `fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${size * .055}" stroke-linejoin="round"`;
  if (color === 'red') return `<circle cx="${size / 2}" cy="${size / 2}" r="${size * .4}" ${common}/>`;
  if (color === 'green') return `<rect x="${size * .1}" y="${size * .1}" width="${size * .8}" height="${size * .8}" rx="${size * .05}" ${common}/>`;
  return `<path d="M${size / 2} ${size * .1} L${size * .9} ${size * .9} L${size * .1} ${size * .9} Z" ${common}/>`;
}

function spark(x: number, y: number, r: number, fill: string): string {
  return `<path d="M${x} ${y-r} L${x+r*.24} ${y-r*.24} L${x+r} ${y} L${x+r*.24} ${y+r*.24} L${x} ${y+r} L${x-r*.24} ${y+r*.24} L${x-r} ${y} L${x-r*.24} ${y-r*.24} Z" fill="${fill}"/>`;
}

function dummy(p: Palette): string {
  return `<style>
.svg-dummy #body { transform-origin:150px 384px; }
.svg-dummy:not([data-anim]) #body { animation:svg-dummy-idle 3s ease-in-out infinite; }
.svg-dummy #face_hurt,.svg-dummy #straw_fly { opacity:0; }
.svg-dummy[data-anim="hit"] #body { animation:svg-dummy-hit 400ms ease-out; }
.svg-dummy[data-anim="hit_big"] #body { animation:svg-dummy-hit-big 700ms ease-out; }
.svg-dummy[data-anim="hit_big"] #face { opacity:0; }
.svg-dummy[data-anim="hit_big"] #face_hurt { opacity:1; }
.svg-dummy[data-anim="hit_big"] #straw_fly { animation:svg-dummy-straw 700ms ease-out; }
@keyframes svg-dummy-idle { 0%,100% { transform:rotate(-.8deg); } 50% { transform:rotate(.8deg); } }
@keyframes svg-dummy-hit { 25% { transform:rotate(6deg); } 100% { transform:rotate(0); } }
@keyframes svg-dummy-hit-big { 25% { transform:rotate(14deg); } 100% { transform:rotate(0); } }
@keyframes svg-dummy-straw { 0% { opacity:0; transform:translateY(0); } 30% { opacity:1; } 100% { opacity:0; transform:translateY(-60px); } }
</style><g id="root"><ellipse id="shadow" cx="150" cy="374" rx="104" ry="10" fill="${p.ink}" opacity=".8"/>
<g id="body"><rect id="post" x="131" y="154" width="38" height="230" rx="7" fill="${p.accentDark}" stroke="${p.ink}" stroke-width="8"/>
<path d="M48 190 L250 190" stroke="${p.accentDark}" stroke-width="34" stroke-linecap="round"/>
<rect x="93" y="139" width="114" height="151" rx="32" fill="${p.textDim}" stroke="${p.ink}" stroke-width="7"/>
<g id="target" fill="none" stroke="${p.accentDark}" stroke-width="9"><circle cx="150" cy="216" r="40"/><circle cx="150" cy="216" r="20"/></g>
<g id="head"><circle cx="150" cy="88" r="62" fill="${p.accent}" stroke="${p.ink}" stroke-width="7"/>
<g id="face" stroke="${p.ink}" stroke-width="7" stroke-linecap="round"><path d="M125 81h3m44 0h3m-38 29q13 10 26 0"/></g>
<g id="face_hurt" fill="none" stroke="${p.ink}" stroke-width="5"><circle cx="129" cy="83" r="12"/><circle cx="172" cy="83" r="12"/><ellipse cx="150" cy="117" rx="10" ry="13"/></g></g>
<g id="straw_fly" stroke="${p.accent}" stroke-width="5"><path d="M65 100l-15 -12m185 0l17 -14M79 140l-22 3m172 -15l23 7"/></g></g></g>`;
}

function badge(p: Palette): string {
  return `<defs><clipPath id="plateClip"><rect x="4" y="4" width="212" height="92" rx="20"/></clipPath></defs><style>
.svg-ui_mult_badge #sweep,.svg-ui_mult_badge #points { opacity:0; }
.svg-ui_mult_badge[data-anim="up"] #sweep { animation:svg-ui_mult_badge-up 300ms ease-out; }
.svg-ui_mult_badge[data-anim="double"] #points { animation:svg-ui_mult_badge-double 600ms ease-out; transform-origin:110px 50px; }
@keyframes svg-ui_mult_badge-up { 0% { opacity:0; transform:translateX(-240px); } 30% { opacity:.7; } 100% { opacity:0; transform:translateX(240px); } }
@keyframes svg-ui_mult_badge-double { 0% { opacity:0; transform:scale(.65); } 25% { opacity:1; } 100% { opacity:0; transform:scale(1.25); } }
</style><rect x="4" y="4" width="212" height="92" rx="20" fill="${p.accentDark}" stroke="${p.accent}" stroke-width="4"/>
<g clip-path="url(#plateClip)"><path id="sweep" d="M100 0h20l40 100h-20Z" fill="${p.text}"/></g><g id="points" fill="${p.text}"><circle cx="20" cy="18" r="5"/><circle cx="110" cy="10" r="5"/><circle cx="200" cy="18" r="5"/><circle cx="25" cy="82" r="5"/><circle cx="195" cy="82" r="5"/></g>`;
}

function monster(def: ArtDefinition, p: Palette, w: number, h: number): string {
  const name = `svg-${def.id}`;
  const cx = w / 2;
  const used = new Set<string>();
  const part = (id: string, content = '') => { used.add(id); return `<g id="${id}">${content}</g>`; };
  const names: Record<string, string> = { mon_chest: '宝箱怪', mon_soldier: '发条兵', mon_bear: '布偶熊', mon_clock: '老座钟', mon_dragon: '宝石龙' };
  const clock = def.id === 'mon_clock';
  const faceY = clock ? 95 : 112;
  const bodyWidth = def.monster === 'boss' ? 340 : 200;
  const body = part(clock ? 'case' : def.id === 'mon_chest' ? 'box' : 'body', `<rect x="${cx-bodyWidth/2}" y="160" width="${bodyWidth}" height="220" rx="42" fill="${p.panelBg}" stroke="${p.accentDark}" stroke-width="8"/>`);
  const face = `<path d="M${cx-28} ${faceY}h4m48 0h4m-44 24q16 12 32 0" fill="none" stroke="${p.text}" stroke-width="7" stroke-linecap="round"/>`;
  const eyes = (def.parts ?? []).includes('eyes') ? part('eyes', face) : (def.parts ?? []).includes('face') ? part('face', face) : `<g class="normal-face">${face}</g>`;
  const hurt = part('face_hurt', `<path d="M${cx-34} ${faceY-8}l18 18m0 -18l-18 18m50 -18l18 18m0 -18l-18 18" fill="none" stroke="${p.text}" stroke-width="6"/>`);
  const daze = part('face_daze', `<text x="${cx}" y="${faceY+12}" text-anchor="middle" fill="${p.accent}" font-size="40">×  ×</text>`);
  const head = clock
    ? part('dial', `<circle cx="160" cy="140" r="62" fill="${p.textDim}" stroke="${p.accentDark}" stroke-width="7"/>${part('countdown_slot')}${eyes}${hurt}${daze}`)
    : part((def.parts ?? []).includes('head') ? 'head' : 'lid', `<circle cx="${cx}" cy="116" r="66" fill="${p.panelBg}" stroke="${p.accentDark}" stroke-width="8"/>${eyes}${hurt}${daze}`);
  const label = `<text x="${cx}" y="300" text-anchor="middle" fill="${p.textDim}" font-size="28" font-family="sans-serif">${names[def.id] ?? xml(def.id)}</text>`;
  const shadow = part('shadow', `<ellipse cx="${cx}" cy="386" rx="${bodyWidth*.57}" ry="12" fill="${p.ink}" opacity=".8"/>`);
  used.add('root');
  const ruleParts: Record<string, string> = {
    key: `<path d="M${cx+76} 170v-38m0 0c-38 0-38-42-18-42 14 0 18 18 18 24 0-6 4-24 18-24 20 0 20 42-18 42Z" fill="${p.accent}" stroke="${p.ink}" stroke-width="5"/>`,
    teeth: `<path d="M${cx-40} 145l14 22 14-22 14 22 14-22 14 22 14-22" fill="${p.text}"/>`,
    belly_gems: ['red','green','blue'].map((color, i) => `<g class="rule-layer-gem rule-layer-gem-${i}" transform="translate(${cx-82+i*58} 205)">${shape(color as GemColor,p.gem[color as GemColor].mid,p.ink,48)}</g>`).join(''),
  };
  const remaining = (def.parts ?? []).filter(id => !used.has(id)).map(id => part(id,ruleParts[id] ?? '')).join('');
  const rules = monsterRuleAnimations(def, p);
  return `<style>
.${name} #root { transform-origin:${cx}px ${h}px; }
.${name}:not([data-anim]) #root { animation:${name}-idle 3000ms ease-in-out infinite; }
.${name} #face_hurt,.${name} #face_daze { opacity:0; }
.${name}[data-anim="hit"] #root { animation:${name}-hit 400ms ease-out; }
.${name}[data-anim="hit_big"] #root { animation:${name}-hit-big 700ms ease-out; }
.${name}[data-anim="hit_big"] #face_hurt,.${name}[data-anim="daze"] #face_daze { opacity:1; }
.${name}[data-anim="hit_big"] #eyes,.${name}[data-anim="hit_big"] #face,.${name}[data-anim="hit_big"] .normal-face,.${name}[data-anim="daze"] #eyes,.${name}[data-anim="daze"] #face,.${name}[data-anim="daze"] .normal-face { opacity:0; }
.${name}[data-anim="attack"] #root { animation:${name}-attack 800ms ease-in-out; }
.${name}[data-anim="daze"] #root { animation:${name}-daze 600ms ease-in-out infinite; }
.${name}[data-anim="die"] #root { animation:${name}-die 1000ms ease-in both; }
${clock ? `.${name}[data-anim="tick"] #root { animation:${name}-tick 500ms ease-out; } .${name} #dial { transform-origin:160px 140px; animation:${name}-dial 2600ms ease-in-out infinite; }` : ''}
@keyframes ${name}-idle { 0%,100% { transform:rotate(-.8deg); } 50% { transform:rotate(.8deg); } }
@keyframes ${name}-hit { 25% { transform:rotate(6deg); } 100% { transform:rotate(0); } }
@keyframes ${name}-hit-big { 25% { transform:rotate(14deg); } 100% { transform:rotate(0); } }
@keyframes ${name}-attack { 50% { transform:scale(1.15); } 100% { transform:scale(1); } }
@keyframes ${name}-daze { 0%,100% { transform:rotate(-3deg); } 50% { transform:rotate(3deg); } }
@keyframes ${name}-die { to { opacity:0; transform:translateY(65px) scale(.9); } }
${clock ? `@keyframes ${name}-tick { 25% { transform:translateX(-8px); } 50% { transform:translateX(8px); } 100% { transform:translateX(0); } } @keyframes ${name}-dial { 0%,100% { transform:rotate(-1deg); } 50% { transform:rotate(1deg); } }` : ''}
</style>${rules.style}<g id="root">${shadow}${body}${head}${label}${remaining}${rules.decoration}</g>`;
}

/** New rule events are generated from the manifest; delivered v1 artwork stays untouched. */
function monsterRuleAnimations(def: ArtDefinition, p: Palette): { style: string; decoration: string } {
  const name = `svg-${def.id}`;
  const styles: string[] = [];
  let decoration = '';
  for (const [event, duration] of Object.entries(def.events ?? {})) {
    const selector = `.${name}[data-anim="${event}"]`;
    if (event === 'bite') {
      styles.push(`${selector} #lid,${selector} #teeth { transform-origin:160px 148px; animation:${name}-bite ${duration}ms ease-out; }
@keyframes ${name}-bite { 0%,100% { transform:translateY(0); } 35% { transform:translateY(-24px); } 58% { transform:translateY(12px); } }`);
    } else if (event === 'unwind') {
      styles.push(`.${name} #key { transform-origin:236px 132px; }
${selector} #key { animation:${name}-unwind ${duration}ms ease-out; }
${selector} #root { animation:${name}-unwind-body ${duration}ms ease-out; }
@keyframes ${name}-unwind { to { transform:rotate(-90deg); } }
@keyframes ${name}-unwind-body { 45% { transform:rotate(-6deg); } 100% { transform:rotate(0); } }`);
    } else if (event === 'wound_down') {
      styles.push(`${selector} #root { animation:${name}-wound-down ${duration}ms ease-out forwards; }
${selector} #key { transform:rotate(-90deg); }
@keyframes ${name}-wound-down { to { transform:translateY(25px) scaleY(.88); } }`);
    } else if (event === 'ring') {
      styles.push(`.${name} .rule-rings { opacity:0; transform-origin:160px 95px; }
${selector} #root { animation:${name}-ring ${duration}ms ease-out; }
${selector} .rule-rings { animation:${name}-ring-waves ${duration}ms ease-out; }
@keyframes ${name}-ring { 22% { transform:translateY(-18px); } 45% { transform:translateX(-6px); } 68% { transform:translateX(6px); } 100% { transform:translate(0); } }
@keyframes ${name}-ring-waves { 0% { opacity:0; transform:scale(.6); } 30% { opacity:1; } 100% { opacity:0; transform:scale(1.15); } }`);
      decoration = `<g class="rule-rings" fill="none" stroke="${p.text}" stroke-width="5"><path d="M70 75Q160 5 250 75M90 95Q160 35 230 95"/></g>`;
    } else if (event === 'layer') {
      styles.push(`${selector} #head { transform-origin:260px 170px; animation:${name}-layer ${duration}ms ease-out; }
${selector} .rule-layer-gem { animation:${name}-layer-glow ${duration}ms ease-out; }
${selector} .rule-layer-gem-1 { animation-delay:${duration*.12}ms; }
${selector} .rule-layer-gem-2 { animation-delay:${duration*.24}ms; }
@keyframes ${name}-layer { 30% { transform:translateY(-18px) rotate(-8deg); } 100% { transform:translateY(0); } }
@keyframes ${name}-layer-glow { 20% { filter:brightness(2); } 55%,100% { filter:brightness(1); } }`);
    }
  }
  return { style:styles.length ? `<style>${styles.join('\n')}</style>` : '', decoration };
}

function ruleSign(def: ArtDefinition, p: Palette): string {
  const duration = def.events!.flip;
  return `<style>
.svg-ui_rule_sign #board { transform-origin:140px 44px; }
.svg-ui_rule_sign:not([data-anim]) #board { animation:svg-ui_rule_sign-idle 3000ms ease-in-out infinite; }
.svg-ui_rule_sign[data-anim="flip"] #board { animation:svg-ui_rule_sign-flip ${duration}ms ease-in-out; }
@keyframes svg-ui_rule_sign-idle { 0%,100% { transform:rotate(-1deg); } 50% { transform:rotate(1deg); } }
@keyframes svg-ui_rule_sign-flip { 0%,100% { transform:scaleX(1); } 50% { transform:scaleX(0); } }
</style><g id="root"><g id="rope" fill="none" stroke="${p.accentDark}" stroke-width="5"><path d="M58 0v22M222 0v22"/></g><g id="board"><rect x="4" y="14" width="272" height="70" rx="10" fill="${p.textDim}" stroke="${p.accentDark}" stroke-width="5"/><g id="icon_slot"></g><g id="rule_text"></g></g></g>`;
}

function ruleOrRelic(def: ArtDefinition, p: Palette, w: number, h: number): string {
  // Use the user-supplied names, not implementation IDs, for readable placeholder labels.
  const label = def.desc.split('：')[0].slice(0,def.id.startsWith('rule_') ? 1 : 2);
  return `<rect x="3" y="3" width="${w-6}" height="${h-6}" rx="${w*.18}" fill="${p.panelBg}" stroke="${p.accentDark}" stroke-width="4"/><text x="${w/2}" y="${h/2}" text-anchor="middle" dominant-baseline="central" fill="${p.text}" font-size="${w*.36}" font-family="sans-serif">${xml(label)}</text>`;
}

function rainbowSlot(def: ArtDefinition, p: Palette): string {
  return `<style>
.svg-ui_rainbow_slot #gem { opacity:0; transform-origin:24px 24px; }
.svg-ui_rainbow_slot[data-anim="light"] #gem { animation:svg-ui_rainbow_slot-light ${def.events!.light}ms ease-out forwards; }
.svg-ui_rainbow_slot[data-anim="out"] #gem { animation:svg-ui_rainbow_slot-out ${def.events!.out}ms ease-out forwards; }
@keyframes svg-ui_rainbow_slot-light { 0% { opacity:0; transform:scale(.4); } 65% { opacity:1; transform:scale(1.15); } 100% { opacity:1; transform:scale(1); } }
@keyframes svg-ui_rainbow_slot-out { 0% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(.5); } }
</style><circle cx="24" cy="24" r="21" fill="${p.barTrack}" stroke="${p.accentDark}" stroke-width="3"/><g id="gem"><circle cx="24" cy="24" r="17" fill="currentColor"/></g>`;
}

function toolArt(def: ArtDefinition, p: Palette): string {
  const glyphs: Record<string, string> = { bag: '袋', lens: '放', hammer: '锤', mirror: '镜', stone: '磨', hourglass: '沙漏', seal: '封条', shadow: '影子', whistle: '哨子' };
  const name = `svg-${def.id}`;
  return `<style>.${name} #tool { transform-origin:88px 94px; }
.${name}:not([data-anim]) #tool { animation:${name}-idle 3200ms ease-in-out infinite; }
.${name}[data-anim="play"] #tool { animation:${name}-play 600ms ease-out; }
@keyframes ${name}-idle { 0%,100% { transform:rotate(-3deg); } 50% { transform:rotate(3deg); } }
@keyframes ${name}-play { 40% { transform:scale(1.2); } 100% { transform:scale(1); } }
</style><g id="tool"><circle cx="88" cy="94" r="56" fill="${def.tint ? 'currentColor' : p.textDim}" stroke="${p.ink}" stroke-width="6"/><text x="88" y="94" text-anchor="middle" dominant-baseline="central" fill="${p.ink}" font-size="48" font-family="sans-serif">${glyphs[def.id.replace('card_art_', '')]}</text></g>`;
}

function door(def: ArtDefinition, p: Palette): string {
  return `<style>
.svg-ui_door #leaf { transform-origin:32px 480px; }
.svg-ui_door[data-anim="open"] #leaf { animation:svg-ui_door-open ${def.events!.open}ms ease-in-out forwards; }
@keyframes svg-ui_door-open { 0% { transform:scaleX(1); } 15% { transform:scaleX(.96); } 100% { transform:scaleX(.12); } }
</style><g id="root"><g id="dark"><path d="M32 480V160Q32 65 160 24Q288 65 288 160V480Z" fill="${p.pageBg}"/></g><g id="leaf"><path d="M32 480V160Q32 65 160 24Q288 65 288 160V480Z" fill="${p.accentDark}" stroke="${p.ink}" stroke-width="6"/><path d="M96 80V478M160 28V478M224 80V478" fill="none" stroke="${p.ink}" stroke-width="4"/><circle cx="252" cy="225" r="14" fill="none" stroke="${p.accent}" stroke-width="6"/></g><g id="frame"><path d="M16 480V160Q16 52 160 8Q304 52 304 160V480M32 480V160Q32 65 160 24Q288 65 288 160V480" fill="none" stroke="${p.textDim}" stroke-width="14"/></g></g>`;
}

function knocker(def: ArtDefinition, p: Palette): string {
  return `<style>
.svg-npc_knocker #ring { transform-origin:120px 130px; }
.svg-npc_knocker:not([data-anim]) #ring { animation:svg-npc_knocker-idle 3000ms ease-in-out infinite; }
.svg-npc_knocker[data-anim="talk"] #ring { animation:svg-npc_knocker-talk ${def.events!.talk}ms ease-in-out; }
@keyframes svg-npc_knocker-idle { 0%,100% { transform:rotate(-2deg); } 50% { transform:rotate(2deg); } }
@keyframes svg-npc_knocker-talk { 0%,25%,50%,75%,100% { transform:translateY(0); } 12.5%,37.5%,62.5%,87.5% { transform:translateY(-12px); } }
</style><g id="root"><g id="plate"><circle cx="120" cy="100" r="84" fill="${p.accentDark}" stroke="${p.textDim}" stroke-width="7"/></g><g id="face"><g id="eyes" fill="${p.gem.green.mid}"><circle cx="92" cy="90" r="5"/><circle cx="148" cy="90" r="5"/></g><g id="mouth"><path d="M92 125Q120 145 148 125" fill="none" stroke="${p.ink}" stroke-width="9"/></g></g><g id="ring"><circle cx="120" cy="172" r="49" fill="none" stroke="${p.accent}" stroke-width="15"/></g></g>`;
}

function heart(def: ArtDefinition, p: Palette): string {
  const path = `<path d="M32 55C26 49 7 36 7 21C7 7 24 4 32 16C40 4 57 7 57 21C57 36 38 49 32 55Z" fill="${def.id === 'ui_heart_empty' ? 'none' : p.gem.red.mid}" stroke="${p.textDim}" stroke-width="4"/>`;
  if (def.id === 'ui_heart_empty') return path;
  return `<style>.svg-ui_heart #heart { transform-origin:32px 32px; }
.svg-ui_heart:not([data-anim]) #heart { animation:svg-ui_heart-idle 1600ms ease-in-out infinite; }
.svg-ui_heart[data-anim="lose"] #heart { animation:svg-ui_heart-lose 600ms ease-in both; }
.svg-ui_heart[data-anim="gain"] #heart { animation:svg-ui_heart-gain 500ms ease-out both; }
@keyframes svg-ui_heart-idle { 50% { transform:scale(1.04); } }
@keyframes svg-ui_heart-lose { to { transform:scale(.3); opacity:0; } }
@keyframes svg-ui_heart-gain { 0% { transform:scale(.3); } 65% { transform:scale(1.15); } 100% { transform:scale(1); } }
</style><g id="heart">${path}</g>`;
}

function countdown(p: Palette): string {
  return `<style>.svg-ui_countdown #badge { transform-origin:48px 48px; }
.svg-ui_countdown[data-anim="tick"] #badge { animation:svg-ui_countdown-tick 500ms ease-out; }
.svg-ui_countdown[data-anim="warn"] #badge { animation:svg-ui_countdown-warn 800ms ease-in-out infinite; }
@keyframes svg-ui_countdown-tick { to { transform:rotate(180deg); } }
@keyframes svg-ui_countdown-warn { 0%,100% { transform:rotate(-5deg); } 50% { transform:rotate(5deg); } }
</style><g id="badge"><circle cx="48" cy="48" r="43" fill="${p.accentDark}" stroke="${p.accent}" stroke-width="5"/></g>`;
}

function lootChest(p: Palette): string {
  return `<style>.svg-loot_chest #root { transform-origin:120px 195px; }
.svg-loot_chest #lid { transform-origin:32px 100px; }
.svg-loot_chest[data-anim="drop"] #root { animation:svg-loot_chest-drop 500ms ease-out both; }
.svg-loot_chest[data-anim="open"] #lid { animation:svg-loot_chest-open 800ms ease-in-out forwards; }
@keyframes svg-loot_chest-drop { 0% { transform:translateY(-90px); opacity:0; } 60% { transform:translateY(0); opacity:1; } 80% { transform:translateY(-12px); } 100% { transform:translateY(0); } }
@keyframes svg-loot_chest-open { to { transform:rotate(-45deg); } }
</style><g id="root"><rect x="32" y="100" width="176" height="94" rx="10" fill="${p.accentDark}" stroke="${p.ink}" stroke-width="6"/><g id="lid"><rect x="32" y="55" width="176" height="55" rx="12" fill="${p.accentDark}" stroke="${p.accent}" stroke-width="6"/></g><rect x="109" y="108" width="22" height="30" rx="4" fill="${p.accent}"/></g>`;
}

function emblem(def: ArtDefinition, p: Palette, w: number, h: number): string {
  const back = def.id === 'card_back';
  const frame = back
    ? `<rect x="5" y="5" width="${w-10}" height="${h-10}" rx="15" fill="${p.panelBg}" stroke="${p.accentDark}" stroke-width="6"/>`
    : `<path d="M30 22H370V205Q310 300 200 330Q90 300 30 205Z" fill="${p.panelBg}" stroke="${p.accentDark}" stroke-width="10"/>`;
  const size = back ? 48 : 86;
  const colors: GemColor[] = ['red', 'green', 'blue'];
  const gems = colors.map((color, i) => `<g transform="translate(${w/2-size*.5+(i-1)*size*1.1} ${h*.48-size*.5})"><g class="emblem-gem emblem-gem-${i}">${shape(color,p.gem[color].mid,p.ink,size)}</g></g>`).join('');
  return `<style>.svg-${def.id} .emblem-gem { opacity:.8; animation:svg-${def.id}-idle 5100ms ease-in-out infinite; } .svg-${def.id} .emblem-gem-1 { animation-delay:1700ms; } .svg-${def.id} .emblem-gem-2 { animation-delay:3400ms; } @keyframes svg-${def.id}-idle { 0%,15%,100% { opacity:.7; } 7% { opacity:1; } }</style>${frame}${gems}`;
}

function effect(def: ArtDefinition, p: Palette, w: number, h: number): string {
  const color = def.tint ? 'currentColor' : def.id === 'fx_white' ? p.mix['7']! : def.id === 'fx_heal' ? p.gem.red.mid : p.text;
  let content = `<circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)*.34}" fill="none" stroke="${color}" stroke-width="${Math.min(w,h)*.065}"/>`;
  if (def.id === 'fx_attack') content = [0,1,2].map(i => `<path d="M${w*.23+i*45} ${h*.2}l${w*.3} ${h*.6}" fill="none" stroke="${p.ink}" stroke-width="18" stroke-linecap="round"/><path d="M${w*.23+i*45+5} ${h*.2}l${w*.3} ${h*.6}" fill="none" stroke="${p.textDim}" stroke-width="4"/>`).join('');
  if (def.id === 'fx_slam') content = `<ellipse cx="${w/2}" cy="${h/2}" rx="${w*.4}" ry="${h*.22}" fill="none" stroke="currentColor" stroke-width="10"/>`;
  if (def.id === 'fx_shun') content = `<rect x="${w*.35}" y="12" width="${w*.3}" height="${h-24}" rx="8" fill="currentColor"/>`;
  if (def.id === 'fx_rainbow') content = ['1','3','2','6','4','5'].map((key, i) => `<path d="M18 ${h-20-i*8} Q${w/2} ${-h*.2-i*8} ${w-18} ${h-20-i*8}" fill="none" stroke="${p.mix[key]}" stroke-width="8"/>`).join('');
  if (def.id === 'fx_grow') content += [0,1,2,3].map(i => spark(w/2 + Math.cos(i*Math.PI/2)*w*.3, h/2+Math.sin(i*Math.PI/2)*h*.3, 12, color)).join('');
  const name = `svg-${def.id}`;
  const duration = def.events?.play ?? 500;
  const start = def.id === 'fx_shun' ? 'translateY(70px) scaleY(.3)' : 'scale(.3)';
  const finish = def.id === 'fx_shun' ? 'translateY(-30px) scaleY(1.2)' : 'scale(1.2)';
  return `<style>.${name} #effect { opacity:0; transform-origin:${w/2}px ${h/2}px; } .${name}[data-anim="play"] #effect { animation:${name}-play ${duration}ms ease-out both; } @keyframes ${name}-play { 0% { opacity:0; transform:${start}; } 15% { opacity:1; } 100% { opacity:0; transform:${finish}; } }</style><g id="effect">${content}</g>`;
}

export function generatePlaceholder(def: ArtDefinition, manifest: ArtManifest): string {
  const p = manifest.palette;
  const [w, h] = dimensions(def);
  let body: string;
  const gem = /^gem_(red|green|blue)_(rough|cut|shine)$/.exec(def.id);
  const icon = /^gem_icon_(red|green|blue)$/.exec(def.id);
  if (gem) {
    const color = gem[1] as GemColor;
    body = shape(color, gem[2] === 'rough' ? '#4a4440' : p.gem[color].mid, p.ink);
    if (gem[2] === 'rough') body += `<g transform="translate(20 14) scale(.65)">${shape(color, p.gem[color].mid, p.ink, 100, .45)}</g>`;
    if (gem[2] === 'shine') body += spark(76, 22, 13, p.mix['7']!) + spark(27, 73, 8, p.mix['7']!);
    if (def.idle) {
      const offset = ['red','green','blue'].indexOf(color)*3 + ['rough','cut','shine'].indexOf(gem[2]);
      body += `<style>.svg-${def.id} .idle-spark { opacity:.25; animation:svg-${def.id}-idle ${3100+offset*290}ms ease-in-out infinite; } @keyframes svg-${def.id}-idle { 0%,20%,100% { opacity:.1; } 10% { opacity:.9; } }</style><circle class="idle-spark" cx="62" cy="32" r="5" fill="${p.mix['7']}"/>`;
    }
  } else if (icon) {
    const color = icon[1] as GemColor;
    body = shape(color, p.gem[color].mid, p.ink, 32);
  } else if (def.id === 'card_frame' || def.id === 'card_frame_tool') {
    const a = manifest.cardLayout.artWindow;
    const edge = def.id === 'card_frame_tool' ? p.textDim : p.accent;
    body = `<path fill="${p.panelBg}" fill-rule="evenodd" d="M12 0H188Q200 0 200 12V288Q200 300 188 300H12Q0 300 0 288V12Q0 0 12 0Z M${a.x+a.r} ${a.y}H${a.x+a.w-a.r}Q${a.x+a.w} ${a.y} ${a.x+a.w} ${a.y+a.r}V${a.y+a.h-a.r}Q${a.x+a.w} ${a.y+a.h} ${a.x+a.w-a.r} ${a.y+a.h}H${a.x+a.r}Q${a.x} ${a.y+a.h} ${a.x} ${a.y+a.h-a.r}V${a.y+a.r}Q${a.x} ${a.y} ${a.x+a.r} ${a.y}Z"/><rect x="2" y="2" width="196" height="296" rx="11" fill="none" stroke="${edge}" stroke-width="2"/><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="${a.r}" fill="none" stroke="${edge}" stroke-width="2"/>`;
  } else if (def.id === 'card_art_bg' || def.id === 'card_art_bg_tool' || def.id === 'bg_tile') {
    body = `<rect width="${w}" height="${h}" fill="${def.id === 'bg_tile' ? p.pageBg : def.id === 'card_art_bg_tool' ? p.barTrack : p.panelBg}"/>`;
  } else if (def.id === 'card_art_empty') {
    body = `<g fill="none" stroke="${p.textDim}" stroke-width="7"><ellipse cx="88" cy="105" rx="42" ry="30"/><path d="M48 111l-9 -14m89 14l9 -14M88 78V61" stroke-linecap="round"/></g>`;
  } else if (def.id === 'card_gem_bar') {
    body = `<rect width="132" height="34" rx="12" fill="${p.accentDark}"/><circle cx="30" cy="17" r="12" fill="${p.ink}"/><rect x="54" y="5" width="24" height="24" rx="2" fill="${p.ink}"/><path d="M102 5l12 24H90Z" fill="${p.ink}"/>`;
  } else if (def.id === 'ui_door') {
    body = door(def, p);
  } else if (def.id === 'npc_knocker') {
    body = knocker(def, p);
  } else if (def.id.startsWith('ui_reward_')) {
    const labels: Record<string,string> = { ui_reward_card:'牌', ui_reward_shop:'坊', ui_reward_heal:'心' };
    body = ruleOrRelic({...def, desc:labels[def.id]}, p, w, h);
  } else if (def.id === 'ui_rule_sign') {
    body = ruleSign(def, p);
  } else if (def.id === 'ui_rainbow_slot') {
    body = rainbowSlot(def, p);
  } else if (def.id.startsWith('rule_') || def.id.startsWith('relic_')) {
    body = ruleOrRelic(def, p, w, h);
  } else if (def.monster) {
    body = monster(def, p, w, h);
  } else if (/^card_art_(bag|lens|hammer|mirror|stone|hourglass|seal|shadow|whistle)$/.test(def.id)) {
    body = toolArt(def, p);
  } else if (def.id === 'ui_heart' || def.id === 'ui_heart_empty') {
    body = heart(def, p);
  } else if (def.id === 'ui_countdown') {
    body = countdown(p);
  } else if (def.id === 'loot_chest') {
    body = lootChest(p);
  } else if (def.id === 'card_back' || def.id === 'title_emblem') {
    body = emblem(def, p, w, h);
  } else if (def.id.startsWith('ui_node_')) {
    const glyph = ({ui_node_fight:'战',ui_node_elite:'精',ui_node_boss:'龙',ui_node_door:'门'} as Record<string,string>)[def.id];
    body = `<circle cx="32" cy="32" r="27" fill="${p.panelBg}" stroke="${p.accentDark}" stroke-width="5"/><text x="32" y="32" text-anchor="middle" dominant-baseline="central" fill="${p.text}" font-family="sans-serif" font-size="28">${glyph}</text>`;
  } else if (def.id === 'ui_banner') {
    body = `<path d="M4 10H596L570 70L596 130H4L30 70Z" fill="${p.accentDark}" stroke="${p.accent}" stroke-width="5"/>`;
  } else if (def.id === 'prop_pillar') {
    body = `<rect x="24" y="20" width="72" height="216" rx="4" fill="${p.textDim}" stroke="${p.ink}" stroke-width="6"/>`;
  } else if (def.id === 'dummy') {
    body = dummy(p);
  } else if (def.id === 'ui_mult_badge') {
    body = badge(p);
  } else if (def.id.startsWith('fx_')) {
    body = effect(def, p, w, h);
  } else if (def.nineSlice) {
    const s = Math.min(...def.nineSlice)*.36;
    body = `<rect x="3" y="3" width="${w-6}" height="${h-6}" rx="16" fill="${def.id === 'ui_btn_primary' ? p.accentDark : def.id === 'ui_hp_frame' ? p.barTrack : p.panelBg}" stroke="${p.accentDark}" stroke-width="6"/>`;
    body += [[10,10],[w-10-s,10],[10,h-10-s],[w-10-s,h-10-s]].map(([x,y]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="3" fill="${p.accent}"/>`).join('');
  } else if (def.id.startsWith('ui_icon_')) {
    const glyphs: Record<string,string> = { ui_icon_rules:'?', ui_icon_settings:'≡', ui_icon_undo:'↶', ui_icon_deck:'▤' };
    body = `<text x="32" y="49" text-anchor="middle" fill="${p.text}" font-size="52" font-family="sans-serif">${glyphs[def.id] ?? '?'}</text>`;
  } else {
    body = `<rect x="3" y="3" width="${w-6}" height="${h-6}" rx="12" fill="${p.panelBg}" stroke="${p.textDim}" stroke-width="3" stroke-dasharray="8 5"/><text x="${w/2}" y="${h/2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(18,w/9)}" fill="${p.textDim}" font-family="sans-serif">${xml(def.id)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${def.viewBox}" class="svg-${def.id}">${body}</svg>`;
}
