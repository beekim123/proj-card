// 全部音效合成（石板、锻铁、水晶宝石、铃、羊皮纸与夜林环境）+ 密集发声限流。

export const SFX_CATALOG = [
  { id: 'dry', group: '走路与林子', name: '干地脚步', desc: '枯叶碎枝轻响配泥土低频踏步' },
  { id: 'wet', group: '走路与林子', name: '湿地脚步', desc: '浅水溅落带通滤波配湿泥低频吸附' },
  { id: 'owl', group: '走路与林子', name: '夜林猫头鹰', desc: '远处双音空谷夜啼，带雾林回声' },
  { id: 'frog', group: '走路与林子', name: '湿地蛙鸣', desc: '水洼边低沉三连木质蛙鸣' },
  { id: 'menu', group: '界面', name: '菜单点按', desc: '温润石片轻叩配短促木石共鸣' },
  { id: 'hover', group: '界面', name: '按钮/手牌悬停', desc: '极轻的羊皮纸与微光拂过声（55ms 限流）' },
  { id: 'play', group: '牌', name: '拖牌进序列', desc: '石板牌落槽叩击配晶石微鸣' },
  { id: 'undo', group: '牌', name: '撤销回手', desc: '轻快滑回配降调石片轻响' },
  { id: 'deal', group: '牌', name: '补牌飞入', desc: '顺滑发牌刷纸声，连续发牌音高微升' },
  { id: 'shuffle', group: '牌', name: '洗牌', desc: '多张牌快速交错洗拢的层次刷牌声' },
  { id: 'overflow', group: '牌', name: '满手牌进弃牌堆', desc: '沉闷滑落配石槽收牌低音' },
  { id: 'instant', group: '牌', name: '立即释放', desc: '青铜牌框共鸣配暖光绽放五度和弦' },
  { id: 'cast', group: '施法', name: '按施法', desc: '法阵启动低频共鸣配水晶泛音上扬' },
  { id: 'hit', group: '施法', name: '单发打中', desc: '宝石碎光敲击配扎实受击（28ms 限流+五声音阶微调，密集如晶雨）' },
  { id: 'crit', group: '施法', name: '暴击', desc: '重锤低频冲击配明亮晶石爆裂泛音（45ms 限流）' },
  { id: 'block', group: '施法', name: '特性挡掉', desc: '厚重岩石/铁甲闷响（35ms 限流）' },
  { id: 'white', group: '施法', name: '补色白光', desc: '纯净大三和弦水晶钟鸣配光束柔风' },
  { id: 'rainbow', group: '施法', name: '出彩虹', desc: '六音阶竖琴与钟琴华丽上行琶音' },
  { id: 'mult', group: '施法', name: '倍率数字弹跳', desc: '清脆宝石泛音上跳，随连续翻倍微升音高' },
  { id: 'rainbowSup', group: '施法', name: '“彩虹补”跳出', desc: '浑厚金钟齐鸣配璀璨高音泛音落地' },
  { id: 'roll', group: '施法', name: '总伤害往上滚', desc: '极轻的晶石计数滚动声（55ms 限流）' },
  { id: 'warning', group: '怪', name: '怪要攻击预警', desc: '低沉暗角号声配紧迫压迫感' },
  { id: 'hurt', group: '怪', name: '攻击打掉心', desc: '沉重撞击配琉璃心碎裂颤音' },
  { id: 'shieldBlock', group: '怪', name: '护盾挡住攻击', desc: '宽阔青铜大盾钟鸣共振配卸力气流' },
  { id: 'countdown1', group: '怪', name: '倒计时剩 1', desc: '低沉紧迫的双重钟摆心跳声' },
  { id: 'monsterDie', group: '怪', name: '怪倒下', desc: '深林巨物崩解低频滑落配雾气消散' },
  { id: 'bell', group: '怪', name: '敲钟', desc: '幽暗古铜巨钟长泛音' },
  { id: 'dark', group: '怪', name: '躲光变暗/灭灯', desc: '冷雾吹熄烛火的低沉吸气声' },
  { id: 'gemUp', group: '成长与奖励', name: '宝石升级', desc: '清亮三连晶石升阶琶音配暖金余韵' },
  { id: 'drop', group: '成长与奖励', name: '掉牌', desc: '战利品石板落入草丛配微光闪烁' },
  { id: 'pickup', group: '成长与奖励', name: '捡牌', desc: '手抚石牌配温暖五度泛音' },
  { id: 'seal', group: '成长与奖励', name: '封印', desc: '金线收拢旋转泛音配庄重古印落定' },
  { id: 'result', group: '成长与奖励', name: '结算/失败', desc: '沉稳余音和弦收束' },
  { id: 'page', group: '卡册', name: '卡册滚牌/翻动', desc: '石板碑廊滑轨与羊皮卷拂动声' },
  { id: 'cardOut', group: '卡册', name: '拿出牌细看', desc: '石板从碑廊浮出配暖光晶石泛音' },
  { id: 'cardIn', group: '卡册', name: '把牌放回', desc: '石板归位沉稳落槽声' },
];

// 限流冷却表（秒）：防止一回合上千发叠加成噪音墙
const COOLDOWNS = {
  hit: 0.028,
  crit: 0.045,
  block: 0.036,
  roll: 0.055,
  hover: 0.055,
  deal: 0.042,
  mult: 0.045,
};

// 五声音阶倍率，用于连续 hit / deal / mult 时自然错开音高
const PENTA = [1.0, 1.125, 1.25, 1.5, 1.667, 2.0];

export function createSfxEngine(voiceFn, getSfxBus, getAirBus) {
  const lastAt = {};
  let footSide = 0;
  let dealStep = 0;
  let multStep = 0;
  let hitStep = 0;

  function jitter(range = 0.04) {
    return 1 + (Math.random() * 2 - 1) * range;
  }

  function panJitter(spread = 0.28) {
    return (Math.random() * 2 - 1) * spread;
  }

  function bookSound(bus, id, o = {}) {
    const v = Math.min(2, Math.max(0.3, o.speed ?? 1));
    const p = panJitter(0.2);
    if (id === 'page') {
      // 石板碑廊滑轨 + 羊皮卷轻拂
      voiceFn(bus, 'noise', (1800 + 500 * v) * jitter(), 820, 0.16 / Math.sqrt(v), 0.16 * Math.min(1.25, v), 0.012, p);
      voiceFn(bus, 'triangle', 190 * jitter(), 128, 0.11, 0.08 * v, 0.006, p, 0, 520);
      return true;
    }
    if (id === 'rustle') {
      voiceFn(bus, 'noise', 2600 * jitter(0.1), 1700, 0.08, 0.045, 0.008, p);
      return true;
    }
    if (id === 'pageGrab') {
      voiceFn(bus, 'noise', 3400, 2200, 0.045, 0.06, 0.003, p);
      return true;
    }
    if (id === 'pageLand') {
      voiceFn(bus, 'sine', 142 * jitter(), 78, 0.11, 0.09, 0.005, p);
      voiceFn(bus, 'noise', 780, 240, 0.1, 0.08, 0.006, p);
      return true;
    }
    if (id === 'bookLift' || id === 'bookOpen') {
      voiceFn(bus, 'triangle', 110, 82, 0.24, 0.07, 0.03, -0.1, 0, 480);
      voiceFn(bus, 'noise', 1350, 620, 0.25, 0.09, 0.02, -0.1);
      return true;
    }
    if (id === 'coverLand' || id === 'bookClose') {
      voiceFn(bus, 'sine', 104, 48, 0.2, 0.16, 0.005, -0.1);
      voiceFn(bus, 'noise', 560, 170, 0.16, 0.14, 0.004, -0.1);
      return true;
    }
    if (id === 'cardOut') {
      voiceFn(bus, 'noise', 1100, 2900, 0.2, 0.08, 0.025, 0.08);
      voiceFn(bus, 'sine', 528 * jitter(0.02), 792, 0.28, 0.055, 0.03, 0.08, 0.04, 3200);
      return true;
    }
    if (id === 'cardIn') {
      voiceFn(bus, 'noise', 2600, 950, 0.16, 0.08, 0.015, -0.06);
      voiceFn(bus, 'triangle', 240, 132, 0.14, 0.09, 0.006, -0.06, 0.04, 680);
      return true;
    }
    return false;
  }

  function trigger(ac, id, o = {}) {
    const bus = getSfxBus();
    const air = getAirBus() || bus;
    if (!ac || !bus) return false;
    const now = ac.currentTime;

    // 限流检查
    const cd = COOLDOWNS[id];
    if (cd && lastAt[id] && now - lastAt[id] < cd) return false;
    if (now - (lastAt.deal || 0) > 0.6) dealStep = 0;
    if (now - (lastAt.mult || 0) > 1.2) multStep = 0;
    lastAt[id] = now;

    if (bookSound(bus, id, o)) return true;

    const k = jitter(0.045);
    const p = panJitter(0.24);

    switch (id) {
      case 'dry': {
        const fp = footSide++ % 2 ? 0.2 : -0.2;
        voiceFn(bus, 'noise', 2100 * k, 1150, 0.15, 0.28, 0.012, fp);
        voiceFn(bus, 'sine', 88 * k, 52, 0.13, 0.16, 0.012, fp, 0, 320);
        return true;
      }
      case 'wet': {
        const fp = footSide++ % 2 ? 0.2 : -0.2;
        voiceFn(bus, 'noise', 680 * k, 260, 0.17, 0.38, 0.012, fp);
        voiceFn(bus, 'sine', 124 * k, 50, 0.14, 0.17, 0.014, fp, 0, 360);
        voiceFn(bus, 'noise', 1850 * k, 620, 0.15, 0.18, 0.022, -fp, 0.05);
        return true;
      }
      case 'owl': {
        const op = o.pan ?? 0.25;
        voiceFn(air, 'sine', 338 * k, 286, 0.42, 0.18, 0.08, op, 0, 900);
        voiceFn(air, 'sine', 302 * k, 226, 0.74, 0.15, 0.14, op, 0.48, 820);
        return true;
      }
      case 'frog': {
        const fp = o.pan ?? -0.2;
        for (let i = 0; i < 3; i++) {
          voiceFn(air, 'triangle', (198 - i * 8) * k, 84, 0.14, 0.15, 0.02, fp, i * 0.11, 640);
        }
        return true;
      }
      case 'menu': {
        // 石片温润轻叩
        voiceFn(bus, 'triangle', 320 * k, 185, 0.085, 0.14, 0.004, 0, 0, 1100);
        voiceFn(bus, 'sine', 640 * k, 480, 0.065, 0.06, 0.003, 0, 0.008, 1800);
        return true;
      }
      case 'hover': {
        // 极轻的微光拂过
        voiceFn(bus, 'noise', 2800 * k, 1900, 0.045, 0.032, 0.006, p * 0.5);
        voiceFn(bus, 'sine', 780 * k, 880, 0.05, 0.018, 0.008, p * 0.5, 0, 1600);
        return true;
      }
      case 'play': {
        // 石板牌落入序列槽 + 宝石清鸣
        voiceFn(bus, 'triangle', 210 * k, 118, 0.11, 0.18, 0.004, p * 0.4, 0, 820);
        voiceFn(bus, 'noise', 1450 * k, 520, 0.08, 0.11, 0.004, p * 0.4);
        voiceFn(bus, 'sine', 587.3 * k, 880 * k, 0.18, 0.065, 0.008, p * 0.4, 0.02, 2800);
        return true;
      }
      case 'undo': {
        // 滑回手牌
        voiceFn(bus, 'noise', 2200 * k, 980, 0.11, 0.08, 0.008, p * 0.3);
        voiceFn(bus, 'triangle', 392 * k, 261.6 * k, 0.13, 0.11, 0.006, p * 0.3, 0, 1100);
        return true;
      }
      case 'deal': {
        // 补牌一张张飞入（音高随张数微升）
        const stepPitch = 1 + Math.min(10, dealStep++) * 0.035;
        voiceFn(bus, 'noise', 2600 * stepPitch * k, 1300, 0.085, 0.085, 0.007, 0.25);
        voiceFn(bus, 'sine', 440 * stepPitch * k, 520 * stepPitch, 0.075, 0.035, 0.006, 0.15, 0.01, 1800);
        return true;
      }
      case 'shuffle': {
        // 多层交错洗牌声
        for (let i = 0; i < 6; i++) {
          const d = i * 0.048;
          const sp = ((i % 2) - 0.5) * 0.5;
          voiceFn(bus, 'noise', (2100 + i * 180) * jitter(), 950, 0.075, 0.11, 0.005, sp, d);
          voiceFn(bus, 'triangle', (180 + i * 22) * jitter(), 110, 0.06, 0.06, 0.004, sp, d + 0.01, 760);
        }
        return true;
      }
      case 'overflow': {
        // 手牌满 12 张滑落弃牌槽
        voiceFn(bus, 'triangle', 260 * k, 96, 0.24, 0.16, 0.01, -0.25, 0, 680);
        voiceFn(bus, 'noise', 1200, 340, 0.22, 0.12, 0.012, -0.25, 0.03);
        return true;
      }
      case 'instant': {
        // 立即释放（青铜共鸣 + 暖光五度和弦）
        voiceFn(bus, 'triangle', 392 * k, 392, 0.32, 0.13, 0.008, 0, 0, 1800);
        voiceFn(bus, 'sine', 587.3 * k, 587.3, 0.38, 0.11, 0.015, 0.18, 0.04, 2800);
        voiceFn(bus, 'sine', 784 * k, 880, 0.42, 0.08, 0.02, -0.18, 0.08, 3400);
        return true;
      }
      case 'cast': {
        // 法阵启动低频共鸣 + 水晶泛音上扬
        voiceFn(bus, 'sine', 73.4 * k, 110, 0.48, 0.18, 0.04, 0, 0, 420);
        voiceFn(bus, 'triangle', 220 * k, 440, 0.42, 0.11, 0.05, -0.15, 0.03, 1600);
        voiceFn(bus, 'sine', 587.3 * k, 880, 0.45, 0.085, 0.06, 0.15, 0.08, 3200);
        return true;
      }
      case 'hit': {
        // 晶雨单发打中：五声音阶微调 + 扎实低频轻叩
        const note = PENTA[hitStep++ % PENTA.length] * k;
        voiceFn(bus, 'triangle', 165 * k, 68, 0.095, 0.14, 0.004, p, 0, 720);
        voiceFn(bus, 'sine', 523.25 * note, 392 * note, 0.11, 0.055, 0.003, p, 0.005, 2600);
        return true;
      }
      case 'crit': {
        // 暴击：重锤低频 + 晶石爆裂双泛音
        voiceFn(bus, 'sine', 135 * k, 46, 0.22, 0.22, 0.004, p, 0, 520);
        voiceFn(bus, 'triangle', 659.25 * k, 329.6, 0.2, 0.13, 0.004, p, 0.01, 2400);
        voiceFn(bus, 'sine', 1318.5 * k, 987.8, 0.24, 0.08, 0.004, -p, 0.02, 4200);
        voiceFn(bus, 'noise', 2400 * k, 580, 0.14, 0.12, 0.004, p);
        return true;
      }
      case 'block': {
        // 特性挡掉：厚岩石闷响
        voiceFn(bus, 'triangle', 140 * k, 62, 0.14, 0.16, 0.004, p, 0, 420);
        voiceFn(bus, 'noise', 620 * k, 220, 0.11, 0.12, 0.005, p);
        return true;
      }
      case 'white': {
        // 补色白光：纯净大三和弦水晶钟鸣 + 光束柔风
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          voiceFn(bus, 'sine', f * k, f * 0.998, 0.46, 0.075, 0.01, (i - 1.5) * 0.2, i * 0.032, 3800);
        });
        voiceFn(bus, 'noise', 1800, 900, 0.36, 0.07, 0.04, 0);
        return true;
      }
      case 'rainbow': {
        // 出彩虹：六音阶竖琴与钟琴华丽琶音
        const scale = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1318.5];
        scale.forEach((f, i) => {
          const sp = ((i % 2) - 0.5) * 0.55;
          voiceFn(bus, 'sine', f, f * 1.001, 0.62, 0.075, 0.008, sp, i * 0.042, 4500);
          voiceFn(bus, 'triangle', f * 0.5, f * 0.5, 0.45, 0.05, 0.012, -sp, i * 0.042, 2200);
        });
        return true;
      }
      case 'mult': {
        // 倍率弹跳：随翻倍阶梯微升的宝石音
        const mp = PENTA[Math.min(PENTA.length - 1, multStep++ % PENTA.length)];
        voiceFn(bus, 'sine', 440 * mp * k, 660 * mp, 0.14, 0.085, 0.005, -0.35, 0, 3000);
        voiceFn(bus, 'triangle', 220 * mp, 330 * mp, 0.12, 0.06, 0.005, -0.35, 0, 1600);
        return true;
      }
      case 'rainbowSup': {
        // “彩虹补 xxx”大数字落地：浑厚金钟齐鸣 + 璀璨泛音
        voiceFn(bus, 'sine', 110, 55, 0.45, 0.22, 0.006, 0, 0, 480);
        voiceFn(bus, 'triangle', 440, 440, 0.52, 0.14, 0.008, -0.2, 0.02, 2600);
        voiceFn(bus, 'sine', 880, 880, 0.58, 0.11, 0.01, 0.2, 0.04, 4200);
        voiceFn(bus, 'sine', 1318.5, 1318.5, 0.62, 0.085, 0.012, 0, 0.06, 4800);
        return true;
      }
      case 'roll': {
        // 总伤害往上滚：极轻的晶石计数声
        voiceFn(bus, 'sine', 680 * jitter(0.06), 760, 0.038, 0.026, 0.004, 0, 0, 2200);
        return true;
      }
      case 'warning': {
        // 怪要攻击预警：低沉暗角号声
        voiceFn(bus, 'sawtooth', 98 * k, 65.4, 0.46, 0.13, 0.06, 0, 0, 340);
        voiceFn(bus, 'triangle', 196 * k, 130.8, 0.42, 0.11, 0.05, 0, 0.02, 520);
        return true;
      }
      case 'hurt': {
        // 攻击打掉心：沉重撞击 + 琉璃碎音
        voiceFn(bus, 'sine', 96 * k, 36, 0.38, 0.26, 0.005, 0, 0, 380);
        voiceFn(bus, 'noise', 720, 180, 0.3, 0.2, 0.006, 0);
        voiceFn(bus, 'sine', 980 * k, 420, 0.22, 0.08, 0.005, -0.3, 0.04, 2600);
        return true;
      }
      case 'shieldBlock': {
        // 护盾挡住：宽阔青铜大盾钟鸣共振
        voiceFn(bus, 'triangle', 220 * k, 196, 0.38, 0.18, 0.005, -0.2, 0, 1600);
        voiceFn(bus, 'sine', 440 * k, 432, 0.46, 0.13, 0.006, 0.2, 0.01, 2800);
        voiceFn(bus, 'sine', 659.25 * k, 650, 0.42, 0.09, 0.008, 0, 0.025, 3400);
        voiceFn(bus, 'noise', 1400, 420, 0.18, 0.11, 0.006, 0);
        return true;
      }
      case 'countdown1': {
        // 倒计时剩 1：低沉双重钟摆心跳
        voiceFn(bus, 'sine', 82 * k, 48, 0.16, 0.14, 0.008, 0, 0, 260);
        voiceFn(bus, 'sine', 76 * k, 44, 0.2, 0.11, 0.01, 0, 0.18, 240);
        return true;
      }
      case 'monsterDie': {
        // 怪倒下：深林巨物崩解低频滑落 + 雾气消散
        voiceFn(bus, 'sawtooth', 110 * k, 38, 0.62, 0.16, 0.03, 0, 0, 320);
        voiceFn(bus, 'noise', 920, 160, 0.58, 0.15, 0.04, 0, 0.03);
        return true;
      }
      case 'bell': {
        // 敲钟：古铜巨钟长泛音
        voiceFn(bus, 'sine', 293.66 * k, 290, 0.78, 0.16, 0.006, 0.12, 0, 2400);
        voiceFn(bus, 'triangle', 440 * k, 436, 0.62, 0.1, 0.008, -0.12, 0.015, 1800);
        voiceFn(bus, 'sine', 810 * k, 800, 0.45, 0.055, 0.004, 0, 0.005, 3600);
        return true;
      }
      case 'dark': {
        // 躲光变暗 / 灭灯：冷雾吹熄烛火
        voiceFn(bus, 'noise', 950 * k, 240, 0.34, 0.13, 0.03, 0);
        voiceFn(bus, 'sine', 240 * k, 78, 0.32, 0.11, 0.02, 0, 0, 480);
        return true;
      }
      case 'gemUp': {
        // 宝石升级：三连晶石升阶琶音
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          voiceFn(bus, 'sine', f, f * 1.002, 0.38, 0.1, 0.006, -0.25 + i * 0.12, i * 0.065, 4000);
          voiceFn(bus, 'triangle', f * 0.5, f * 0.5, 0.3, 0.065, 0.008, -0.25, i * 0.065, 2000);
        });
        return true;
      }
      case 'drop': {
        // 掉牌：石板落草丛 + 微光闪烁
        voiceFn(bus, 'triangle', 340 * k, 145, 0.24, 0.14, 0.008, 0, 0, 900);
        voiceFn(bus, 'sine', 880 * k, 659.25, 0.42, 0.075, 0.02, 0.15, 0.08, 3200);
        return true;
      }
      case 'pickup': {
        // 捡牌：手抚石牌 + 温暖五度泛音
        voiceFn(bus, 'noise', 1800, 900, 0.12, 0.08, 0.01, 0);
        voiceFn(bus, 'sine', 440 * k, 659.25, 0.34, 0.11, 0.015, -0.1, 0.02, 2800);
        voiceFn(bus, 'sine', 659.25 * k, 880, 0.38, 0.085, 0.02, 0.1, 0.09, 3400);
        return true;
      }
      case 'seal': {
        // 封印：金线收拢旋转泛音 + 古印落定
        [293.66, 440, 587.33, 880].forEach((f, i) => {
          voiceFn(bus, 'sine', f * 0.96, f, 0.45, 0.09, 0.04, (i - 1.5) * 0.2, i * 0.08, 3200);
        });
        voiceFn(bus, 'sine', 110, 52, 0.36, 0.2, 0.008, 0, 0.34, 380);
        return true;
      }
      case 'result': {
        // 结算 / 失败：沉稳余音和弦收束
        voiceFn(bus, 'triangle', 220 * k, 146.83, 0.75, 0.14, 0.04, -0.18, 0, 820);
        voiceFn(bus, 'sine', 329.63 * k, 220, 0.82, 0.11, 0.06, 0.18, 0.06, 1400);
        return true;
      }
      default:
        return false;
    }
  }

  return { trigger };
}
