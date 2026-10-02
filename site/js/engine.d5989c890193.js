(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SplendorEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLORS = ['red', 'blue', 'black', 'pink', 'yellow'];
  const ALL_COLORS = [...COLORS, 'purple'];
  const TIERS = ['stage1', 'stage2', 'stage3', 'rare', 'legend'];
  const SLOTS = { stage1: 4, stage2: 4, stage3: 4, rare: 1, legend: 1 };
  const TIER_COUNTS = { stage1: 35, stage2: 30, stage3: 15, rare: 5, legend: 5 };

  function requireRule(ok, message) {
    if (!ok) throw new Error(message);
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function emptyTokens() { return Object.fromEntries(ALL_COLORS.map(color => [color, 0])); }
  function tokenTotal(tokens) { return ALL_COLORS.reduce((n, color) => n + (tokens[color] || 0), 0); }
  function catalogOf(cards) { return new Map(cards.map(card => [card.id, card])); }
  function getCard(cards, id) { return cards.find(card => card.id === id) || null; }
  function nextRandom(state) {
    let x = state.rng >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.rng = x >>> 0;
    return state.rng / 4294967296;
  }
  function shuffle(state, values) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(state) * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
  }
  function draw(state, tier) { return state.decks[tier].pop() || null; }
  function appendLog(state, message) {
    state.history.push(message);
    if (state.history.length > 80) state.history.shift();
  }
  function checkCards(cards) {
    requireRule(Array.isArray(cards) && cards.length === 90, '卡牌数据应有 90 张');
    requireRule(new Set(cards.map(card => card.id)).size === 90, '卡牌编号重复');
    for (const tier of TIERS) {
      requireRule(cards.filter(card => card.tier === tier).length === TIER_COUNTS[tier], tier + ' 数量不正确');
    }
    for (const card of cards) {
      requireRule(COLORS.includes(card.bonus), card.id + ' 折扣颜色无效');
      requireRule(Number.isInteger(card.vp) && card.vp >= 0, card.id + ' 分数无效');
      requireRule(Number.isInteger(card.bonusCount) && card.bonusCount >= 1, card.id + ' 折扣数量无效');
      requireRule(ALL_COLORS.every(color => Number.isInteger(card.cost[color] || 0) && (card.cost[color] || 0) >= 0), card.id + ' 成本无效');
      if (card.evolvesTo) requireRule(cards.some(candidate => candidate.name === card.evolvesTo), card.id + ' 进化目标缺失');
    }
  }
  function newGame(cards, seats, seed) {
    checkCards(cards);
    requireRule(Array.isArray(seats) && seats.length >= 2 && seats.length <= 4, '需要 2 至 4 名玩家');
    const players = seats.map((seat, index) => ({
      name: String(seat.name || '玩家 ' + (index + 1)).slice(0, 20),
      ai: Boolean(seat.ai), tokens: emptyTokens(), owned: [], reserved: [], evolved: [], pokedex: []
    }));
    const state = {
      version: 1, rng: (Number(seed) >>> 0) || 1, players,
      bank: emptyTokens(), decks: {}, display: {}, current: 0, turn: 1,
      phase: 'action', evolvedThisTurn: false, finalRound: false, winners: [], history: []
    };
    const bankSize = { 2: 4, 3: 5, 4: 7 }[players.length];
    for (const color of COLORS) state.bank[color] = bankSize;
    state.bank.purple = 5;
    for (const tier of TIERS) {
      state.decks[tier] = cards.filter(card => card.tier === tier).map(card => card.id);
      shuffle(state, state.decks[tier]);
      state.display[tier] = Array.from({ length: SLOTS[tier] }, () => draw(state, tier));
    }
    appendLog(state, '对局开始，' + players[0].name + ' 先手。');
    return state;
  }
  function score(player, cards) {
    const catalog = catalogOf(cards);
    return player.owned.reduce((sum, id) => sum + (catalog.get(id)?.vp || 0), 0);
  }
  function bonuses(player, cards) {
    const output = Object.fromEntries(COLORS.map(color => [color, 0]));
    const catalog = catalogOf(cards);
    for (const id of player.owned) {
      const card = catalog.get(id);
      if (card) output[card.bonus] += card.bonusCount;
    }
    return output;
  }
  function sourceCardId(state, source, player) {
    if (!source || typeof source !== 'object') return null;
    if (source.zone === 'display' && TIERS.includes(source.tier) && Number.isInteger(source.index)) {
      return state.display[source.tier][source.index] || null;
    }
    if (source.zone === 'reserved' && Number.isInteger(source.index)) return player.reserved[source.index] || null;
    return null;
  }
  function removeSource(state, source, player) {
    if (source.zone === 'display') {
      const id = state.display[source.tier][source.index];
      state.display[source.tier][source.index] = draw(state, source.tier);
      return id;
    }
    if (source.zone === 'reserved') return player.reserved.splice(source.index, 1)[0];
    if (source.zone === 'deck') return draw(state, source.tier);
    return null;
  }
  function requiredPayment(player, card, cards) {
    const bonus = bonuses(player, cards);
    const need = Object.fromEntries(COLORS.map(color => [color, Math.max(0, (card.cost[color] || 0) - bonus[color])]));
    return { need, fixedMaster: card.cost.purple || 0 };
  }
  function autoPayment(player, card, cards) {
    const { need, fixedMaster } = requiredPayment(player, card, cards);
    const payment = emptyTokens();
    let wild = fixedMaster;
    for (const color of COLORS) {
      payment[color] = Math.min(need[color], player.tokens[color]);
      wild += need[color] - payment[color];
    }
    if (wild > player.tokens.purple) return null;
    payment.purple = wild;
    return payment;
  }
  function checkPayment(player, card, cards, payment) {
    requireRule(payment && typeof payment === 'object', '请选择支付方式');
    const { need, fixedMaster } = requiredPayment(player, card, cards);
    let wild = fixedMaster;
    for (const color of COLORS) {
      const amount = payment[color] || 0;
      requireRule(Number.isInteger(amount) && amount >= 0 && amount <= need[color] && amount <= player.tokens[color], '彩色精灵球支付无效');
      wild += need[color] - amount;
    }
    requireRule(Number.isInteger(payment.purple) && payment.purple === wild && wild <= player.tokens.purple, '大师球支付无效');
  }
  function takeTokens(state, colors) {
    requireRule(Array.isArray(colors), '请选择精灵球');
    requireRule(colors.every(color => COLORS.includes(color)), '只能直接取得普通精灵球');
    const different = new Set(colors).size === colors.length;
    if (different) {
      const available = COLORS.filter(color => state.bank[color] > 0).length;
      requireRule(available > 0 && colors.length === Math.min(3, available), '须取足可取得的不同色精灵球');
      requireRule(colors.every(color => state.bank[color] > 0), '精灵球不足');
    } else {
      requireRule(colors.length === 2 && colors[0] === colors[1], '只能取两枚同色精灵球');
      requireRule(state.bank[colors[0]] >= 4, '取同色两枚前，供应区至少应有四枚');
    }
    const player = state.players[state.current];
    for (const color of colors) { state.bank[color]--; player.tokens[color]++; }
    appendLog(state, player.name + ' 取得了 ' + colors.map(color => COLOR_NAMES[color]).join('、') + '。');
  }
  const COLOR_NAMES = { red: '精灵球', blue: '超级球', black: '高级球', pink: '治愈球', yellow: '先机球', purple: '大师球' };
  function reserveCard(state, cards, source) {
    const player = state.players[state.current];
    requireRule(player.reserved.length < 3, '最多预留三张卡');
    requireRule(source && (source.zone === 'display' || source.zone === 'deck'), '只能从展示区或牌堆预留');
    if (source.zone === 'deck') {
      requireRule(['stage1', 'stage2', 'stage3'].includes(source.tier) && state.decks[source.tier].length > 0, '无法从该牌堆预留');
    } else {
      const id = sourceCardId(state, source, player);
      const card = getCard(cards, id);
      requireRule(card && ['stage1', 'stage2', 'stage3'].includes(card.tier), '只能预留普通宝可梦');
    }
    const id = removeSource(state, source, player);
    requireRule(id, '无可预留卡牌');
    player.reserved.push(id);
    if (state.bank.purple > 0) { state.bank.purple--; player.tokens.purple++; }
    appendLog(state, player.name + ' 预留了' + (source.zone === 'deck' ? '一张暗牌' : ' ' + getCard(cards, id).name) + '。');
  }
  function buyCard(state, cards, source, requestedPayment) {
    const player = state.players[state.current];
    const id = sourceCardId(state, source, player);
    const card = getCard(cards, id);
    requireRule(card, '所选卡牌不存在');
    const payment = requestedPayment || autoPayment(player, card, cards);
    checkPayment(player, card, cards, payment);
    for (const color of ALL_COLORS) {
      const amount = payment[color] || 0;
      player.tokens[color] -= amount;
      state.bank[color] += amount;
    }
    removeSource(state, source, player);
    player.owned.push(id);
    if (!player.pokedex.includes(card.name)) player.pokedex.push(card.name);
    appendLog(state, player.name + ' 捕捉了 ' + card.name + '。');
  }
  function perform(state, cards, action) {
    requireRule(state.phase === 'action', '当前不能进行主行动');
    requireRule(action && typeof action === 'object', '行动无效');
    if (action.type === 'take') takeTokens(state, action.colors);
    else if (action.type === 'reserve') reserveCard(state, cards, action.source);
    else if (action.type === 'buy') buyCard(state, cards, action.source, action.payment);
    else throw new Error('未知行动');
    state.phase = tokenTotal(state.players[state.current].tokens) > 10 ? 'discard' : 'evolve';
    return state;
  }
  function discardToken(state, color) {
    requireRule(state.phase === 'discard', '当前无需归还精灵球');
    requireRule(ALL_COLORS.includes(color), '精灵球颜色无效');
    const player = state.players[state.current];
    requireRule(player.tokens[color] > 0, '没有该精灵球');
    player.tokens[color]--; state.bank[color]++;
    if (tokenTotal(player.tokens) <= 10) state.phase = 'evolve';
    return state;
  }
  function evolutionOptions(state, cards) {
    const player = state.players[state.current];
    const bonus = bonuses(player, cards);
    const catalog = catalogOf(cards);
    const options = [];
    player.owned.forEach((id, ownedIndex) => {
      const oldCard = catalog.get(id);
      if (!oldCard?.evolvesTo || !oldCard.evoCost || bonus[oldCard.evoCost.color] < oldCard.evoCost.count) return;
      const nextTier = oldCard.tier === 'stage1' ? 'stage2' : oldCard.tier === 'stage2' ? 'stage3' : null;
      if (!nextTier) return;
      state.display[nextTier].forEach((nextId, index) => {
        if (catalog.get(nextId)?.name === oldCard.evolvesTo) options.push({ ownedIndex, source: { zone: 'display', tier: nextTier, index }, from: id, to: nextId });
      });
      player.reserved.forEach((nextId, index) => {
        if (catalog.get(nextId)?.name === oldCard.evolvesTo) options.push({ ownedIndex, source: { zone: 'reserved', index }, from: id, to: nextId });
      });
    });
    return options;
  }
  function evolve(state, cards, option) {
    requireRule(state.phase === 'evolve' && !state.evolvedThisTurn, '本回合无法继续进化');
    const legal = evolutionOptions(state, cards).find(candidate =>
      candidate.ownedIndex === option.ownedIndex && candidate.source.zone === option.source?.zone &&
      candidate.source.tier === option.source?.tier && candidate.source.index === option.source?.index
    );
    requireRule(legal, '不满足进化条件');
    const player = state.players[state.current];
    const nextId = removeSource(state, legal.source, player);
    requireRule(nextId === legal.to, '进化目标改变，请重试');
    player.owned.splice(legal.ownedIndex, 1, nextId);
    player.evolved.push(legal.from);
    const nextCard = getCard(cards, nextId);
    if (!player.pokedex.includes(nextCard.name)) player.pokedex.push(nextCard.name);
    state.evolvedThisTurn = true;
    appendLog(state, player.name + ' 将 ' + getCard(cards, legal.from).name + ' 进化为 ' + nextCard.name + '。');
    return state;
  }
  function ranking(state, cards) {
    return state.players.map((player, index) => ({
      index, name: player.name, points: score(player, cards), evolved: player.evolved.length, pokemon: player.owned.length
    })).sort((a, b) => b.points - a.points || b.evolved - a.evolved || b.pokemon - a.pokemon);
  }
  function finishTurn(state, cards) {
    requireRule(state.phase === 'evolve', '请先完成当前行动');
    const currentPlayer = state.players[state.current];
    if (score(currentPlayer, cards) >= 18) state.finalRound = true;
    if (state.finalRound && state.current === state.players.length - 1) {
      state.phase = 'gameover';
      const sorted = ranking(state, cards);
      const top = sorted[0];
      state.winners = sorted.filter(row => row.points === top.points && row.evolved === top.evolved && row.pokemon === top.pokemon).map(row => row.index);
      appendLog(state, '对局结束，冠军：' + state.winners.map(index => state.players[index].name).join('、') + '。');
      return state;
    }
    state.current = (state.current + 1) % state.players.length;
    state.turn++;
    state.phase = 'action';
    state.evolvedThisTurn = false;
    return state;
  }
  function combinations(values, count) {
    if (count === 0) return [[]];
    const result = [];
    values.forEach((value, index) => {
      for (const tail of combinations(values.slice(index + 1), count - 1)) result.push([value, ...tail]);
    });
    return result;
  }
  function legalActions(state, cards) {
    if (state.phase !== 'action') return [];
    const player = state.players[state.current];
    const actions = [];
    for (const tier of TIERS) {
      state.display[tier].forEach((id, index) => {
        if (!id) return;
        const source = { zone: 'display', tier, index };
        if (autoPayment(player, getCard(cards, id), cards)) actions.push({ type: 'buy', source });
        if (player.reserved.length < 3 && !['rare', 'legend'].includes(tier)) actions.push({ type: 'reserve', source });
      });
    }
    player.reserved.forEach((id, index) => {
      if (id && autoPayment(player, getCard(cards, id), cards)) actions.push({ type: 'buy', source: { zone: 'reserved', index } });
    });
    const available = COLORS.filter(color => state.bank[color] > 0);
    if (available.length) for (const colors of combinations(available, Math.min(3, available.length))) actions.push({ type: 'take', colors });
    for (const color of COLORS) if (state.bank[color] >= 4) actions.push({ type: 'take', colors: [color, color] });
    if (player.reserved.length < 3) {
      for (const tier of TIERS.slice(0, 3)) if (state.decks[tier].length) actions.push({ type: 'reserve', source: { zone: 'deck', tier } });
    }
    return actions;
  }
  function observe(state, viewer) {
    const publicState = copy(state);
    for (const tier of TIERS) publicState.decks[tier] = publicState.decks[tier].map(() => null);
    publicState.players.forEach((player, index) => {
      if (index !== viewer) player.reserved = player.reserved.map(() => null);
    });
    return publicState;
  }
  function validateState(state, cards) {
    const expected = state.players.length === 2 ? 4 : state.players.length === 3 ? 5 : 7;
    for (const color of ALL_COLORS) {
      const total = state.bank[color] + state.players.reduce((sum, player) => sum + player.tokens[color], 0);
      requireRule(total === (color === 'purple' ? 5 : expected), '精灵球总数不守恒：' + color);
      requireRule(state.bank[color] >= 0 && state.players.every(player => player.tokens[color] >= 0), '精灵球数量为负');
    }
    const locations = [];
    for (const tier of TIERS) locations.push(...state.decks[tier], ...state.display[tier].filter(Boolean));
    for (const player of state.players) locations.push(...player.owned, ...player.reserved, ...player.evolved);
    requireRule(locations.length === cards.length, '卡牌总数不守恒');
    requireRule(new Set(locations).size === cards.length, '卡牌重复出现');
    requireRule(state.phase === 'discard' || state.players.every(player => tokenTotal(player.tokens) <= 10), '回合结束时精灵球超过上限');
    return true;
  }
  return { COLORS, ALL_COLORS, TIERS, SLOTS, TIER_COUNTS, COLOR_NAMES, newGame, score, bonuses,
    getCard, sourceCardId, requiredPayment, autoPayment, perform, discardToken, evolutionOptions,
    evolve, finishTurn, ranking, legalActions, observe, validateState, tokenTotal };
});
