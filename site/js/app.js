(function () {
  'use strict';
  const BoardMotion = window.BoardMotion || { watch() {}, aiDelay: () => 360, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  let E = window.SplendorEngine;
  const AI = window.SplendorAI;
  const cards = window.CARD_DATA;
  const app = document.getElementById('app');
  const overlayRoot = document.getElementById('overlay-root');
  const SAVE_KEY = 'splendor-pokemon-classroom-v1';
  const COLLECTION_KEY = 'splendor-pokemon-pokedex-v1';
  const TIER_NAME = { stage1: '初阶', stage2: '进阶', stage3: '高阶', rare: '稀有', legend: '传说' };
  const AI_TRAINERS = ['小智', '小刚', '小霞', '小茂'];
  let state = null;
  let savedState = null;
  let screen = 'setup';
  let setupCount = 2;
  let setupSeats = [false, true, false, false].map((ai, index) => ({
    name: defaultSeatName(index, ai), ai, customName: false
  }));
  let selected = [];
  let detail = null;
  let payment = null;
  let handoff = false;
  let showRules = false;
  let showMasterHelp = false;
  let pokedexIndex = null;
  let rosterIndex = null;
  let gameoverDismissed = false;
  let aiTimer = null;
  let toastTimer = null;
  let reasonTooltip = null;
  let collections = {};
  E = BoardMotion.watch({ game: 'pokemon', engine: E, state: () => state, methods: ['perform', 'discardToken', 'evolve', 'finishTurn'] }) || E;
  E = Room.wrap(E, 'pokemon');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function defaultSeatName(index, ai) {
    return ai ? AI_TRAINERS[index] + '（简单）' : index === 0 ? '训练家' : '训练家 ' + (index + 1);
  }
  function syncSetupSeats() {
    setupSeats.forEach((seat, index) => {
      const nameInput = app.querySelector('[data-seat-name="' + index + '"]');
      const aiInput = app.querySelector('[data-seat-ai="' + index + '"]');
      if (nameInput && nameInput.value !== seat.name) {
        seat.name = nameInput.value;
        seat.customName = true;
      }
      if (aiInput && (aiInput.value === 'ai') !== seat.ai) {
        seat.ai = aiInput.value === 'ai';
        if (!seat.customName) {
          seat.name = defaultSeatName(index, seat.ai);
          if (nameInput) nameInput.value = seat.name;
        }
      }
    });
  }
  function card(id) { return E.getCard(cards, id); }
  function colorBall(color, size) { return '<span class="ball ' + color + (size ? ' ' + size : '') + '" aria-hidden="true"></span>'; }
  function player() { return state.players[state.current]; }
  function humanTurn() { return state && state.phase !== 'gameover' && !player().ai && !handoff && (!Room.active || Room.canAct); }
  function hasMultipleHumans() { return state.players.filter(item => !item.ai).length > 1; }
  function save() {
    if (Room.active) return true;
    try {
      E.validateState(state, cards);
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      localStorage.setItem('boardgame-box-last-played', 'splendor');
      for (const item of state.players) {
        collections[item.name] = [...new Set([...(collections[item.name] || []), ...item.pokedex])];
      }
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(collections));
      savedState = JSON.parse(JSON.stringify(state));
      return true;
    } catch (error) { console.warn('存档未写入：', error); return false; }
  }
  function loadSave() {
    try {
      const collected = localStorage.getItem(COLLECTION_KEY);
      if (collected) {
        const parsed = JSON.parse(collected);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) collections = parsed;
      }
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const candidate = JSON.parse(raw);
      if (candidate.version !== 1) return;
      E.validateState(candidate, cards);
      savedState = candidate;
    } catch (error) { console.warn('旧存档无法读取：', error); }
  }
  function notifyError(error) {
    console.error(error);
    let banner = document.querySelector('.error-banner');
    if (banner) banner.remove();
    banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = error.message || String(error);
    document.body.appendChild(banner);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => banner.remove(), 5000);
  }
  function notifyInfo(message) {
    let banner = document.querySelector('.info-banner');
    if (banner) banner.remove();
    banner = document.createElement('div');
    banner.className = 'info-banner';
    banner.textContent = message;
    document.body.appendChild(banner);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => banner.remove(), 2600);
  }
  function guard(fn) {
    try { fn(); } catch (error) { notifyError(error); render(); }
  }
  function unavailableAttrs(reason) {
    return reason ? ' aria-disabled="true" aria-description="' + esc(reason) +
      '" data-unavailable-reason="' + esc(reason) + '"' : '';
  }
  function actionBlockReason() {
    if (Room.active && !Room.canAct) return Room.reason;
    if (!state || state.phase === 'gameover') return '本局已结束，请开始新对局。';
    if (handoff) return '请先由下一位训练家确认接手。';
    if (player().ai) return '正在等待电脑完成回合。';
    if (state.phase === 'discard') return '请先归还精灵球，直到随身总数不超过 10 枚。';
    if (state.phase === 'evolve') return '请先完成或跳过本回合的进化。';
    return '';
  }
  function captureReason(item) {
    const blocked = actionBlockReason();
    if (blocked) return blocked;
    const req = E.requiredPayment(player(), item, cards);
    const neededMaster = req.fixedMaster + E.COLORS.reduce((total, color) =>
      total + Math.max(0, req.need[color] - player().tokens[color]), 0);
    if (neededMaster <= player().tokens.purple) return '';
    const missing = E.COLORS.filter(color => req.need[color] > player().tokens[color])
      .map(color => E.COLOR_NAMES[color] + '差 ' + (req.need[color] - player().tokens[color]) + ' 枚');
    return '暂不能捕捉：' + (missing.length ? missing.join('、') + '；' : '') +
      '至少需要 ' + neededMaster + ' 枚大师球补足，当前持有 ' + player().tokens.purple + ' 枚。';
  }
  function reserveReason(item) {
    const blocked = actionBlockReason();
    if (blocked) return blocked;
    if (!['stage1', 'stage2', 'stage3'].includes(item.tier)) return '稀有和传说宝可梦不能预留。';
    if (player().reserved.length >= 3) return '已经预留 3 张卡，达到上限。';
    return '';
  }
  function takeSelectionReason() {
    const blocked = actionBlockReason();
    if (blocked) return blocked;
    const available = E.COLORS.filter(color => state.bank[color] > 0).length;
    if (!available) return '补给站没有普通球可取；可以尝试捕捉或预留卡牌。';
    if (!selected.length) return '先选普通球：拿最多 3 种不同色，或点颜色下方的“拿 2 枚”。';
    if (selected.length === 2 && selected[0] === selected[1]) {
      return state.bank[selected[0]] < 4 ? '拿两枚同色前，该色在补给站至少要有 4 枚。' : '';
    }
    const remaining = Math.min(3, available) - selected.length;
    return remaining > 0 ? '还需选择 ' + remaining + ' 种不同色；也可点颜色下方的“拿 2 枚”。' : '';
  }
  function hideReasonTooltip() {
    if (reasonTooltip) reasonTooltip.hidden = true;
  }
  function showReasonTooltip(target) {
    const reason = target?.dataset.unavailableReason || target?.dataset.hoverReason;
    if (!reason) return;
    if (!reasonTooltip) {
      reasonTooltip = document.createElement('div');
      reasonTooltip.className = 'unavailable-tooltip';
      reasonTooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(reasonTooltip);
    }
    reasonTooltip.textContent = reason;
    reasonTooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    reasonTooltip.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - reasonTooltip.offsetWidth / 2,
      window.innerWidth - reasonTooltip.offsetWidth - 8)) + 'px';
    reasonTooltip.style.top = (rect.bottom + reasonTooltip.offsetHeight + 12 < window.innerHeight ?
      rect.bottom + 8 : Math.max(8, rect.top - reasonTooltip.offsetHeight - 8)) + 'px';
  }
  function renderSetup() {
    screen = 'setup';
    app.innerHTML = '<main class="setup-screen"><div class="setup-hero"><button class="setup-hub-link" data-action="hub">← 返回桌游中心</button>' +
      '<div class="brand"><span class="brand-icon"></span><div><div class="brand-title">璀璨宝石：宝可梦</div><div class="brand-sub">POKÉMON SPLENDOR</div></div></div>' +
      '<div class="setup-eyebrow">一场关于收集与进化的旅程</div>' +
      '<h1>成为最耀眼的训练家</h1><p>收集精灵球，捕捉伙伴，进化你的队伍。<br>率先达到 18 分，赢得这场训练家对决。</p>' +
      '<div class="setup-features"><span>✦ 90 张宝可梦卡牌</span><span>✦ 2–4 人同屏对战</span><span>✦ 简单电脑 AI</span></div>' +
      '<div class="setup-art"><img src="assets/cards/s1_01.webp" alt="小火龙卡牌"><img src="assets/cards/rr_08.webp" alt="卡比兽卡牌"><img src="assets/cards/lg_08.webp" alt="梦幻卡牌"></div></div>' +
      '<div class="setup-content"><section class="panel setup-panel"><div class="panel-eyebrow">NEW ADVENTURE</div><h2>创建对局</h2>' +
      '<div class="setup-row"><label for="seat-count">参加人数</label><select id="seat-count" data-setup-count>' +
      [2, 3, 4].map(n => '<option value="' + n + '"' + (n === setupCount ? ' selected' : '') + '>' + n + ' 人</option>').join('') + '</select></div>' +
      '<div id="seat-list">' + setupSeats.slice(0, setupCount).map((seat, index) =>
        '<div class="seat-row"><span>' + (index + 1) + 'P</span><input aria-label="玩家 ' + (index + 1) + ' 名称" data-seat-name="' + index + '" maxlength="20" value="' + esc(seat.name) + '">' +
        '<select aria-label="玩家 ' + (index + 1) + ' 类型" data-seat-ai="' + index + '"><option value="human"' + (!seat.ai ? ' selected' : '') + '>真人</option><option value="ai"' + (seat.ai ? ' selected' : '') + '>电脑 · 简单</option></select></div>'
      ).join('') + '</div>' +
      '<div class="setup-actions"><button class="primary-button" data-action="start">开始冒险 →</button> ' +
      (savedState ? '<button class="soft-button" data-action="continue">继续上次对局</button>' : '') +
      '</div><p class="tiny">可全部设为真人或电脑；对局会自动保存在本机。</p></section></div></main>';
    overlayRoot.innerHTML = '';
  }
  function tile(id, source, compact) {
    if (!id) return '<span class="card-tile placeholder" aria-label="空位">空</span>';
    const item = card(id);
    const playable = source && (source.zone === 'display' || (source.zone === 'reserved' && source.player === state.current));
    const availablePayment = humanTurn() && state.phase === 'action' && playable ? E.autoPayment(player(), item, cards) : null;
    const canBuy = Boolean(availablePayment);
    const freeBuy = canBuy && E.ALL_COLORS.every(color => (availablePayment[color] || 0) === 0);
    const attrs = source ? ' data-card-zone="' + source.zone + '"' +
      (source.tier ? ' data-card-tier="' + source.tier + '"' : '') +
      (Number.isInteger(source.index) ? ' data-card-index="' + source.index + '"' : '') +
      (Number.isInteger(source.player) ? ' data-card-player="' + source.player + '"' : '') : '';
    const reason = playable && !canBuy ? captureReason(item) : '';
    const hint = source?.zone === 'owned' ? '已捕捉，点击查看卡牌' :
      freeBuy ? '无需支付随身精灵球，可免费捕捉' : canBuy ? '可捕捉，点击查看' : reason || '点击查看卡牌';
    return '<button class="card-tile' + (compact ? ' compact' : '') + (canBuy ? ' buyable' : '') + (freeBuy ? ' free-buyable' : '') +
      '" data-motion-key="card:' + id + '" aria-label="查看 ' + esc(item.name) + ' 卡牌" title="' + esc(item.name) + ' · ' + item.vp + ' 分 · ' + esc(hint) + '"' +
      (reason ? ' data-hover-reason="' + esc(reason) + '"' : '') + attrs +
      '><img src="' + esc(item.img) + '" alt="' + esc(item.name) + '" loading="lazy">' +
      (freeBuy ? '<span class="free-badge">免费捕捉</span>' : '') + '</button>';
  }
  function renderBank() {
    return '<section class="bank-panel"><div class="section-head"><div><div class="panel-eyebrow">SUPPLY STATION</div><h2>精灵球补给站</h2></div><span class="tiny">点球选颜色 · 点“拿 2 枚”选同色两枚</span></div><div class="bank-row">' +
      E.ALL_COLORS.map(color => {
        const master = color === 'purple';
        const isSelected = selected.includes(color);
        const blocked = actionBlockReason();
        const oneReason = master ? '' : blocked || (state.bank[color] <= 0 ?
          '补给站已无' + E.COLOR_NAMES[color] + '，现在不能拿取。' : '');
        const doubleReason = master ? '' : blocked || (state.bank[color] < 4 ?
          '拿两枚同色前，补给站至少要有 4 枚' + E.COLOR_NAMES[color] + '；当前仅剩 ' + state.bank[color] + ' 枚。' : '');
        const help = master ? '大师球不能直接拿取；点击查看获取方法' : '点此选 1 枚；同色两枚请点下方“拿 2 枚”';
        return '<div class="token-choice" data-motion-key="bank:' + color + '"><button class="token-button' + (isSelected ? ' selected' : '') +
          (master ? ' master-guide' : '') + '"' +
          (master ? ' data-action="master-help" data-hover-reason="大师球不能直接拿取；预留普通卡时才可领取。"' :
            ' data-token="' + color + '"' + unavailableAttrs(oneReason)) +
          ' aria-label="' + esc(E.COLOR_NAMES[color]) + (master ? '：预留普通卡时自动获得，点击查看用法' : '，剩余 ' + state.bank[color] + ' 枚') + '" title="' + esc(oneReason || help) + '">' +
          colorBall(color) + '<span>' + esc(E.COLOR_NAMES[color]) + '<br><small>' +
          (master ? '预留卡领取 · 剩余 ' : '剩余 ') + state.bank[color] + '</small></span></button>' +
          (master ? '<span class="token-choice-note">预留普通卡领取</span>' :
            '<button class="double-token-button' + (selected.length === 2 && selected[0] === color && selected[1] === color ? ' selected' : '') +
            '" data-token-double="' + color + '"' + unavailableAttrs(doubleReason) +
            ' aria-label="拿 2 枚' + esc(E.COLOR_NAMES[color]) + '">拿 2 枚同色</button>') + '</div>';
      }).join('') + '</div></section>';
  }
  function renderMarket() {
    const rows = E.TIERS.map(tier => {
      const normal = ['stage1', 'stage2', 'stage3'].includes(tier);
      const allCards = state.display[tier].map((id, index) => tile(id, { zone: 'display', tier, index })).join('');
      const deckReason = actionBlockReason() || (!normal ? '稀有和传说牌堆不能暗抽预留。' :
        player().reserved.length >= 3 ? '已经预留 3 张卡，达到上限。' :
          !state.decks[tier].length ? '这叠牌已经抽完，不能暗抽预留。' : '');
      const deck = '<div class="deck-stack"><button class="deck-button" data-deck="' + tier + '"' + unavailableAttrs(deckReason) +
        ' aria-label="' + (normal ? '从' + TIER_NAME[tier] + '牌堆暗抽并预留' : TIER_NAME[tier] + '牌堆不可预留') +
        '" title="' + esc(deckReason || (normal ? '从牌堆暗抽并预留' : '特殊卡不可预留')) + '"><span aria-hidden="true">' +
        (normal ? '?' : '★') + '</span></button>' +
        '<span class="deck-count">剩余 ' + state.decks[tier].length + '</span></div>';
      const tierMark = normal ? '0' + (E.TIERS.indexOf(tier) + 1) : tier === 'rare' ? '✦' : '★';
      return '<div class="market-row ' + tier + '"><div class="tier-label ' + tier + '"><b>' + tierMark + '</b><strong>' + TIER_NAME[tier] +
        '</strong><span>' + (normal ? '可捕捉 / 预留' : '大师球捕捉') + '</span></div><div class="card-strip">' + allCards + '</div>' + deck + '</div>';
    });
    return '<section class="market"><div class="section-head"><div><div class="panel-eyebrow">WILD ENCOUNTERS</div><h2>野外宝可梦</h2></div><span class="tiny"><span class="legend-dot"></span> 绿色可捕捉 · <span class="legend-dot free"></span> 蓝色免费捕捉</span></div>' +
      '<div class="market-grid"><div class="tier-column">' + rows.slice(0, 3).join('') + '</div>' +
      '<div class="special-column"><div class="special-head">特别邂逅 <span>MASTER BALL</span></div>' + rows.slice(3).join('') + '</div></div></section>';
  }
  function canTakeSelection() {
    if (!state || state.phase !== 'action' || !selected.length) return false;
    const available = E.COLORS.filter(color => state.bank[color] > 0).length;
    if (selected.length === 2 && selected[0] === selected[1]) return state.bank[selected[0]] >= 4;
    return new Set(selected).size === selected.length &&
      selected.length === Math.min(3, available) && selected.every(color => state.bank[color] > 0);
  }
  function renderAction() {
    if (state.phase === 'gameover') return '<section class="action-panel"><div class="action-copy"><strong>对局结束</strong><span>查看排行榜或开启新对局。</span></div><button class="primary-button" data-action="results">查看结果</button></section>';
    if (Room.active && !Room.canAct) return '<section class="action-panel"><div class="action-copy"><strong>' + esc(Room.reason) + '</strong><span>你的预留牌始终只对你可见。</span></div></section>';
    if (player().ai) return '<section class="action-panel"><div class="action-copy"><strong>电脑正在思考…</strong><span>简单 AI 会选择捕捉、收集或预留。</span></div></section>';
    if (handoff) return '<section class="action-panel"><div class="action-copy"><strong>等待 ' + esc(player().name) + ' 接手</strong></div></section>';
    if (state.phase === 'discard') return '<section class="action-panel"><div class="action-copy"><strong>精灵球超过 10 枚</strong><span>点击右侧自己持有的精灵球，归还至剩余 10 枚。</span></div></section>';
    if (state.phase === 'evolve') return '<section class="action-panel"><div class="action-copy"><strong>进化机会</strong><span>选择一张宝可梦进化，或跳过。</span></div></section>';
    const colorsAvailable = E.COLORS.filter(color => state.bank[color] > 0).length;
    const targetCount = Math.min(3, colorsAvailable);
    const samePair = selected.length === 2 && selected[0] === selected[1];
    const selectionLabel = samePair ? '已选两枚同色' : selected.length ? '已选 ' + selected.length + ' / ' + targetCount + ' 种颜色' : '尚未选球';
    const takeReason = takeSelectionReason();
    return '<section class="action-panel"><div class="action-copy"><strong>轮到 ' + esc(player().name) + ' 行动</strong>' +
      '<span>可拿 ' + targetCount + ' 枚不同色；要拿 2 枚同色，点该球下方的“拿 2 枚同色”（库存须至少 4 枚）。也可捕捉或预留。</span></div>' +
      '<div class="selected-balls">' + (selected.length ? selected.map(color => colorBall(color, 'small')).join('') : '') +
      '<span class="chip">' + selectionLabel + '</span></div>' +
      '<button class="primary-button" data-action="take"' + unavailableAttrs(takeReason) + '>确认拿取</button>' +
      '<button class="soft-button" data-action="clear-selection">清空</button></section>';
  }
  function playerPanel(item, index) {
    const active = index === (state.networkCurrent ?? state.current) && state.phase !== 'gameover';
    const viewer = index === state.current && !item.ai && !handoff;
    const bonus = E.bonuses(item, cards);
    const reserved = item.reserved.length ? item.reserved.map((id, i) => viewer ?
      tile(id, { zone: 'reserved', index: i, player: index }, true) :
      '<span class="card-tile back" title="对手预留牌"></span>').join('') : '<span class="empty-note">暂无</span>';
    const owned = item.owned.length ? item.owned.map((id, i) => tile(id, { zone: 'owned', index: i, player: index }, true)).join('') :
      '<span class="empty-note">暂无</span>';
    const clickableWallet = active && humanTurn() && state.phase === 'discard';
    const points = E.score(item, cards);
    return '<div data-motion-player="' + index + '" class="player-card' + (active ? ' active' : '') + '"><div class="player-top"><div class="trainer-identity"><span class="trainer-avatar p' +
      index + '">' + (index + 1) + '</span><div><div class="player-name">' + esc(item.name) + '</div><div class="player-kind">' +
      (item.ai ? '电脑 · 简单' : '真人') + (active ? ' · 当前回合' : '') + '</div></div></div><div class="score">' +
      points + '<small> / 18</small></div></div><div class="score-track"><span style="width:' + Math.min(100, points / 18 * 100) + '%"></span></div>' +
      '<div class="mini-info"><span>宝可梦 <b>' + item.owned.length + '</b></span><span>进化 <b>' + item.evolved.length +
      '</b></span><span>图鉴 <b>' + item.pokedex.length + '</b></span><span>预留 <b>' + item.reserved.length + '/3</b></span></div>' +
      '<div class="resource-label">永久加成</div><div class="bonus-row" title="永久加成">' + E.COLORS.map(color => '<span class="bonus-piece">' + colorBall(color, 'mini') + bonus[color] + '</span>').join('') + '</div>' +
      '<div class="resource-label">随身精灵球</div><div class="wallet-row" title="持有的精灵球">' + E.ALL_COLORS.map(color => {
        const content = colorBall(color, 'mini') + item.tokens[color];
        return clickableWallet && item.tokens[color] > 0 ?
          '<button data-motion-key="wallet:' + index + ':' + color + '" class="wallet-piece" data-discard="' + color + '" title="归还一枚 ' + esc(E.COLOR_NAMES[color]) + '">' + content + '</button>' :
          '<span data-motion-key="wallet:' + index + ':' + color + '" class="wallet-piece">' + content + '</span>';
      }).join('') + '</div>' +
      (active || viewer ? '<div class="side-section"><h3>已捕捉</h3><div class="thumb-row">' + owned +
        '</div><h3>预留牌</h3><div class="thumb-row">' + reserved + '</div>' +
        '<div class="side-button-row">' +
        (viewer ? '<button class="soft-button" data-roster="' + index + '">展开队伍</button>' : '') +
        '<button class="soft-button" data-pokedex="' + index + '">查看图鉴</button></div></div>' : '') + '</div>';
  }
  function renderGame() {
    screen = 'game';
    app.innerHTML = '<main class="app-shell"><header class="topbar"><div class="brand"><span class="brand-icon"></span>' +
      '<div><div class="brand-title">璀璨宝石：宝可梦</div><div class="brand-sub">POKÉMON SPLENDOR</div></div></div>' +
      '<div class="top-actions"><span class="status-pill"><em>TURN ' + state.turn + '</em> ' + (state.finalRound ? '最后一轮' : esc(state.players[state.networkCurrent ?? state.current].name) + ' 的回合') + '</span>' +
      '<button class="soft-button" data-action="rules">规则</button><button class="soft-button" data-action="save">保存</button>' +
      '<button class="soft-button" data-action="menu">主菜单</button><button class="soft-button" data-action="hub">桌游中心</button></div></header>' +
      '<div class="game-layout"><div class="board">' + renderBank() + renderMarket() + renderAction() + '</div>' +
      '<aside class="side-panel"><div class="panel-eyebrow">TRAINER ROSTER</div><h2 class="side-title">训练家席位</h2>' +
      state.players.map(playerPanel).join('') +
      '<div class="sidebar-rule"></div><div class="side-section"><h3>对局记录</h3><div class="history">' +
      state.history.slice(-10).reverse().map(line => '<div>' + esc(line) + '</div>').join('') +
      '</div></div></aside></div></main>';
    renderOverlay();
  }
  function modal(content, cls) {
    return '<div class="overlay" role="dialog" aria-modal="true"><div class="modal ' + (cls || '') + '">' + content + '</div></div>';
  }
  function getDetailCard() {
    if (!detail || !state) return null;
    if (detail.zone === 'display') return card(state.display[detail.tier]?.[detail.index]);
    if (detail.zone === 'reserved' || detail.zone === 'owned') return card(state.players[detail.player]?.[detail.zone]?.[detail.index]);
    return null;
  }
  function initPayment(item) {
    const auto = E.autoPayment(player(), item, cards);
    const req = E.requiredPayment(player(), item, cards);
    payment = auto || Object.fromEntries(E.COLORS.map(color => [color, Math.min(req.need[color], player().tokens[color])]));
    payment = { ...payment };
    recomputePurple(item);
  }
  function recomputePurple(item) {
    const req = E.requiredPayment(player(), item, cards);
    payment.purple = req.fixedMaster + E.COLORS.reduce((sum, color) => sum + req.need[color] - (payment[color] || 0), 0);
  }
  function renderPaymentBreakdown(item, req, canBuy) {
    const bonus = E.bonuses(player(), cards);
    const cardPrice = E.ALL_COLORS.reduce((sum, color) => sum + (item.cost[color] || 0), 0);
    const permanentDiscount = E.COLORS.reduce((sum, color) =>
      sum + Math.min(item.cost[color] || 0, bonus[color]), 0);
    const regularPaid = E.COLORS.reduce((sum, color) => sum + (payment[color] || 0), 0);
    const freeCapture = canBuy && regularPaid + payment.purple === 0;
    const rows = E.COLORS.filter(color => item.cost[color]).map(color => {
      const price = item.cost[color];
      const discount = Math.min(price, bonus[color]);
      const fromWallet = payment[color] || 0;
      const fromMaster = req.need[color] - fromWallet;
      const limit = Math.min(req.need[color], player().tokens[color]);
      return '<div class="payment-item" data-payment-row="' + color + '">' +
        '<div class="payment-item-head">' + colorBall(color, 'mini') + '<strong>' + esc(E.COLOR_NAMES[color]) +
        '</strong><small>卡价 ' + price + '</small></div>' +
        '<div class="payment-item-parts"><span class="payment-permanent">永久抵 ' + discount + '</span>' +
        '<span>随身付 ' + fromWallet + '</span>' +
        (fromMaster ? '<span class="payment-master-fill">大师补 ' + fromMaster + '</span>' : '') + '</div>' +
        (req.need[color] ? '<div class="payment-stepper"><span>调整随身支付</span><div class="stepper">' +
          '<button data-pay-color="' + color + '" data-pay-delta="-1"' + (fromWallet <= 0 ? ' disabled' : '') + '>−</button>' +
          '<b>' + fromWallet + '</b><button data-pay-color="' + color + '" data-pay-delta="1"' + (fromWallet >= limit ? ' disabled' : '') +
          '>+</button></div></div>' : '') + '</div>';
    }).join('');
    return '<div class="payment-breakdown"><div class="payment-overview">' +
      '<div><span>卡牌原价</span><b>' + cardPrice + ' 枚</b></div>' +
      '<div class="payment-overview-permanent"><span>永久加成抵扣</span><b>−' + permanentDiscount + ' 枚</b></div>' +
      '<div><span>随身普通球支付</span><b>' + regularPaid + ' 枚</b></div>' +
      '<div><span>随身大师球支付</span><b>' + payment.purple + ' 枚</b></div></div>' +
      '<p class="payment-explain">永久加成只抵扣费用，不会消耗；只有“随身支付”的球会交回补给站。</p>' +
      '<div class="payment-grid">' + rows + '</div>' +
      (req.fixedMaster ? '<div class="payment-fixed-master">这张卡另有固定大师球成本 ' + req.fixedMaster + ' 枚，不能用永久加成抵扣。</div>' : '') +
      '<div class="payment-total">大师球需付 ' + payment.purple + ' / 持有 ' + player().tokens.purple +
      (canBuy ? '' : ' · 数量不足') + '</div>' +
      (freeCapture ? '<div class="payment-free-note">永久加成已覆盖全部费用，本次无需支付随身精灵球。</div>' : '') +
      '<p class="hint">点击“−”可把一种普通球的随身支付改为大师球。' +
      '<button class="inline-help" data-action="master-help">如何获得大师球？</button></p></div>';
  }
  function renderCardDetail() {
    const item = getDetailCard();
    if (!item) { detail = null; return ''; }
    const actionable = humanTurn() && state.phase === 'action' &&
      (detail.zone === 'display' || (detail.zone === 'reserved' && detail.player === state.current));
    if (actionable && !payment) initPayment(item);
    const req = actionable ? E.requiredPayment(player(), item, cards) : null;
    const canBuy = actionable && payment && payment.purple <= player().tokens.purple;
    const canReserve = actionable && detail.zone === 'display' &&
      ['stage1', 'stage2', 'stage3'].includes(item.tier) && player().reserved.length < 3;
    const freeCapture = canBuy && E.ALL_COLORS.every(color => (payment[color] || 0) === 0);
    const buyReason = canBuy ? '' : actionable ?
      '当前支付方案需要 ' + payment.purple + ' 枚大师球，持有 ' + player().tokens.purple +
      ' 枚；可点普通球旁的“+”减少大师球消耗，或之后再捕捉。' : captureReason(item);
    const reserveBlock = canReserve ? '' : detail.zone !== 'display' ? '自己的预留牌已经预留过，不能再次预留。' : reserveReason(item);
    const paymentUI = actionable ? renderPaymentBreakdown(item, req, canBuy) : '';
    return modal('<button class="modal-close" data-action="close-detail" aria-label="关闭">×</button>' +
      '<div class="card-detail"><img src="' + esc(item.img) + '" alt="' + esc(item.name) + ' 卡牌">' +
      '<div><div class="detail-name">' + esc(item.name) + '</div><div class="detail-stat">' + TIER_NAME[item.tier] +
      ' · ' + item.vp + ' 分 · ' + esc(E.COLOR_NAMES[item.bonus]) + ' 永久加成 +' + item.bonusCount + '</div>' +
      (item.evolvesTo ? '<p class="hint">可进化为 ' + esc(item.evolvesTo) + '。进化时需要' +
        esc(E.COLOR_NAMES[item.evoCost.color]) + ' 永久加成达到 ' + item.evoCost.count + '。</p>' : '') +
      (item.cost.purple ? '<p class="hint">这张特殊卡需要支付大师球。</p>' : '') +
      paymentUI + '<div class="modal-actions">' +
      (actionable ? '<button class="soft-button" data-action="reserve"' + unavailableAttrs(reserveBlock) + '>预留</button>' +
        '<button class="primary-button' + (freeCapture ? ' free-capture' : '') + '" data-action="buy"' +
        unavailableAttrs(buyReason) + '>' + (freeCapture ? '免费捕捉' : '捕捉') + '</button>' : '') +
      '<button class="soft-button" data-action="close-detail">关闭</button></div></div></div>');
  }
  function renderRules() {
    return modal('<button class="modal-close" data-action="close-rules" aria-label="关闭">×</button><h2>玩法速览</h2>' +
      '<div class="rules-grid"><section><h3>目标</h3><p>收集宝可梦积分。有人回合结束达到 18 分后，完成当前轮，让每位玩家行动次数相同。分高者获胜；同分比较进化次数，再比较当前捕捉的卡牌数。</p></section>' +
      '<section><h3>每回合选一个主行动</h3><p>拿 3 枚不同色普通球；或在供应区至少有 4 枚时拿 2 枚同色普通球；或预留普通宝可梦并从供应区领取 1 枚大师球；或支付成本捕捉一张展示或已预留的卡。大师球不能直接拿取。</p></section>' +
      '<section><h3>捕捉与进化</h3><p>已捕捉宝可梦给出永久颜色加成，抵扣捕捉费用但不会消耗。蓝色光环代表本次无需交出随身球。大师球可代替任意普通颜色；特殊卡印出的“大师球”成本必须用大师球。行动后若满足进化条件，可从展示区或自己的预留牌进化最多一次。</p></section>' +
      '<section><h3>限制与操作</h3><p>每人最多预留 3 张；回合结束最多持有 10 枚球。进化前的卡收在进化记录中，不再提供分数和加成。点击球选不同色；拿两枚同色请点球下方的“拿 2 枚同色”。点击卡查看支付与捕捉，点击普通牌堆可暗抽预留。</p></section></div>' +
      '<p class="hint">玩法依据公开的宝可梦版规则整理；卡牌文字与数值以界面卡图为准。</p><div class="modal-actions"><button class="primary-button" data-action="close-rules">明白了</button></div>');
  }
  function renderMasterHelp() {
    return modal('<button class="modal-close" data-action="close-master-help" aria-label="关闭">×</button>' +
      '<div class="panel-eyebrow">MASTER BALL GUIDE</div><h2>大师球怎么拿、怎么用？</h2>' +
      '<p><strong>不能直接拿取。</strong>在你的回合点击初阶、进阶或高阶卡牌选择“预留”，也可以点击这三个牌堆的卡背暗抽预留。' +
      '如果补给站还有大师球，预留成功时会自动领取 1 枚。</p>' +
      '<p>捕捉宝可梦时，大师球会自动补足缺少的普通球。打开卡牌支付面板后，点击某种普通球旁的“−”，还可以改用大师球支付。' +
      '稀有和传说卡印出的固定大师球成本，必须实际支付大师球。</p>' +
      '<div class="modal-actions"><button class="primary-button" data-action="close-master-help">明白了</button></div>',
      'narrow master-help-modal');
  }
  function renderEvolution() {
    const options = E.evolutionOptions(state, cards);
    if (!options.length || !humanTurn() || state.phase !== 'evolve') return '';
    return modal('<h2>选择一次进化</h2><p>进化后，旧卡将失去积分和永久加成。你也可以跳过。</p>' +
      options.map((option, index) => {
        const from = card(option.from), to = card(option.to);
        return '<div class="evo-option"><img src="' + esc(from.img) + '" alt="' + esc(from.name) + '"><span class="arrow">→</span>' +
          '<img src="' + esc(to.img) + '" alt="' + esc(to.name) + '"><div class="evo-copy"><b>' + esc(from.name) + ' → ' +
          esc(to.name) + '</b><br>' + from.vp + ' 分 → ' + to.vp + ' 分<br>' +
          esc(E.COLOR_NAMES[from.bonus]) + ' +' + from.bonusCount + ' → ' + esc(E.COLOR_NAMES[to.bonus]) + ' +' + to.bonusCount +
          '</div><button class="primary-button" data-evolve="' + index + '">进化</button></div>';
      }).join('') + '<div class="modal-actions"><button class="soft-button" data-action="skip-evolve">跳过进化</button></div>');
  }
  function renderPokedex() {
    const item = state.players[pokedexIndex];
    const totalSpecies = new Set(cards.map(entry => entry.name)).size;
    return modal('<button class="modal-close" data-action="close-pokedex" aria-label="关闭">×</button><h2>' + esc(item.name) + ' 的图鉴</h2>' +
      '<p>已登记 ' + item.pokedex.length + ' / ' + totalSpecies + ' 种宝可梦。进化后的形态也计入图鉴，记录保存在本机。</p>' +
      '<div class="pokedex-list">' + (item.pokedex.length ? item.pokedex.map(name => '<span>' + esc(name) + '</span>').join('') :
        '<span class="empty-note">尚未捕捉</span>') + '</div><div class="modal-actions"><button class="primary-button" data-action="close-pokedex">关闭</button></div>');
  }
  function renderRoster() {
    const item = state.players[rosterIndex];
    if (!item || rosterIndex !== state.current || !humanTurn()) { rosterIndex = null; return ''; }
    const owned = item.owned.map((id, index) => tile(id, { zone: 'owned', index, player: rosterIndex })).join('');
    const reserved = item.reserved.map((id, index) => tile(id, { zone: 'reserved', index, player: rosterIndex })).join('');
    const evolved = item.evolved.map(id => {
      const entry = card(id);
      return '<img class="roster-evolved" src="' + esc(entry.img) + '" alt="' + esc(entry.name) + '" title="' + esc(entry.name) + '">';
    }).join('');
    return modal('<button class="modal-close" data-action="close-roster" aria-label="关闭">×</button>' +
      '<div class="panel-eyebrow">YOUR COLLECTION</div><h2>' + esc(item.name) + ' 的队伍</h2>' +
      '<p>当前 ' + E.score(item, cards) + ' / 18 分。点击卡牌可放大查看，预留牌也可在这里捕捉。</p>' +
      '<div class="roster-section"><h3>已捕捉 <span>' + item.owned.length + ' 张</span></h3><div class="roster-grid">' +
      (owned || '<div class="empty-note">还没有捕捉宝可梦</div>') + '</div></div>' +
      '<div class="roster-section"><h3>预留牌 <span>' + item.reserved.length + ' / 3</span></h3><div class="roster-grid">' +
      (reserved || '<div class="empty-note">暂无预留牌</div>') + '</div></div>' +
      (evolved ? '<div class="roster-section"><h3>进化记录 <span>' + item.evolved.length + ' 张</span></h3><div class="roster-grid">' + evolved + '</div></div>' : '') +
      '<div class="modal-actions"><button class="primary-button" data-action="close-roster">返回棋盘</button></div>', 'roster-modal');
  }
  function renderResults() {
    const rows = E.ranking(state, cards);
    const winners = state.winners.map(index => state.players[index].name).join('、');
    return modal('<div class="champion">🏆 ' + esc(winners) + ' 获胜</div><p>本局已经结束。最终排名如下：</p>' +
      '<table class="results"><thead><tr><th>名次</th><th>训练家</th><th>积分</th><th>进化</th><th>现有宝可梦</th></tr></thead><tbody>' +
      rows.map((row, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(row.name) + '</td><td>' + row.points +
        '</td><td>' + row.evolved + '</td><td>' + row.pokemon + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="modal-actions"><button class="soft-button" data-action="close-results">查看棋盘</button>' +
      '<button class="primary-button" data-action="menu">再来一局</button></div>');
  }
  function renderOverlay() {
    hideReasonTooltip();
    if (screen !== 'game') { overlayRoot.innerHTML = ''; return; }
    if (handoff && state.phase !== 'gameover') {
      overlayRoot.innerHTML = modal('<div class="eyebrow">下一位训练家</div><h2>轮到 ' + (state.current + 1) + 'P · ' + esc(player().name) + ' 操作</h2><p>请由第 ' + (state.current + 1) + ' 席的 ' + esc(player().name) + ' 接手设备。确认后显示你的预留卡牌，开始本回合。</p>' +
        '<div class="modal-actions"><button class="primary-button" data-action="handoff">我准备好了</button></div>', 'narrow');
      return;
    }
    if (showMasterHelp) { overlayRoot.innerHTML = renderMasterHelp(); return; }
    if (showRules) { overlayRoot.innerHTML = renderRules(); return; }
    if (pokedexIndex !== null) { overlayRoot.innerHTML = renderPokedex(); return; }
    if (rosterIndex !== null) { overlayRoot.innerHTML = renderRoster(); return; }
    if (state.phase === 'gameover' && !gameoverDismissed) { overlayRoot.innerHTML = renderResults(); return; }
    if (detail) { overlayRoot.innerHTML = renderCardDetail(); return; }
    if (state.phase === 'evolve') { overlayRoot.innerHTML = renderEvolution(); return; }
    overlayRoot.innerHTML = '';
  }
  function render() {
    hideReasonTooltip();
    if (screen === 'setup' || !state) renderSetup(); else renderGame();
  }
  function afterTurn(oldIndex) {
    selected = [];
    detail = null;
    rosterIndex = null;
    showMasterHelp = false;
    payment = null;
    save();
    handoff = state.phase !== 'gameover' && !player().ai && oldIndex !== state.current && hasMultipleHumans();
    render();
    scheduleAI();
  }
  function afterHumanAction() {
    if (Room.active) { selected = []; detail = null; payment = null; render(); return; }
    save();
    if (state.phase === 'evolve' && E.evolutionOptions(state, cards).length === 0) {
      const old = state.current;
      E.finishTurn(state, cards);
      afterTurn(old);
      return;
    }
    render();
  }
  function scheduleAI() {
    clearTimeout(aiTimer);
    if (Room.active) return;
    if (screen !== 'game' || !state || state.phase === 'gameover' || !player().ai) return;
    aiTimer = setTimeout(() => guard(() => {
      const old = state.current;
      AI.takeTurn(state, cards);
      afterTurn(old);
    }), BoardMotion.aiDelay());
  }
  function openDetail(zone, tier, index, playerIndex) {
    if (handoff) return;
    rosterIndex = null;
    detail = { zone, tier, index, player: playerIndex };
    payment = null;
    renderOverlay();
  }
  function selectedSource() {
    return { zone: detail.zone, tier: detail.tier, index: detail.index };
  }
  function startNewGame() {
    syncSetupSeats();
    const seats = setupSeats.slice(0, setupCount).map((seat, index) => ({
      name: seat.name.trim() || defaultSeatName(index, seat.ai), ai: seat.ai
    }));
    state = E.newGame(cards, seats, Date.now());
    for (const item of state.players) {
      item.pokedex = [...new Set(collections[item.name] || [])].filter(name => cards.some(entry => entry.name === name));
    }
    screen = 'game';
    handoff = false;
    showMasterHelp = false;
    selected = [];
    detail = null;
    rosterIndex = null;
    gameoverDismissed = false;
    save();
    render();
    scheduleAI();
  }
  function onAction(action) {
    if (action === 'hub') {
      clearTimeout(aiTimer);
      if (state) save();
      window.location.assign('index.html');
      return;
    }
    if (action === 'start') return startNewGame();
    if (action === 'continue') {
      if (!savedState) return;
      state = JSON.parse(JSON.stringify(savedState));
      screen = 'game';
      handoff = !player().ai && state.phase !== 'gameover' && hasMultipleHumans();
      selected = [];
      detail = null;
      rosterIndex = null;
      showMasterHelp = false;
      gameoverDismissed = false;
      render();
      scheduleAI();
      return;
    }
    if (action === 'menu') {
      clearTimeout(aiTimer);
      screen = 'setup';
      state = null;
      handoff = false;
      showRules = false;
      showMasterHelp = false;
      pokedexIndex = null;
      rosterIndex = null;
      detail = null;
      render();
      return;
    }
    if (action === 'rules') { showRules = true; renderOverlay(); return; }
    if (action === 'close-rules') { showRules = false; renderOverlay(); return; }
    if (action === 'master-help') { showMasterHelp = true; renderOverlay(); return; }
    if (action === 'close-master-help') { showMasterHelp = false; renderOverlay(); return; }
    if (action === 'save') { if (save()) notifyInfo('对局已保存到本机'); return; }
    if (action === 'clear-selection') { selected = []; render(); return; }
    if (action === 'take') {
      if (!humanTurn() || !canTakeSelection()) return;
      E.perform(state, cards, { type: 'take', colors: [...selected] });
      selected = [];
      afterHumanAction();
      return;
    }
    if (action === 'close-detail') { detail = null; payment = null; renderOverlay(); return; }
    if (action === 'reserve' || action === 'buy') {
      if (!humanTurn() || state.phase !== 'action' || !detail) return;
      const actor = state.current;
      const masterBefore = state.players[actor].tokens.purple;
      const source = selectedSource();
      if (action === 'buy') E.perform(state, cards, { type: 'buy', source, payment: { ...payment } });
      else E.perform(state, cards, { type: 'reserve', source });
      detail = null;
      payment = null;
      afterHumanAction();
      if (action === 'reserve') notifyInfo(state.players[actor].tokens.purple > masterBefore ?
        '预留成功，获得 1 枚大师球；捕捉时可用于支付。' : '预留成功；补给站已无大师球。');
      return;
    }
    if (action === 'skip-evolve') {
      if (!humanTurn() || state.phase !== 'evolve') return;
      const old = state.current;
      E.finishTurn(state, cards);
      afterTurn(old);
      return;
    }
    if (action === 'handoff') { handoff = false; render(); return; }
    if (action === 'close-pokedex') { pokedexIndex = null; renderOverlay(); return; }
    if (action === 'close-roster') { rosterIndex = null; renderOverlay(); return; }
    if (action === 'close-results') { gameoverDismissed = true; renderOverlay(); return; }
    if (action === 'results') { gameoverDismissed = false; renderOverlay(); }
  }
  function onToken(color) {
    if (!humanTurn() || state.phase !== 'action' || !E.COLORS.includes(color) || state.bank[color] <= 0) return;
    if (selected.length === 1 && selected[0] === color && state.bank[color] >= 4) selected = [color, color];
    else if (selected.length === 1 && selected[0] === color) {
      notifyInfo('要拿两枚同色，补给站须先有至少 4 枚' + E.COLOR_NAMES[color] + '；当前仅剩 ' + state.bank[color] + ' 枚。');
      return;
    }
    else if (selected.includes(color)) selected = selected.filter(item => item !== color);
    else if (selected.length === 2 && selected[0] === selected[1]) selected = [color];
    else if (selected.length < 3) selected.push(color);
    else selected = [color];
    render();
  }
  function onDoubleToken(color) {
    if (!humanTurn() || state.phase !== 'action' || !E.COLORS.includes(color) || state.bank[color] < 4) return;
    selected = [color, color];
    render();
  }
  document.addEventListener('click', event => guard(() => {
    const target = event.target.closest('button');
    if (!target || target.disabled) return;
    if (target.dataset.unavailableReason) { notifyInfo(target.dataset.unavailableReason); return; }
    if (target.dataset.action) return onAction(target.dataset.action);
    if (target.dataset.tokenDouble) return onDoubleToken(target.dataset.tokenDouble);
    if (target.dataset.token) return onToken(target.dataset.token);
    if (target.dataset.cardZone) return openDetail(target.dataset.cardZone, target.dataset.cardTier,
      Number(target.dataset.cardIndex), target.dataset.cardPlayer === undefined ? undefined : Number(target.dataset.cardPlayer));
    if (target.dataset.deck) {
      if (!humanTurn() || state.phase !== 'action') return;
      const actor = state.current;
      const masterBefore = state.players[actor].tokens.purple;
      E.perform(state, cards, { type: 'reserve', source: { zone: 'deck', tier: target.dataset.deck } });
      afterHumanAction();
      if (!Room.active) notifyInfo(state.players[actor].tokens.purple > masterBefore ?
        '预留成功，获得 1 枚大师球；捕捉时可用于支付。' : '预留成功；补给站已无大师球。');
      return;
    }
    if (target.dataset.discard) {
      if (!humanTurn() || state.phase !== 'discard') return;
      E.discardToken(state, target.dataset.discard);
      afterHumanAction();
      return;
    }
    if (target.dataset.payColor) {
      const item = getDetailCard();
      const color = target.dataset.payColor;
      const req = E.requiredPayment(player(), item, cards);
      payment[color] = Math.max(0, Math.min(Math.min(req.need[color], player().tokens[color]),
        payment[color] + Number(target.dataset.payDelta)));
      recomputePurple(item);
      renderOverlay();
      return;
    }
    if (target.dataset.evolve !== undefined) {
      if (!humanTurn() || state.phase !== 'evolve') return;
      const options = E.evolutionOptions(state, cards);
      const choice = options[Number(target.dataset.evolve)];
      if (!choice) return;
      E.evolve(state, cards, choice);
      const old = state.current;
      E.finishTurn(state, cards);
      afterTurn(old);
      return;
    }
    if (target.dataset.pokedex !== undefined) { pokedexIndex = Number(target.dataset.pokedex); renderOverlay(); return; }
    if (target.dataset.roster !== undefined && humanTurn() && Number(target.dataset.roster) === state.current) {
      rosterIndex = state.current;
      renderOverlay();
    }
  }));
  document.addEventListener('mouseover', event => {
    const target = event.target.closest?.('[data-unavailable-reason],[data-hover-reason]');
    if (target) showReasonTooltip(target);
  });
  document.addEventListener('mouseout', event => {
    const target = event.target.closest?.('[data-unavailable-reason],[data-hover-reason]');
    if (target && !target.contains(event.relatedTarget)) hideReasonTooltip();
  });
  document.addEventListener('focusin', event => showReasonTooltip(event.target.closest?.('[data-unavailable-reason],[data-hover-reason]')));
  document.addEventListener('focusout', event => {
    if (event.target.closest?.('[data-unavailable-reason],[data-hover-reason]')) hideReasonTooltip();
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-seat-name]')) return;
    const seat = setupSeats[Number(event.target.dataset.seatName)];
    if (!seat) return;
    seat.name = event.target.value;
    seat.customName = true;
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-seat-ai]')) {
      syncSetupSeats();
      return;
    }
    if (event.target.matches('[data-setup-count]')) {
      syncSetupSeats();
      setupCount = Number(event.target.value);
      render();
    }
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && detail) { detail = null; payment = null; renderOverlay(); }
    else if (event.key === 'Escape' && rosterIndex !== null) { rosterIndex = null; renderOverlay(); }
  });
  if (!Room.active) loadSave();
  if (!E || !AI || !Array.isArray(cards)) {
    app.textContent = '游戏数据未完整加载，请重新打开游戏。';
    return;
  }
  if (Room.active) Room.connect({ game: 'pokemon', root: 'app', getState: () => state, setState: value => {
    state = value; screen = 'game'; handoff = false; selected = []; detail = null; payment = null; rosterIndex = null;
  }, render });
  else { render(); if (new URLSearchParams(window.location.search).get('continue') === '1' && savedState) onAction('continue'); }
})();
