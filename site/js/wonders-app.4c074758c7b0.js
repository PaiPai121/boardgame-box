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
  const SCORE_CATEGORIES = { military: '军事', treasury: '金币', wonder: '奇迹', civilian: '民用',
    science: '科技', commerce: '商业', guild: '行会' };
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
  let scorePlayer = null, scoreCategory = null;
  let cityPlayer = null, cityFilter = 'all', citySection = 'buildings', scoreReturnCity = null;
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
  function viewerIndex() {
    if (Room.active && Number.isInteger(Room.snapshot?.mine) && Room.snapshot.mine >= 0) return Room.snapshot.mine;
    if (!state.players[state.current]?.ai) return state.current;
    return state.players[lastHuman] ? lastHuman : 0;
  }
  function positionLabel(index) {
    const at = viewerIndex(), seats = E.neighbors(state, at);
    return index === at ? '本位' : index === seats.left ? '左邻' : index === seats.right ? '右邻' : (index + 1) + 'P';
  }
  function productionChips(slots) {
    const grouped = new Map();
    slots.forEach(slot => grouped.set(slot.options, (grouped.get(slot.options) || 0) + 1));
    return [...grouped].map(([options, count]) => {
      const names = [...options].map(symbol => D.R[symbol]);
      return '<span class="w-production-chip"' + helpAttr(names.length > 1 ?
        '可选产能：每回合' + (count > 1 ? '有 ' + count + ' 组，各自' : '') + '从' + names.join('、') + '中任选 1 份；不能同时生产全部选项。' :
        names[0] + '产能：每回合提供 ' + count + ' 份；资源不会被消耗。') + '>' + [...options].map(icon).join('<i>/</i>') +
        (count > 1 ? '<b>×' + count + '</b>' : '') + '</span>';
    }).join('');
  }
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
  function chainIcon(card) {
    const symbol = D.CHAIN_SYMBOLS[card.key];
    return symbol ? '<img class="w-chain-icon" data-chain-symbol="' + symbol.id +
      '" src="assets/wonders/icons/chains/' + symbol.id + '.svg" alt="' + esc(symbol.name) + '连锁标识">' : '';
  }
  function chainInfo(item, owner = state.current, inspecting = false) {
    const previous = E.chainKeys(item).map(key => BY_KEY.get(key));
    const next = [...BY_KEY.values()].filter(card => E.chainKeys(card).includes(item.key));
    const isBuilt = card => state.players[owner].built.some(id => E.CARD.get(id).key === card.key);
    const unlocked = previous.some(isBuilt);
    if (!previous.length && !next.length) return '<div class="w-chain w-no-chain">无连锁关系</div>';
    return '<div class="w-chain' + (unlocked ? ' unlocked' : '') + '">' +
      previous.map(card => '<div class="w-chain-row"' + helpAttr('连锁标识：' + D.CHAIN_SYMBOLS[item.key].name + '。已建造《' + card.name + '》时，《' + item.name + '》可以免费建造；多个前置满足任意一个即可。也可选择普通资源建造。') +
        '><span class="w-chain-label">前置建筑</span><span class="w-chain-chip' + (isBuilt(card) ? ' built' : '') + '">' + chainIcon(item) +
        '<span class="w-chain-identity"><b>' + esc(card.name) + '</b><em>' + (isBuilt(card) ? inspecting ? '已建' : '已建 · 连锁免费' : '未建') + '</em></span></span></div>').join('') +
      (next.length ? '<div class="w-chain-row"><span class="w-chain-label">解锁建筑</span><div class="w-chain-options">' +
        next.map(card => '<span class="w-chain-chip' + (inspecting && isBuilt(card) ? ' built' : '') + '"' + helpAttr('连锁标识：' + D.CHAIN_SYMBOLS[card.key].name + '。建成《' + item.name + '》后，抽到《' + card.name + '》（时代' + card.age + '）时可连锁免费建造。标识用于匹配建筑，不是资源或科技奖励。') + '>' +
          chainIcon(card) + '<span class="w-chain-identity"><b>' + esc(card.name) + '</b><span class="w-chain-age">（时代' + card.age + '）</span>' +
          (inspecting ? '<em>' + (isBuilt(card) ? '已建' : '未建 · 可解锁') + '</em>' : '') + '</span></span>').join('') + '</div></div>' : '') + '</div>';
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
    const position = positionLabel(index);
    return '<article class="w-player' + (active ? ' active' : '') + '" data-motion-player="' + index + '" data-player="' + index + '"><div class="w-player-top">' +
      '<span class="w-player-index">' + (index + 1) + 'P</span><span class="w-player-tag">' + (position || (player.ai ? '电脑' : '真人')) + '</span></div>' +
      '<h3>' + esc(player.name) + '</h3><p>' + esc(w.city) + ' · ' + (player.side === 'a' ? '白昼' : '夜晚') + '</p>' +
      '<div class="w-player-numbers"><span' + helpAttr('◈ 金币：可支付建筑费用和购买邻座资源；游戏结束时每 3 枚剩余金币得 1 分。') +
      '><b>' + icon('$') + player.coins + '</b> 金币</span><span' + helpAttr('盾牌：每时代结束时分别与左右邻座比较。胜利在第一、二、三时代分别得 1、3、5 分；失败扣 1 分。') +
      '><b>' + icon('shields') + E.shields(player) + '</b> 军力</span><button class="w-player-score" data-score-player="' + index +
      '" aria-label="查看' + esc(player.name) + '的计分明细，' + total + ' 分" title="点击查看每项分数的来源"><b>' + icon('points') + total + '</b> 分 · 明细</button></div>' +
      '<div class="w-player-resources">' + productionChips(E.production(player)) + '</div>' +
      '<div class="w-player-bottom"><button class="w-player-buildings" data-city-player="' + index + '" title="查看全部已建建筑、效果和连锁" aria-label="查看' + esc(player.name) +
      '的已建建筑">建筑 ' + player.built.length + ' · 查看</button><button data-city-player="' + index + '" data-city-section="wonder" aria-label="查看' +
      esc(player.name) + '的奇迹进度">奇迹 ' + player.stages.length + '/' + E.stages(player).length + '</button></div></article>';
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
  function wonderPanel(player, heading = '你的奇迹') {
    const w = E.WONDER.get(player.wonder);
    return '<section class="w-wonder-panel"><div class="w-wonder-head"><div><span class="w-eyebrow">' + esc(heading) + '</span><h2>' +
      esc(w.name) + '</h2><p>' + (player.side === 'a' ? '白昼 A 面' : '夜晚 B 面') + ' · 初始生产 ' + D.R[w.resource] +
      '</p></div><div class="w-wonder-seal"' + helpAttr(player.side === 'a' ? '☼ 白昼 A 面：这座奇迹的 A 面阶段。' : '☾ 夜晚 B 面：这座奇迹的 B 面阶段。') +
      '>' + (player.side === 'a' ? '☼' : '☾') + '</div></div>' +
      '<div class="w-wonder-art"' + helpAttr('《' + w.name + '》' + (player.side === 'a' ? '白昼 A 面' : '夜晚 B 面') +
      '。起始资源：' + D.R[w.resource] + '。奇迹阶段需按顺序建造；本局费用与效果以下方中文说明为准。') +
      '><img src="assets/wonders/boards/' + esc(w.id) + '-' + player.side + '.jpg" alt="' + esc(w.name) + '奇迹版图" decoding="async"></div><div class="w-stages">' +
      E.stages(player).map((stage, index) => '<div class="w-stage' + (index < player.stages.length ? ' done' : index === player.stages.length && state.phase !== 'gameover' ? ' next' : '') + '"><small>阶段 ' +
      (index + 1) + ' · ' + (index < player.stages.length ? '已建' : index === player.stages.length && state.phase !== 'gameover' ? '下一阶段' : '未建') + '</small>' + effectSymbols(stage.effect) + '<strong' + helpAttr('第 ' + (index + 1) + ' 阶段：' + effectText(stage.effect) +
        '。费用：' + costText(stage.cost) + '。需要按顺序建造。') + '>' + effectText(stage.effect) + '</strong><span>' + resourceList(stage.cost) +
      '</span></div>').join('') + '</div></section>';
  }
  function cityCard(card, index) {
    const item = E.CARD.get(card.id);
    return '<article class="w-city-card w-card ' + card.type + '" data-built-card="' + card.id + '" style="--card-color:' + D.COLORS[card.type] + '">' +
      '<div class="w-city-card-art"' + helpAttr('《' + card.name + '》：已建造的' + D.TYPES[card.type] + '。效果：' + effectText(card.effect) +
      '。原建造需求：' + costText(card.cost) + '；费用和效果以中文说明为准。') + '><img src="assets/wonders/cards/' + card.key +
      '.jpg" alt="' + esc(card.name) + '卡图" loading="lazy"><small>时代 ' + card.age + ' · 已建</small></div><div class="w-card-content">' +
      '<div class="w-card-type"' + helpAttr(TYPE_HELP[card.type]) + '>' + D.TYPES[card.type] + '</div><h3>' + esc(card.name) + '</h3>' +
      effectSymbols(card.effect) + '<p>' + esc(effectText(card.effect)) + '</p><div class="w-city-card-cost"><small>原建造需求</small>' + resourceList(card.cost) +
      '</div>' + chainInfo(item, index, true) + '</div></article>';
  }
  function renderCivilization() {
    const index = cityPlayer, player = state.players[index], info = E.civilizationInfo(state, index), neighbors = E.neighbors(state, index);
    const cards = info.cards.filter(card => cityFilter === 'all' || card.type === cityFilter);
    const science = Object.entries(info.science).filter(([_symbol, count]) => count).map(([symbol, count]) => '<span' +
      helpAttr(symbol === 'wild' ? '任意科技：计分时可选罗盘、齿轮或泥板；计分明细会显示总分最高的分配。' :
      { compass: '罗盘', gear: '齿轮', tablet: '泥板' }[symbol] + '数量；同类平方分与成套奖励见计分明细。') + '>' +
      (symbol === 'wild' ? '<b>任意</b>' : icon(symbol)) + ' ×' + count + '</span>').join('');
    const trades = info.tradeDiscounts.map(trade => '<li>' + esc(effectText({ trade })) + '</li>').join('');
    const view = index + ':' + cityFilter + ':' + citySection;
    return '<div class="w-modal-backdrop w-city-backdrop"><section class="w-modal w-score-modal w-city-modal" data-city-view="' + view +
      '" role="dialog" aria-modal="true" aria-labelledby="w-city-title"><div class="w-score-toolbar w-city-toolbar"><h2 id="w-city-title">文明详情 <span>· ' + esc(info.name) + '</span></h2>' +
      '<button class="w-score-close" data-action="close-city" aria-label="关闭文明详情">关闭 ×</button></div><div class="w-city-heading"><div><span class="w-eyebrow">' +
      positionLabel(index) + ' · ' + (player.ai ? '电脑 · 简单' : '真人') + '</span><h3>' + esc(info.name) + '</h3><p>' + esc(info.wonder.name) +
      ' · ' + (info.wonder.side === 'a' ? '白昼 A 面' : '夜晚 B 面') + '</p></div><button class="w-city-score-link" data-score-player="' + index +
      '">' + icon('points') + '<b>' + info.score.total + '</b><span>' + (state.phase === 'gameover' ? '最终得分' : '当前预估') + ' · 查看明细</span></button></div>' +
      '<nav class="w-score-player-tabs w-city-player-tabs" aria-label="选择查看的文明">' + state.players.map((item, at) => '<button data-city-player="' + at +
      '" aria-pressed="' + (at === index) + '"><small>' + positionLabel(at) + '</small>' + esc(item.name) + '</button>').join('') + '</nav>' +
      '<p class="w-city-neighbors">' + esc(info.name) + '的左邻：<button data-city-player="' + neighbors.left + '">' + esc(state.players[neighbors.left].name) +
      '</button> · 右邻：<button data-city-player="' + neighbors.right + '">' + esc(state.players[neighbors.right].name) + '</button></p>' +
      '<div class="w-city-stats"><span>' + icon('$') + '<b>' + info.coins + '</b> 金币</span><span>' + icon('shields') + '<b>' + info.shields +
      '</b> 军力</span><span>' + icon('stage') + '<b>' + info.wonder.completed + '/' + info.wonder.total + '</b> 奇迹阶段</span><span><i class="w-mini-card"></i><b>' +
      info.cards.length + '</b> 已建建筑</span></div><div class="w-city-economy"><section><h4>全部产能</h4><div class="w-city-production">' +
      productionChips(info.production) + '</div><p>每回合可重复使用。带斜线的一组选其中一种；同组选项不能同时生产。</p></section><section><h4>可供邻座购买的产能</h4>' +
      '<div class="w-city-production" data-city-trade-production>' + productionChips(info.tradeProduction) + '</div><p>来自初始资源和棕色、灰色建筑；贸易优惠以购买方为准。</p></section>' +
      '<section><h4>科技符号</h4><div class="w-city-science">' + (science || '<span class="w-city-muted">尚无科技符号</span>') +
      '</div><p>任意科技保留为可选符号，计分明细显示当前的最优分配。</p></section><section><h4>贸易优惠</h4>' +
      (trades ? '<ul class="w-city-trades">' + trades + '</ul>' : '<p class="w-city-muted">尚无贸易优惠</p>') + '</section></div>' +
      '<div class="w-city-section-tabs" role="group" aria-label="文明内容"><button data-city-section="buildings" aria-pressed="' + (citySection === 'buildings') +
      '">已建建筑 · ' + info.cards.length + '</button><button data-city-section="wonder" aria-pressed="' + (citySection === 'wonder') + '">奇迹进度 · ' +
      info.wonder.completed + '/' + info.wonder.total + '</button></div>' +
      (citySection === 'wonder' ? '<div class="w-city-wonder">' + wonderPanel(player, '奇迹进度') + '</div>' :
        '<nav class="w-city-filters" aria-label="按建筑类型筛选"><button data-city-filter="all" aria-pressed="' + (cityFilter === 'all') +
        '">全部 <b>' + info.cards.length + '</b></button>' + Object.entries(D.TYPES).map(([type, name]) => '<button data-city-filter="' + type +
        '" aria-pressed="' + (cityFilter === type) + '"><i class="w-mini-card" style="background:' + D.COLORS[type] + '"></i>' + name + ' <b>' + info.counts[type] +
        '</b></button>').join('') + '</nav><p class="w-city-note">以下是' + esc(info.name) + '已完成的建筑。卡牌效果中的“自己”和“左右邻座”均以该文明为准。</p>' +
        (cards.length ? '<div class="w-city-buildings">' + cards.map(card => cityCard(card, index)).join('') + '</div>' :
          '<div class="w-city-empty"><h3>' + (info.cards.length ? '还没有这类建筑' : '尚未建造建筑') + '</h3><p>' +
          (info.cards.length ? '可切换其他建筑类型或文明查看。' : '建造完成后，建筑、效果和连锁关系会自动出现在这里。') + '</p></div>')) +
      '<div class="w-modal-actions"><button class="w-primary" data-action="close-city">返回对局</button></div></section></div>';
  }
  function closeCivilization() {
    const index = cityPlayer;
    cityPlayer = null; scoreReturnCity = null; hideTooltip(); renderOverlay();
    root.querySelector('.w-player-buildings[data-city-player="' + index + '"]')?.focus();
  }
  function scoreTable() {
    const categories = SCORE_CATEGORIES;
    const scores = state.players.map((player, index) => ({ player, index, score: E.score(state, index) }))
      .sort((a, b) => b.score.total - a.score.total || b.player.coins - a.player.coins);
    return '<table class="w-scores"><thead><tr><th>文明</th>' + Object.values(categories).map(name => '<th>' + name + '</th>').join('') +
      '<th>总分</th></tr></thead><tbody>' + scores.map(entry => '<tr' + (state.winners.includes(entry.index) ? ' class="winner"' : '') +
      '><td><strong>' + esc(entry.player.name) + '</strong><small>' + esc(E.WONDER.get(entry.player.wonder).city) + '</small></td>' +
      Object.keys(categories).map(key => '<td><button class="w-score-cell" data-score-player="' + entry.index + '" data-score-category="' + key +
        '" aria-label="查看' + esc(entry.player.name) + '的' + categories[key] + '计分明细">' + entry.score[key] + '</button></td>').join('') +
      '<td><button class="w-score-cell w-score-total-cell" data-score-player="' + entry.index + '" aria-label="查看' + esc(entry.player.name) + '的全部计分明细"><b>' +
      entry.score.total + '</b><small>查看明细</small></button></td></tr>').join('') + '</tbody></table>';
  }
  function scoreSourceName(source) {
    return source.kind === 'card' ? source.name : E.WONDER.get(source.wonder).name + ' · 阶段 ' + source.stage;
  }
  function scoreCategoryIcon(key) {
    if (key === 'science') return icon('gear');
    if (['military', 'treasury', 'wonder'].includes(key)) return icon({ military: 'shields', treasury: '$', wonder: 'stage' }[key]);
    return '<i class="w-mini-card" style="background:' + D.COLORS[{ civilian: 'blue', commerce: 'yellow', guild: 'purple' }[key]] + '"></i>';
  }
  function scoreRow(row, index) {
    let name, formula, sources = '', art = '';
    if (row.source) {
      name = scoreSourceName(row.source);
      if (row.source.kind === 'card') art = '<img class="w-score-art" src="assets/wonders/cards/' + E.CARD.get(row.source.cardId).key + '.jpg" alt="" loading="lazy">';
      else art = '<span class="w-score-stage">' + icon('stage') + '<small>' + row.source.stage + '</small></span>';
    }
    if (row.kind === 'conflict') {
      name = '第' + ['一', '二', '三'][row.age - 1] + '时代 · ' + (row.side === 'left' ? '左邻' : '右邻') + ' ' + state.players[row.opponent].name;
      formula = '军力 ' + row.shields + ' 对 ' + row.opponentShields + ' · ' + (row.points > 0 ? '胜利' : row.points < 0 ? '战败' : '平局');
      art = '<span class="w-score-stage">' + icon('shields') + '</span>';
    } else if (row.kind === 'legacyMilitary') {
      name = '旧存档军事标记';
      formula = row.count + ' 枚 × ' + row.value + ' 分；原存档未记录时代与邻座';
    } else if (row.kind === 'treasury') {
      name = '剩余金币折算';
      formula = row.coins + ' 枚金币 ÷ 3 = ' + row.points + ' 分，余 ' + row.remainder + ' 枚不计分';
      art = '<span class="w-score-stage">' + icon('$') + '</span>';
    } else if (row.kind === 'scienceSymbol') {
      name = { compass: '罗盘', gear: '齿轮', tablet: '泥板' }[row.symbol];
      formula = row.count + ' × ' + row.count + ' = ' + row.points + ' 分';
      art = '<span class="w-score-stage">' + icon(row.symbol) + '</span>';
      sources = row.sources.length ? '<div class="w-score-sources">' + row.sources.map(source => '<span>' + esc(scoreSourceName(source)) +
        (source.symbol === 'wild' ? ' <em>任意科技 → ' + name + '</em>' : '') + '</span>').join('') + '</div>' : '<div class="w-score-sources">尚无此科技符号</div>';
    } else if (row.kind === 'scienceSets') {
      name = '三种科技成套奖励';
      formula = row.count + ' 套 × 7 = ' + row.points + ' 分；每套各含罗盘、齿轮、泥板 1 个';
      art = '<span class="w-score-set">' + ['compass', 'gear', 'tablet'].map(icon).join('') + '</span>';
    } else if (row.counted) {
      const { what, count, basis } = row.counted;
      if (what === 'allStages') formula = '已建 ' + basis[0].count + '/' + basis[0].required + ' 个奇迹阶段 · ' +
        (count ? '全部完成' : '尚未全部完成') + ' × ' + row.rate + ' = ' + row.points + ' 分';
      else {
        formula = COUNT_HELP[what] + ' ' + count + ' 个 × ' + row.rate + (row.fixed ? ' + 固定 ' + row.fixed : '') + ' = ' + row.points + ' 分';
        const neighbors = E.neighbors(state, index);
        sources = '<div class="w-score-basis">' + basis.map(item => esc(item.player === index ? '自己' :
          (item.player === neighbors.left ? '左邻 ' : '右邻 ') + state.players[item.player].name) +
          (item.type && what === 'brownGrayPurpleSelf' ? '的' + D.TYPES[item.type] : '') + ' ' + item.count +
          (item.unit === 'stages' ? ' 阶段' : ' 张')).join(' + ') + '</div>';
      }
    } else if (row.science) formula = '任意科技计入「科技」项，此处不重复加分';
    else if (row.points) formula = '固定胜利分 ' + row.points + ' 分';
    else if (row.incomeOrTrade) formula = '金币收入或贸易优惠；剩余金币统一在「金币」项折算';
    else formula = '此项没有直接胜利分';
    const points = (row.points > 0 ? '+' : '') + row.points;
    return '<li class="w-score-row"><div class="w-score-row-main">' + art + '<div><strong>' + esc(name) + '</strong><p>' + esc(formula) + '</p>' +
      sources + '</div><b class="w-score-points' + (row.points < 0 ? ' negative' : row.points === 0 ? ' zero' : '') + '" data-score-row-points="' + row.points + '">' + points + '<small>分</small></b></div></li>';
  }
  function renderScoreDetails() {
    const index = scorePlayer, player = state.players[index], detail = E.scoreBreakdown(state, index), total = detail.totals;
    const keys = Object.keys(SCORE_CATEGORIES);
    const selected = scoreCategory || keys.find(key => total[key] !== 0) || 'treasury';
    return '<div class="w-modal-backdrop w-score-backdrop"><section class="w-modal w-score-modal" data-score-view="' + index + ':' + (scoreCategory || '') +
      '" role="dialog" aria-modal="true" aria-labelledby="w-score-dialog-title">' +
      '<div class="w-score-toolbar"><h2 id="w-score-dialog-title">计分明细</h2><button class="w-score-close" data-action="close-scores" aria-label="关闭计分明细">关闭 ×</button></div><div class="w-score-head"><div><span class="w-eyebrow">' +
      (detail.final ? '最终得分' : '当前预估') + '</span><h3>' + esc(player.name) +
      '</h3><p>' + esc(E.WONDER.get(player.wonder).name) + ' · ' + (player.side === 'a' ? '白昼 A 面' : '夜晚 B 面') + '</p></div>' +
      '<div class="w-score-grand"><strong data-score-grand-total>' + total.total + '</strong><span>总分</span></div></div>' +
      '<nav class="w-score-player-tabs" aria-label="选择文明">' + state.players.map((item, at) => '<button data-score-player="' + at +
        '" aria-pressed="' + (at === index) + '">' + esc(item.name) + '</button>').join('') + '</nav>' +
      '<p class="w-score-note">' + (detail.final ? '展开各项可查看具体来源。金币已按每 3 枚 1 分折算；同分时比较剩余金币。' :
      '随建筑、金币及邻座情况实时更新。尚未结算的军事冲突不计入当前分数；终局仍会变化。') + '</p>' +
      '<div class="w-score-summary">' + keys.map(key => '<button data-score-player="' + index + '" data-score-category="' + key + '">' +
        scoreCategoryIcon(key) + '<span>' + SCORE_CATEGORIES[key] + '</span><b data-score-subtotal="' + key + '">' + total[key] + '</b></button>').join('') + '</div>' +
      '<div class="w-score-categories">' + keys.map(key => '<details class="w-score-category" data-score-section="' + key + '"' + (selected === key ? ' open' : '') +
        '><summary>' + scoreCategoryIcon(key) + '<strong>' + SCORE_CATEGORIES[key] + '</strong><span>' + total[key] + ' 分</span></summary><div class="w-score-category-content">' +
        (key === 'science' && detail.science.wild ? '<p class="w-score-wild">' + detail.science.wild + ' 个任意科技已自动选择总分最高的组合：' +
        Object.entries(detail.science.allocated).filter(([_symbol, count]) => count).map(([symbol, count]) =>
          ({ compass: '罗盘', gear: '齿轮', tablet: '泥板' }[symbol]) + ' +' + count).join('、') + '。</p>' : '') +
        (detail.categories[key].length ? '<ul class="w-score-rows">' + detail.categories[key].map(row => scoreRow(row, index)).join('') + '</ul>' :
          '<p class="w-score-empty">' + (key === 'military' ? '尚无已结算的军事冲突。' : '尚无此类计分来源。') + '</p>') + '</div></details>').join('') + '</div>' +
      '<footer class="w-score-addition"><span>合计核对</span><p>' + keys.map(key => SCORE_CATEGORIES[key] + ' ' + (total[key] < 0 ? '(' + total[key] + ')' : total[key])).join(' + ') +
      ' = <b>' + total.total + ' 分</b></p></footer><div class="w-modal-actions"><button class="w-primary" data-action="close-scores">返回对局</button></div></section></div>';
  }
  function closeScores() {
    const index = scorePlayer;
    scorePlayer = null; scoreCategory = null;
    if (scoreReturnCity !== null && state?.players[scoreReturnCity]) cityPlayer = scoreReturnCity;
    scoreReturnCity = null; hideTooltip(); renderOverlay();
    (cityPlayer !== null ? overlay.querySelector('.w-city-score-link') : root.querySelector('[data-score-player="' + index + '"]'))?.focus();
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
        state.winners.map(index => esc(state.players[index].name)).join('、') + ' 获胜</h2><p>三时代已经结束，按总分排名；同分时比较剩余金币。点击分类分数或总分可查看来源明细。</p>' +
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
      '<div class="w-legend-item">' + chainIcon(BY_KEY.get('aqueduct')) + '<span><b>连锁标识</b>：相同图标连接前置与后续建筑。例如水滴连接浴场与高架水渠；已建前置建筑时可免费建造后续牌。图标旁显示中文名称与时代。</span></div></div></div>' +
      '<p class="w-legend-note">卡图和奇迹版图是印刷图片，悬停整张图会显示该项解释。本预览的数据与图片可能不完全一致，请以图片下方的中文费用、效果为准。</p>' +
      '<div class="w-modal-actions"><button class="w-primary" data-action="close-symbols">知道了</button></div></section></div>';
  }
  function renderOverlay() {
    if (cityPlayer !== null && state?.players[cityPlayer]) {
      const previous = overlay.querySelector('.w-city-modal');
      const retain = previous?.dataset.cityView === cityPlayer + ':' + cityFilter + ':' + citySection;
      const scroll = retain ? previous.scrollTop : 0;
      const focused = retain && previous.contains(document.activeElement);
      overlay.innerHTML = renderCivilization();
      const next = overlay.querySelector('.w-city-modal');
      if (focused) next.querySelector('[data-action="close-city"]').focus({ preventScroll: true });
      next.scrollTop = scroll;
      return;
    }
    if (scorePlayer !== null && state?.players[scorePlayer]) {
      const previous = overlay.querySelector('.w-score-modal');
      const retain = previous?.dataset.scoreView === scorePlayer + ':' + (scoreCategory || '');
      const open = retain ? [...previous.querySelectorAll('details[open]')].map(node => node.dataset.scoreSection) : null;
      const scroll = retain ? previous.scrollTop : 0;
      const focused = retain && previous.contains(document.activeElement);
      overlay.innerHTML = renderScoreDetails();
      const next = overlay.querySelector('.w-score-modal');
      if (open) next.querySelectorAll('details').forEach(node => { node.open = open.includes(node.dataset.scoreSection); });
      if (focused) next.querySelector('[data-action="close-scores"]').focus({ preventScroll: true });
      next.scrollTop = scroll;
      return;
    }
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
    screen = 'game'; handoff = false; showRules = false; showSymbols = false; scorePlayer = null; cityPlayer = null; scoreReturnCity = null; cityFilter = 'all'; citySection = 'buildings'; lastHuman = 0; aiError = ''; startTime = Date.now();
    save(); render(); scheduleAI();
  }
  function resume() {
    if (!savedState) return;
    state = JSON.parse(JSON.stringify(savedState));
    screen = 'game'; showRules = false; showSymbols = false; scorePlayer = null; cityPlayer = null; scoreReturnCity = null; aiError = ''; startTime = Date.now();
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
  document.addEventListener('scroll', () => {
    // Focusing a chain chip can scroll it into view. Keep keyboard help visible
    // and positioned beside its anchor after that scroll completes.
    if (!tooltipPinned && tooltipAnchor?.contains(document.activeElement)) {
      const rect = tooltipAnchor.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth) {
        showTooltip(tooltipAnchor); return;
      }
    }
    hideTooltip();
  }, true);
  window.addEventListener('resize', hideTooltip);
  document.addEventListener('keydown', event => {
    if ((scorePlayer !== null || cityPlayer !== null) && event.key === 'Tab') {
      const modal = overlay.querySelector('.w-score-modal');
      const focusable = [...modal.querySelectorAll('button,summary,[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!modal.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (event.key !== 'Escape') return;
    hideTooltip();
    if (scorePlayer !== null) { closeScores(); return; }
    if (cityPlayer !== null) { closeCivilization(); return; }
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
    if (event.target.matches('.w-score-backdrop')) { closeScores(); return; }
    if (event.target.matches('.w-city-backdrop')) { closeCivilization(); return; }
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
    if (target.dataset.cityPlayer !== undefined && state) {
      const index = Number(target.dataset.cityPlayer);
      if (!Number.isInteger(index) || !state.players[index]) return;
      const open = cityPlayer !== null;
      cityPlayer = index; scorePlayer = null; scoreReturnCity = null;
      if (!open) { cityFilter = 'all'; citySection = target.dataset.citySection || 'buildings'; }
      hideTooltip(); renderOverlay();
      overlay.querySelector('[data-action="close-city"]')?.focus();
      if (!open && citySection === 'wonder') overlay.querySelector('.w-city-section-tabs')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (cityPlayer !== null && target.dataset.cityFilter !== undefined) {
      if (!['all', ...Object.keys(D.TYPES)].includes(target.dataset.cityFilter)) return;
      cityFilter = target.dataset.cityFilter; hideTooltip(); renderOverlay();
      overlay.querySelector('[data-city-filter="' + cityFilter + '"]')?.focus({ preventScroll: true });
      overlay.querySelector('.w-city-filters')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (cityPlayer !== null && target.dataset.citySection !== undefined) {
      if (!['buildings', 'wonder'].includes(target.dataset.citySection)) return;
      citySection = target.dataset.citySection; hideTooltip(); renderOverlay();
      overlay.querySelector('.w-city-section-tabs [data-city-section="' + citySection + '"]')?.focus({ preventScroll: true });
      overlay.querySelector('.w-city-section-tabs')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (target.dataset.scorePlayer !== undefined && state) {
      const index = Number(target.dataset.scorePlayer);
      if (!Number.isInteger(index) || !state.players[index]) return;
      if (cityPlayer !== null) scoreReturnCity = cityPlayer;
      else if (scorePlayer === null) scoreReturnCity = null;
      cityPlayer = null;
      scorePlayer = index; scoreCategory = target.dataset.scoreCategory || null;
      hideTooltip(); renderOverlay();
      overlay.querySelector('[data-action="close-scores"]')?.focus();
      if (scoreCategory) overlay.querySelector('[data-score-section="' + scoreCategory + '"]')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (target.dataset.reason) { message(target.dataset.reason); return; }
    const action = target.dataset.action;
    if (action === 'start') return start();
    if (action === 'continue') return resume();
    if (action === 'menu') {
      clearTimeout(timer); screen = 'setup'; state = null; handoff = false; showRules = false; showSymbols = false; scorePlayer = null; cityPlayer = null; scoreReturnCity = null; render(); return;
    }
    if (action === 'symbols') { clearTimeout(timer); showSymbols = true; showRules = false; renderOverlay(); return; }
    if (action === 'close-symbols') { showSymbols = false; renderOverlay(); scheduleAI(); return; }
    if (action === 'rules') { clearTimeout(timer); showRules = true; renderOverlay(); return; }
    if (action === 'close-rules') { showRules = false; renderOverlay(); scheduleAI(); return; }
    if (action === 'close-scores') { closeScores(); return; }
    if (action === 'close-city') { closeCivilization(); return; }
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
