(function () {
  'use strict';
  const BoardMotion = window.BoardMotion || { watch() {}, aiDelay: () => 360, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  const D = window.WondersData;
  let E = window.WondersEngine;
  const root = document.getElementById('wonders');
  const overlay = document.getElementById('wonders-overlay');
  const SAVE_KEY = 'boardgame-box-seven-wonders-v1';
  const RES = { W: '木', S: '石', C: '土', O: '矿', G: '玻', P: '纸', L: '布' };
  const ICON = { W: 'wood', S: 'stone', C: 'clay', O: 'ore', G: 'glass', P: 'paper', L: 'linen',
    '$': 'coin', points: 'laurel', shields: 'shield', compass: 'compass', gear: 'gear', tablet: 'tablet', stage: 'pyramid' };
  const BY_KEY = new Map(D.allCards.map(card => [card.key, card]));
  const TYPE_HELP = {
    brown: '棕色牌：原材料建筑，提供木材、石材、黏土或矿石。',
    gray: '灰色牌：工艺品建筑，提供玻璃、纸莎草或织物。',
    blue: '蓝色牌：民用建筑，提供胜利分数。',
    red: '红色牌：军事建筑，提供盾牌；每时代末与左右邻座比较军力。',
    green: '绿色牌：科技建筑，提供罗盘、齿轮或泥板，用于科技计分。',
    yellow: '黄色牌：商业建筑，提供金币、贸易优惠或按条件计分。',
    purple: '紫色牌：行会建筑，通常按自己或邻座的建筑、奇迹数量计分。'
  };
  const COUNT_HELP = {
    brownAll: '自己与左右邻座的棕色牌', grayAll: '自己与左右邻座的灰色牌',
    brownSelf: '自己的棕色牌', graySelf: '自己的灰色牌', redSelf: '自己的红色牌',
    yellowSelf: '自己的黄色牌', stagesSelf: '自己的已建奇迹阶段',
    stagesAll: '自己与左右邻座的已建奇迹阶段', allStages: '自己是否建完全部奇迹阶段',
    brownGrayPurpleSelf: '自己的棕色、灰色与紫色牌',
    brownNeighbors: '左右邻座的棕色牌', grayNeighbors: '左右邻座的灰色牌',
    yellowNeighbors: '左右邻座的黄色牌', greenNeighbors: '左右邻座的绿色牌',
    redNeighbors: '左右邻座的红色牌', blueNeighbors: '左右邻座的蓝色牌'
  };
  const AI_NAMES = ['阿塔罗斯', '克娄巴特拉', '尼布甲尼撒', '菲迪亚斯', '阿基米德', '托勒密', '哈德良'];
  const setupSeats = Array.from({ length: 7 }, (_, index) => ({
    name: index === 0 ? '玩家' : AI_NAMES[index - 1] + '（简单）',
    ai: index !== 0, side: 'a', customName: false
  }));
  let setupCount = 3;
  let state = null;
  let savedState = null;
  let screen = 'setup';
  let showRules = false;
  let showSymbols = false;
  let handoff = false;
  let lastHuman = 0;
  let timer = null;
  let toastTimer = null;
  let startTime = Date.now();
  let aiError = '';
  const tooltip = document.createElement('div');
  tooltip.id = 'w-symbol-tooltip';
  tooltip.className = 'w-symbol-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let tooltipAnchor = null;
  let tooltipPinned = false;
  E = BoardMotion.watch({ game: 'wonders', engine: E, state: () => state, methods: ['play', 'playBonus'] }) || E;
  E = Room.wrap(E, 'wonders');
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch])); }
  function defaultName(index, ai) { return ai ? AI_NAMES[index ? index - 1 : 6] + '（简单）' :
    index ? '玩家 ' + (index + 1) : '玩家'; }
  function save() {
    if (Room.active) return;
    try {
      E.validate(state);
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      localStorage.setItem('boardgame-box-last-played', 'wonders');
      savedState = JSON.parse(JSON.stringify(state));
    } catch (error) { console.error('七大奇迹存档失败', error); message('存档失败：' + error.message); }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const candidate = JSON.parse(raw);
      E.validate(candidate);
      savedState = candidate;
    } catch (error) { console.warn('七大奇迹旧存档无法读取', error); }
  }
  function message(value) {
    let toast = document.querySelector('.w-toast');
    if (!toast) { toast = document.createElement('div'); toast.className = 'w-toast'; document.body.appendChild(toast); }
    toast.textContent = value;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3400);
  }
  function helpAttr(value) {
    return ' data-w-tip="' + esc(value) + '" aria-label="' + esc(value) + '" tabindex="0"';
  }
  function costText(cost) {
    if (!cost) return '免费';
    const counts = {};
    for (const symbol of cost) counts[symbol] = (counts[symbol] || 0) + 1;
    return Object.entries(counts).map(([symbol, count]) =>
      symbol === '$' ? count + ' 金币' : D.R[symbol] + ' ×' + count).join('、');
  }
  function resourceList(cost) {
    if (!cost) return '<span class="w-free">免费</span>';
    return [...cost].map(symbol => symbol === '$' ?
      '<span class="w-coin"' + helpAttr('金币费用：每个金币符号需要支付 1 枚金币给银行。') + '>' + icon('$') + '</span>' :
      '<span class="w-resource ' + symbol + '"' + helpAttr(D.R[symbol] +
        '需求：每个符号需要 1 份。自己的产能可每回合重复使用；不足时可向左右邻座购买。') +
      '>' + icon(symbol) + '</span>').join('');
  }
  function icon(symbol) {
    return '<img class="w-icon" src="assets/wonders/icons/' + ICON[symbol] + '.png" alt="' +
      esc(D.R[symbol] || ({ '$': '金币', points: '胜利分', shields: '盾牌', compass: '罗盘', gear: '齿轮', tablet: '泥板', stage: '奇迹阶段' }[symbol])) + '">';
  }
  function effectSymbols(effect) {
    const parts = [];
    const badge = (content, text) => '<span class="w-effect-badge"' + helpAttr(text) + '>' + content + '</span>';
    if (effect.produce) parts.push(badge([...effect.produce].map(icon).join(''), '每回合生产：' + [...effect.produce].map(s => D.R[s]).join('、') + '。资源不会消耗。'));
    if (effect.choose) parts.push(badge([...effect.choose].map(icon).join('<i>/</i>'), '每回合从这些资源中任选一份；不能同时生产所有资源。'));
    if (effect.points) parts.push(badge(icon('points') + '<b>' + effect.points + '</b>', '胜利分：' + effect.points + ' 分。'));
    if (effect.shields) parts.push(badge(icon('shields') + '<b>' + effect.shields + '</b>', '军力：' + effect.shields + ' 面盾牌。时代末与左右邻座分别比较。'));
    if (effect.science) parts.push(badge(effect.science === 'wild' ? ['compass', 'gear', 'tablet'].map(icon).join('<i>/</i>') : icon(effect.science), '科技：' + effectText({ science: effect.science }) + '。同类数量平方计分；每套三种加 7 分。'));
    if (effect.coins) parts.push(badge(icon('$') + '<b>+' + effect.coins + '</b>', '立即获得 ' + effect.coins + ' 枚金币。'));
    for (const field of ['coinsPer', 'pointsPer', 'guild']) if (effect[field]) {
      const name = effect[field];
      const type = Object.keys(D.TYPES).find(key => name.startsWith(key));
      const counter = name.includes('Stages') || name.includes('stages') ? icon('stage') : type ?
        '<i class="w-mini-card" style="background:' + D.COLORS[type] + '"></i>' : '<i class="w-mini-card multicolor"></i>';
      const rate = effect[field === 'guild' ? 'guildRate' : field === 'coinsPer' ? 'coinsRate' : 'pointsRate'] || 1;
      parts.push(badge(counter + (name.includes('Neighbors') ? ' ← → ' : name.endsWith('All') ? ' ← · → ' : '') + '×' + rate + icon(field === 'coinsPer' ? '$' : 'points'), effectText({ [field]: name, [field === 'guild' ? 'guildRate' : field === 'coinsPer' ? 'coinsRate' : 'pointsRate']: rate })));
    }
    if (effect.trade) parts.push(badge(({ leftRaw: '←', rightRaw: '→', rawBoth: '← →', manufactured: '← →' }[effect.trade]) + icon('$') + '1', effectText({ trade: effect.trade })));
    if (effect.freeAge) parts.push(badge('<i class="w-mini-card"></i><b>0</b> ×1', '每时代可以免费建造一张建筑，不消耗资源或金币。'));
    if (effect.lastCard) parts.push(badge('<i class="w-mini-card"></i><b>第7张</b>', '每时代可使用手牌最后剩下的第七张牌。'));
    if (effect.discardBuild) parts.push(badge('<i class="w-mini-card"></i><b>↺ 0</b>', '从弃牌堆中免费建造一张建筑。'));
    return '<div class="w-effects">' + parts.join('') + '</div>';
  }
  function chainInfo(item) {
    const previous = E.chainKeys(item).map(key => BY_KEY.get(key));
    const next = [...BY_KEY.values()].filter(card => E.chainKeys(card).includes(item.key));
    const isBuilt = card => state.players[state.current].built.some(id => E.CARD.get(id).key === card.key);
    const unlocked = previous.some(isBuilt);
    if (!previous.length && !next.length) return '<div class="w-chain w-no-chain">无连锁关系</div>';
    return '<div class="w-chain' + (unlocked ? ' unlocked' : '') + '">' +
      previous.map(card => '<div' + helpAttr('已建造《' + card.name + '》时，《' + item.name + '》可以免费建造；多个前置满足任意一个即可。也可选择普通资源建造。') + '><span>前置建筑</span><b>' + esc(card.name) + '</b><em>' + (isBuilt(card) ? '已建 · 连锁免费' : '未建') + '</em></div>').join('') +
      (next.length ? '<div' + helpAttr('建成《' + item.name + '》后，抽到以下建筑时可免费连锁建造：' + next.map(card => card.name).join('、')) + '><span>解锁建筑</span><b>' + next.map(card => esc(card.name) + '（时代' + card.age + '）').join('、') + '</b></div>' : '') + '</div>';
  }
  function effectText(effect) {
    const parts = [];
    if (effect.points) parts.push(effect.points + ' 分');
    if (effect.produce) parts.push('生产 ' + [...effect.produce].map(symbol => D.R[symbol]).join('、'));
    if (effect.choose) parts.push('每回合任选 ' + [...effect.choose].map(symbol => D.R[symbol]).join(' / '));
    if (effect.shields) parts.push(effect.shields + ' 盾牌');
    if (effect.science) parts.push(effect.science === 'wild' ? '任意科技符号' :
      { compass: '罗盘', gear: '齿轮', tablet: '泥板' }[effect.science]);
    if (effect.coins) parts.push('立即获得 ' + effect.coins + ' 金币');
    if (effect.coinsPer) parts.push('按' + COUNT_HELP[effect.coinsPer] + '每个获得 ' + (effect.coinsRate || 1) + ' 金币');
    if (effect.pointsPer) parts.push('按' + COUNT_HELP[effect.pointsPer] + '每个获得 ' + (effect.pointsRate || 1) + ' 分');
    if (effect.guild) parts.push(effect.guild === 'allStages' ? '建完全部奇迹阶段得 ' +
      (effect.guildRate || 1) + ' 分' : '按' + COUNT_HELP[effect.guild] + '每个获得 ' + (effect.guildRate || 1) + ' 分');
    if (effect.trade) parts.push({ leftRaw: '向左邻购买原材料每份 1 金币',
      rightRaw: '向右邻购买原材料每份 1 金币', rawBoth: '向两侧购买原材料每份 1 金币',
      manufactured: '向两侧购买工艺品每份 1 金币' }[effect.trade]);
    if (effect.freeAge) parts.push('每时代一次免费建造');
    if (effect.lastCard) parts.push('每时代可使用最后一张牌');
    if (effect.discardBuild) parts.push('从弃牌堆免费建造一张');
    return parts.join(' · ') || '特殊效果';
  }
  function paymentText(payment) {
    if (!payment || !payment.total) return '免费';
    const details = [];
    if (payment.bank) details.push('银行 ' + payment.bank);
    if (payment.left) details.push('左邻 ' + payment.left);
    if (payment.right) details.push('右邻 ' + payment.right);
    return payment.total + ' 金币 · ' + details.join(' / ');
  }
  function syncSetup() {
    for (let index = 0; index < setupCount; index++) {
      const seat = setupSeats[index];
      const name = root.querySelector('[data-seat-name="' + index + '"]');
      const ai = root.querySelector('[data-seat-ai="' + index + '"]');
      const side = root.querySelector('[data-seat-side="' + index + '"]');
      if (name && name.value !== seat.name) { seat.name = name.value; seat.customName = true; }
      if (ai && seat.ai !== (ai.value === 'ai')) {
        seat.ai = ai.value === 'ai';
        if (!seat.customName) {
          seat.name = defaultName(index, seat.ai);
          if (name) name.value = seat.name;
        }
      }
      if (side) seat.side = side.value;
    }
  }
  function renderSetup() {
    root.innerHTML = '<div class="w-setup"><header class="w-setup-top"><a href="index.html">← 桌游中心</a><span>桌游盒子 · 文明策略</span></header>' +
      '<div class="w-setup-layout"><section class="w-setup-hero"><div class="w-kicker">古代世界，等你书写</div>' +
      '<h1>七大<br><em>奇迹</em></h1><p>从一张建筑牌开始，发展文明、开拓贸易、建造奇迹。在三个时代里，让你的城市名留青史。</p>' +
      '<div class="w-hero-facts"><span>✦ 三个时代</span><span>✦ 七座奇迹</span><span>✦ 3–7 位玩家</span></div></section>' +
      '<section class="w-setup-panel"><div class="w-eyebrow">新的文明</div><h2>创建对局</h2>' +
      '<div class="w-count"><label for="w-count">参与人数</label><select id="w-count" data-count>' +
      [3, 4, 5, 6, 7].map(n => '<option value="' + n + '"' + (n === setupCount ? ' selected' : '') + '>' + n + ' 人</option>').join('') + '</select></div>' +
      '<div class="w-seat-heading"><span>席位</span><span>名称</span><span>身份</span><span>奇迹面</span></div><div class="w-seat-list">' +
      setupSeats.slice(0, setupCount).map((seat, index) => '<div class="w-seat"><strong>' + (index + 1) + 'P</strong>' +
        '<input data-seat-name="' + index + '" aria-label="玩家 ' + (index + 1) + ' 名称" maxlength="20" value="' + esc(seat.name) + '">' +
        '<select data-seat-ai="' + index + '" aria-label="玩家 ' + (index + 1) + ' 类型"><option value="human"' + (!seat.ai ? ' selected' : '') + '>真人</option><option value="ai"' + (seat.ai ? ' selected' : '') + '>电脑 · 简单</option></select>' +
        '<select data-seat-side="' + index + '" aria-label="玩家 ' + (index + 1) + ' 奇迹面"><option value="a"' + (seat.side === 'a' ? ' selected' : '') + '>白昼 A</option><option value="b"' + (seat.side === 'b' ? ' selected' : '') + '>夜晚 B</option></select></div>').join('') +
      '</div><div class="w-setup-actions"><button class="w-primary" data-action="start">开启文明 →</button>' +
      (savedState && savedState.phase !== 'gameover' ? '<button class="w-secondary" data-action="continue">继续上次对局</button>' : '') +
      '</div><p class="w-small">奇迹随机分配且不会重复。可以混合真人与电脑；选牌会自动保存在本机。</p></section></div></div>';
    overlay.innerHTML = '';
  }
  function playerTile(player, index) {
    const active = (Room.active && state.phase === 'draft' ? !state.picks[index] : (state.networkCurrent ?? state.current) === index) && ['draft', 'bonus'].includes(state.phase);
    const w = E.WONDER.get(player.wonder);
    const total = E.score(state, index).total;
    const position = index === state.current ? '本位' : index === E.neighbors(state, state.current).left ? '左邻' :
      index === E.neighbors(state, state.current).right ? '右邻' : '';
    return '<article class="w-player' + (active ? ' active' : '') + '" data-motion-player="' + index + '" data-player="' + index + '"><div class="w-player-top">' +
      '<span class="w-player-index">' + (index + 1) + 'P</span><span class="w-player-tag">' + (position || (player.ai ? '电脑' : '真人')) + '</span></div>' +
      '<h3>' + esc(player.name) + '</h3><p>' + esc(w.city) + ' · ' + (player.side === 'a' ? '白昼' : '夜晚') + '</p>' +
      '<div class="w-player-numbers"><span' + helpAttr('◈ 金币：可支付建筑费用和购买邻座资源；游戏结束时每 3 枚剩余金币得 1 分。') +
      '><b>' + icon('$') + player.coins + '</b> 金币</span><span' + helpAttr('盾牌：每时代结束时分别与左右邻座比较。胜利在第一、二、三时代分别得 1、3、5 分；失败扣 1 分。') +
      '><b>' + icon('shields') + E.shields(player) + '</b> 军力</span><span' + helpAttr('胜利分：当前已获得的分数估算；科技、金币及已建建筑会计入。') +
      '><b>' + icon('points') + total + '</b> 分</span></div>' +
      '<div class="w-player-resources">' + E.production(player).map(slot => {
        const names = [...slot.options].map(symbol => D.R[symbol]);
        return '<span' + helpAttr(names.length > 1 ? '可选产能：每回合从' + names.join('、') +
          '中任选 1 份；资源不会被消耗。' : names[0] + '产能：每回合提供 1 份；资源不会被消耗。') +
          '>' + [...slot.options].map(icon).join('/') + '</span>';
      }).join('') + '</div>' +
      '<div class="w-player-bottom"' + helpAttr('建筑是已建造的牌；奇迹数字表示已完成阶段 / 全部阶段。奇迹阶段按顺序建造。') +
      '>建筑 ' + player.built.length + ' · 奇迹 ' + player.stages.length + '/' + E.stages(player).length + '</div></article>';
  }
  function actionButton(cardId, mode, label, action, reason) {
    const unavailable = !action;
    return '<button class="w-action ' + mode + (unavailable ? ' unavailable' : '') + '" data-card="' + cardId +
      '" data-mode="' + mode + '"' + (unavailable ? ' aria-disabled="true" data-reason="' + esc(reason) + '" title="' + esc(reason) + '"' :
        ' title="' + esc(paymentText(action.payment)) + '"') + '>' + label + '</button>';
  }
  function cardTile(cardId, legal) {
    const item = E.CARD.get(cardId);
    const can = mode => legal.find(action => action.cardId === cardId && action.mode === mode);
    const alreadyBuilt = state.players[state.current].built.some(id => E.CARD.get(id).key === item.key);
    const buildReason = alreadyBuilt ? '同名建筑只能建造一次。' : '资源或金币不足；也可建造奇迹或出售此牌。';
    const cardHelp = '《' + item.name + '》：' + TYPE_HELP[item.type] + ' 费用：' + costText(item.cost) +
      '；效果：' + effectText(item.effect) + '。本局以图片下方的中文费用和效果为准。';
    return '<article data-motion-key="card:' + cardId + '" class="w-card ' + item.type + '" style="--card-color:' + D.COLORS[item.type] + '"><div class="w-card-art"' +
      helpAttr(cardHelp) + '><img src="assets/wonders/cards/' + esc(item.key) + '.jpg" alt="" decoding="async"><small>时代 ' + item.age + '</small></div>' +
      '<div class="w-card-content"><div class="w-card-type"' + helpAttr(TYPE_HELP[item.type]) + '>' + D.TYPES[item.type] + '</div><h3>' + esc(item.name) + '</h3>' +
      '<div class="w-card-cost">' + resourceList(item.cost) + '</div>' + effectSymbols(item.effect) + '<p>' + esc(effectText(item.effect)) + '</p>' +
      chainInfo(item) +
      '<div class="w-card-actions">' + actionButton(cardId, 'build', can('build')?.chained ? '连锁免费建造' : '建造' + (can('build') ? ' · ' + paymentText(can('build').payment) : ''), can('build'), buildReason) +
      (can('build')?.chained ? actionButton(cardId, 'paidBuild', '按资源建造' + (can('paidBuild') ? ' · ' + (can('paidBuild').payment.total ? paymentText(can('paidBuild').payment) : '自有产能') : ''), can('paidBuild'), '普通建造所需资源或金币不足；仍可选择连锁免费建造。') : '') +
      (can('freeBuild') ? actionButton(cardId, 'freeBuild', '本时代免费建造', can('freeBuild')) : '') +
      actionButton(cardId, 'stage', '建造奇迹', can('stage'), E.stages(state.players[state.current]).length === state.players[state.current].stages.length ?
        '这座奇迹已经建造完成。' : '下一阶段所需资源或金币不足。') +
      actionButton(cardId, 'sell', '出售 +3 金币', can('sell')) + '</div></div></article>';
  }
  function reclaimTile(cardId) {
    const item = E.CARD.get(cardId);
    const cardHelp = '《' + item.name + '》：' + TYPE_HELP[item.type] + ' 效果：' + effectText(item.effect) +
      '。当前可从弃牌堆免费建造；本局以图片下方的中文效果为准。';
    return '<article data-motion-key="card:' + cardId + '" class="w-card ' + item.type + '" style="--card-color:' + D.COLORS[item.type] + '"><div class="w-card-art"' +
      helpAttr(cardHelp) + '><img src="assets/wonders/cards/' + esc(item.key) + '.jpg" alt="" decoding="async"><small>时代 ' + item.age + '</small></div>' +
      '<div class="w-card-content"><div class="w-card-type"' + helpAttr(TYPE_HELP[item.type]) + '>' + D.TYPES[item.type] + '</div><h3>' + esc(item.name) + '</h3>' +
      '<div class="w-card-cost">' + resourceList(item.cost) + '</div>' + effectSymbols(item.effect) + '<p>' + esc(effectText(item.effect)) + '</p>' + chainInfo(item) +
      '<div class="w-card-actions"><button class="w-action freeBuild" data-bonus-card="' + cardId +
      '">从弃牌堆免费建造</button></div></div></article>';
  }
  function wonderPanel(player) {
    const w = E.WONDER.get(player.wonder);
    return '<section class="w-wonder-panel"><div class="w-wonder-head"><div><span class="w-eyebrow">你的奇迹</span><h2>' +
      esc(w.name) + '</h2><p>' + (player.side === 'a' ? '白昼 A 面' : '夜晚 B 面') + ' · 初始生产 ' + D.R[w.resource] +
      '</p></div><div class="w-wonder-seal"' + helpAttr(player.side === 'a' ? '☼ 白昼 A 面：这座奇迹的 A 面阶段。' : '☾ 夜晚 B 面：这座奇迹的 B 面阶段。') +
      '>' + (player.side === 'a' ? '☼' : '☾') + '</div></div>' +
      '<div class="w-wonder-art"' + helpAttr('《' + w.name + '》' + (player.side === 'a' ? '白昼 A 面' : '夜晚 B 面') +
      '。起始资源：' + D.R[w.resource] + '。奇迹阶段需按顺序建造；本局费用与效果以下方中文说明为准。') +
      '><img src="assets/wonders/boards/' + esc(w.id) + '-' + player.side + '.jpg" alt="' + esc(w.name) + '奇迹版图" decoding="async"></div><div class="w-stages">' +
      E.stages(player).map((stage, index) => '<div class="w-stage' + (index < player.stages.length ? ' done' : index === player.stages.length ? ' next' : '') + '"><small>阶段 ' +
      (index + 1) + '</small>' + effectSymbols(stage.effect) + '<strong' + helpAttr('第 ' + (index + 1) + ' 阶段：' + effectText(stage.effect) +
        '。费用：' + costText(stage.cost) + '。需要按顺序建造。') + '>' + effectText(stage.effect) + '</strong><span>' + resourceList(stage.cost) +
      '</span></div>').join('') + '</div></section>';
  }
  function scoreTable() {
    const categories = { military: '军事', treasury: '金币', wonder: '奇迹', civilian: '民用',
      science: '科技', commerce: '商业', guild: '行会' };
    const scores = state.players.map((player, index) => ({ player, index, score: E.score(state, index) }))
      .sort((a, b) => b.score.total - a.score.total || b.player.coins - a.player.coins);
    return '<table class="w-scores"><thead><tr><th>文明</th>' + Object.values(categories).map(name => '<th>' + name + '</th>').join('') +
      '<th>总分</th></tr></thead><tbody>' + scores.map(entry => '<tr' + (state.winners.includes(entry.index) ? ' class="winner"' : '') +
      '><td><strong>' + esc(entry.player.name) + '</strong><small>' + esc(E.WONDER.get(entry.player.wonder).city) + '</small></td>' +
      Object.keys(categories).map(key => '<td>' + entry.score[key] + '</td>').join('') + '<td><b>' + entry.score.total +
      '</b></td></tr>').join('') + '</tbody></table>';
  }
  function renderGame() {
    const current = state.players[state.current];
    const ageName = ['', '远古的曙光', '文明的繁盛', '不朽的荣光'][state.age];
    const bonus = state.phase === 'bonus' ? state.bonusQueue[0] : null;
    const legal = (state.phase === 'draft' || state.phase === 'bonus') && !current.ai && !handoff && (!Room.active || Room.canAct) ?
      (bonus ? E.bonusActions(state) : E.actions(state, state.current)) : [];
    const hand = bonus ? [...new Set(legal.filter(action => action.cardId).map(action => action.cardId))] :
      state.hands[state.current];
    root.innerHTML = '<div class="w-game"><header class="w-game-top"><a href="index.html">← 桌游中心</a><div class="w-game-brand">七大奇迹 <span>文明与奇迹</span></div><div class="w-top-actions"><button data-action="symbols">符号说明</button><button data-action="rules">规则</button><button data-action="save">保存</button><button data-action="menu">新对局</button></div></header>' +
      '<div class="w-game-body"><section class="w-age-banner"><div><span class="w-eyebrow">时代 ' +
      ['I', 'II', 'III'][state.age - 1] + ' · 第 ' + state.round + '/6 轮</span><h1>第 ' +
      ['一', '二', '三'][state.age - 1] + ' 时代 <em>' + ageName + '</em></h1></div>' +
      '<p>每轮从手牌中选一张：建造建筑、建造奇迹，或出售换取 3 金币。</p></section>' +
      '<section class="w-players" aria-label="玩家文明">' + state.players.map(playerTile).join('') + '</section>' +
      (state.phase === 'gameover' ? '<section class="w-results"><div class="w-eyebrow">文明终章</div><h2>' +
        state.winners.map(index => esc(state.players[index].name)).join('、') + ' 获胜</h2><p>三时代已经结束，按总分排名；同分时比较剩余金币。</p>' +
        scoreTable() + '<button class="w-primary" data-action="menu">再开一局</button></section>' :
        '<div class="w-game-grid"><main class="w-draft"><div class="w-section-title"><div><span class="w-eyebrow">本轮选牌</span><h2>' +
        (current.ai ? esc(current.name) + ' 正在选牌' : bonus ? esc(current.name) + ' 的特殊行动' : esc(current.name) + ' 的手牌') + '</h2></div><span>' +
        (bonus ? (bonus.type === 'discardBuild' ? '从弃牌堆建造一张' : '使用时代末最后一张牌') :
          hand.length + ' 张可选 · ' + state.picks.filter(Boolean).length + '/' + state.players.length + ' 位已选') +
        '</span></div>' + (current.ai ? '<div class="w-wait"><div class="w-hourglass"' + helpAttr('沙漏：电脑正在自动选择行动，完成后会进入下一位玩家。') + '>⌛</div><h3>' +
        (aiError ? '电脑行动中断' : '文明正在发展') + '</h3><p>' + (aiError ? esc(aiError) : '电脑正在评估建筑与贸易，完成后自动进入下一位玩家。') +
        '</p><small>第 ' + state.age + ' 时代 · 第 ' + state.round + ' 轮 · 已运行 ' + Math.floor((Date.now() - startTime) / 1000) +
        ' 秒</small>' + (aiError ? '<button class="w-primary" data-action="retry-ai">重试电脑行动</button>' : '') + '</div>' :
        handoff ? '<div class="w-wait"><h3>等待交接</h3><p>请由下一位玩家接手。</p></div>' :
        Room.active && !Room.canAct ? '<div class="w-wait"><h3>' + esc(Room.reason) + '</h3><p>本轮所有人选好后，同时结算并传递手牌。</p></div>' :
        bonus && !hand.length ? '<div class="w-wait"><h3>弃牌堆暂无可建造的牌</h3><button class="w-primary" data-action="skip-bonus">继续对局</button></div>' :
        '<div class="w-hand">' + hand.map(id => bonus?.type === 'discardBuild' ? reclaimTile(id) : cardTile(id, legal)).join('') + '</div>') +
        '</main><aside class="w-aside">' + wonderPanel(current) + '<section class="w-log"><span class="w-eyebrow">城市的发展记录</span><h2>文明纪事</h2><ol>' +
        state.log.slice(-6).reverse().map(line => '<li>' + esc(line) + '</li>').join('') + '</ol></section></aside></div>') +
      '</div></div>';
    renderOverlay();
  }
  function renderSymbols() {
    const resources = Object.entries(RES).map(([symbol, short]) =>
      '<div class="w-legend-item"><span class="w-resource ' + symbol + '">' + icon(symbol) +
      '</span><span><b>' + D.R[symbol] + '</b>：建造费用或每回合产能。自己的产能不会消耗。</span></div>').join('');
    const colors = Object.entries(D.TYPES).map(([key, name]) =>
      '<div class="w-legend-item"><i class="w-legend-color" style="background:' + D.COLORS[key] +
      '"></i><span><b>' + name + '</b>：' + TYPE_HELP[key].split('：')[1] + '</span></div>').join('');
    return '<div class="w-modal-backdrop"><section class="w-modal w-symbols-modal" aria-label="符号说明"><button class="w-modal-close" data-action="close-symbols" aria-label="关闭符号说明">×</button>' +
      '<span class="w-eyebrow">认识每一种符号</span><h2>符号说明</h2><p>将鼠标停在符号或卡图上可看解释；触屏点一下可查看，再点一下或点空白处关闭。</p>' +
      '<div class="w-legend-grid"><div><h3>资源与金币</h3>' + resources +
      '<div class="w-legend-item"><span class="w-coin">' + icon('$') + '</span><span><b>金币费用</b>：金币符号需要付给银行；向邻座买资源通常每份付 2 金币，有折扣时付 1 金币。</span></div>' +
      '<div class="w-legend-item"><span class="w-legend-glyph">' + icon('$') + '</span><span><b>金币余额</b>：可用于付款；游戏结束时每剩 3 枚得 1 分。</span></div>' +
      '<div class="w-legend-item"><span class="w-legend-glyph">' + icon('shields') + '</span><span><b>盾牌</b>：每时代末分别与左右邻座比较军力；胜利得 1 / 3 / 5 分，失败扣 1 分。</span></div></div>' +
      '<div><h3>牌与计分</h3>' + colors +
      '<div class="w-legend-item"><span class="w-legend-glyph">' + ['compass', 'gear', 'tablet'].map(icon).join('') + '</span><span><b>科技</b>：罗盘、齿轮、泥板各自数量平方计分；每套三种再加 7 分。任意科技可任选一种。</span></div>' +
      '<div class="w-legend-item"><span class="w-legend-glyph">☼/☾</span><span><b>奇迹面</b>：白昼 A / 夜晚 B；阶段按顺序建造。</span></div>' +
      '<div class="w-legend-item"><span class="w-legend-glyph">→</span><span><b>连锁</b>：已建对应前置建筑时，可免费建造该牌。</span></div></div></div>' +
      '<p class="w-legend-note">卡图和奇迹版图是印刷图片，悬停整张图会显示该项解释。本预览的数据与图片可能不完全一致，请以图片下方的中文费用、效果为准。</p>' +
      '<div class="w-modal-actions"><button class="w-primary" data-action="close-symbols">知道了</button></div></section></div>';
  }
  function renderOverlay() {
    if (showSymbols) { overlay.innerHTML = renderSymbols(); return; }
    if (showRules) {
      overlay.innerHTML = '<div class="w-modal-backdrop"><section class="w-modal"><button class="w-modal-close" data-action="close-rules" aria-label="关闭">×</button><span class="w-eyebrow">七大奇迹规则</span><h2>玩法速览</h2>' +
        '<p>对局有三个时代，每时代六轮。每轮从手牌中选一张，然后传给邻座：第一、三时代向左传，第二时代向右传。每时代最后剩下的一张牌弃置。</p>' +
        '<p>一张牌可用来建造建筑、覆盖在下一阶段奇迹下，或出售获得 3 枚金币。缺少建造资源时，可向左右邻座购买其初始资源和棕色、灰色建筑的产能；不能购买黄色建筑或奇迹阶段的产能。资源不会被消耗。相同名称的建筑不能重复建造。已建前置建筑时可选择免费连锁，也可按普通资源费用建造；自有产能不会消耗。</p>' +
        '<p>每时代结束时分别与左右邻座比较军力，第三时代结束后计算民用、科技、军事、商业、行会、奇迹和金币分数。</p>' +
        '<div class="w-modal-actions"><button class="w-primary" data-action="close-rules">开始选牌</button></div></section></div>';
      return;
    }
    if (handoff && ['draft', 'bonus'].includes(state?.phase) && !state.players[state.current].ai) {
      overlay.innerHTML = '<div class="w-modal-backdrop"><section class="w-modal w-handoff"><span class="w-eyebrow">下一位玩家</span><h2>交给 ' +
        esc(state.players[state.current].name) + '</h2><p>请把电脑交给下一位玩家。准备好后再显示手牌，避免提前看见其他文明的选择。</p>' +
        '<div class="w-modal-actions"><button class="w-primary" data-action="handoff">我准备好了</button></div></section></div>';
      return;
    }
    overlay.innerHTML = '';
  }
  function render() { hideTooltip(); if (screen === 'setup' || !state) renderSetup(); else renderGame(); }
  function humans() { return state.players.filter(player => !player.ai).length; }
  function scheduleAI() {
    if (Room.active) return;
    clearTimeout(timer);
    if (screen !== 'game' || !state || !['draft', 'bonus'].includes(state.phase) || handoff ||
      showRules || showSymbols || aiError || !state.players[state.current].ai) return;
    timer = setTimeout(() => {
      try {
        const at = state.current;
        const action = E.chooseAI(state, at);
        if (state.phase === 'bonus') E.playBonus(state, at, action.cardId, action.mode);
        else E.play(state, at, action.cardId, action.mode);
        save();
        if (['draft', 'bonus'].includes(state.phase) && !state.players[state.current].ai && humans() > 1 && state.current !== lastHuman) handoff = true;
        render();
        scheduleAI();
      } catch (error) { console.error(error); aiError = error.message; message('电脑回合中断：' + error.message); render(); }
    }, BoardMotion.aiDelay());
  }
  function start() {
    syncSetup();
    const seats = setupSeats.slice(0, setupCount).map((seat, index) => ({
      name: seat.name.trim() || defaultName(index, seat.ai), ai: seat.ai, side: seat.side
    }));
    state = E.newGame(seats, Date.now());
    screen = 'game'; handoff = false; showRules = false; showSymbols = false; lastHuman = 0; aiError = ''; startTime = Date.now();
    save(); render(); scheduleAI();
  }
  function resume() {
    if (!savedState) return;
    state = JSON.parse(JSON.stringify(savedState));
    screen = 'game'; showRules = false; showSymbols = false; aiError = ''; startTime = Date.now();
    handoff = ['draft', 'bonus'].includes(state.phase) && !state.players[state.current].ai && humans() > 1;
    render(); scheduleAI();
  }
  function hideTooltip() {
    tooltip.hidden = true;
    tooltipAnchor = null;
    tooltipPinned = false;
  }
  function showTooltip(anchor, pinned = false) {
    if (!anchor?.isConnected || !(anchor.dataset.wTip || anchor.dataset.reason)) return;
    tooltip.textContent = anchor.dataset.wTip || anchor.dataset.reason;
    tooltip.hidden = false;
    tooltipAnchor = anchor;
    tooltipPinned = pinned;
    const rect = anchor.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 12));
    const below = rect.bottom + height + 12 <= innerHeight;
    const top = below ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
    tooltip.style.left = Math.round(left) + 'px';
    tooltip.style.top = Math.round(top) + 'px';
  }
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || tooltipPinned) return;
    const anchor = event.target.closest?.('[data-w-tip],[data-reason]');
    if (anchor && anchor !== tooltipAnchor) showTooltip(anchor);
  });
  document.addEventListener('pointerout', event => {
    if (tooltipPinned || !tooltipAnchor) return;
    if (tooltipAnchor.contains(event.target) && !tooltipAnchor.contains(event.relatedTarget)) hideTooltip();
  });
  document.addEventListener('focusin', event => {
    const anchor = event.target.closest?.('[data-w-tip],[data-reason]');
    if (anchor && !tooltipPinned) showTooltip(anchor);
  });
  document.addEventListener('focusout', event => {
    if (!tooltipPinned && tooltipAnchor?.contains(event.target)) hideTooltip();
  });
  document.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    hideTooltip();
    if (showSymbols) { showSymbols = false; renderOverlay(); scheduleAI(); }
  });
  root.addEventListener('input', event => {
    if (!event.target.matches('[data-seat-name]')) return;
    const seat = setupSeats[Number(event.target.dataset.seatName)];
    seat.name = event.target.value; seat.customName = true;
  });
  root.addEventListener('change', event => {
    if (event.target.matches('[data-count]')) {
      syncSetup(); setupCount = Number(event.target.value); render(); return;
    }
    if (event.target.matches('[data-seat-ai],[data-seat-side]')) syncSetup();
  });
  document.addEventListener('click', event => {
    const help = event.target.closest?.('[data-w-tip]');
    if (help) {
      if (tooltipPinned && tooltipAnchor === help) hideTooltip();
      else showTooltip(help, true);
      event.stopPropagation();
      return;
    }
    hideTooltip();
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.reason) { message(target.dataset.reason); return; }
    const action = target.dataset.action;
    if (action === 'start') return start();
    if (action === 'continue') return resume();
    if (action === 'menu') {
      clearTimeout(timer); screen = 'setup'; state = null; handoff = false; showRules = false; showSymbols = false; render(); return;
    }
    if (action === 'symbols') { clearTimeout(timer); showSymbols = true; showRules = false; renderOverlay(); return; }
    if (action === 'close-symbols') { showSymbols = false; renderOverlay(); scheduleAI(); return; }
    if (action === 'rules') { clearTimeout(timer); showRules = true; renderOverlay(); return; }
    if (action === 'close-rules') { showRules = false; renderOverlay(); scheduleAI(); return; }
    if (action === 'save') { save(); message('对局已保存到本机'); return; }
    if (action === 'handoff') { handoff = false; render(); scheduleAI(); return; }
    if (action === 'retry-ai') { aiError = ''; render(); scheduleAI(); return; }
    if (action === 'skip-bonus' || target.dataset.bonusCard) {
      if (!state || state.phase !== 'bonus' || state.players[state.current].ai || handoff) return;
      try {
        const at = state.current;
        E.playBonus(state, at, action === 'skip-bonus' ? null : target.dataset.bonusCard,
          action === 'skip-bonus' ? 'skip' : 'reclaim');
        lastHuman = at;
        save();
        if (['draft', 'bonus'].includes(state.phase) && !state.players[state.current].ai && humans() > 1 && at !== state.current) handoff = true;
        render(); scheduleAI();
      } catch (error) { message(error.message); }
      return;
    }
    if (target.dataset.card && target.dataset.mode) {
      if (!state || !['draft', 'bonus'].includes(state.phase) || state.players[state.current].ai || handoff) return;
      try {
        const at = state.current;
        if (state.phase === 'bonus') E.playBonus(state, at, target.dataset.card, target.dataset.mode);
        else E.play(state, at, target.dataset.card, target.dataset.mode);
        lastHuman = at;
        save();
        if (['draft', 'bonus'].includes(state.phase) && !state.players[state.current].ai && humans() > 1 && at !== state.current) handoff = true;
        render(); scheduleAI();
      } catch (error) { message(error.message); }
    }
  });
  if (Room.active) Room.connect({ game: 'wonders', root: 'wonders', getState: () => state, setState: value => {
    state = value; screen = 'game'; handoff = false; lastHuman = value.current;
  }, render });
  else { load(); render(); if (new URLSearchParams(location.search).get('continue') === '1') resume(); }
})();
