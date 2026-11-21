import { variants, inhabit, traitOf } from './explore/roster.js';
import { RULES as R, EXPERIMENT as X } from './config.js';

const CN_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'];
const GEM_ARTS = ['red', 'green', 'blue'];
const MAX_EXACT_BATCH_SHOTS = 2000;

// 中文大数：单位前最多 5 位，每 4 位进一级（例：14532 万、12324 亿、12432 兆）。
export function formatChineseNumber(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n < 100000) return String(n);
  let v = n;
  let unit = 0;
  while (v >= 100000 && unit < CN_UNITS.length - 1) {
    v /= 10000;
    unit++;
  }
  return Math.floor(v) + ' ' + CN_UNITS[unit];
}

// A run owns its random stream. Planning and rendering never consume it.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(values, rng) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function gemMaskToVals(col) {
  const mask = R.masks[col] || 0;
  return [mask & 1 ? 1 : 0, mask & 2 ? 1 : 0, mask & 4 ? 1 : 0];
}

function gemCard(col) {
  return {
    id: 'gem',
    name: R.colors[col] + '宝石',
    col,
    vals: gemMaskToVals(col),
    text: '每颗宝石打倍率发',
  };
}

function startDeck() {
  const deck = [];
  for (let col = 0; col < R.deckCounts.length; col++) {
    const count = R.deckCounts[col];
    for (let i = 0; i < count; i++) deck.push(gemCard(col));
  }
  return deck;
}

export function gemThreshold(level) {
  return Math.max(1, level) * R.gemLevelStep;
}

export function gemPower(gems, colorIdx) {
  const level = gems?.[colorIdx]?.level ?? 1;
  return R.gemLevelGrowth ** Math.max(0, level - 1);
}

export function newRun(seed) {
  return {
    seed,
    rng: seededRandom(seed),
    deck: startDeck(),
    hearts: R.hearts,
    gems: [
      { level: 1, exp: 0 },
      { level: 1, exp: 0 },
      { level: 1, exp: 0 },
    ],
    fights: 0,
    wins: 0,
    seals: [],
    maxTurn: 0,
    maxHit: 0,
  };
}

export function addCardToHand(b, card) {
  if (!card) return false;
  b.drawEvents ??= [];
  if (b.hand.length >= R.maxHandSize) {
    b.discard.push(card);
    b.drawEvents.push({ type: 'overflow', card });
    return false;
  }
  b.hand.push(card);
  b.drawEvents.push({ type: 'draw', card });
  return true;
}

export function drawCards(b, count) {
  let drawn = 0;
  b.drawEvents ??= [];
  for (let i = 0; i < count; i++) {
    if (!b.draw.length) {
      if (!b.discard.length) break;
      const n = b.discard.length;
      b.draw = shuffle(b.discard.splice(0), b.rng);
      b.drawEvents.push({ type: 'reshuffle', count: n });
    }
    if (!b.draw.length) break;
    addCardToHand(b, b.draw.pop());
    drawn++;
  }
  return drawn;
}

function replenish(b) {
  b.drawEvents ??= [];
  while (b.hand.length < R.handSize) {
    if (!b.draw.length) {
      if (!b.discard.length) break;
      const n = b.discard.length;
      b.draw = shuffle(b.discard.splice(0), b.rng);
      b.drawEvents.push({ type: 'reshuffle', count: n });
    }
    if (!b.draw.length) break;
    if (!addCardToHand(b, b.draw.pop())) break;
  }
}

export function startFight(run) {
  run.fights++;
  const elite = run.fights % R.eliteEvery === 0;
  const hp = X.lowHp
    ? (elite ? X.hpElite : X.hpNormal)
    : (elite ? R.hpElite : R.hpNormal) * R.hpGrowth ** (run.fights - 1);
  const group = elite ? R.eliteGroup : R.groups[Math.floor(run.rng() * R.groups.length)];
  const monsters = group.map(([model, fraction], i) => {
    const kind = inhabit(model, run.seed, run.fights, i);
    const maxHp = Math.round(hp * fraction);
    return {
      kind,
      ...R.monsters[model],
      name: variants[kind]?.name ?? R.monsters[model].name,
      maxHp,
      hp: maxHp,
      attacks: 0,
    };
  });
  const b = {
    elite,
    monsters,
    turn: 1,
    hand: [],
    line: [],
    draw: shuffle([...run.deck], run.rng),
    discard: [],
    target: 0,
    lamps: 0,
    cursor: -1,
    multiplier: 1,
    rng: run.rng,
    shield: 0,
    gems: run.gems,
    pendingGemExp: [0, 0, 0],
    lastLevelUps: [],
  };
  replenish(b);
  return b;
}

export function playInstant(b, handIndex) {
  const card = b.hand[handIndex];
  if (!card || !card.instant) return null;
  b.hand.splice(handIndex, 1);
  b.discard.push(card);
  if (card.vals && b.pendingGemExp) {
    for (let j = 0; j < 3; j++) {
      if (card.vals[j]) b.pendingGemExp[j] += 1;
    }
  }
  if (card.id === 'shield') b.shield++;
  return { card, shield: b.shield };
}

export function queueCard(b, handIndex) {
  const card = b.hand[handIndex];
  if (!card || card.instant) return false;
  b.line.push(b.hand.splice(handIndex, 1)[0]);
  return true;
}

export function undoLast(b) {
  if (!b.line.length) return false;
  b.hand.push(b.line.pop());
  return true;
}

export function undoAll(b) {
  if (!b.line.length) return false;
  b.hand.push(...b.line.splice(0));
  return true;
}

export function selectTarget(b, index) {
  if (!(b.monsters[index]?.hp > 0)) return false;
  b.target = index;
  return true;
}

function resolved(card, cursor) {
  if (card.id !== 'mirror') return card;
  const col = cursor >= 0 && cursor < 6 ? (cursor + 3) % 6 : 6;
  return { ...card, col, vals: gemMaskToVals(col) };
}

function relation(col, cursor) {
  if (col === 8) return '无色';
  if (cursor < 0) return '起色';
  if (cursor === 6 || col === 6) return '百搭';
  const d = Math.abs(cursor - col);
  return ['同色', '邻色', '断色', '补色'][Math.min(d, 6 - d)];
}

export function lampCount(lamps) {
  let count = 0;
  for (let i = 0; i < 6; i++) count += (lamps >> i) & 1;
  return count;
}

function lightNeighbors(lamps, cursor) {
  const positions = cursor >= 0 && cursor < 6
    ? [(cursor + 1) % 6, (cursor + 5) % 6]
    : [0, 1, 2, 3, 4, 5];
  let count = 0;
  for (const pos of positions) {
    if (lamps & (1 << pos)) continue;
    lamps |= 1 << pos;
    if (++count === R.relight) break;
  }
  return lamps;
}

function hint(rel, before, lamps, rainbow, card) {
  if (card.instant) return '立即释放';
  if (rainbow) return '彩虹 ×' + R.rainbowFactor;
  if (rel === '补色') return '合白·灭灯';
  if (rel === '断色') return '断色·灭灯';
  if (lampCount(lamps) === 5) return '差一盏彩虹';
  if (lamps !== before) return rel === '无色' ? '点灯' : rel + '·亮灯';
  return rel === '无色' ? card.name : rel;
}

export function preview(b, cards = b.line) {
  let cursor = b.cursor ?? -1;
  let lamps = b.lamps ?? 0;
  const gems = b.gems;
  let multiplier = 1;
  let hops = 0;
  let rainbow = false;
  const batches = [];
  const states = [];

  function addBatch(cardIndex, count, base, power, art, { white = false, pure = false, gemColor = -1 } = {}) {
    if (count <= 0) return;
    batches.push({ cardIndex, count, base, power, art, white, pure, gemColor });
  }

  for (let i = 0; i < cards.length; i++) {
    const rawCard = cards[i];
    if (rawCard.instant) {
      states.push({
        card: rawCard,
        relation: '无色',
        hint: '立即释放',
        lamps,
        cursor,
        multiplier,
        rainbow: false,
        total: 0,
        max: 0,
        shotCount: 0,
      });
      continue;
    }
    const card = resolved(rawCard, cursor);
    const { col, vals, id } = card;
    const rel = relation(col, cursor);
    const before = lamps;
    let triggered = false;

    if (col !== 8) {
      if (rel !== '起色' && rel !== '断色') multiplier *= R.multiplier;
      const bit = col < 6 ? 1 << col : 0;
      lamps = rel === '补色' || rel === '断色' ? bit : lamps | bit;
      for (let j = 0; j < 3; j++) {
        if (vals?.[j]) {
          addBatch(i, multiplier, R.baseDamage, gemPower(gems, j), GEM_ARTS[j], { gemColor: j });
        }
      }
      if (rel === '补色') {
        hops++;
        for (let j = 0; j < 3; j++) {
          addBatch(i, multiplier, R.baseDamage, gemPower(gems, j), 'white', { white: true, gemColor: j });
        }
      }
      cursor = col;
    }

    switch (id) {
      case 'lens':
        multiplier *= R.multiplier;
        break;
      case 'rain':
        addBatch(i, R.rainHits * multiplier, R.rainPoints, 1, 'extra');
        break;
      case 'light':
        lamps = lightNeighbors(lamps, cursor);
        break;
      case 'ice':
        addBatch(i, 1, R.iceDamage, 1, 'pure', { pure: true });
        break;
      case 'seal':
        addBatch(i, R.sealHits * multiplier, R.sealPoints, 1, 'extra');
        break;
    }

    if (col !== 8 && !rainbow && lamps === 0b111111) {
      triggered = rainbow = true;
      lamps = col < 6 ? 1 << col : 0;
    }

    states.push({
      card,
      relation: rel,
      hint: hint(rel, before, lamps, triggered, card),
      lamps,
      cursor,
      multiplier,
      rainbow: triggered,
      total: 0,
      max: 0,
      shotCount: 0,
    });
  }

  // 封印·大巴多姆：这回合每合白一次，再多打 1 × 倍率 发，每发 6。
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].id === 'seal' && hops > 0) {
      addBatch(i, hops * multiplier, R.sealPoints, 1, 'extra');
    }
  }

  const rainbowMult = rainbow ? R.rainbowFactor : 1;
  let total = 0;
  let max = 0;
  let shotCount = 0;

  for (const batch of batches) {
    batch.unscaledRaw = batch.base * batch.power;
    batch.raw = batch.unscaledRaw * rainbowMult;
    batch.perShot = Math.max(1, Math.round(batch.raw));
    batch.critPerShot = Math.max(1, Math.round(batch.raw * R.critFactor));
    const bTotal = batch.perShot * batch.count;
    const bMax = batch.critPerShot * batch.count;
    const st = states[batch.cardIndex];
    st.total += bTotal;
    st.max += bMax;
    st.shotCount += batch.count;
    total += bTotal;
    max += bMax;
    shotCount += batch.count;
  }

  return {
    states,
    batches,
    cursor,
    lamps,
    multiplier,
    hops,
    rainbow,
    total,
    max,
    shotCount,
  };
}

function rollBinomialCrits(count, p, rng) {
  if (count <= MAX_EXACT_BATCH_SHOTS) {
    let crits = 0;
    for (let i = 0; i < count; i++) if (rng() < p) crits++;
    return crits;
  }
  const mean = count * p;
  const std = Math.sqrt(count * p * (1 - p));
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.min(count, Math.round(mean + z * std)));
}

export function startCast(b) {
  const plan = preview(b);
  plan.damage = 0;
  plan.startLamps = b.lamps;
  plan.lastTarget = b.target;
  plan.segments = [];

  // 按牌分组展开每发，同牌内的发打乱顺序（红绿蓝、暴击混着出）。
  const byCard = Array.from({ length: plan.states.length }, () => []);
  for (const batch of plan.batches) {
    const targetList = byCard[batch.cardIndex];
    if (batch.count <= MAX_EXACT_BATCH_SHOTS) {
      for (let i = 0; i < batch.count; i++) {
        const crit = b.rng() < R.critChance;
        const mult = crit ? R.critFactor : 1;
        targetList.push({
          cardIndex: batch.cardIndex,
          value: batch.raw * mult,
          rawValue: (batch.unscaledRaw ?? batch.raw) * mult,
          art: batch.art,
          white: batch.white,
          pure: batch.pure,
          gemColor: batch.gemColor,
          crit,
          count: 1,
        });
      }
    } else {
      // 超大倍率保护：按发数切分成合理数量的包，不卡死内存且保持精确单发伤害与不转溢出。
      const crits = rollBinomialCrits(batch.count, R.critChance, b.rng);
      const normals = batch.count - crits;
      const chunks = 40;
      const pushChunked = (n, crit) => {
        if (n <= 0) return;
        const mult = crit ? R.critFactor : 1;
        const c = Math.min(n, chunks);
        const baseN = Math.floor(n / c);
        let rem = n - baseN * c;
        for (let i = 0; i < c; i++) {
          const cnt = baseN + (rem-- > 0 ? 1 : 0);
          targetList.push({
            cardIndex: batch.cardIndex,
            value: batch.raw * mult,
            rawValue: (batch.unscaledRaw ?? batch.raw) * mult,
            art: batch.art,
            white: batch.white,
            pure: batch.pure,
            gemColor: batch.gemColor,
            crit,
            count: cnt,
          });
        }
      };
      pushChunked(normals, false);
      pushChunked(crits, true);
    }
  }

  for (const list of byCard) {
    shuffle(list, b.rng);
    for (const seg of list) plan.segments.push(seg);
  }
  return plan;
}

export function segmentDamage(seg, kind, lamps) {
  const trait = traitOf(kind);
  if (!seg.pure && seg.white && trait !== 'tiko') return 0;
  // Apply the reduction as integer tenths so an exact half stays a half.
  const reduction = !seg.pure && trait === 'tiko' ? R.dimPerLamp * 10 * lampCount(lamps) : 0;
  return Math.max(1, Math.round(seg.value * (10 - reduction) / 10));
}

export function applyHit(run, b, plan, index) {
  const seg = plan.segments[index];
  const count = seg.count || 1;
  let remaining = count;
  let totalDealt = 0;
  let lastTarget = b.target;
  let lastSingleDamage = 0;
  let killed = false;

  while (remaining > 0) {
    let target = b.target;
    if (b.monsters[target].hp <= 0) target = b.monsters.findIndex(mon => mon.hp > 0);
    if (target < 0) {
      target = plan.lastTarget;
      const mon = b.monsters[target];
      lastSingleDamage = segmentDamage(seg, mon.kind, plan.startLamps);
      totalDealt += lastSingleDamage * remaining;
      lastTarget = target;
      break;
    }
    const mon = b.monsters[target];
    const perShot = segmentDamage(seg, mon.kind, plan.startLamps);
    lastSingleDamage = perShot;
    lastTarget = target;
    b.target = plan.lastTarget = target;

    if (perShot <= 0) {
      remaining = 0;
      break;
    }
    // 一发打穿了，多出来的不转给下一只；剩下的发顺延打下一只。
    const shotsNeeded = Math.ceil(mon.hp / perShot);
    const used = Math.min(remaining, shotsNeeded);
    const previousHp = mon.hp;
    mon.hp = Math.max(0, mon.hp - perShot * used);
    totalDealt += perShot * used;
    run.maxHit = Math.max(run.maxHit, perShot);
    if (previousHp > 0 && mon.hp === 0) killed = true;
    remaining -= used;
  }

  const rawSingleDamage = segmentDamage(
    { ...seg, value: seg.rawValue ?? seg.value },
    b.monsters[lastTarget].kind,
    plan.startLamps
  );
  const rawTotalDamage = totalDealt > 0 ? rawSingleDamage * count : 0;
  plan.damage += totalDealt;
  return {
    ...seg,
    target: lastTarget,
    damage: lastSingleDamage,
    rawDamage: rawSingleDamage,
    totalDamage: totalDealt,
    rawTotalDamage,
    killed,
  };
}

export function endCast(run, b, plan) {
  b.lamps = plan.lamps;
  b.cursor = plan.cursor;
  b.multiplier = plan.multiplier;
  run.maxTurn = Math.max(run.maxTurn, plan.damage);

  // 记宝石等级次数（白牌算红绿蓝各 1 颗，白光不算，回合结束时结算升级）。
  for (const st of plan.states) {
    const vals = st.card?.vals;
    if (!vals) continue;
    for (let j = 0; j < 3; j++) {
      if (vals[j]) b.pendingGemExp[j] += 1;
    }
  }

  b.discard.push(...b.line.splice(0));

  const attacks = [];
  for (let i = 0; i < b.monsters.length; i++) {
    const mon = b.monsters[i];
    if (!mon.hp) continue;
    mon.countdown -= 1 + (mon.kind === 'elite' ? plan.hops : 0);
    if (mon.countdown <= 0) {
      mon.countdown = 0;
      attacks.push(i);
    }
  }
  return attacks;
}

export function attack(run, b, monsterIndex) {
  const mon = b.monsters[monsterIndex];
  const blocked = b.shield > 0;
  const dmg = mon.attackDamage ?? R.monsters[traitOf(mon.kind)]?.attackDamage ?? R.attackDamage;
  if (blocked) b.shield--;
  else run.hearts = Math.max(0, Math.round((run.hearts - dmg) * 2) / 2);
  mon.attacks++;
  const baseCd = R.monsters[traitOf(mon.kind)].countdown;
  mon.countdown = mon.attacks >= R.attacksBeforeRage ? 1 : Math.max(1, baseCd - mon.attacks);
  return { blocked, damage: blocked ? 0 : dmg };
}

export function previewPendingGems(b, states = []) {
  const pend = [...(b?.pendingGemExp || [0, 0, 0])];
  for (const st of states) {
    const vals = st?.card?.vals;
    if (!vals) continue;
    for (let j = 0; j < 3; j++) if (vals[j]) pend[j] += 1;
  }
  return pend;
}

export function settleGemLevels(run, b) {
  const levelUps = [];
  if (!b.pendingGemExp) return levelUps;
  for (let j = 0; j < 3; j++) {
    const gained = b.pendingGemExp[j] || 0;
    b.pendingGemExp[j] = 0;
    if (!gained) continue;
    const gem = run.gems[j];
    const from = gem.level;
    gem.exp += gained;
    while (gem.exp >= gemThreshold(gem.level)) {
      gem.exp -= gemThreshold(gem.level);
      gem.level++;
    }
    if (gem.level > from) {
      levelUps.push({ color: j, from, to: gem.level });
    }
  }
  b.lastLevelUps = levelUps;
  return levelUps;
}

export function finishTurn(run, b) {
  settleGemLevels(run, b);
  if (b.monsters.every(mon => mon.hp <= 0)) {
    run.wins++;
    return 'win';
  }
  if (run.hearts <= 0) return 'dead';
  if (b.turn >= R.turnLimit) return 'limit';
  b.turn++;
  b.shield = 0;
  b.multiplier = 1;
  if (!b.monsters[b.target].hp) b.target = b.monsters.findIndex(mon => mon.hp > 0);
  replenish(b);
  return 'next';
}

function extra(id) {
  return { id, ...R.extras[id] };
}

export function lootChoices(run) {
  return shuffle([...R.loot], run.rng).slice(0, R.lootCount).map(extra);
}

export function takeLoot(run, card) {
  if (card) run.deck.push(card);
}

export function finishElite(run, seal) {
  run.hearts = Math.min(R.hearts, run.hearts + R.healElite);
  if (seal) {
    run.deck.push(extra('seal'));
    run.seals.push(R.monsters.elite.name);
  }
}
