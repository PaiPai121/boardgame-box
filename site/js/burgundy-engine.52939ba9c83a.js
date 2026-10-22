(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../data/burgundy.js'));
  else root.BurgundyEngine = factory(root.BurgundyData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';
  const T = D.tileById, C = D.cells, R = D.regions;
  const insist = (ok, message) => { if (!ok) throw Error(message); };
  const sum = list => list.reduce((a, b) => a + b, 0);
  const int = (n, max = Infinity) => Number.isInteger(n) && n >= 0 && n <= max;
  const has = (p, n) => p.built.some(id => T[id].type === 'knowledge' && T[id].number === n);
  const count = (p, type) => p.built.filter(id => T[id].type === type).length;
  function random(s) { let n = s.rng | 0; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; s.rng = n >>> 0 || 1; return s.rng / 4294967296; }
  function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function log(s, text) { s.log.push(text); if (s.log.length > 160) s.log.shift(); }
  function award(s, p, points, category, text, extra = {}) {
    if (!points) return;
    p.vp += points; p.ledger.push({ points, category, text, era: s.era, round: s.round, ...extra });
    log(s, p.name + '：' + text + '，+' + points + ' 分。');
  }
  function turnOrder(s) { return s.players.map((p, i) => i).sort((a, b) => s.players[b].order - s.players[a].order || s.players[b].arrival - s.players[a].arrival); }
  function refill(s) {
    s.depots.forEach(list => s.out.push(...list.splice(0))); s.out.push(...s.black.splice(0));
    D.depotSlots.forEach((slots, depot) => slots.forEach(([original, players]) => {
      if (players > s.players.length) return;
      const type = s.players.length === 3 && depot === 5 && original === 'castle' && s.era % 2 === 0 ? 'mine' : original;
      const id = s.supply[type].pop(); insist(id, '对应颜色地块供应不足：' + D.names[type]); s.depots[depot].push(id);
    }));
    for (let i = 0; i < ({ 2: 2, 3: 4, 4: 8 })[s.players.length]; i++) {
      const id = s.supply.black.pop(); insist(id, '黑市地块供应不足。'); s.black.push(id);
    }
    s.phaseGoods = s.goodsDeck.splice(0, 5);
    log(s, '阶段 ' + 'ABCDE'[s.era - 1] + ' 开始：补充六个货站与黑市；货站上未领取的货物保留。');
  }
  function beginRound(s) {
    s.roundOrder = turnOrder(s); s.turnIndex = 0; s.current = s.roundOrder[0]; s.buyUsed = false;
    s.players.forEach(p => { p.dice = [0, 1].map(() => ({ value: Math.floor(random(s) * 6) + 1, used: false })); });
    s.whiteDie = Math.floor(random(s) * 6) + 1;
    const good = s.phaseGoods.shift(); insist(int(good, 5), '本轮货物缺失。');
    s.goodsDepots[s.whiteDie - 1][good]++; s.delivered = good;
    log(s, '阶段 ' + 'ABCDE'[s.era - 1] + ' · 第 ' + s.round + ' 轮：白骰 ' + s.whiteDie + '，' + (good + 1) + ' 号货物到达该货站。');
  }
  function newGame(seats, seed = Date.now()) {
    insist(Array.isArray(seats) && seats.length >= 2 && seats.length <= 4, '勃艮第城堡支持 2–4 人。');
    const s = { version: 1, kind: 'burgundy', rules: 'classic-2011', rng: seed >>> 0 || 1, era: 1, round: 1,
      phase: 'action', current: 0, turnIndex: 0, roundOrder: [], arrival: 0, buyUsed: false, whiteDie: 1,
      depots: Array.from({ length: 6 }, () => []), goodsDepots: Array.from({ length: 6 }, () => Array(6).fill(0)),
      black: [], supply: Object.fromEntries([...D.types, 'black'].map(type => [type, []])), out: [],
      goodsDeck: [], unusedGoods: Array(6).fill(0), phaseGoods: [], delivered: 0,
      colorClaims: Object.fromEntries(D.types.map(type => [type, []])), pending: [], log: [], moves: 0, winners: [], players: [] };
    for (const t of D.tiles) s.supply[t.black ? 'black' : t.type].push(t.id);
    Object.values(s.supply).forEach(pool => shuffle(s, pool));
    const goods = shuffle(s, Array.from({ length: 42 }, (_, i) => Math.floor(i / 7)));
    s.goodsDeck = goods.splice(0, 25);
    const first = Math.floor(random(s) * seats.length), initialOrder = seats.map((_, i) => (first + i) % seats.length);
    s.players = seats.map((seat, i) => {
      const castle = s.supply.castle.pop(), estate = C.map(() => null), center = C.findIndex(c => !c.q && !c.r);
      estate[center] = castle;
      const p = { name: String(seat.name || '领主 ' + (i + 1)).trim().slice(0, 20) || '领主 ' + (i + 1), ai: Boolean(seat.ai), map: 1,
        estate, built: [castle], reserved: [], goods: Array(6).fill(0), sold: Array(6).fill(0), silver: 1,
        workers: initialOrder.indexOf(i) + 1, vp: 0, order: 0, arrival: seats.length - initialOrder.indexOf(i),
        dice: [], completed: [C[center].region], bonuses: [], ledger: [] };
      for (let n = 0; n < 3; n++) p.goods[goods.pop()]++;
      return p;
    });
    goods.forEach(g => s.unusedGoods[g]++); s.arrival = seats.length;
    refill(s); beginRound(s); validate(s); return s;
  }
  function workerCost(p, die, target, action, tile) {
    if (die === -1 || action === 'workers') return { cost: 0, free: 0, distance: 0 };
    const value = p.dice[die]?.value, distance = Math.min(Math.abs(value - target), 6 - Math.abs(value - target));
    const free = action === 'take' ? Number(has(p, 12)) : action === 'place' ? Number(has(p,
      tile.type === 'building' ? 9 : ['ship', 'animal'].includes(tile.type) ? 10 : 11)) : 0;
    return { cost: Math.ceil(Math.max(0, distance - free) / (has(p, 8) ? 2 : 1)), free: Math.min(free, distance), distance };
  }
  function placementReason(p, tileId, cell) {
    const tile = T[tileId], space = C[cell];
    if (!p.reserved.includes(tileId)) return '这块地块不在你的暂存区。';
    if (!space) return '请选择领地上的一个六角格。';
    if (p.estate[cell]) return '这格已经放有地块，不能移动或覆盖。';
    if (space.type !== tile.type) return '颜色不匹配：这格只能放置' + D.names[space.type] + '。';
    if (!space.neighbors.some(n => p.estate[n])) return '必须与领地中至少一块已有地块相邻。';
    if (tile.type === 'building' && !has(p, 1) && R[space.region].cells.some(i => p.estate[i] && T[p.estate[i]].building === tile.building))
      return '这片城市已有' + D.name(tile) + '。同城同名建筑只能有一座，知识 1 可解除限制。';
    return '';
  }
  function quote(s, a) {
    const result = { valid: false, reason: '', cost: 0, free: 0, distance: 0 };
    const no = reason => ({ ...result, reason });
    if (!s || s.phase === 'gameover') return no('本局已结束。');
    if (!a || typeof a !== 'object') return no('请选择一个行动。');
    const p = s.players[s.current], pending = s.pending[0];
    if (a.type === 'skip') return pending && pending.type !== 'castle' && pending.type !== 'collect' ? { ...result, valid: true } : no('当前没有可以放弃的建筑奖励。');
    if (a.type === 'end') return pending ? no('请先处理当前的额外效果。') : p.dice.some(d => !d.used) ? no('两颗骰子都用完后才能结束回合。') : { ...result, valid: true };
    if (a.type === 'collect') {
      if (pending?.type !== 'collect') return no('先放置船舶，才能从货站收货。');
      if (!Array.isArray(a.depots) || !a.depots.length || a.depots.length > (has(p, 5) ? 2 : 1) || new Set(a.depots).size !== a.depots.length || a.depots.some(n => !int(n, 5))) return no('请选择一个货站；知识 5 可选择两个相邻货站。');
      if (a.depots.length === 2 && ![1, 5].includes(Math.abs(a.depots[0] - a.depots[1]))) return no('两个货站必须相邻，1 号和 6 号也相邻。');
      const available = Array.from({ length: 6 }, (_, g) => a.depots.reduce((n, d) => n + s.goodsDepots[d][g], 0));
      const newTypes = available.map((n, g) => n && !p.goods[g] ? g : -1).filter(g => g >= 0);
      const room = 3 - p.goods.filter(n => n).length;
      if (!Array.isArray(a.types) || new Set(a.types).size !== a.types.length || a.types.some(g => !newTypes.includes(g)) || a.types.length !== Math.min(room, newTypes.length)) return no('货仓最多三种货物：已有种类会自动全部收取，请选择可容纳的新种类。');
      return { ...result, valid: true, available };
    }
    if (!['take', 'buy', 'place', 'sell', 'workers'].includes(a.type)) return no('未知行动。');
    const tile = T[a.tile];
    if (a.type === 'buy') {
      if (pending) return no('先完成当前效果，再进行本回合的额外购买。');
      if (s.buyUsed) return no('本回合已经购买过一次，下回合才可再买。');
      if (p.silver < 2) return no('需要 2 枚银币，当前只有 ' + p.silver + ' 枚。');
      if (a.depot !== 6 && !has(p, 6)) return no('银币购买只能选择黑市；知识 6 可购买编号货站地块。');
    } else if (pending) {
      const allowed = pending.type === 'castle' ? ['take','place','sell','workers'] : [pending.type];
      if (!allowed.includes(a.type)) return no('请先处理：' + pending.label + '。');
      if (a.die !== -1) return no('这次是额外行动，不消耗你的普通骰子，请使用奖励行动。');
    } else if (!int(a.die, 1) || p.dice[a.die].used) return no('请选择一颗尚未使用的骰子。');
    if (['take', 'buy'].includes(a.type)) {
      if (!int(a.depot, a.type === 'buy' ? 6 : 5)) return no('请选择编号货站中的地块。');
      const depot = a.depot === 6 ? s.black : s.depots[a.depot];
      if (!tile || !depot.includes(a.tile)) return no('该地块已不在这个货站。');
      if (pending?.types && !pending.types.includes(tile.type)) return no('这项建筑奖励只能领取：' + pending.types.map(t => D.names[t]).join('、') + '。');
      if (p.reserved.length >= 3 && !p.reserved.includes(a.discard)) return no('暂存区已满，请先指定一块原有地块弃置，再取新地块。');
      if (p.reserved.length < 3 && a.discard != null) return no('暂存区还有空位，无须弃置地块。');
      if (a.type === 'take') Object.assign(result, workerCost(p, a.die, a.depot + 1, 'take'));
    }
    if (a.type === 'place') {
      const reason = placementReason(p, a.tile, a.cell); if (reason) return no(reason);
      Object.assign(result, workerCost(p, a.die, C[a.cell].die, 'place', tile));
    }
    if (a.type === 'sell') {
      if (!int(a.good, 5) || !p.goods[a.good]) return no('没有这种货物可以出售。');
      Object.assign(result, workerCost(p, a.die, a.good + 1, 'sell'));
    }
    if (result.cost > p.workers) return { ...result, reason: '需消耗 ' + result.cost + ' 名工人调整骰子，当前只有 ' + p.workers + ' 名。' };
    return { ...result, valid: true };
  }
  function combinations(list, size) {
    if (!size) return [[]];
    return list.flatMap((value, i) => combinations(list.slice(i + 1), size - 1).map(rest => [value, ...rest]));
  }
  function collectionActions(s) {
    const p = s.players[s.current], groups = Array.from({ length: 6 }, (_, d) => [d]);
    if (has(p, 5)) for (let d = 0; d < 6; d++) groups.push([d, (d + 1) % 6]);
    return groups.flatMap(depots => {
      const available = Array.from({ length: 6 }, (_, g) => depots.some(d => s.goodsDepots[d][g]) && !p.goods[g] ? g : -1).filter(g => g >= 0);
      return combinations(available, Math.min(3 - p.goods.filter(n => n).length, available.length)).map(types => ({ type: 'collect', depots, types }));
    });
  }
  function actions(s) {
    if (s.phase === 'gameover') return [];
    const p = s.players[s.current], pending = s.pending[0], candidates = [], dice = pending ? [-1] : p.dice.map((d, i) => d.used ? -2 : i).filter(i => i >= 0);
    if (pending?.type === 'collect') return collectionActions(s);
    for (const die of dice) {
      if (!pending || ['castle', 'take'].includes(pending.type)) s.depots.forEach((depot, d) => depot.forEach(tile => {
        for (const discard of p.reserved.length >= 3 ? p.reserved : [undefined]) candidates.push({ type: 'take', die, depot: d, tile, ...(discard ? { discard } : {}) });
      }));
      if (!pending || ['castle','place'].includes(pending.type)) for (const tile of p.reserved) for (const c of C) if (!p.estate[c.index] && c.type === T[tile].type) candidates.push({ type: 'place', die, tile, cell: c.index });
      if (!pending || ['castle','sell'].includes(pending.type)) p.goods.forEach((n, good) => { if (n) candidates.push({ type: 'sell', die, good }); });
      if (!pending || pending.type === 'castle') candidates.push({ type: 'workers', die });
    }
    if (pending && pending.type !== 'castle') candidates.push({ type: 'skip' });
    if (!pending) {
      candidates.push({ type: 'end' });
      if (!s.buyUsed && p.silver >= 2) [...s.depots, s.black].forEach((list, depot) => {
        if (depot !== 6 && !has(p, 6)) return;
        for (const tile of list) for (const discard of p.reserved.length >= 3 ? p.reserved : [undefined]) candidates.push({ type: 'buy', depot, tile, ...(discard ? { discard } : {}) });
      });
    }
    return candidates.filter(a => quote(s, a).valid);
  }
  function bonus(s, type, label, extra = {}) { s.pending.unshift({ type, label, ...extra }); }
  function sale(s, p, good) {
    const quantity = p.goods[good], silver = has(p, 3) ? 2 : 1;
    p.goods[good] = 0; p.sold[good] += quantity; p.silver += silver; if (has(p, 4)) p.workers++;
    award(s, p, quantity * s.players.length, 'goods', '出售 ' + quantity + ' 块 ' + (good + 1) + ' 号货物（每块 ' + s.players.length + ' 分）', { quantity, good });
    log(s, p.name + ' 售货收入 ' + silver + ' 银币' + (has(p, 4) ? '、1 名工人' : '') + '。');
  }
  function complete(s, p, cell) {
    const region = R[C[cell].region];
    if (!p.completed.includes(region.index) && region.cells.every(i => p.estate[i])) {
      p.completed.push(region.index); const area = D.regionPoints[region.cells.length], early = 12 - s.era * 2;
      award(s, p, area + early, 'regions', '完成 ' + region.cells.length + ' 格' + D.names[region.type] + '区域：规模 ' + area + ' + 阶段 ' + early, { region: region.index, area, early });
    }
    const type = C[cell].type, claims = s.colorClaims[type];
    if (!claims.includes(s.current) && C.filter(c => c.type === type).every(c => p.estate[c.index])) {
      if (claims.length < 2) {
        const points = s.players.length + (claims.length === 0 ? 3 : 0);
        p.bonuses.push({ type, place: claims.length + 1, points });
        award(s, p, points, 'colors', '第 ' + (claims.length + 1) + ' 位填满全部' + D.names[type] + '格', { color: type });
      }
      claims.push(s.current);
    }
  }
  function place(s, p, id, cell) {
    p.reserved.splice(p.reserved.indexOf(id), 1); p.estate[cell] = id; p.built.push(id);
    const t = T[id]; log(s, p.name + ' 放置' + D.name(t) + '。');
    if (t.type === 'animal') {
      const matching = R[C[cell].region].cells.map(i => T[p.estate[i]]).filter(other => other?.type === 'animal' && other.species === t.species);
      const base = matching.reduce((n, other) => n + other.count, 0), extra = has(p, 7) ? matching.length : 0;
      award(s, p, base + extra, 'animals', D.names[t.species] + '群：' + matching.map(other => other.count).join(' + ') + (extra ? ' + 知识奖励 ' + extra : ''), { species: t.species, base, extra, cell });
    }
    if (t.type === 'castle') bonus(s, 'castle', '城堡：执行一个任意点数的额外行动');
    if (t.type === 'ship') { p.order++; p.arrival = ++s.arrival; bonus(s, 'collect', '船舶：选择收货的货站'); }
    if (t.type === 'building') {
      if (t.building === 'bank') p.silver += 2;
      if (t.building === 'boarding-house') p.workers += 4;
      if (t.building === 'watchtower') award(s, p, 4, 'buildings', '瞭望塔', { building: t.building });
      if (t.building === 'warehouse') bonus(s, 'sell', '仓库：免费出售一种货物');
      if (t.building === 'city-hall') bonus(s, 'place', '市政厅：免费放置一块暂存地块');
      const allowed = { 'carpenters-workshop': ['building'], church: ['castle','mine','knowledge'], market: ['animal','ship'] }[t.building];
      if (allowed) bonus(s, 'take', D.name(t) + '：免费取一块地块', { types: allowed });
    }
    complete(s, p, cell);
  }
  function finalItems(p) {
    const list = [{ text: '未售货物 ' + sum(p.goods) + ' 块 × 1', points: sum(p.goods), category: 'remaining' },
      { text: '剩余银币 ' + p.silver + ' 枚 × 1', points: p.silver, category: 'remaining' },
      { text: '剩余工人 ' + p.workers + ' 名，每两名 1 分', points: Math.floor(p.workers / 2), category: 'remaining' }];
    for (const id of p.built) {
      const t = T[id]; if (t.type !== 'knowledge' || t.number < 15) continue;
      let n = 0, text;
      if (t.number === 15) { n = p.sold.filter(v => v).length * 3; text = p.sold.filter(v => v).length + ' 种已售货物 × 3'; }
      if (t.number >= 16 && t.number <= 23) { const b = D.buildings[t.number - 16]; const amount = p.built.filter(x => T[x].building === b.id).length; n = amount * 4; text = amount + ' 座' + b.name + ' × 4'; }
      if (t.number === 24) { const amount = new Set(p.built.map(x => T[x].species).filter(Boolean)).size; n = amount * 4; text = amount + ' 种动物 × 4'; }
      if (t.number === 25) { n = sum(p.sold); text = n + ' 块已售货物 × 1'; }
      if (t.number === 26) { n = p.bonuses.length * 2; text = p.bonuses.length + ' 枚颜色奖励 × 2'; }
      list.push({ text: '知识 ' + t.number + '：' + text, points: n, category: 'knowledge', number: t.number });
    }
    return list;
  }
  function scoreBreakdown(p, final = false) {
    const categories = { regions: 0, colors: 0, animals: 0, goods: 0, buildings: 0, knowledge: 0, remaining: 0 };
    p.ledger.forEach(entry => categories[entry.category] += entry.points);
    const estimates = final ? [] : finalItems(p), projected = sum(estimates.map(e => e.points));
    return { total: p.vp, categories, entries: p.ledger, estimates, projected, estimatedTotal: p.vp + projected };
  }
  function finish(s) {
    s.players.forEach(p => finalItems(p).forEach(item => award(s, p, item.points, item.category, item.text, { final: true })));
    s.phase = 'gameover'; s.pending = [];
    const order = turnOrder(s), rank = s.players.map((_, i) => i).sort((a, b) => s.players[b].vp - s.players[a].vp ||
      s.players[b].estate.filter(t => !t).length - s.players[a].estate.filter(t => !t).length || order.indexOf(b) - order.indexOf(a));
    s.winners = [rank[0]]; log(s, '对局结束，' + s.players[rank[0]].name + ' 获胜，' + s.players[rank[0]].vp + ' 分。');
  }
  function endTurn(s) {
    s.turnIndex++;
    if (s.turnIndex < s.players.length) { s.current = s.roundOrder[s.turnIndex]; s.buyUsed = false; return; }
    if (s.round === 5) {
      s.players.forEach(p => {
        const mines = count(p, 'mine'); p.silver += mines; if (has(p, 2)) p.workers += mines;
        log(s, p.name + ' 阶段矿山收入：' + mines + ' 银币' + (has(p, 2) ? '、' + mines + ' 名工人' : '') + '。');
      });
      if (s.era === 5) { finish(s); return; }
      s.era++; s.round = 1; refill(s);
    } else s.round++;
    beginRound(s);
  }
  function play(s, a) {
    const q = quote(s, a); insist(q.valid, q.reason);
    const p = s.players[s.current];
    if (a.type === 'end') { endTurn(s); s.moves++; validate(s); return s; }
    if (a.type === 'skip') { const effect = s.pending.shift(); log(s, p.name + ' 放弃' + effect.label + '。'); }
    else {
      if (a.type !== 'buy') { if (s.pending.length) s.pending.shift(); else p.dice[a.die].used = true; }
      p.workers -= q.cost;
      if (q.cost) log(s, p.name + ' 消耗 ' + q.cost + ' 名工人调整骰子。');
      if (a.type === 'take' || a.type === 'buy') {
        if (a.discard) { p.reserved.splice(p.reserved.indexOf(a.discard), 1); s.out.push(a.discard); log(s, p.name + ' 从暂存区弃置' + D.name(a.discard) + '。'); }
        const depot = a.depot === 6 ? s.black : s.depots[a.depot]; depot.splice(depot.indexOf(a.tile), 1); p.reserved.push(a.tile);
        if (a.type === 'buy') { p.silver -= 2; s.buyUsed = true; }
        log(s, p.name + (a.type === 'buy' ? ' 花费 2 银币购买' : ' 取得') + D.name(a.tile) + '，放入暂存区。');
      }
      if (a.type === 'place') place(s, p, a.tile, a.cell);
      if (a.type === 'sell') sale(s, p, a.good);
      if (a.type === 'workers') { const n = has(p, 14) ? 4 : 2; p.workers += n; if (has(p, 13)) p.silver++; log(s, p.name + ' 领取 ' + n + ' 名工人' + (has(p, 13) ? '和 1 银币' : '') + '。'); }
      if (a.type === 'collect') {
        let amount = 0;
        for (const depot of a.depots) for (let good = 0; good < 6; good++) if (p.goods[good] || a.types.includes(good)) {
          const n = s.goodsDepots[depot][good]; amount += n; p.goods[good] += n; s.goodsDepots[depot][good] = 0;
        }
        log(s, p.name + ' 从 ' + a.depots.map(d => d + 1).join('、') + ' 号货站收取 ' + amount + ' 块货物；下一轮按新顺序行动。');
      }
    }
    s.phase = s.pending.length ? 'bonus' : 'action'; s.moves++; validate(s); return s;
  }
  function tileValue(s, p, id) {
    const t = T[id], empty = C.filter(c => c.type === t.type && !p.estate[c.index]);
    if (!empty.length) return -18;
    if (t.type === 'building' && !has(p, 1) && !empty.some(c => !R[c.region].cells.some(i => p.estate[i] && T[p.estate[i]].building === t.building))) return -12;
    let value = ({ castle: 10, mine: (6 - s.era) * 1.4 + 3, ship: 7, animal: t.count + 3, building: 6, knowledge: 6 })[t.type];
    if (t.type === 'knowledge') {
      if (t.number < 15) value += (6 - s.era) * .5;
      if (t.number >= 16 && t.number <= 23) value += p.built.filter(x => T[x].building === D.buildings[t.number - 16].id).length * 3;
      if (t.number === 24) value += new Set(p.built.map(x => T[x].species).filter(Boolean)).size * 2;
      if (t.number === 15) value += p.sold.filter(n => n).length * 2;
      if (t.number === 25) value += sum(p.sold) * .7;
    }
    if (t.building === 'bank' && p.silver < 2) value += 2;
    if (t.building === 'boarding-house' && p.workers < 2) value += 2;
    if (t.building === 'city-hall' && p.reserved.length > 1) value += 3;
    if (t.type === 'ship') value += Math.max(...s.goodsDepots.map(goods => sum(goods))) * .9;
    if (!empty.some(c => c.neighbors.some(i => p.estate[i]))) value -= 5;
    return value;
  }
  function chooseAI(s) {
    const legal = actions(s); insist(legal.length, '当前没有可执行的行动。');
    const p = s.players[s.current];
    function value(a) {
      const q = quote(s, a);
      if (a.type === 'skip') return -90;
      if (a.type === 'end') return .1;
      if (a.type === 'collect') return a.depots.reduce((n, d) => n + s.goodsDepots[d].reduce((v, amount, g) => v + (p.goods[g] || a.types.includes(g) ? amount * (2 + s.players.length * .5) : 0), 0), 0);
      if (a.type === 'workers') return (p.workers < 2 ? 5 : p.workers < 4 ? 2 : -2) + (has(p, 13) ? 1.8 : 0) + (has(p, 14) ? 1 : 0);
      if (a.type === 'sell') return p.goods[a.good] * s.players.length + (p.silver < 2 ? 3 : 1) + (has(p, 3) ? 1.5 : 0) - q.cost * 1.8;
      const usefulness = tileValue(s, p, a.tile);
      if (a.type === 'take' || a.type === 'buy') return usefulness * .65 - q.cost * 2 - p.reserved.length * 1.7 - (a.discard ? 7 + tileValue(s, p, a.discard) * .5 : 0) - (a.type === 'buy' ? 1.4 : 0);
      const region = R[C[a.cell].region], left = region.cells.filter(i => !p.estate[i]).length;
      let gain = 9 + usefulness * .6 - q.cost * 1.7 + 4 / left + C[a.cell].neighbors.filter(i => !p.estate[i]).length * .35;
      if (left === 1) gain += D.regionPoints[region.cells.length] + 12 - s.era * 2;
      if (T[a.tile].type === 'animal') gain += region.cells.reduce((n, i) => n + (T[p.estate[i]]?.species === T[a.tile].species ? T[p.estate[i]].count : 0), 0);
      return gain;
    }
    return legal.reduce((best, action) => value(action) > value(best) ? action : best, legal[0]);
  }
  function validate(s) {
    insist(s?.version === 1 && s.kind === 'burgundy' && s.rules === 'classic-2011', '勃艮第城堡存档版本不正确。');
    insist(Array.isArray(s.players) && s.players.length >= 2 && s.players.length <= 4 && int(s.current, s.players.length - 1), '玩家数据不正确。');
    insist(int(s.era - 1, 4) && int(s.round - 1, 4) && ['action','bonus','gameover'].includes(s.phase) && int(s.moves), '阶段或轮次不正确。');
    insist(Array.isArray(s.pending) && (s.phase === 'bonus') === Boolean(s.pending.length), '额外行动状态不正确。');
    insist(s.roundOrder.length === s.players.length && new Set(s.roundOrder).size === s.players.length && s.roundOrder.every(i => int(i, s.players.length - 1)), '本轮行动顺序不正确。');
    const ids = [...Object.values(s.supply).flat(), ...s.depots.flat(), ...s.black, ...s.out], goods = Array(6).fill(0);
    insist(s.depots.length === 6 && s.goodsDepots.length === 6, '货站数量不正确。');
    for (const list of [...s.goodsDepots, s.unusedGoods]) { insist(Array.isArray(list) && list.length === 6 && list.every(n => int(n, 7)), '货物库存不正确。'); list.forEach((n, g) => goods[g] += n); }
    for (const good of [...s.goodsDeck, ...s.phaseGoods]) { insist(int(good, 5), '货物牌不正确。'); goods[good]++; }
    s.players.forEach(p => {
      insist(p.map === 1 && p.estate.length === 37 && p.reserved.length <= 3 && int(p.silver) && int(p.workers) && int(p.vp) && int(p.order, 6) && int(p.arrival), '领地或资源数据不正确。');
      insist(p.dice.length === 2 && p.dice.every(d => int(d.value - 1, 5) && typeof d.used === 'boolean'), '骰子数据不正确。');
      insist(p.goods.length === 6 && p.sold.length === 6 && [...p.goods, ...p.sold].every(n => int(n, 7)) && p.goods.filter(n => n).length <= 3, '玩家货仓不正确。');
      p.goods.forEach((n, g) => goods[g] += n + p.sold[g]);
      insist(sum(p.ledger.map(entry => entry.points)) === p.vp && p.ledger.every(e => int(e.points) && e.category), '计分明细与总分不一致。');
      const built = p.estate.filter(Boolean); insist(built.length === p.built.length && built.every(id => p.built.includes(id)), '领地地块清单不一致。');
      p.estate.forEach((id, i) => { if (id) insist(T[id] && T[id].type === C[i].type, '领地颜色不匹配。'); });
      ids.push(...built, ...p.reserved);
    });
    insist(ids.length === 164 && new Set(ids).size === 164 && ids.every(id => T[id]), '地块总数或唯一性不正确。');
    insist(goods.every(n => n === 7), '货物总数不守恒。');
    if (s.phase === 'gameover') insist(s.winners.length === 1 && int(s.winners[0], s.players.length - 1), '胜者数据不正确。');
    return true;
  }
  return Object.freeze({ newGame, play, actions, quote, chooseAI, validate, has, count, workerCost, placementReason, finalItems, scoreBreakdown, turnOrder });
});
