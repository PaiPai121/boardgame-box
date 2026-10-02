(function () {
  'use strict';
  const BoardMotion = window.BoardMotion || { watch() {}, aiDelay: () => 360, cancel() {} };
  const Room = window.BoardRoom || { active: false, wrap: e => e };
  const D = window.PuertoData, root = document.getElementById('puerto'), overlay = document.getElementById('pr-overlay');
  let E = window.PuertoEngine;
  const KEY = 'boardgame-box-puerto-rico-v1', AI_NAMES = ['卡洛斯', '埃琳娜', '拉蒙', '伊莎贝尔', '维嘉'];
  const PHASE = { role: '选择角色', settler: '拓荒', mayor: '安排居民', builder: '建造', craftsman: '生产', craftsmanBonus: '工匠特权', trader: '交易', captain: '装运', storage: '保留货物', gameover: '终局结算' };
  const seats = Array.from({ length: 5 }, (_, i) => ({ name: i ? AI_NAMES[i - 1] + '（简单）' : '玩家', ai: Boolean(i), custom: false }));
  let count = 3, state = null, saved = null, screen = 'setup', handoff = false, showRules = false, view = 0;
  let timer, toastTimer, aiError = '', started = Date.now(), draft = null, storage = null, usePrivilege = true, useStaff = true, useDiscount = true;
  const tooltip = document.createElement('div'); tooltip.className = 'pr-tooltip'; tooltip.hidden = true; tooltip.setAttribute('role', 'tooltip'); document.body.appendChild(tooltip);
  let tipAnchor = null, tipPinned = false;
  E = BoardMotion.watch({ game: 'puerto', engine: E, state: () => state, methods: ['play'] }) || E;
  E = Room.wrap(E, 'puerto');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roleName = id => E.ROLE.get(id === 'prospector2' ? 'prospector' : id)?.name || '';
  const art = (folder, id) => 'assets/puerto-rico/' + folder + '/' + id + '.png';
  const tip = text => ' tabindex="0" data-pr-tip="' + esc(text) + '" aria-label="' + esc(text) + '"';
  const icon = (id, text = '') => '<img class="pr-icon" src="' + art('icons', id) + '" alt="' + esc(text || D.names[id] || { coin: '金币', vp: '胜利分', governor: '总督' }[id]) + '">';
  function button(label, attrs, reason = '', primary = false) {
    return '<button ' + attrs + ' class="' + (primary ? 'pr-primary' : '') + '"' + (reason ? ' aria-disabled="true" data-reason="' + esc(reason) + '" title="' + esc(reason) + '"' : '') + '>' + label + '</button>';
  }
  function toast(text) {
    let node = document.querySelector('.pr-toast'); if (!node) { node = document.createElement('div'); node.className = 'pr-toast'; document.body.appendChild(node); }
    node.textContent = text; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => node.hidden = true, 3500);
  }
  function save() { if (Room.active) return; E.validate(state); localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem('boardgame-box-last-played', 'puerto-rico'); saved = structuredClone(state); }
  try { const value = JSON.parse(localStorage.getItem(KEY)); if (value) { E.validate(value); saved = value; } } catch (error) { console.warn('波多黎各存档无法读取', error); }
  function header() {
    return '<header class="pr-top"><a href="index.html">← 桌游中心</a><div class="pr-brand">波多黎各<small>PUERTO RICO</small></div><div class="pr-top-actions">' +
      button('规则与符号', 'data-action="rules"') + button('保存', 'data-action="save"', state ? '' : '开始对局后可保存') + button('新对局', 'data-action="menu"') + '</div></header>';
  }
  function setup() {
    root.innerHTML = header() + '<main class="pr-setup"><section class="pr-hero"><div class="pr-eyebrow">岛屿、城市与远洋</div><h1>波多黎各<br><em>每一个角色<br>都改变岛屿的未来</em></h1><p>拓荒种植，安排居民，建造城市。把货物送往海港，在金币与胜利分之间决定你的道路。</p><p class="pr-small">2–5 人 · 约 60–120 分钟 · 简单电脑</p><div class="pr-hero-art"><img class="pr-hero-island" src="' + art('boards', 'island') + '" alt="原版岛屿与城市版图"><img class="pr-hero-ship" src="' + art('decoration', 'sailing_ship') + '" alt="原版帆船图画"></div></section>' +
      '<section class="pr-setup-panel"><div class="pr-eyebrow">新的岛屿之旅</div><h2>创建对局</h2><div class="pr-count"><label for="pr-count">参与人数</label><select id="pr-count" data-count>' + [2, 3, 4, 5].map(n => '<option value="' + n + '"' + (count === n ? ' selected' : '') + '>' + n + ' 人</option>').join('') + '</select></div>' +
      seats.slice(0, count).map((seat, i) => '<div class="pr-seat-input"><b>' + (i + 1) + 'P</b><input data-name="' + i + '" maxlength="20" aria-label="玩家 ' + (i + 1) + ' 名称" value="' + esc(seat.name) + '"><select data-ai="' + i + '" aria-label="玩家 ' + (i + 1) + ' 类型"><option value="human"' + (!seat.ai ? ' selected' : '') + '>真人</option><option value="ai"' + (seat.ai ? ' selected' : '') + '>电脑 · 简单</option></select></div>').join('') +
      '<div class="pr-setup-buttons">' + button('启航 →', 'data-action="start"', '', true) + (saved ? button('继续上次对局', 'data-action="continue"') : '') + '</div><p class="pr-small">经典基础版 · 23 种建筑 · 官方双人规则<br>可以混合真人与电脑。对局自动保存于当前设备，多位真人轮流接手。</p></section></main>';
  }
  function seatTile(p, i) {
    const revealVP = state.phase === 'gameover' || (Room.active ? i === Room.mine : !p.ai && i === state.current && !handoff);
    return '<article class="pr-seat' + (i === state.current ? ' active' : '') + '" data-motion-player="' + i + '"><div class="pr-seat-head"><b>' + (i + 1) + 'P · ' + esc(p.name) + '</b><span>' + (i === state.governor ? '总督' : p.ai ? '电脑' : '真人') + '</span></div><div class="pr-seat-stats"><span' + tip('金币：用于购买建筑，货物交易与角色牌上积累的金币是主要收入。') + '>' + icon('coin') + p.coins + '</span><span' + tip('居民：只有进驻的种植园和建筑才能使用能力；生产建筑按实际进驻人数加工。') + '><i class="pr-worker"></i>' + E.workers(p) + '</span><span' + tip('装运所得胜利分按桌游规则隐藏；终局才公开比较。') + '>' + icon('vp') + (revealVP ? p.vp : '隐藏') + '</span></div><div class="pr-seat-goods">' + D.goods.map(g => '<span data-motion-key="wallet:' + i + ':' + g + '"' + tip(D.names[g] + '：库存 ' + p.goods[g] + ' 桶；交易基础卖价 ' + D.goods.indexOf(g) + ' 金币；装运每桶 1 分。') + '>' + icon(g) + p.goods[g] + '</span>').join('') + '</div><div class="pr-seat-foot"><span>岛屿 ' + p.island.length + '/12 · 城市 ' + E.spaces(p) + '/12</span>' + button(view === i ? '正在查看' : '查看版图', 'data-view="' + i + '"') + '</div></article>';
  }
  function phaseBanner() {
    const p = state.players[state.current], role = state.role ? roleName(state.role) : '';
    return '<section class="pr-phase"><div><div class="pr-eyebrow">第 ' + state.round + ' 轮 · ' + (state.players.length === 2 ? '每人选择三个角色' : '每人选择一个角色') + '</div><h1>' + (state.phase === 'gameover' ? '岛屿的荣光' : role ? role + ' · ' + PHASE[state.phase] : '轮到 ' + (state.current + 1) + 'P · ' + esc(p.name) + ' 选择角色') + '</h1><p>' + (state.phase === 'gameover' ? '本轮所有角色已经完成，公开胜利分并结算。' : state.role ? '本阶段由 ' + (state.picker + 1) + 'P · ' + esc(state.players[state.picker].name) + ' 发起。现在由 ' + (state.current + 1) + 'P · ' + esc(p.name) + ' 行动。' : '选取一个尚未使用的角色，领取该角色上积累的金币；其他人也会顺时针执行它的行动。') + '</p></div><div class="pr-phase-badge">' + icon('governor') + '<span>总督：' + esc(state.players[state.governor].name) + '<br>已选角色 ' + state.chosen + '/' + (state.players.length === 2 ? 6 : state.players.length) + '</span></div></section>';
  }
  function rolePanel() {
    return '<label class="pr-option"><input type="checkbox" data-option="privilege"' + (usePrivilege ? ' checked' : '') + '>使用所选角色的特权</label><div class="pr-role-grid">' + state.roles.map(token => {
      const id = token.id === 'prospector2' ? 'prospector' : token.id, role = E.ROLE.get(id), reason = token.usedBy !== null ? '本轮已由 ' + (token.usedBy + 1) + 'P · ' + state.players[token.usedBy].name + ' 选取。下一轮才能再次选择。' : '';
      return '<article class="pr-role-card' + (reason ? ' used' : '') + '" data-motion-key="card:role:' + token.id + '"><h3>' + role.name + '</h3><img data-motion-art src="' + art('roles', id) + '" alt="' + role.name + '原版角色牌"><p>' + role.action + '<br><b' + tip('角色特权：' + role.privilege + ' 只有选择此角色的人享有。') + '>特权：' + role.privilege + '</b></p><small>' + (token.coins ? '积累 ' + token.coins + ' 金币' : '暂无积累金币') + '</small>' + button(reason ? '本轮已使用' : '选取' + (token.coins ? ' · +' + token.coins + ' 金币' : ''), 'data-role="' + token.id + '"', reason) + '</article>';
    }).join('') + '</div>';
  }
  function settlerPanel() {
    const p = state.players[state.current], legal = E.actions(state), quarry = legal.some(a => a.tile === 'quarry');
    const full = p.island.length >= 12 ? '岛屿已占满 12 格。' : '';
    return '<p class="pr-small">选一块公开种植园。种植园和采石场需要居民进驻才有效；玉米直接生产，其他作物还需要对应加工厂。</p>' +
      (E.active(p, 'hacienda') ? '<div class="pr-action-footer">' + button('庄园 · 先暗抽一块', 'data-action="hacienda"', legal.some(a => a.type === 'hacienda') ? '' : state.haciendaUsed ? '本次已经使用过庄园。' : full || '种植园牌堆和弃牌堆均已耗尽。') + '<span class="pr-small">额外暗抽必须放入岛屿；不会触发收容所。</span></div>' : '') +
      (E.active(p, 'hospice') ? '<label class="pr-option"><input data-option="staff" type="checkbox"' + (useStaff ? ' checked' : '') + '>使用收容所，让新地块立即进驻一位居民</label>' : '') +
      '<div class="pr-selection-grid">' + state.faceUp.map(t => '<article class="pr-plant-option" data-motion-key="card:' + t.id + '"><img data-motion-art src="' + art('plantations', t.kind) + '" alt="' + D.names[t.kind] + '种植园"><h3>' + D.names[t.kind] + '种植园</h3><small>岛屿占用 1 格 · 1 个工位</small>' + button('取得地块', 'data-tile="' + t.id + '"', full) + '</article>').join('') + '<article class="pr-plant-option" data-motion-key="card:quarry"><img data-motion-art src="' + art('plantations', 'quarry') + '" alt="采石场"><h3>采石场</h3><small>剩余 ' + state.quarries + ' 块 · 进驻后降低建筑费用</small>' + button('取得采石场', 'data-tile="quarry"', full || (!state.quarries ? '采石场已经取完。' : !quarry ? '需要拓荒者特权，或已进驻的建筑工棚。' : '')) + '</article></div><div class="pr-action-footer">' + button('跳过选地', 'data-action="pass"') + '</div>';
  }
  function ensureDraft() {
    if (!draft) { const p = state.players[state.current]; draft = { type: 'allocate', island: p.island.map(t => t.workers), city: p.city.map(b => b.workers) }; }
  }
  function mayorPanel() {
    const p = state.players[state.current]; ensureDraft(); const assigned = E.sum(draft.island) + E.sum(draft.city), total = E.workers(p);
    return '<p class="pr-small">来船居民已分配给所有玩家。你可以重新安排全部居民；点下方岛屿和城市里的 ＋ / − 调整。只有工位全部填满，多余居民才能留在圣胡安。</p><div class="pr-allocate-info"><span>拥有 <strong>' + total + '</strong> 位</span><span>已安排 <strong>' + assigned + '</strong> 位</span><span>待安排 <strong>' + (total - assigned) + '</strong> 位</span></div><div class="pr-action-footer">' + button('自动安排', 'data-action="auto-allocate"') + button('全部移回圣胡安', 'data-action="clear-allocate"') + button('确认居民安排', 'data-action="allocate"', E.allocationReason(p, draft), true) + '</div>';
  }
  function builderPanel() {
    const p = state.players[state.current];
    return '<p class="pr-small">每人最多建造一座建筑，同名建筑不能重复。采石场只有进驻后才优惠，优惠上限等于建筑分值（所在列）；建筑能力也要进驻才启用。</p>' +
      (state.current === state.picker && state.privilege ? '<label class="pr-option"><input data-option="discount" type="checkbox"' + (useDiscount ? ' checked' : '') + '>使用建造师特权，实付费用再减一金币</label>' : '') +
      (E.active(p, 'university') ? '<label class="pr-option"><input data-option="staff" type="checkbox"' + (useStaff ? ' checked' : '') + '>使用大学，给新建筑立即进驻一位居民</label>' : '') + '<p class="pr-catalog-hint">建筑市场 · 上下滑动查看全部 23 种建筑</p><div class="pr-build-grid">' + D.buildings.map(b => {
        const q = E.quoteBuilding(state, state.current, b.id, state.picker, state.privilege && useDiscount);
        return '<article class="pr-build-card' + (!state.buildings[b.id] ? ' sold' : '') + '" data-motion-key="card:building:' + b.id + '"><h3>' + b.name + '<span>余 ' + state.buildings[b.id] + '</span></h3><img data-motion-art src="' + art('buildings', b.id) + '" alt="' + b.name + '原版建筑板块"' + tip(b.name + '：' + b.description + ' 占用 ' + b.spaces + ' 格，' + b.workers + ' 个工位，基础价值 ' + b.points + ' 分。') + '><p>' + b.description + '</p><small>' + b.points + ' 分 · ' + b.spaces + ' 城市格 · ' + b.workers + ' 工位<br>标价 ' + b.cost + ' − 采石 ' + q.quarry + ' − 特权 ' + q.discount + ' = ' + q.cost + ' 金币</small>' + button('建造 · ' + q.cost + ' 金币', 'data-building="' + b.id + '"', q.reason, q.valid) + '</article>';
      }).join('') + '</div><div class="pr-action-footer">' + button('跳过建造', 'data-action="pass"') + '</div>';
  }
  function craftsmanPanel(bonus = false) {
    const p = state.players[state.current], production = E.production(p);
    return '<p class="pr-small">' + (bonus ? '工匠特权：选一桶本阶段实际生产过、且供应区还有的货物。' : '玉米只需要进驻的种植园；其他货物同时需要进驻的种植园与加工工位。供应不足时按顺时针顺序领取。居民和地块不会消耗。') + '</p><div class="pr-selection-grid">' + D.goods.map(g => {
      const available = Math.min(state.bank[g], production[g]), reason = bonus ? !state.produced[g] ? '本阶段没有实际生产过' + D.names[g] + '。' : !state.bank[g] ? '供应区已经没有' + D.names[g] + '。' : '' : '';
      return '<div class="pr-good-option">' + icon(g) + '<h3>' + D.names[g] + '</h3><p>' + (bonus ? '实际生产 ' + (state.produced[g] || 0) + ' 桶 · 供应 ' + state.bank[g] : '产能 ' + production[g] + ' · 供应 ' + state.bank[g] + '<br>本次领取 ' + available + ' 桶') + '</p>' + (bonus ? button('额外领取 1 桶', 'data-bonus="' + g + '"', reason) : '') + '</div>';
    }).join('') + '</div><div class="pr-action-footer">' + (bonus ? button('放弃额外货物', 'data-action="pass"') : button('生产全部可生产货物', 'data-action="produce"', '', true) + button('跳过生产', 'data-action="pass"')) + '</div>';
  }
  function traderPanel() {
    const p = state.players[state.current];
    return '<p class="pr-small">向交易所出售一桶货物。基础卖价为玉米 0、靛蓝 1、蔗糖 2、烟草 3、咖啡 4；角色特权和已进驻市场加成另计。交易所仅在本阶段结束时、装满四桶后清空。</p><div class="pr-selection-grid">' + D.goods.map(g => '<div class="pr-good-option">' + icon(g) + '<h3>' + D.names[g] + '</h3><p>随身 ' + p.goods[g] + ' 桶<br>出售得 ' + E.tradePrice(state, state.current, g) + ' 金币</p>' + button('出售 1 桶', 'data-trade="' + g + '"', E.tradeReason(state, state.current, g)) + '</div>').join('') + '</div><div class="pr-action-footer">' + button('跳过出售', 'data-action="pass"') + '</div>';
  }
  function captainPanel() {
    const p = state.players[state.current], moves = E.shipments(state, state.current), wharf = E.wharfAvailable(state, state.current);
    return '<p class="pr-small">只要公共货船能装，就必须装运一种货物，并尽量装满。相同货物只能占一艘船；空船可选时必须选能装下最多该种货物的船。所有人轮流装运，直到无人可装，才保留剩余货物并清空满船。</p><div class="pr-selection-grid">' + D.goods.map(g => {
      const legal = moves.filter(a => a.good === g), reason = !p.goods[g] ? '没有' + D.names[g] + '库存。' : '公共货船已满、被其他种类占用，或已有同种货物的船不能再装。';
      return '<div class="pr-good-option">' + icon(g) + '<h3>' + D.names[g] + '</h3><p>库存 ' + p.goods[g] + ' 桶</p>' + (legal.length ? legal.map(a => button('装船 ' + (a.ship + 1) + ' · ' + a.count + ' 桶', 'data-ship="' + a.ship + '" data-good="' + g + '"', '', true)).join('') : button('公共货船不可装', 'data-no-ship="' + g + '"', reason)) +
        (E.active(p, 'wharf') ? button('私人码头 · ' + p.goods[g] + ' 桶', 'data-wharf="' + g + '"', !wharf ? '私人码头本阶段已经使用或放弃。' : !p.goods[g] ? '没有这类货物。' : '') : '') + '</div>';
    }).join('') + '</div>' + (!moves.length ? '<div class="pr-action-footer">' + button(wharf ? '放弃使用私人码头' : '继续', 'data-action="pass"') + '</div>' : '');
  }
  function storagePanel() {
    const p = state.players[state.current]; if (!storage) storage = E.autoStorage(p);
    const kept = D.goods.reduce((n, g) => n + (storage.types.includes(g) ? p.goods[g] : storage.single === g ? 1 : 0), 0), slots = E.storageSlots(p);
    return '<p class="pr-small">公共装运已结束。每人基本保留一桶；已进驻仓库还可保留指定种类的全部库存。小仓库增加 1 种，大仓库增加 2 种，可叠加。其余货物归还供应区。</p><div class="pr-allocate-info"><span>仓库可保留 <strong>' + slots + '</strong> 种</span><span>已选 <strong>' + storage.types.length + '</strong> 种</span><span>合计保留 <strong>' + kept + '</strong> 桶 · 归还 ' + (E.sum(p.goods) - kept) + ' 桶</span></div>' +
      D.goods.filter(g => p.goods[g]).map(g => '<div class="pr-storage-row"><span>' + icon(g) + D.names[g] + ' · ' + p.goods[g] + ' 桶</span><label><input type="checkbox" data-store-type="' + g + '"' + (storage.types.includes(g) ? ' checked' : '') + (slots ? '' : ' disabled') + '>仓库保留全部</label><label><input type="radio" name="pr-single" data-store-single="' + g + '"' + (storage.single === g ? ' checked' : '') + '>基本保留 1 桶</label></div>').join('') + '<label class="pr-option"><input type="radio" name="pr-single" data-store-single="none"' + (storage.single === null ? ' checked' : '') + '>不使用基本保留</label><div class="pr-action-footer">' + button('确认保留货物', 'data-action="store"', storage.types.length > slots ? '仓库只能保留 ' + slots + ' 种货物，请减少选择。' : '', true) + '</div>';
  }
  function actionPanel() {
    const p = state.players[state.current];
    let inner;
    if (Room.active && !Room.canAct) inner = '<div class="pr-ai-wait"><h3>' + esc(Room.reason) + '</h3><p>你可以查看各座岛屿，等待轮到自己的角色行动。</p></div>';
    else if (handoff) inner = '<div class="pr-ai-wait"><h3>等待 ' + (state.current + 1) + 'P · ' + esc(p.name) + ' 接手</h3><p>确认接手后显示本位的行动与胜利分。</p></div>';
    else if (p.ai) inner = '<div class="pr-ai-wait"><img src="' + art('icons', 'governor') + '" alt=""><h3>' + esc(p.name) + ' 正在行动</h3><div class="pr-ai-dots" aria-hidden="true"><i></i><i></i><i></i></div><p>' + (aiError ? '电脑行动中断：' + esc(aiError) : '当前阶段：' + PHASE[state.phase] + ' · 正在评估岛屿、建筑与货运') + '</p><small class="pr-small">已完成 ' + state.moves + ' 次行动 · 已运行 <span id="pr-elapsed">' + Math.floor((Date.now() - started) / 1000) + '</span> 秒</small>' + (aiError ? '<div class="pr-action-footer">' + button('重试电脑行动', 'data-action="retry-ai"') + '</div>' : '') + '</div>';
    else if (state.phase === 'role') inner = rolePanel();
    else if (state.phase === 'settler') inner = settlerPanel();
    else if (state.phase === 'mayor') inner = mayorPanel();
    else if (state.phase === 'builder') inner = builderPanel();
    else if (state.phase === 'craftsman') inner = craftsmanPanel();
    else if (state.phase === 'craftsmanBonus') inner = craftsmanPanel(true);
    else if (state.phase === 'trader') inner = traderPanel();
    else if (state.phase === 'captain') inner = captainPanel();
    else if (state.phase === 'storage') inner = storagePanel();
    return '<section class="pr-panel pr-action-panel"><div class="pr-panel-title"><div><div class="pr-eyebrow">岛屿上的决定</div><h2>' + (state.current + 1) + 'P · ' + esc(p.name) + '</h2><p>' + PHASE[state.phase] + ' · ' + (state.current === state.picker && state.privilege ? '本位享有角色特权' : '顺时针执行角色行动') + '</p></div><span class="pr-small">' + p.coins + ' 金币 · ' + E.workers(p) + ' 位居民</span></div>' + inner + '</section>';
  }
  function allocationControls(zone, index, value) {
    return '<div class="pr-allocate">' + button('−', 'data-allocate-zone="' + zone + '" data-index="' + index + '" data-change="-1" aria-label="移出一位居民"', value === 0 ? '这个地块还没有居民。' : '') + '<b>' + value + '</b>' + button('＋', 'data-allocate-zone="' + zone + '" data-index="' + index + '" data-change="1" aria-label="进驻一位居民"') + '</div>';
  }
  function boardPanel(index) {
    const p = state.players[index], allocating = state.phase === 'mayor' && index === state.current && !p.ai && !handoff && (!Room.active || Room.canAct);
    if (allocating) ensureDraft();
    const island = p.island.map((t, i) => {
      const amount = allocating ? draft.island[i] : t.workers;
      return '<div class="pr-island-cell" data-motion-key="island:' + index + ':' + t.id + '"><img data-motion-art src="' + art('plantations', t.kind) + '" alt="' + D.names[t.kind] + '"' + tip(t.kind === 'quarry' ? '采石场：进驻后每块减 1 建筑费用；每座建筑的采石优惠上限等于建筑所在列（分值 1–4）。' : D.names[t.kind] + '种植园：进驻后在工匠阶段提供一份原料。' + (t.kind === 'corn' ? '玉米直接产出货物。' : '还需要对应加工厂的进驻工位才能生产货物。')) + '><div class="pr-worker-badge"><i class="pr-worker"></i>' + amount + '/1</div><span>' + D.names[t.kind] + '</span>' + (allocating ? allocationControls('island', i, amount) : '') + '</div>';
    }).join('');
    // Tiles may be rearranged freely under the tabletop rules. Pack two-space tiles first.
    const order = p.city.map((b, i) => ({ b, i })).sort((a, b) => E.BUILDING.get(b.b.id).spaces - E.BUILDING.get(a.b.id).spaces);
    const city = order.map(({ b, i }) => {
      const def = E.BUILDING.get(b.id), amount = allocating ? draft.city[i] : b.workers;
      return '<div class="pr-city-cell' + (def.spaces === 2 ? ' large' : '') + '" data-motion-key="city:' + index + ':' + b.id + '"><img data-motion-art src="' + art('buildings', b.id) + '" alt="' + def.name + '"' + tip(def.name + '：' + def.description + ' 基础 ' + def.points + ' 分；' + (amount ? '已经进驻，能力有效。' : '尚未进驻，能力无效。')) + '><div class="pr-worker-badge"><i class="pr-worker"></i>' + amount + '/' + def.workers + '</div><strong>' + def.name + '</strong><small>' + (amount ? '已进驻' : '待进驻') + ' · ' + def.points + ' 分</small>' + (allocating ? allocationControls('city', i, amount) : '') + '</div>';
    }).join('');
    return '<section class="pr-panel pr-board"><div class="pr-panel-title"><div><div class="pr-eyebrow">你的岛屿与城市</div><h2>' + (index + 1) + 'P · ' + esc(p.name) + ' 的版图</h2><p>居民进驻后才能使用生产与建筑能力。建筑的基础分数始终计入终局。</p></div>' + (view !== state.current ? button('返回当前玩家', 'data-view="' + state.current + '"') : '') + '</div><div class="pr-board-subhead"><b>岛屿 · ' + p.island.length + '/12</b><span>种植园与采石场</span></div><div class="pr-island-grid">' + island + Array.from({ length: 12 - p.island.length }, (_, i) => '<div class="pr-island-cell empty">空地 ' + (p.island.length + i + 1) + '</div>').join('') + '</div><div class="pr-board-subhead"><b>城市 · ' + E.spaces(p) + '/12</b><span>圣胡安：' + (allocating ? E.workers(p) - E.sum(draft.island) - E.sum(draft.city) : p.loose) + ' 位居民未进驻</span></div><div class="pr-city-grid">' + city + Array.from({ length: 12 - E.spaces(p) }, () => '<div class="pr-city-cell empty">空建筑位</div>').join('') + '</div></section>';
  }
  function harborPanel() {
    return '<section class="pr-panel"><div class="pr-eyebrow">公共供应与海港</div><h2>港湾与交易所</h2><div class="pr-supply">' + D.goods.map(g => '<div class="pr-supply-item" data-motion-key="bank:' + g + '"' + tip(D.names[g] + '供应区：剩余 ' + state.bank[g] + ' 桶。货物是有限组件；生产、出售、装运和仓储归还都会改变供应。') + '>' + icon(g) + '<b>' + state.bank[g] + '</b><small>' + D.names[g] + '</small></div>').join('') + '</div><div class="pr-supply-other"><span' + tip('居民供应：市长的额外居民、收容所和大学会从这里领取居民。只有居民不足以补满市长来船时，才触发终局。') + '><i class="pr-worker" data-motion-key="workers:supply"></i> 供应 ' + state.supplyWorkers + '</span><span data-motion-key="workers:ship"' + tip('居民来船：下次市长阶段按顺时针一人一位循环分配。阶段末按城市建筑空工位总数补充，最少为玩家人数。') + '><i class="pr-worker" data-motion-art></i> 来船 ' + state.workerShip + '</span><span' + tip('胜利分供应耗尽时触发终局；仍继续本轮，并正常发放额外胜利分。') + '>' + icon('vp') + ' 分数余 ' + Math.max(0, state.vpSupply) + '</span></div><div class="pr-ships">' + state.ships.map((ship, i) => '<div class="pr-ship" data-motion-key="ship:' + i + '"' + tip('货船 ' + (i + 1) + '：容量 ' + ship.size + '，目前' + (ship.kind ? D.names[ship.kind] + ' ' + ship.count + ' 桶' : '空船') + '。同种货物只能占用一艘公共货船，满船也要等船长阶段结束才离港。') + '><img data-motion-art src="' + ([4, 8].includes(ship.size) ? art('decoration', 'sailing_ship') : art('ships', ship.size === 7 ? 'cargo7' : ship.size === 6 ? 'cargo6' : 'cargo')) + '" alt="原版货船"><strong>货船 ' + (i + 1) + ' · ' + ship.count + '/' + ship.size + '</strong><span>' + (ship.kind ? D.names[ship.kind] : '等待装货') + '</span><div class="pr-cargo-dots" style="--good:' + (D.colors[ship.kind] || '#142a30') + '">' + Array.from({ length: ship.size }, (_, k) => '<i' + (k < ship.count ? ' class="filled"' : '') + '></i>').join('') + '</div></div>').join('') + '</div><div class="pr-trade-house" data-motion-key="trading"><h3' + tip('交易所最多四桶，每种通常只能一桶；已进驻办公室允许同种出售。仅当商人阶段结束且已装满四桶时才清空。') + '>交易所 · ' + state.trading.length + '/4</h3><div class="pr-trade-slots">' + Array.from({ length: 4 }, (_, i) => '<span>' + (state.trading[i] ? icon(state.trading[i]) : '空') + '</span>').join('') + '</div></div><div class="pr-role-track">' + state.roles.map(r => '<span' + (r.usedBy !== null ? ' class="used"' : '') + '>' + roleName(r.id) + (r.usedBy !== null ? ' 已选' : r.coins ? ' +' + r.coins + '币' : '') + '</span>').join('') + '</div><p class="pr-small">未选的角色每轮积累 1 金币。下轮由下一位玩家担任总督。</p></section>';
  }
  function resultsPanel() {
    const ranking = state.players.map((p, i) => ({ p, i, score: E.score(p) })).sort((a, b) => b.score.total - a.score.total || b.p.coins + E.sum(b.p.goods) - a.p.coins - E.sum(a.p.goods));
    return '<section class="pr-panel pr-results"><div class="pr-eyebrow">岛屿的最终荣光</div><h2>' + state.winners.map(i => esc(state.players[i].name)).join('、') + ' 获胜</h2><p class="pr-small">装运胜利分 + 所有建筑基础分 + 已进驻大型建筑额外分。相同总分比较金币与货物之和。</p><table class="pr-score-table"><thead><tr><th>玩家</th><th>装运</th><th>建筑</th><th>大型建筑加分</th><th>总分</th></tr></thead><tbody>' + ranking.map(({ p, i, score }) => '<tr' + (state.winners.includes(i) ? ' class="winner"' : '') + '><td>' + (i + 1) + 'P · ' + esc(p.name) + '<small>金币 ' + p.coins + ' · 货物 ' + E.sum(p.goods) + '</small></td><td>' + score.shipping + '</td><td>' + score.building + '</td><td>' + score.extra + '<small>' + Object.entries(score.bonus).map(([id, n]) => E.BUILDING.get(id).name + ' +' + n).join('、') + '</small></td><td><b>' + score.total + '</b></td></tr>').join('') + '</tbody></table><p class="pr-small">结束原因：' + state.endReasons.map(esc).join('、') + '。本轮角色已经全部执行。</p>' + button('再开一局', 'data-action="menu"', '', true) + '</section>';
  }
  function game() {
    root.innerHTML = header() + '<main class="pr-main">' + phaseBanner() + (state.endReasons.length && state.phase !== 'gameover' ? '<div class="pr-end-notice">结束条件已触发：' + state.endReasons.map(esc).join('、') + '。本轮所有角色结束后结算。</div>' : '') + '<section class="pr-seats" style="--players:' + state.players.length + '" aria-label="玩家岛屿">' + state.players.map(seatTile).join('') + '</section>' + (state.phase === 'gameover' ? resultsPanel() : '') + '<div class="pr-game-layout"><div class="pr-left">' + (state.phase !== 'gameover' ? actionPanel() : '') + boardPanel(view) + '</div><aside class="pr-right">' + harborPanel() + '<section class="pr-panel" style="margin-top:18px"><div class="pr-eyebrow">岛屿发展记录</div><h2>航海日志</h2><ol class="pr-log">' + state.log.slice(-6).reverse().map(text => '<li>' + esc(text) + '</li>').join('') + '</ol></section></aside></div></main>';
  }
  function renderRules() {
    return '<div class="pr-backdrop"><section class="pr-modal"><button class="pr-modal-close" data-action="close-rules">关闭</button><div class="pr-eyebrow">经典基础版 · 官方双人变体</div><h2>波多黎各 · 规则与符号</h2><h3>一轮如何进行</h3><p>总督先选角色，之后顺时针每人选一个尚未使用的角色。选取者先领取角色上积累的金币，再享有特权；除淘金者外，所有人从选取者开始顺时针执行行动。只有船长的公共装运是强制行动。每轮末未选角色各积累 1 金币，总督移交下一位。</p><h3>七种角色</h3><ul>' + D.roles.map(r => '<li><b>' + r.name + '</b>：' + r.action + ' 特权：' + r.privilege + '</li>').join('') + '</ul><h3>居民、种植园与建筑</h3><p>居民只在市长阶段重新安排。种植园和采石场各一个工位，生产建筑有 1–3 个工位；其他建筑只有一个。只有进驻的地块或建筑才能使用能力，但建筑基础分不要求进驻。市长阶段必须尽可能填满空位，圣胡安只能保留超过所有工位数量的居民。收容所和大学允许新取得的地块或建筑立即进驻一位居民。</p><h3>费用与采石场</h3><p>已进驻采石场每块减少一金币，优惠上限是建筑所在列（建筑基础分值 1–4）。建造师另减一金币，实付最低为零。同名建筑每人最多一座。城市最多 12 格，大型建筑占两格；岛屿最多 12 格。</p><h3>装运和保留</h3><p>每次装一种货物到一艘船，且必须尽量多装。若该种货物已在公共船上，只能使用那艘船；若有多个空船，必须选能装下最多货物的船。可选种类不要求选数量最多的种类。满船在船长阶段结束时才清空，不满的船留到下次。私人码头每阶段可自愿使用一次，装一种货物的全部库存；港口每次装运额外一分。阶段末每人保留一桶货物，小仓库再保留一种的全部、大仓库再保留两种的全部，可叠加，其余归还。</p><h3>游戏结束和胜负</h3><p>居民不足以补满市长来船、某人的城市占满 12 格、或装运分数供应耗尽，均触发终局。继续执行本轮剩余角色，才结算。总分＝装运分＋所有建筑基础分＋已进驻大型建筑加分。平分时比较剩余金币与货物桶数之和。</p><h3>双人规则</h3><p>每人起始 3 金币，先手靛蓝、后手玉米；每种种植园和采石场移除 3 块。每种非生产建筑只用 1 座，六种生产建筑各用 2 座；胜利分供应 65，居民供应 40 且来船另有 2 位，使用容量 4 与 6 的两艘货船，每种货物移除 2 桶，使用 7 张角色牌。双方交替各选三个角色，每轮只剩一张未选角色积累金币。</p><h3>看懂符号</h3><p>' + icon('coin') + ' 金币：购买建筑；' + icon('vp') + ' 胜利分：装运得分在对局中隐藏，终局公开；<i class="pr-worker"></i> 居民：进驻工位启用能力；' + icon('governor') + ' 总督：本轮首先选择角色。货物颜色：' + D.goods.map(g => icon(g) + ' ' + D.names[g]).join('、') + '。资源与建筑可悬停查看，平板可点按说明。</p><h3>大型建筑</h3><ul>' + D.buildings.filter(b => b.spaces === 2).map(b => '<li><b>' + b.name + '</b>：' + b.description + '</li>').join('') + '</ul><p class="pr-small">本游戏使用 2019 豪华版的经典基础规则和原版图画，5 人胜利分供应为 126；不含两款扩展。</p><a href="' + D.rulesSource + '" target="_blank" rel="noopener">查看出版商原始规则书 ↗</a></section></div>';
  }
  function renderOverlay() {
    if (showRules) { overlay.innerHTML = renderRules(); return; }
    if (handoff && state && state.phase !== 'gameover') { overlay.innerHTML = '<div class="pr-backdrop"><section class="pr-modal pr-handoff"><div class="pr-eyebrow">下一位玩家</div><h2>轮到 ' + (state.current + 1) + 'P · ' + esc(state.players[state.current].name) + ' 操作</h2><p>请交给这位玩家，确认接手后显示本位行动与隐藏的装运分数。</p>' + button('我准备好了', 'data-action="handoff"', '', true) + '</section></div>'; return; }
    overlay.innerHTML = '';
  }
  function render() { hideTip(); if (screen === 'setup') setup(); else game(); renderOverlay(); }
  function resetDraft() { draft = null; storage = null; useStaff = true; useDiscount = true; usePrivilege = true; }
  function execute(action) {
    const at = state.current; E.play(state, action); resetDraft(); aiError = ''; view = state.current; save();
    handoff = state.phase !== 'gameover' && at !== state.current && !state.players[state.current].ai && state.players.filter(p => !p.ai).length > 1;
    render(); scheduleAI();
  }
  function scheduleAI() {
    if (Room.active) return;
    clearTimeout(timer);
    if (!state || screen !== 'game' || state.phase === 'gameover' || !state.players[state.current].ai || showRules || handoff || aiError) return;
    timer = setTimeout(() => { try { execute(E.chooseAI(state)); } catch (error) { console.error(error); aiError = error.message; save(); render(); toast('电脑行动中断：' + error.message); } }, BoardMotion.aiDelay());
  }
  function start() {
    clearTimeout(timer); state = E.newGame(seats.slice(0, count), Date.now()); screen = 'game'; handoff = false; showRules = false; aiError = ''; started = Date.now(); view = 0; resetDraft(); save(); render(); scheduleAI();
  }
  function resume() {
    if (!saved) return; state = structuredClone(saved); E.validate(state); screen = 'game'; view = state.current; started = Date.now(); aiError = ''; resetDraft();
    handoff = state.phase !== 'gameover' && !state.players[state.current].ai && state.players.filter(p => !p.ai).length > 1; render(); scheduleAI();
  }
  function hideTip() { tooltip.hidden = true; tipAnchor = null; tipPinned = false; }
  function showTip(node, pinned = false) {
    const text = node?.dataset.prTip || node?.dataset.reason; if (!text) return;
    tooltip.textContent = text; tooltip.hidden = false; tipAnchor = node; tipPinned = pinned;
    const r = node.getBoundingClientRect(), w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    tooltip.style.left = Math.max(12, Math.min(r.x + r.width / 2 - w / 2, innerWidth - w - 12)) + 'px';
    tooltip.style.top = (r.top - h - 10 > 10 ? r.top - h - 10 : Math.min(r.bottom + 10, innerHeight - h - 12)) + 'px';
  }
  document.addEventListener('pointerover', event => { const node = event.target.closest('[data-pr-tip],[data-reason]'); if (node && node !== tipAnchor) showTip(node); });
  document.addEventListener('pointerout', event => { if (!tipPinned && tipAnchor && !tipAnchor.contains(event.relatedTarget)) hideTip(); });
  document.addEventListener('focusin', event => { const node = event.target.closest('[data-pr-tip],[data-reason]'); if (node) showTip(node); });
  document.addEventListener('focusout', () => { if (!tipPinned) hideTip(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { hideTip(); if (showRules) { showRules = false; renderOverlay(); scheduleAI(); } } });
  window.addEventListener('scroll', hideTip, { passive: true }); window.addEventListener('resize', hideTip);
  root.addEventListener('input', event => { if (event.target.dataset.name != null) { const seat = seats[Number(event.target.dataset.name)]; seat.name = event.target.value; seat.custom = true; } });
  root.addEventListener('change', event => {
    const node = event.target;
    if (node.hasAttribute('data-count')) { count = Number(node.value); render(); }
    if (node.dataset.ai != null) { const i = Number(node.dataset.ai), seat = seats[i]; seat.ai = node.value === 'ai'; if (!seat.custom) seat.name = seat.ai ? AI_NAMES[i ? i - 1 : 4] + '（简单）' : i ? '玩家 ' + (i + 1) : '玩家'; render(); }
    if (node.dataset.option) { if (node.dataset.option === 'privilege') usePrivilege = node.checked; if (node.dataset.option === 'staff') useStaff = node.checked; if (node.dataset.option === 'discount') { useDiscount = node.checked; render(); } }
    if (node.dataset.storeType) { const g = node.dataset.storeType; if (node.checked && !storage.types.includes(g)) storage.types.push(g); else if (!node.checked) storage.types = storage.types.filter(x => x !== g); render(); }
    if (node.dataset.storeSingle) { storage.single = node.dataset.storeSingle === 'none' ? null : node.dataset.storeSingle; render(); }
  });
  document.addEventListener('click', event => {
    const info = event.target.closest('[data-pr-tip]'); if (info) { if (tipPinned && tipAnchor === info) hideTip(); else showTip(info, true); return; }
    hideTip(); const node = event.target.closest('button'); if (!node) return;
    if (node.dataset.reason) { toast(node.dataset.reason); return; }
    const action = node.dataset.action;
    try {
      if (action === 'rules') { showRules = true; clearTimeout(timer); renderOverlay(); return; }
      if (action === 'close-rules') { showRules = false; renderOverlay(); scheduleAI(); return; }
      if (action === 'save') { if (state) { save(); toast('对局已保存在当前设备。'); } return; }
      if (action === 'menu') { clearTimeout(timer); BoardMotion.cancel(); screen = 'setup'; state = null; handoff = false; showRules = false; render(); return; }
      if (action === 'start') { start(); return; }
      if (action === 'continue') { resume(); return; }
      if (action === 'handoff') { handoff = false; render(); scheduleAI(); return; }
      if (action === 'retry-ai') { aiError = ''; render(); scheduleAI(); return; }
      if (node.dataset.view != null) { view = Number(node.dataset.view); render(); return; }
      if (!state || state.phase === 'gameover' || state.players[state.current].ai || handoff) return;
      if (node.dataset.role) { execute({ type: 'role', role: node.dataset.role, privilege: usePrivilege }); return; }
      if (node.dataset.tile) { execute({ type: 'settle', tile: node.dataset.tile, staff: useStaff }); return; }
      if (node.dataset.building) { execute({ type: 'build', building: node.dataset.building, staff: useStaff, privilege: useDiscount }); return; }
      if (node.dataset.bonus) { execute({ type: 'bonus', good: node.dataset.bonus }); return; }
      if (node.dataset.trade) { execute({ type: 'trade', good: node.dataset.trade }); return; }
      if (node.dataset.ship != null) { execute({ type: 'ship', ship: Number(node.dataset.ship), good: node.dataset.good }); return; }
      if (node.dataset.wharf) { execute({ type: 'wharf', good: node.dataset.wharf }); return; }
      if (['hacienda', 'pass', 'produce'].includes(action)) { execute({ type: action }); return; }
      if (action === 'auto-allocate') { draft = E.autoAllocation(state.players[state.current]); view = state.current; render(); return; }
      if (action === 'clear-allocate') { const p = state.players[state.current]; draft = { type: 'allocate', island: p.island.map(() => 0), city: p.city.map(() => 0) }; view = state.current; render(); return; }
      if (action === 'allocate') { execute(structuredClone(draft)); return; }
      if (action === 'store') { execute(structuredClone(storage)); return; }
      if (node.dataset.allocateZone) {
        ensureDraft(); const zone = node.dataset.allocateZone, i = Number(node.dataset.index), change = Number(node.dataset.change), p = state.players[state.current];
        const maximum = zone === 'island' ? 1 : E.BUILDING.get(p.city[i].id).workers;
        if (draft[zone][i] + change > maximum || draft[zone][i] + change < 0) { toast('这个地块的工位已满或为空。'); return; }
        if (change > 0 && E.sum(draft.island) + E.sum(draft.city) >= E.workers(p)) { toast('没有待安排的居民。请先从其他地块移出居民。'); return; }
        draft[zone][i] += change; render(); return;
      }
    } catch (error) { console.error(error); toast(error.message); }
  });
  setInterval(() => { const elapsed = document.getElementById('pr-elapsed'); if (elapsed) elapsed.textContent = Math.floor((Date.now() - started) / 1000); }, 1000);
  if (Room.active) Room.connect({ game: 'puerto', root: 'puerto', getState: () => state, setState: (value, snapshot, previous) => {
    if (!state) view = snapshot.mine;
    if (!previous || value.current !== state?.current || value.phase !== state?.phase) resetDraft();
    state = value; screen = 'game'; handoff = false;
  }, render });
  else if (new URLSearchParams(location.search).get('continue') === '1' && saved) resume(); else render();
})();
