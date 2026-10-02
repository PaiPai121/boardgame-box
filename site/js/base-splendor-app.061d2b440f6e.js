(function () {
  'use strict';
  const BoardMotion = window.BoardMotion || { watch() {}, aiDelay: () => 360, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  let E = window.BaseSplendorEngine;
  const root = document.getElementById('base-splendor'), overlay = document.getElementById('b-overlay');
  const KEY = 'boardgame-box-splendor-classic-v1';
  const NAME = { white: '钻石', blue: '蓝宝石', green: '祖母绿', red: '红宝石', black: '缟玛瑙', gold: '黄金' };
  const IMAGE = { white: 'diamond', blue: 'sapphire', green: 'emerald', red: 'ruby', black: 'onyx', gold: 'gold' };
  const AI_NAMES = ['洛伦佐', '伊莎贝拉', '亨利', '凯瑟琳'];
  const seats = Array.from({ length: 4 }, (_, i) => ({ name: i ? AI_NAMES[i - 1] + '（简单）' : '玩家', ai: Boolean(i), custom: false }));
  let count = 2, state = null, saved = null, screen = 'setup', modal = null, handoff = false;
  let selected = [], timer, toastTimer, aiError = '', started = Date.now();
  const tip = document.createElement('div'); tip.className = 'b-tooltip'; tip.hidden = true; tip.id = 'b-tooltip';
  tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
  let anchor = null, pinned = false;
  E = BoardMotion.watch({ game: 'splendor', engine: E, state: () => state, methods: ['play'] }) || E;
  E = Room.wrap(E, 'splendor');
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const player = () => state.players[state.current];
  const gem = color => '<img class="b-gem" src="assets/base-splendor/gems/' + IMAGE[color] + '.png" alt="' + NAME[color] + '">';
  const help = text => ' data-b-tip="' + esc(text) + '" tabindex="0" aria-label="' + esc(text) + '"';
  function button(label, attr, reason = '', primary = false) {
    return '<button class="' + (primary ? 'b-primary ' : '') + (reason ? 'b-unavailable' : '') + '" ' + attr +
      (reason ? ' aria-disabled="true" data-reason="' + esc(reason) + '" title="' + esc(reason) + '"' : '') + '>' + label + '</button>';
  }
  function toast(text) {
    let node = document.querySelector('.b-toast');
    if (!node) { node = document.createElement('div'); node.className = 'b-toast'; document.body.appendChild(node); }
    node.textContent = text; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.hidden = true, 3300);
  }
  function save() {
    if (Room.active) return;
    E.validate(state); localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem('boardgame-box-last-played', 'splendor-classic'); saved = structuredClone(state);
  }
  try { const value = JSON.parse(localStorage.getItem(KEY)); if (value) { E.validate(value); saved = value; } }
  catch (error) { console.warn('原版璀璨宝石存档无法读取', error); }
  function header() {
    return '<header class="b-top"><a href="index.html">← 桌游中心</a><div class="b-brand">璀璨宝石<small>宝石商会 · 原版基础游戏</small></div><div class="b-top-actions">' +
      button('规则与符号', 'data-action="rules"') + button('保存', 'data-action="save"', state ? '' : '开始对局后可以保存') + button('新对局', 'data-action="menu"') + '</div></header>';
  }
  function setup() {
    root.innerHTML = header() + '<main class="b-setup"><div class="b-setup-layout"><section class="b-setup-hero"><div class="b-eyebrow">文艺复兴的宝石商会</div><h1>璀璨宝石<br><em>从矿场到荣耀</em></h1><p>采集宝石，投资矿场，吸引贵族来访。让每一张发展卡成为你的永久财富，在这场商会竞逐中赢得声望。</p><p class="b-small">2–4 人 · 约 30 分钟 · 一档简单电脑</p><div class="b-hero-art">' +
      ['green-L1-01', 'blue-L2-01', 'white-L3-01'].map(id => '<img src="assets/base-splendor/cards/' + id + '.webp" alt="原版发展卡">').join('') + '</div></section>' +
      '<section class="b-setup-panel"><div class="b-eyebrow">新的商会之旅</div><h2>创建对局</h2><div class="b-count"><label for="b-count">参与人数</label><select id="b-count" data-count>' + [2, 3, 4].map(n => '<option value="' + n + '"' + (n === count ? ' selected' : '') + '>' + n + ' 人</option>').join('') + '</select></div>' +
      seats.slice(0, count).map((seat, i) => '<div class="b-seat"><strong>' + (i + 1) + 'P</strong><input data-name="' + i + '" aria-label="玩家 ' + (i + 1) + ' 名称" maxlength="20" value="' + esc(seat.name) + '"><select data-ai="' + i + '" aria-label="玩家 ' + (i + 1) + ' 类型"><option value="human"' + (!seat.ai ? ' selected' : '') + '>真人</option><option value="ai"' + (seat.ai ? ' selected' : '') + '>电脑 · 简单</option></select></div>').join('') +
      '<div class="b-setup-actions">' + button('开启商会 →', 'data-action="start"', '', true) + (saved ? button('继续上次对局', 'data-action="continue"') : '') + '</div><p class="b-small">可以混合真人与电脑。多位真人轮流接手设备，对局自动保存在当前设备。</p></section></div></main>';
  }
  function playerTile(p, index) {
    const bonus = E.bonuses(p);
    return '<article data-motion-player="' + index + '" class="b-player' + (index === (state.networkCurrent ?? state.current) ? ' active' : '') + '"><div class="b-player-head"><b>' + (index + 1) + 'P · ' + esc(p.name) + '</b><span>' + E.score(p) + ' 分</span></div><div class="b-wallet">' +
      E.TOKENS.map(c => '<div data-motion-key="wallet:' + index + ':' + c + '"' + help(NAME[c] + '：随身 ' + p.tokens[c] + ' 枚' + (c === 'gold' ? '。黄金可代替任意颜色的筹码，只能通过预留获得。' : '，永久加成 ' + bonus[c] + ' 点。加成每次购买均可抵扣，不会消耗。')) + '>' + gem(c) + '<strong>' + p.tokens[c] + '</strong><small>' + (c === 'gold' ? '百搭' : '永久 ' + bonus[c]) + '</small></div>').join('') +
      '</div><div class="b-player-summary">发展卡 ' + p.owned.length + ' · 预留 ' + p.reserved.length + '/3 · 贵族 ' + p.nobles.length + ' · 筹码 ' + E.sum(p.tokens) + '/10</div></article>';
  }
  function nobleTile(id) {
    const n = E.NOBLE.get(id), ready = E.eligibleNobles(state, state.current).includes(id);
    const text = '贵族来访：永久加成达到' + Object.entries(n.cost).map(([c, num]) => NAME[c] + num).join('、') + '，回合结束可获得 3 分。不消耗任何加成或筹码；每回合最多来访一位。';
    return '<div data-motion-key="noble:' + id + '" class="b-noble' + (ready ? ' ready' : '') + '"' + help(text) + '><img src="assets/base-splendor/nobles/' + id + '.jpg" alt="贵族牌"><div><strong>' + (ready ? '可来访 · ' : '') + '+3 声望</strong><div class="b-requirements">' + Object.entries(n.cost).map(([c, num]) => '<span>' + gem(c) + num + '</span>').join('') + '</div></div></div>';
  }
  function activeReason() { return Room.active && !Room.canAct ? Room.reason : state.phase !== 'action' ? '请先完成当前回合的归还或贵族选择' : player().ai ? '现在轮到电脑行动' : handoff ? '请先由当前玩家确认交接' : ''; }
  function cardTile(id, reserved = false) {
    const q = E.quote(state, state.current, id), card = E.CARD.get(id), reason = activeReason();
    const label = q.free ? '永久加成全额抵扣' : q.valid ? '永久抵扣 ' + q.bonusTotal + ' · 筹码支付 ' + q.tokenTotal : '永久抵扣 ' + q.bonusTotal + ' · 随身筹码不足';
    return '<article class="b-card' + (q.free ? ' b-card-free' : q.valid ? ' b-card-affordable' : '') + '" data-motion-key="card:' + id + '" data-card="' + id + '">' +
      (q.free ? '<span class="b-card-badge">零筹码购买</span>' : '') + '<button class="b-card-art" data-art="' + id + '" aria-label="查看' + NAME[card.bonus] + '发展卡完整牌面"><img src="assets/base-splendor/cards/' + id + '.webp" alt="' + card.level + '级' + NAME[card.bonus] + '发展卡，' + card.points + '分" loading="lazy"></button><div class="b-card-buttons"><div class="b-card-label">' + label + '</div>' +
      '<button class="b-buy' + (reason || !q.valid ? ' b-unavailable' : '') + '" data-buy="' + id + '"' + (reason || !q.valid ? ' data-reason="' + esc(reason || q.reason) + '" aria-disabled="true" title="' + esc(reason || q.reason) + '"' : '') + '>' + (q.free ? '免费购买 · 永久加成' : '购买 · ' + q.tokenTotal + ' 枚筹码') + '</button>' +
      (!reserved ? button('预留' + (state.bank.gold ? ' · +1 黄金' : ' · 无黄金'), 'data-reserve="' + id + '"', reason || (player().reserved.length >= 3 ? '最多预留 3 张牌，先购买预留牌后才能继续预留' : '')) : '') + '</div></article>';
  }
  function bankPanel() {
    const reason = activeReason(), canTake = E.takeReason(state, selected);
    return '<section class="b-bank"><h2>宝石银行</h2><div class="b-bank-grid">' + E.TOKENS.map(c => '<div data-motion-key="bank:' + c + '" class="b-bank-item">' +
      '<button data-gem="' + c + '" class="' + (selected.includes(c) ? 'selected ' : '') + (reason || c === 'gold' || !state.bank[c] ? 'b-unavailable' : '') + '"' +
      (reason || c === 'gold' || !state.bank[c] ? ' aria-disabled="true" data-reason="' + esc(reason || (c === 'gold' ? '黄金不能直接领取。预留一张发展卡时，银行有黄金便获得一枚' : '银行的' + NAME[c] + '已经领完')) + '"' : '') + '>' + gem(c) + '<b>' + state.bank[c] + '</b><small>' + NAME[c] + '</small></button>' +
      (c === 'gold' ? '<small class="b-small">预留获得</small>' : '<button class="b-double' + (reason || state.bank[c] < 4 ? ' b-unavailable' : '') + '" data-double="' + c + '"' + (reason || state.bank[c] < 4 ? ' data-reason="' + esc(reason || '拿两枚同色前，银行至少要有 4 枚' + NAME[c]) + '" aria-disabled="true"' : '') + '>拿 2 枚</button>') + '</div>').join('') +
      '</div><div class="b-take-actions">' + button('领取' + (selected.length ? ' ' + selected.length + ' 枚' : '不同宝石'), 'data-action="take"', reason || canTake, true) + button('清除', 'data-action="clear"') + '</div><p class="b-bank-note">三种各一枚，或同色两枚（银行至少 4 枚）。回合结束最多保留 10 枚；黄金仅在预留时获取。</p></section>';
  }
  function game() {
    const p = player(), labels = ['矿场与采集', '工坊与商路', '珍宝与声望'];
    root.innerHTML = header() + '<div class="b-body"><section class="b-banner"><div><div class="b-eyebrow">第 ' + state.round + ' 轮 · 第 ' + state.turn + ' 回合</div><h1>' + (state.phase === 'gameover' ? '商会荣耀，花落谁家' : '轮到 ' + ((state.networkCurrent ?? state.current) + 1) + 'P · ' + esc(state.players[state.networkCurrent ?? state.current].name)) + '</h1><p>永久加成每次购买都能抵扣，不会消耗。浅蓝色高亮卡可零筹码购买。</p></div><div class="b-status' + (p.ai && !aiError ? ' b-wait' : '') + '">' +
      (state.phase === 'gameover' ? '对局结束' : aiError ? '电脑行动中断 · 可重试' : p.ai ? '电脑正在选择行动 · 已运行 ' + Math.floor((Date.now() - started) / 1000) + ' 秒' : state.finalRound ? '最后一轮 · 本轮结束即结算' : '目标：15 分声望') + '</div></section>' +
      (state.phase === 'gameover' ? '<section class="b-results"><h2>' + state.winners.map(i => esc(state.players[i].name)).join('、') + ' 获胜</h2><table><thead><tr><th>玩家</th><th>声望</th><th>发展卡</th><th>贵族</th></tr></thead><tbody>' + state.players.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + E.score(p) + '</td><td>' + p.owned.length + '</td><td>' + p.nobles.length + '</td></tr>').join('') + '</tbody></table><p class="b-small">同分时，购买发展卡较少者获胜；仍相同则共享胜利。</p>' + button('再开一局', 'data-action="menu"', '', true) + '</section>' : '') +
      '<div class="b-grid"><main><section class="b-noble-bar"><div class="b-section-head"><h2>贵族来访</h2><small>永久加成达标 · 每回合最多一位</small></div><div class="b-nobles">' + (state.nobles.length ? state.nobles.map(nobleTile).join('') : '<p class="b-small">本局贵族均已来访。</p>') + '</div></section>' +
      [3, 2, 1].map(level => '<section class="b-market-level"><div class="b-market-head"><h2>' + level + ' 级 · ' + labels[level - 1] + '</h2><div>' + '<small>牌堆 ' + state.decks[level - 1].length + ' 张 &nbsp;</small>' + button('盲抽预留', 'data-level="' + level + '"', activeReason() || (!state.decks[level - 1].length ? '这一级牌堆已经空了' : p.reserved.length >= 3 ? '最多只能预留 3 张牌' : '')) + '</div></div><div class="b-card-grid">' + state.market[level - 1].map(id => cardTile(id)).join('') + '</div></section>').join('') +
      '<section class="b-private"><div class="b-section-head"><h2>' + esc(p.name) + ' 的预留牌</h2><small>' + p.reserved.length + '/3 张</small></div>' +
      (p.ai || handoff ? '<p class="b-small">预留牌仅在对应玩家回合显示。</p>' : p.reserved.length ? '<div class="b-card-grid">' + p.reserved.map(id => cardTile(id, true)).join('') + '</div>' : '<p class="b-small">预留市场或牌堆中的牌，可获得一枚黄金。</p>') +
      '<h3 class="b-small">已购买发展卡 · 点击查看完整牌面</h3><div class="b-owned">' + p.owned.map(id => '<button data-art="' + id + '" aria-label="查看发展卡"><img src="assets/base-splendor/cards/' + id + '.webp" alt="发展卡"></button>').join('') + '</div></section></main><aside class="b-side">' + bankPanel() +
      '<section><h2>商会成员</h2><div class="b-players">' + state.players.map(playerTile).join('') + '</div></section><section class="b-log"><h2>商会纪事</h2><ol>' + state.log.slice(-7).reverse().map(line => '<li>' + esc(line) + '</li>').join('') + '</ol>' + (aiError ? button('重试电脑行动', 'data-action="retry"') : '') + '</section></aside></div></div>';
  }
  function dialog(content, cls = '', closable = true) {
    return '<div class="b-backdrop"><section class="b-modal ' + cls + '" role="dialog" aria-modal="true">' + (closable ? '<button class="b-close" data-action="close" aria-label="关闭">×</button>' : '') + content + '</section></div>';
  }
  function renderOverlay() {
    if (modal?.type === 'rules') {
      overlay.innerHTML = dialog('<div class="b-eyebrow">原版基础游戏</div><h2>规则与符号</h2><p>2–4 人游戏。每回合执行一种行动：领取三种不同宝石各一枚；领取同色两枚（领取前银行至少有 4 枚）；预留一张发展卡并获得一枚黄金（银行有黄金时）；或购买一张市场 / 自己预留的发展卡。</p><p>银行不足三种宝石时，可以领取剩余种类各一枚。黄金不能直接领取。预留最多 3 张，可以盲抽某一级牌堆。回合结束只能保留 10 枚筹码，超出后自行选择归还。</p><p>每张已购买发展卡提供一种永久加成。购买时先抵扣同色费用，再用随身筹码支付；黄金能替代任意颜色，也可以主动代替已有的同色筹码。永久加成不会消耗。浅蓝色卡牌表示可零筹码购买。</p><p>卡牌左上角数字是声望分，右上角宝石是永久加成，左下方数字是购买费用。贵族数字是各色永久加成要求。回合结束达标的贵族自动来访，增加 3 分；多位达标时选一位，每回合最多一位，不消耗筹码或加成。</p><p>有人达到 15 分后，将当前一轮打完，使每人回合数相同，再比较声望。相同则购买发展卡较少者获胜；仍相同则共享胜利。</p><div class="b-return-options">' + E.TOKENS.map(c => '<span' + help(NAME[c] + (c === 'gold' ? '：百搭筹码，只能通过预留获得。' : '：左下角表示费用，右上角表示永久加成。')) + '>' + gem(c) + NAME[c] + '</span>').join('') + '</div><div class="b-modal-actions">' + button('知道了', 'data-action="close"', '', true) + '</div>'); return;
    }
    if (modal?.type === 'art') { overlay.innerHTML = dialog('<img class="b-modal-art" src="assets/base-splendor/cards/' + modal.id + '.webp" alt="完整发展卡牌面">', 'b-art-modal'); return; }
    if (modal?.type === 'buy') {
      const q = E.quote(state, state.current, modal.id, modal.payment), card = E.CARD.get(modal.id);
      overlay.innerHTML = dialog('<div class="b-eyebrow">确认本次支付</div><h2>' + (q.free ? '永久加成 · 零筹码购买' : '购买发展卡') + '</h2><p>永久加成仅用于抵扣，不会被消耗。下表显示本次需要支付的随身筹码。</p><table class="b-payment"><thead><tr><th>宝石</th><th>原价</th><th>永久抵扣</th><th>随身支付</th><th>黄金替代</th></tr></thead><tbody>' +
        E.COLORS.map(c => '<tr><td>' + gem(c) + '</td><td>' + card.cost[c] + '</td><td>' + q.discount[c] + '</td><td><select data-pay="' + c + '" aria-label="' + NAME[c] + '随身支付">' + Array.from({ length: Math.min(q.needed[c], player().tokens[c]) + 1 }, (_, n) => '<option value="' + n + '"' + (n === q.spend[c] ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></td><td>' + (q.needed[c] - q.spend[c]) + '</td></tr>').join('') + '</tbody></table><p class="b-payment-note">永久抵扣 ' + q.bonusTotal + ' · 随身支付 ' + E.sum(q.spend) + '（含黄金 ' + q.spend.gold + '）<br>黄金余额 ' + player().tokens.gold + ' · ' + (q.valid ? '支付完成后获得 1 点' + NAME[card.bonus] + '永久加成' : q.reason) + '</p><div class="b-modal-actions">' + button('取消', 'data-action="close"') + button('确认购买', 'data-action="confirm-buy"', q.valid ? '' : q.reason, true) + '</div>'); return;
    }
    if (handoff && state && !player().ai) {
      overlay.innerHTML = dialog('<div class="b-eyebrow">下一位玩家</div><h2>轮到 ' + (state.current + 1) + 'P · ' + esc(player().name) + ' 操作</h2><p>请由第 ' + (state.current + 1) + ' 席接手设备。确认后显示你的预留牌，开始本回合。</p><div class="b-modal-actions">' + button('我准备好了', 'data-action="handoff"', '', true) + '</div>', 'b-handoff', false); return;
    }
    if (state && !player().ai && state.phase === 'return') {
      overlay.innerHTML = dialog('<div class="b-eyebrow">本回合继续</div><h2>归还超出的筹码</h2><p>当前持有 ' + E.sum(player().tokens) + ' 枚，需要归还 ' + (E.sum(player().tokens) - 10) + ' 枚。每点一次归还一枚，可以归还刚刚领取的筹码和黄金。</p><div class="b-return-options">' + E.TOKENS.map(c => button(gem(c) + '<b>' + player().tokens[c] + '</b><small>归还 1 枚</small>', 'data-return="' + c + '"', player().tokens[c] ? '' : '没有可以归还的' + NAME[c])).join('') + '</div>', '', false); return;
    }
    if (state && !player().ai && state.phase === 'noble') {
      overlay.innerHTML = dialog('<div class="b-eyebrow">贵族来访</div><h2>选择一位贵族</h2><p>你同时满足多位贵族的永久加成要求，本回合可以获得其中一位，增加 3 分。</p><div class="b-noble-choice">' + E.eligibleNobles(state, state.current).map(id => button('<img src="assets/base-splendor/nobles/' + id + '.jpg" alt="贵族牌">选择这位贵族', 'data-noble="' + id + '"')).join('') + '</div>', '', false); return;
    }
    overlay.innerHTML = '';
  }
  function render() { hideTip(); if (screen === 'setup') setup(); else game(); renderOverlay(); }
  function execute(action) {
    const at = state.current;
    E.play(state, action); selected = []; modal = null; save();
    handoff = state.phase !== 'gameover' && state.current !== at && !player().ai && state.players.filter(p => !p.ai).length > 1;
    render(); scheduleAI();
  }
  function scheduleAI() {
    if (Room.active) return;
    clearTimeout(timer);
    if (!state || screen !== 'game' || state.phase === 'gameover' || !player().ai || handoff || modal || aiError) return;
    timer = setTimeout(() => { try { execute(E.chooseAI(state)); } catch (error) { console.error(error); aiError = error.message; render(); toast('电脑行动中断：' + error.message); } }, BoardMotion.aiDelay());
  }
  function hideTip() { tip.hidden = true; anchor = null; pinned = false; }
  function showTip(node, pin = false) {
    const text = node?.dataset.bTip || node?.dataset.reason; if (!text || !node.isConnected) return;
    tip.textContent = text; tip.hidden = false; anchor = node; pinned = pin;
    const rect = node.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - w / 2, innerWidth - w - 12)) + 'px';
    tip.style.top = (rect.bottom + h + 12 < innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - h - 8)) + 'px';
  }
  document.addEventListener('pointerover', event => { if (event.pointerType !== 'touch' && !pinned) { const n = event.target.closest('[data-b-tip],[data-reason]'); if (n) showTip(n); } });
  document.addEventListener('pointerout', event => { if (!pinned && anchor && !anchor.contains(event.relatedTarget)) hideTip(); });
  document.addEventListener('focusin', event => { const n = event.target.closest('[data-b-tip],[data-reason]'); if (n) showTip(n); });
  document.addEventListener('scroll', hideTip, true); window.addEventListener('resize', hideTip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { hideTip(); if (modal) { modal = null; renderOverlay(); scheduleAI(); } } });
  root.addEventListener('input', event => { if (event.target.dataset.name != null) { const seat = seats[Number(event.target.dataset.name)]; seat.name = event.target.value; seat.custom = true; } });
  root.addEventListener('change', event => {
    const node = event.target;
    if (node.matches('[data-count]')) { count = Number(node.value); render(); }
    if (node.dataset.ai != null) { const i = Number(node.dataset.ai), seat = seats[i]; seat.ai = node.value === 'ai'; if (!seat.custom) seat.name = seat.ai ? AI_NAMES[i ? i - 1 : 3] + '（简单）' : i ? '玩家 ' + (i + 1) : '玩家'; render(); }
  });
  overlay.addEventListener('change', event => {
    if (event.target.dataset.pay == null || modal?.type !== 'buy') return;
    const q = E.quote(state, state.current, modal.id, modal.payment), payment = { ...q.spend };
    payment[event.target.dataset.pay] = Number(event.target.value);
    payment.gold = E.COLORS.reduce((n, c) => n + q.needed[c] - payment[c], 0);
    modal.payment = payment; renderOverlay();
  });
  document.addEventListener('click', event => {
    const info = event.target.closest('[data-b-tip]');
    if (info) { if (pinned && anchor === info) hideTip(); else showTip(info, true); return; }
    hideTip(); const node = event.target.closest('button'); if (!node) return;
    if (node.dataset.reason) { toast(node.dataset.reason); return; }
    const action = node.dataset.action;
    try {
      if (action === 'rules') { clearTimeout(timer); modal = { type: 'rules' }; renderOverlay(); return; }
      if (action === 'close') { modal = null; renderOverlay(); scheduleAI(); return; }
      if (action === 'menu') { clearTimeout(timer); screen = 'setup'; state = null; modal = null; handoff = false; render(); return; }
      if (action === 'start') {
        state = E.newGame(seats.slice(0, count), Date.now()); screen = 'game'; modal = null; handoff = false;
        aiError = ''; selected = []; started = Date.now(); save(); render(); scheduleAI(); return;
      }
      if (action === 'continue' && saved) {
        state = structuredClone(saved); screen = 'game'; modal = null; selected = []; aiError = ''; started = Date.now();
        handoff = state.phase !== 'gameover' && !player().ai && state.players.filter(p => !p.ai).length > 1;
        render(); scheduleAI(); return;
      }
      if (action === 'save') { save(); toast('对局已保存到当前设备'); return; }
      if (action === 'handoff') { handoff = false; render(); scheduleAI(); return; }
      if (action === 'retry') { aiError = ''; render(); scheduleAI(); return; }
      if (node.dataset.art) { modal = { type: 'art', id: node.dataset.art }; clearTimeout(timer); renderOverlay(); return; }
      if (!state || state.phase === 'gameover' || player().ai || handoff) return;
      if (node.dataset.return) return execute({ type: 'return', tokens: { [node.dataset.return]: 1 } });
      if (node.dataset.noble) return execute({ type: 'noble', nobleId: node.dataset.noble });
      if (action === 'confirm-buy' && modal?.type === 'buy') return execute({ type: 'buy', cardId: modal.id, payment: modal.payment });
      if (node.dataset.buy) { modal = { type: 'buy', id: node.dataset.buy }; renderOverlay(); return; }
      if (activeReason()) return;
      if (node.dataset.reserve) return execute({ type: 'reserve', cardId: node.dataset.reserve });
      if (node.dataset.level) return execute({ type: 'reserve', level: Number(node.dataset.level) });
      if (node.dataset.double) { selected = [node.dataset.double, node.dataset.double]; render(); return; }
      if (node.dataset.gem) {
        const c = node.dataset.gem;
        if (selected.includes(c)) selected = selected.filter(s => s !== c);
        else if (selected.length < 3) selected.push(c); else toast('已经选了三种，请先取消一种或清除选择');
        render(); return;
      }
      if (action === 'clear') { selected = []; render(); return; }
      if (action === 'take') return execute({ type: 'take', colors: selected });
    } catch (error) { console.error(error); toast(error.message); }
  });
  render();
  if (Room.active) Room.connect({ game: 'splendor', root: 'base-splendor', getState: () => state, setState: value => {
    state = value; screen = 'game'; handoff = false; selected = []; modal = null;
  }, render });
  else if (new URLSearchParams(location.search).get('continue') === '1' && saved) {
    state = structuredClone(saved); screen = 'game'; handoff = !player().ai && state.phase !== 'gameover' && state.players.filter(p => !p.ai).length > 1;
    render(); scheduleAI();
  }
})();
