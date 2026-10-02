(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../data/puerto-rico.js'));
  else root.PuertoEngine = factory(root.PuertoData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';
  const BUILDING = new Map(D.buildings.map(b => [b.id, b]));
  const ROLE = new Map(D.roles.map(r => [r.id, r]));
  const assert = (ok, text) => { if (!ok) throw Error(text); };
  const sum = object => Object.values(object).reduce((a, b) => a + b, 0);
  const integer = (value, max = Infinity) => Number.isInteger(value) && value >= 0 && value <= max;
  const active = (p, id) => p.city.some(b => b.id === id && b.workers > 0);
  const spaces = p => p.city.reduce((n, b) => n + BUILDING.get(b.id).spaces, 0);
  const workers = p => p.loose + p.city.reduce((n, b) => n + b.workers, 0) + p.island.reduce((n, t) => n + t.workers, 0);
  const plantationCount = (p, kind, staffed = false) => p.island.filter(t => t.kind === kind && (!staffed || t.workers > 0)).length;
  const capacity = (p, kind, staffed = false) => kind === 'corn' ? 12 : p.city.reduce((n, b) => n + (BUILDING.get(b.id).good === kind ? staffed ? b.workers : BUILDING.get(b.id).workers : 0), 0);
  function rng(s) { let x = s.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rng = x >>> 0 || 1; return s.rng / 4294967296; }
  function shuffle(s, list) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng(s) * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }
  function log(s, text) { s.log.push(text); if (s.log.length > 180) s.log.shift(); }
  function draw(s) { if (!s.plantationDeck.length && s.plantationDiscard.length) s.plantationDeck = shuffle(s, s.plantationDiscard.splice(0)); return s.plantationDeck.pop() || null; }
  function refillPlantations(s) {
    s.plantationDiscard.push(...s.faceUp.splice(0));
    for (let i = 0; i <= s.players.length; i++) { const tile = draw(s); if (tile) s.faceUp.push(tile); }
  }
  function newGame(seats, seed = Date.now()) {
    assert(Array.isArray(seats) && seats.length >= 2 && seats.length <= 5, '波多黎各支持 2–5 人。');
    const n = seats.length, roleIds = D.roles.slice(0, 6).map(r => r.id);
    if (n !== 3) roleIds.push('prospector'); if (n === 5) roleIds.push('prospector2');
    const s = { version: 1, kind: 'puerto-rico', rules: 'deluxe-2019-base', rng: seed >>> 0 || 1,
      round: 1, governor: 0, chooser: 0, chosen: 0, current: 0, phase: 'role', role: null, picker: null, privilege: true,
      roles: roleIds.map(id => ({ id, coins: 0, usedBy: null })),
      bank: Object.fromEntries(D.goods.map(g => [g, D.barrels[g] - (n === 2 ? 2 : 0)])),
      supplyWorkers: n === 2 ? 40 : ({ 3: 55, 4: 75, 5: 95 })[n], workerShip: n,
      vpSupply: ({ 2: 65, 3: 75, 4: 100, 5: 126 })[n],
      ships: (n === 2 ? [4, 6] : [n + 1, n + 2, n + 3]).map(size => ({ size, kind: null, count: 0 })),
      trading: [], quarries: n === 2 ? 5 : 8, plantationDeck: [], plantationDiscard: [], faceUp: [],
      buildings: Object.fromEntries(D.buildings.map(b => [b.id, n === 2 ? b.good ? 2 : 1 : b.stock])),
      acted: 0, haciendaUsed: false, produced: {}, wharfUsed: [], wharfDeclined: [], captainBonus: false,
      endReasons: [], winners: [], log: [], moves: 0,
      players: seats.map((seat, i) => ({ name: String(seat.name || '玩家 ' + (i + 1)).slice(0, 20), ai: Boolean(seat.ai),
        coins: n === 2 ? 3 : n - 1, vp: 0, loose: 0, goods: Object.fromEntries(D.goods.map(g => [g, 0])), city: [], island: [] })) };
    let serial = 0;
    for (const kind of D.goods) for (let i = 0; i < D.plantations[kind] - (n === 2 ? 3 : 0); i++) s.plantationDeck.push({ id: 't' + serial++, kind });
    s.players.forEach((p, i) => {
      const kind = i < Math.ceil(n / 2) ? 'indigo' : 'corn';
      const index = s.plantationDeck.findIndex(t => t.kind === kind);
      p.island.push({ ...s.plantationDeck.splice(index, 1)[0], workers: 0 });
    });
    shuffle(s, s.plantationDeck); refillPlantations(s);
    log(s, '第 1 轮开始，由 ' + s.players[0].name + ' 担任总督。'); validate(s); return s;
  }
  function markEnd(s, reason) { if (!s.endReasons.includes(reason)) s.endReasons.push(reason); }
  function score(p) {
    const shipping = p.vp, building = p.city.reduce((n, b) => n + BUILDING.get(b.id).points, 0);
    const bonus = {};
    if (active(p, 'guild_hall')) bonus.guild_hall = p.city.reduce((n, b) => n + (BUILDING.get(b.id).good ? ['small_indigo', 'small_sugar'].includes(b.id) ? 1 : 2 : 0), 0);
    if (active(p, 'residence')) bonus.residence = Math.max(4, p.island.length - 5);
    if (active(p, 'fortress')) bonus.fortress = Math.floor(workers(p) / 3);
    if (active(p, 'customs_house')) bonus.customs_house = Math.floor(p.vp / 4);
    if (active(p, 'city_hall')) bonus.city_hall = p.city.filter(b => !BUILDING.get(b.id).good).length;
    return { shipping, building, bonus, extra: sum(bonus), total: shipping + building + sum(bonus) };
  }
  function endRole(s) {
    log(s, ROLE.get(s.role)?.name + '阶段结束。');
    s.role = null; s.acted = 0;
    const max = s.players.length === 2 ? 6 : s.players.length;
    if (s.chosen >= max) {
      if (s.endReasons.length) {
        s.phase = 'gameover';
        const best = Math.max(...s.players.map(p => score(p).total));
        const candidates = s.players.map((p, i) => i).filter(i => score(s.players[i]).total === best);
        const wealth = Math.max(...candidates.map(i => s.players[i].coins + sum(s.players[i].goods)));
        s.winners = candidates.filter(i => s.players[i].coins + sum(s.players[i].goods) === wealth);
        log(s, '对局结束：' + s.endReasons.join('、') + '。'); return;
      }
      s.roles.forEach(r => { if (r.usedBy === null) r.coins++; r.usedBy = null; });
      s.governor = (s.governor + 1) % s.players.length; s.chooser = s.governor; s.chosen = 0; s.round++;
      log(s, '第 ' + s.round + ' 轮开始，' + s.players[s.governor].name + ' 接任总督。');
    } else s.chooser = (s.chooser + 1) % s.players.length;
    s.current = s.chooser; s.phase = 'role'; s.picker = null;
  }
  function colonistForAbility(s) {
    if (s.supplyWorkers) { s.supplyWorkers--; return 1; }
    if (s.workerShip) { s.workerShip--; return 1; }
    return 0;
  }
  function quoteBuilding(s, index, id, picker = s.picker, privilege = s.privilege) {
    const p = s.players[index], b = BUILDING.get(id); if (!b) return { valid: false, reason: '未知建筑。' };
    const quarry = Math.min(b.points, plantationCount(p, 'quarry', true));
    const discount = picker === index && privilege ? 1 : 0;
    const cost = Math.max(0, b.cost - quarry - discount);
    const reason = !s.buildings[id] ? '这座建筑已售罄。' : p.city.some(x => x.id === id) ? '同名建筑只能拥有一座。' : spaces(p) + b.spaces > 12 ? '城市空位不足，大型建筑需要两格。' : p.coins < cost ? '需要 ' + cost + ' 金币，当前只有 ' + p.coins + '。' : '';
    return { valid: !reason, reason, cost, quarry, discount, original: b.cost };
  }
  function production(p) {
    return Object.fromEntries(D.goods.map(g => [g, Math.min(plantationCount(p, g, true), capacity(p, g, true))]));
  }
  function tradePrice(s, index, good) {
    const p = s.players[index]; return D.goods.indexOf(good) + (s.picker === index && s.privilege ? 1 : 0) + (active(p, 'small_market') ? 1 : 0) + (active(p, 'large_market') ? 2 : 0);
  }
  function tradeReason(s, index, good) {
    const p = s.players[index];
    return !p.goods[good] ? '没有可出售的' + D.names[good] + '。' : s.trading.length >= 4 ? '交易所已满，本阶段不能再出售。' : s.trading.includes(good) && !active(p, 'office') ? '交易所已有' + D.names[good] + '，需要已进驻的办公室才能出售同种货物。' : '';
  }
  function shipments(s, index) {
    const p = s.players[index], moves = [];
    for (const good of D.goods) {
      if (!p.goods[good]) continue;
      const existing = s.ships.findIndex(ship => ship.kind === good);
      const choices = existing >= 0 ? [existing] : s.ships.map((ship, i) => ship.kind === null ? i : -1).filter(i => i >= 0);
      const best = Math.max(0, ...choices.map(i => Math.min(p.goods[good], s.ships[i].size - s.ships[i].count)));
      for (const ship of choices) if (best > 0 && Math.min(p.goods[good], s.ships[ship].size - s.ships[ship].count) === best) moves.push({ type: 'ship', good, ship, count: best });
    }
    return moves;
  }
  function wharfAvailable(s, index) {
    return active(s.players[index], 'wharf') && !s.wharfUsed.includes(index) && !s.wharfDeclined.includes(index) && sum(s.players[index].goods) > 0;
  }
  function storageSlots(p) { return (active(p, 'small_warehouse') ? 1 : 0) + (active(p, 'large_warehouse') ? 2 : 0); }
  function finishCaptain(s) {
    for (const ship of s.ships) if (ship.count === ship.size) { s.bank[ship.kind] += ship.count; ship.count = 0; ship.kind = null; }
    endRole(s);
  }
  function startStorage(s) {
    s.phase = 'storage'; s.acted = 0; s.current = s.picker;
    while (s.acted < s.players.length && !sum(s.players[s.current].goods)) { s.acted++; s.current = (s.current + 1) % s.players.length; }
    if (s.acted === s.players.length) finishCaptain(s);
  }
  function nextCaptain(s, first = false) {
    const start = first ? s.picker : (s.current + 1) % s.players.length;
    for (let n = 0; n < s.players.length; n++) {
      const i = (start + n) % s.players.length;
      if (shipments(s, i).length || wharfAvailable(s, i)) { s.current = i; s.phase = 'captain'; return; }
    }
    startStorage(s);
  }
  function nextNormal(s) {
    s.acted++;
    if (s.acted < s.players.length) { s.current = (s.current + 1) % s.players.length; s.haciendaUsed = false; return; }
    if (s.role === 'settler') refillPlantations(s);
    if (s.role === 'mayor') {
      const needed = Math.max(s.players.length, s.players.reduce((n, p) => n + p.city.reduce((m, b) => m + BUILDING.get(b.id).workers - b.workers, 0), 0));
      if (s.supplyWorkers < needed) markEnd(s, '居民供应不足以补满来船');
      s.workerShip = Math.min(needed, s.supplyWorkers); s.supplyWorkers -= s.workerShip;
    }
    if (s.role === 'trader' && s.trading.length === 4) { for (const g of s.trading) s.bank[g]++; s.trading = []; }
    if (s.role === 'craftsman' && s.privilege && Object.keys(s.produced).some(g => s.produced[g] > 0 && s.bank[g])) { s.phase = 'craftsmanBonus'; s.current = s.picker; return; }
    endRole(s);
  }
  function chooseRole(s, action) {
    const token = s.roles.find(r => r.id === action.role); assert(token && token.usedBy === null, '这个角色本轮已经被选过。');
    s.picker = s.chooser; s.current = s.picker; s.role = token.id === 'prospector2' ? 'prospector' : token.id;
    s.privilege = action.privilege !== false; token.usedBy = s.picker;
    s.players[s.picker].coins += token.coins; token.coins = 0; s.chosen++; s.acted = 0; s.haciendaUsed = false;
    log(s, s.players[s.picker].name + ' 选择了' + ROLE.get(s.role).name + '。');
    s.phase = s.role;
    if (s.role === 'prospector') { if (s.privilege) s.players[s.picker].coins++; endRole(s); }
    if (s.role === 'mayor') {
      if (s.privilege && s.supplyWorkers) { s.supplyWorkers--; s.players[s.picker].loose++; }
      for (let i = 0, count = s.workerShip; i < count; i++) s.players[(s.picker + i) % s.players.length].loose++;
      s.workerShip = 0;
    }
    if (s.role === 'captain') { s.wharfUsed = []; s.wharfDeclined = []; s.captainBonus = false; nextCaptain(s, true); }
    if (s.role === 'craftsman') s.produced = {};
  }
  function allocationReason(p, allocation) {
    if (!allocation || !Array.isArray(allocation.island) || !Array.isArray(allocation.city) || allocation.island.length !== p.island.length || allocation.city.length !== p.city.length) return '居民安排与当前版图不匹配。';
    if (!allocation.island.every(n => integer(n, 1)) || !allocation.city.every((n, i) => integer(n, BUILDING.get(p.city[i].id).workers))) return '一个工位最多安排一位居民。';
    const assigned = sum(allocation.island) + sum(allocation.city), all = workers(p);
    if (assigned > all) return '安排的居民超过你拥有的人数。';
    const slots = p.island.length + p.city.reduce((n, b) => n + BUILDING.get(b.id).workers, 0);
    if (assigned !== Math.min(slots, all)) return '仍有 ' + (Math.min(slots, all) - assigned) + ' 位居民需要进驻空工位。只有所有工位已满，居民才能留在圣胡安。';
    return '';
  }
  function play(s, action) {
    assert(s.phase !== 'gameover', '对局已结束。'); assert(action && typeof action.type === 'string', '请选择一个行动。');
    const p = s.players[s.current], at = s.current;
    if (s.phase === 'role') { assert(action.type === 'role', '请先选择角色。'); chooseRole(s, action); }
    else if (s.phase === 'settler') {
      if (action.type === 'hacienda') {
        assert(active(p, 'hacienda') && !s.haciendaUsed && p.island.length < 12 && (s.plantationDeck.length || s.plantationDiscard.length), '现在不能使用庄园。');
        const tile = draw(s); p.island.push({ ...tile, workers: 0 }); s.haciendaUsed = true;
        log(s, p.name + ' 用庄园暗抽了' + D.names[tile.kind] + '种植园。');
      } else {
        assert(['settle', 'pass'].includes(action.type), '请选择种植园或跳过。');
        if (action.type === 'settle') {
          assert(p.island.length < 12, '岛屿已满 12 格。'); let tile;
          if (action.tile === 'quarry') {
            assert(s.quarries > 0 && ((s.picker === at && s.privilege) || active(p, 'construction_hut')), '只有拓荒者特权或已进驻的建筑工棚才能取得采石场。');
            tile = { id: 'q' + s.quarries, kind: 'quarry' }; s.quarries--;
          } else { const i = s.faceUp.findIndex(t => t.id === action.tile); assert(i >= 0, '这块种植园已经被拿走。'); tile = s.faceUp.splice(i, 1)[0]; }
          p.island.push({ ...tile, workers: active(p, 'hospice') && action.staff !== false ? colonistForAbility(s) : 0 });
          log(s, p.name + ' 获得了' + D.names[tile.kind] + (tile.kind === 'quarry' ? '。' : '种植园。'));
        }
        nextNormal(s);
      }
    } else if (s.phase === 'mayor') {
      assert(action.type === 'allocate', '请安排居民后确认。'); const reason = allocationReason(p, action); assert(!reason, reason);
      const all = workers(p); p.island.forEach((t, i) => t.workers = action.island[i]); p.city.forEach((b, i) => b.workers = action.city[i]); p.loose = all - sum(action.island) - sum(action.city);
      log(s, p.name + ' 安排了 ' + (all - p.loose) + ' 位居民进驻，圣胡安留有 ' + p.loose + ' 位。'); nextNormal(s);
    } else if (s.phase === 'builder') {
      assert(['build', 'pass'].includes(action.type), '请选择建筑或跳过。');
      if (action.type === 'build') {
        const q = quoteBuilding(s, at, action.building, s.picker, s.privilege && action.privilege !== false); assert(q.valid, q.reason);
        const staff = active(p, 'university') && action.staff !== false ? colonistForAbility(s) : 0;
        p.coins -= q.cost; s.buildings[action.building]--; p.city.push({ id: action.building, workers: staff });
        log(s, p.name + ' 花费 ' + q.cost + ' 金币建造了' + BUILDING.get(action.building).name + '。');
        if (spaces(p) === 12) markEnd(s, '城市占满 12 格');
      }
      nextNormal(s);
    } else if (s.phase === 'craftsman') {
      assert(['produce', 'pass'].includes(action.type), '请生产货物或跳过。');
      if (action.type === 'produce') {
        const amounts = production(p), made = {};
        for (const g of D.goods) { made[g] = Math.min(s.bank[g], amounts[g]); p.goods[g] += made[g]; s.bank[g] -= made[g]; }
        const types = D.goods.filter(g => made[g]).length;
        if (active(p, 'factory')) p.coins += [0, 0, 1, 2, 3, 5][types];
        if (at === s.picker) s.produced = made;
        log(s, p.name + ' 生产：' + (D.goods.filter(g => made[g]).map(g => D.names[g] + ' ' + made[g]).join('、') || '当前没有可生产的货物') + '。');
      }
      nextNormal(s);
    } else if (s.phase === 'craftsmanBonus') {
      assert(['bonus', 'pass'].includes(action.type), '请选择工匠的额外货物或放弃。');
      if (action.type === 'bonus') { assert(s.produced[action.good] > 0 && s.bank[action.good] > 0, '额外货物必须是本阶段实际生产过且供应区还有的种类。'); s.bank[action.good]--; p.goods[action.good]++; }
      endRole(s);
    } else if (s.phase === 'trader') {
      assert(['trade', 'pass'].includes(action.type), '请选择出售货物或跳过。');
      if (action.type === 'trade') { const reason = tradeReason(s, at, action.good); assert(!reason, reason); const coins = tradePrice(s, at, action.good); p.goods[action.good]--; p.coins += coins; s.trading.push(action.good); log(s, p.name + ' 出售一桶' + D.names[action.good] + '，获得 ' + coins + ' 金币。'); }
      nextNormal(s);
    } else if (s.phase === 'captain') {
      if (action.type === 'pass') { assert(!shipments(s, at).length, '公共货船仍可装运，船长阶段必须装运。'); s.wharfDeclined.push(at); }
      else {
        let count;
        if (action.type === 'wharf') { assert(wharfAvailable(s, at) && D.goods.includes(action.good) && p.goods[action.good] > 0, '私人码头本阶段只能使用一次，且必须进驻。'); count = p.goods[action.good]; s.wharfUsed.push(at); s.bank[action.good] += count; }
        else { assert(action.type === 'ship', '请选择一种货物装运。'); const move = shipments(s, at).find(m => m.good === action.good && m.ship === action.ship); assert(move, '必须选能装下最多该种货物的货船；已有同种货物时只能装上那艘船。'); count = move.count; s.ships[action.ship].kind = action.good; s.ships[action.ship].count += count; }
        p.goods[action.good] -= count;
        const bonus = (active(p, 'harbor') ? 1 : 0) + (at === s.picker && s.privilege && !s.captainBonus ? 1 : 0);
        if (at === s.picker) s.captainBonus = true; p.vp += count + bonus; s.vpSupply -= count + bonus;
        if (s.vpSupply <= 0) markEnd(s, '胜利分供应耗尽');
        log(s, p.name + (action.type === 'wharf' ? ' 通过私人码头' : '') + ' 装运 ' + count + ' 桶' + D.names[action.good] + '，获得 ' + (count + bonus) + ' 分。');
      }
      nextCaptain(s);
    } else if (s.phase === 'storage') {
      assert(action.type === 'store', '请选择保留货物。'); const types = action.types || [];
      assert(Array.isArray(types) && new Set(types).size === types.length && types.length <= storageSlots(p) && types.every(g => D.goods.includes(g) && p.goods[g]), '仓库保留的货物种类超过容量或不在库存中。');
      assert(action.single == null || D.goods.includes(action.single) && p.goods[action.single], '基本保留必须是库存中的一桶货物。');
      let discarded = 0;
      for (const g of D.goods) { const keep = types.includes(g) ? p.goods[g] : action.single === g ? 1 : 0; discarded += p.goods[g] - keep; s.bank[g] += p.goods[g] - keep; p.goods[g] = keep; }
      log(s, p.name + ' 保留 ' + sum(p.goods) + ' 桶货物，归还 ' + discarded + ' 桶。'); s.acted++; s.current = (s.current + 1) % s.players.length;
      while (s.acted < s.players.length && !sum(s.players[s.current].goods)) { s.acted++; s.current = (s.current + 1) % s.players.length; }
      if (s.acted === s.players.length) finishCaptain(s);
    } else throw Error('未知阶段：' + s.phase);
    s.moves++; validate(s); return s;
  }
  function actions(s) {
    const at = s.current, p = s.players[at];
    if (s.phase === 'gameover') return [];
    if (s.phase === 'role') return s.roles.filter(r => r.usedBy === null).map(r => ({ type: 'role', role: r.id }));
    if (s.phase === 'settler') return [
      ...(p.island.length < 12 ? s.faceUp.map(t => ({ type: 'settle', tile: t.id })) : []),
      ...(p.island.length < 12 && s.quarries && ((s.picker === at && s.privilege) || active(p, 'construction_hut')) ? [{ type: 'settle', tile: 'quarry' }] : []),
      ...(active(p, 'hacienda') && !s.haciendaUsed && p.island.length < 12 && (s.plantationDeck.length || s.plantationDiscard.length) ? [{ type: 'hacienda' }] : []), { type: 'pass' }];
    if (s.phase === 'mayor') return [autoAllocation(p)];
    if (s.phase === 'builder') return [...D.buildings.filter(b => quoteBuilding(s, at, b.id).valid).map(b => ({ type: 'build', building: b.id })), { type: 'pass' }];
    if (s.phase === 'craftsman') return [{ type: 'produce' }, { type: 'pass' }];
    if (s.phase === 'craftsmanBonus') return [...D.goods.filter(g => s.produced[g] && s.bank[g]).map(g => ({ type: 'bonus', good: g })), { type: 'pass' }];
    if (s.phase === 'trader') return [...D.goods.filter(g => !tradeReason(s, at, g)).map(g => ({ type: 'trade', good: g })), { type: 'pass' }];
    if (s.phase === 'captain') return [...shipments(s, at), ...(wharfAvailable(s, at) ? D.goods.filter(g => p.goods[g]).map(g => ({ type: 'wharf', good: g })) : []), ...(!shipments(s, at).length ? [{ type: 'pass' }] : [])];
    if (s.phase === 'storage') return [autoStorage(p)]; return [];
  }
  function autoAllocation(p) {
    const action = { type: 'allocate', island: p.island.map(() => 0), city: p.city.map(() => 0) }; let left = workers(p);
    const addIsland = i => { if (left && !action.island[i]) { action.island[i]++; left--; return true; } return false; };
    const addCity = i => { if (left && action.city[i] < BUILDING.get(p.city[i].id).workers) { action.city[i]++; left--; return true; } return false; };
    for (const id of ['wharf', 'harbor', 'factory', 'small_market', 'large_market']) { const i = p.city.findIndex(b => b.id === id); if (i >= 0) addCity(i); }
    p.island.forEach((t, i) => { if (t.kind === 'corn') addIsland(i); });
    if (spaces(p) < 11) p.island.forEach((t, i) => { if (t.kind === 'quarry') addIsland(i); });
    for (const good of ['coffee', 'tobacco', 'sugar', 'indigo']) {
      const farms = p.island.map((t, i) => t.kind === good ? i : -1).filter(i => i >= 0);
      for (const i of farms) {
        const factory = p.city.findIndex((b, j) => BUILDING.get(b.id).good === good && action.city[j] < BUILDING.get(b.id).workers);
        if (factory >= 0 && left >= 2) { addIsland(i); addCity(factory); }
      }
    }
    for (const id of ['university', 'hospice', 'hacienda', 'office', 'construction_hut', 'small_warehouse', 'large_warehouse', 'guild_hall', 'residence', 'fortress', 'customs_house', 'city_hall']) { const i = p.city.findIndex(b => b.id === id); if (i >= 0) addCity(i); }
    p.island.forEach((_, i) => addIsland(i)); p.city.forEach((b, i) => { while (left && action.city[i] < BUILDING.get(b.id).workers) addCity(i); }); return action;
  }
  function autoStorage(p) {
    const sorted = D.goods.filter(g => p.goods[g]).sort((a, b) => p.goods[b] - p.goods[a] || D.goods.indexOf(b) - D.goods.indexOf(a));
    const types = sorted.slice(0, storageSlots(p)), single = sorted.find(g => !types.includes(g)) || null;
    return { type: 'store', types, single };
  }
  function buildingValue(s, index, id) {
    const p = s.players[index], b = BUILDING.get(id), q = quoteBuilding(s, index, id, index, true);
    let value = b.points * .6 - q.cost * .24;
    if (b.good) value += plantationCount(p, b.good) > capacity(p, b.good) ? 7 : capacity(p, b.good) ? -5 : plantationCount(p, b.good) ? 4 : -3;
    else {
      const types = D.goods.filter(g => plantationCount(p, g) && capacity(p, g)).length;
      value += ({ small_market: 3.5, large_market: 3, hacienda: s.round < 8 ? 2.5 : -.5, construction_hut: s.round < 7 ? 1.5 : -1,
        small_warehouse: 1.7, large_warehouse: active(p, 'small_warehouse') ? -.5 : 1.8, hospice: s.round < 8 ? 3 : 0,
        office: 1.2, factory: types * 1.7, university: s.round < 10 ? 2.7 : .3, harbor: 4.5, wharf: 5.5,
        guild_hall: p.city.filter(x => BUILDING.get(x.id).good).length * 1.4, residence: Math.max(3, p.island.length - 5),
        fortress: workers(p) / 3, customs_house: p.vp / 4, city_hall: p.city.filter(x => !BUILDING.get(x.id).good).length })[id] || 0;
      if (!types && b.spaces === 1) value -= 2;
    }
    if (spaces(p) + b.spaces === 12) value += score(p).total >= Math.max(...s.players.map(x => score(x).total)) ? 4 : -2;
    return value;
  }
  function chooseAI(s) {
    const at = s.current, p = s.players[at], legal = actions(s);
    assert(legal.length, '电脑没有可执行行动。');
    const best = (list, evaluate) => list.reduce((a, b) => !a || evaluate(b) > evaluate(a) ? b : a, null);
    if (s.phase === 'role') return best(legal, a => {
      const role = a.role === 'prospector2' ? 'prospector' : a.role;
      const prod = sum(production(p)), totalGoods = sum(p.goods), empty = p.island.filter(t => !t.workers).length + p.city.reduce((n, b) => n + BUILDING.get(b.id).workers - b.workers, 0);
      let value = 0;
      if (role === 'settler') value = p.island.length < 12 ? p.island.length < 5 ? 3.4 : 2.5 : -4;
      if (role === 'mayor') value = empty ? 2.5 + Math.min(empty, 5) * .6 + (p.loose ? 1 : 0) : -3;
      if (role === 'builder') {
        const buildings = D.buildings.filter(b => quoteBuilding(s, at, b.id, at, true).valid);
        value = buildings.length ? Math.max(...buildings.map(b => buildingValue(s, at, b.id))) : -3;
      }
      if (role === 'craftsman') value = prod ? 2 + prod * 1.1 - totalGoods * .6 : -4;
      if (role === 'trader') {
        const sell = D.goods.filter(g => !tradeReason(s, at, g)); value = sell.length ? 2 + Math.max(...sell.map(g => D.goods.indexOf(g))) * 1.2 + (active(p, 'small_market') ? 1 : 0) + (active(p, 'large_market') ? 2 : 0) : -3;
      }
      if (role === 'captain') value = totalGoods ? Math.min(totalGoods, 10) * .9 + 2 : -3;
      if (role === 'prospector') value = 1.8;
      return value + s.roles.find(r => r.id === a.role).coins * 1.25;
    });
    if (s.phase === 'settler') {
      const choices = legal.filter(a => a.type === 'settle');
      if (legal.some(a => a.type === 'hacienda') && p.island.length < 10) return { type: 'hacienda' };
      return best(choices, a => {
        const kind = a.tile === 'quarry' ? 'quarry' : s.faceUp.find(t => t.id === a.tile).kind;
        if (kind === 'quarry') return plantationCount(p, 'quarry') < 2 && spaces(p) < 9 ? 3.8 : -1;
        const count = plantationCount(p, kind);
        return kind === 'corn' ? 3.5 - count * .3 : 3 + (capacity(p, kind) > count ? 2 : 0) - count * .7 + D.goods.indexOf(kind) * .15;
      }) || { type: 'pass' };
    }
    if (s.phase === 'builder') {
      const choice = best(legal.filter(a => a.type === 'build'), a => buildingValue(s, at, a.building));
      return choice && buildingValue(s, at, choice.building) > 0 ? choice : { type: 'pass' };
    }
    if (s.phase === 'craftsman') return { type: 'produce' };
    if (s.phase === 'craftsmanBonus' || s.phase === 'trader') return best(legal.filter(a => a.good), a => D.goods.indexOf(a.good) + (p.goods[a.good] ? 0 : .2)) || { type: 'pass' };
    if (s.phase === 'captain') return best(legal.filter(a => a.good), a => (a.type === 'wharf' ? p.goods[a.good] : a.count) - (a.type === 'wharf' ? .4 : 0)) || { type: 'pass' };
    return legal[0];
  }
  function validate(s) {
    assert(s && s.version === 1 && s.kind === 'puerto-rico' && Array.isArray(s.players) && s.players.length >= 2 && s.players.length <= 5, '无效的波多黎各存档。');
    const n = s.players.length;
    assert(integer(s.current, n - 1) && integer(s.governor, n - 1) && integer(s.chooser, n - 1) && integer(s.moves), '行动顺序无效。');
    assert(['role', 'settler', 'mayor', 'builder', 'craftsman', 'craftsmanBonus', 'trader', 'captain', 'storage', 'gameover'].includes(s.phase), '对局阶段无效。');
    for (const g of D.goods) {
      const total = s.bank[g] + s.players.reduce((v, p) => v + p.goods[g], 0) + s.trading.filter(x => x === g).length + s.ships.reduce((v, ship) => v + (ship.kind === g ? ship.count : 0), 0);
      assert(total === D.barrels[g] - (n === 2 ? 2 : 0) && integer(s.bank[g]), D.names[g] + '货物总量不守恒。');
    }
    let allWorkers = s.supplyWorkers + s.workerShip;
    const tileIds = [], tileCounts = Object.fromEntries(D.goods.map(g => [g, 0])); let quarries = s.quarries;
    const tiles = [...s.plantationDeck, ...s.plantationDiscard, ...s.faceUp];
    for (const p of s.players) {
      assert(integer(p.coins) && integer(p.vp) && integer(p.loose) && p.island.length <= 12 && spaces(p) <= 12, '金币、分数、居民或版图数量无效。');
      assert(D.goods.every(g => integer(p.goods[g])), '库存无效。');
      assert(new Set(p.city.map(b => b.id)).size === p.city.length, '出现重复建筑。');
      for (const b of p.city) assert(BUILDING.has(b.id) && integer(b.workers, BUILDING.get(b.id).workers), '建筑或进驻居民无效。');
      for (const tile of p.island) { assert(integer(tile.workers, 1), '种植园工位无效。'); if (tile.kind === 'quarry') quarries++; else tiles.push(tile); }
      allWorkers += workers(p);
    }
    for (const tile of tiles) { assert(D.goods.includes(tile.kind), '种植园种类无效。'); tileIds.push(tile.id); tileCounts[tile.kind]++; }
    assert(new Set(tileIds).size === tileIds.length && D.goods.every(g => tileCounts[g] === D.plantations[g] - (n === 2 ? 3 : 0)), '种植园总量不守恒。');
    assert(integer(s.supplyWorkers) && integer(s.workerShip) && allWorkers === ({ 2: 42, 3: 58, 4: 79, 5: 100 })[n], '居民总量不守恒。');
    assert(quarries === (n === 2 ? 5 : 8) && integer(s.quarries), '采石场总量不守恒。');
    for (const b of D.buildings) assert(integer(s.buildings[b.id]) && s.buildings[b.id] + s.players.filter(p => p.city.some(x => x.id === b.id)).length === (n === 2 ? b.good ? 2 : 1 : b.stock), '建筑数量不守恒：' + b.name);
    assert(s.trading.length <= 4 && s.ships.every(ship => integer(ship.count, ship.size) && (ship.count ? D.goods.includes(ship.kind) : ship.kind === null)), '货船或交易所无效。');
    const occupiedShips = s.ships.filter(ship => ship.count).map(ship => ship.kind); assert(new Set(occupiedShips).size === occupiedShips.length, '同种货物不能占用多艘公共货船。');
    assert(Number.isInteger(s.vpSupply) && s.vpSupply + s.players.reduce((v, p) => v + p.vp, 0) === ({ 2: 65, 3: 75, 4: 100, 5: 126 })[n], '装运分数不守恒。'); return true;
  }
  return { BUILDING, ROLE, newGame, play, actions, chooseAI, validate, quoteBuilding, production, tradePrice, tradeReason, shipments, wharfAvailable,
    storageSlots, allocationReason, autoAllocation, autoStorage, active, spaces, workers, score, sum };
});
