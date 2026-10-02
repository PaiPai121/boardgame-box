(function (root) {
  'use strict';
  const D = root.BaseSplendorData;
  const COLORS = ['white', 'blue', 'green', 'red', 'black'];
  const TOKENS = [...COLORS, 'gold'];
  const CARD = new Map(D.cards.map(card => [card.id, card]));
  const NOBLE = new Map(D.nobles.map(noble => [noble.id, noble]));
  const zero = () => Object.fromEntries(TOKENS.map(color => [color, 0]));
  const sum = value => Object.values(value).reduce((a, b) => a + b, 0);
  function insist(ok, message) { if (!ok) throw Error(message); }
  function random(state) {
    let x = state.rng >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.rng = x >>> 0;
    return state.rng / 4294967296;
  }
  function shuffle(state, values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function bonuses(player) {
    const result = zero();
    for (const id of player.owned) result[CARD.get(id).bonus]++;
    return result;
  }
  function score(player) {
    return player.owned.reduce((n, id) => n + CARD.get(id).points, 0) + player.nobles.length * 3;
  }
  function newGame(seats, seed) {
    insist(Array.isArray(seats) && seats.length >= 2 && seats.length <= 4, '璀璨宝石需要 2–4 位玩家');
    const count = seats.length;
    const state = { version: 1, kind: 'splendor-classic', rng: (Number(seed) >>> 0) || 1,
      current: 0, turn: 1, round: 1, phase: 'action', finalRound: false, winners: [],
      bank: Object.fromEntries(TOKENS.map(color => [color, color === 'gold' ? 5 : count === 2 ? 4 : count === 3 ? 5 : 7])),
      decks: [], market: [], nobles: [], unusedNobles: [], log: [], players: seats.map((seat, index) => ({
        name: String(seat.name || '玩家 ' + (index + 1)).trim().slice(0, 20), ai: Boolean(seat.ai),
        tokens: zero(), owned: [], reserved: [], nobles: [] })) };
    for (let level = 1; level <= 3; level++) {
      const deck = shuffle(state, D.cards.filter(card => card.level === level).map(card => card.id));
      state.market.push(deck.splice(0, 4)); state.decks.push(deck);
    }
    const nobles = shuffle(state, D.nobles.map(noble => noble.id));
    state.nobles = nobles.splice(0, count + 1); state.unusedNobles = nobles;
    state.log.push('宝石商会开张。每回合选择领取筹码、预留或购买发展卡。');
    return state;
  }
  function quote(state, index, cardId, chosen) {
    const card = CARD.get(cardId);
    insist(card, '未知发展卡');
    const player = state.players[index], bonus = bonuses(player);
    const discount = zero(), needed = zero(), spend = zero();
    for (const color of COLORS) {
      discount[color] = Math.min(card.cost[color], bonus[color]);
      needed[color] = card.cost[color] - discount[color];
      spend[color] = chosen ? chosen[color] ?? 0 : Math.min(needed[color], player.tokens[color]);
      if (!Number.isInteger(spend[color]) || spend[color] < 0 || spend[color] > needed[color] || spend[color] > player.tokens[color])
        return { valid: false, reason: '选择的宝石筹码数量不正确', discount, needed, spend, free: false };
      spend.gold += needed[color] - spend[color];
    }
    if (chosen && chosen.gold !== spend.gold) return { valid: false, reason: '黄金必须恰好补齐缺少的宝石', discount, needed, spend, free: false };
    const valid = spend.gold <= player.tokens.gold;
    return { valid, reason: valid ? '' : '随身宝石与黄金不足，还差 ' + (spend.gold - player.tokens.gold) + ' 枚筹码',
      discount, needed, spend, free: sum(needed) === 0, tokenTotal: sum(spend), bonusTotal: sum(discount) };
  }
  function eligibleNobles(state, index) {
    const bonus = bonuses(state.players[index]);
    return state.nobles.filter(id => COLORS.every(color => bonus[color] >= (NOBLE.get(id).cost[color] || 0)));
  }
  function takeReason(state, selection) {
    if (state.phase !== 'action') return '当前需要先完成归还筹码或贵族来访';
    const amount = zero();
    for (const color of selection) { if (!COLORS.includes(color)) return '黄金不能直接领取，只能通过预留卡牌获得'; amount[color]++; }
    const colors = COLORS.filter(color => amount[color]);
    if (colors.some(color => amount[color] > state.bank[color])) return '银行没有足够的这种宝石';
    if (colors.length === 1 && selection.length === 2) return state.bank[colors[0]] >= 4 ? '' : '领取两枚同色宝石前，银行必须至少有 4 枚这种宝石';
    if (colors.length !== selection.length || selection.length !== Math.min(3, COLORS.filter(color => state.bank[color] > 0).length))
      return '请选择三种不同宝石各一枚；银行不足三种时才可以少拿';
    return selection.length ? '' : '银行没有可领取的宝石';
  }
  function actions(state, index = state.current) {
    if (index !== state.current || state.phase === 'gameover') return [];
    const player = state.players[index];
    if (state.phase === 'noble') return eligibleNobles(state, index).map(nobleId => ({ type: 'noble', nobleId }));
    if (state.phase === 'return') return TOKENS.filter(color => player.tokens[color] > 0).map(color => ({ type: 'return', tokens: { [color]: 1 } }));
    const result = [];
    for (const id of [...state.market.flat(), ...player.reserved]) if (quote(state, index, id).valid) result.push({ type: 'buy', cardId: id });
    if (player.reserved.length < 3) {
      for (const cardId of state.market.flat()) result.push({ type: 'reserve', cardId });
      for (let level = 1; level <= 3; level++) if (state.decks[level - 1].length) result.push({ type: 'reserve', level });
    }
    const available = COLORS.filter(color => state.bank[color] > 0);
    const n = Math.min(3, available.length);
    function combination(start, picked) {
      if (picked.length === n) { if (n) result.push({ type: 'take', colors: picked }); return; }
      for (let i = start; i < available.length; i++) combination(i + 1, [...picked, available[i]]);
    }
    combination(0, []);
    for (const color of available) if (state.bank[color] >= 4) result.push({ type: 'take', colors: [color, color] });
    if (!result.length) result.push({ type: 'pass' });
    return result;
  }
  function removeCard(state, player, cardId, includeReserved) {
    if (includeReserved && player.reserved.includes(cardId)) { player.reserved.splice(player.reserved.indexOf(cardId), 1); return; }
    for (let level = 0; level < 3; level++) {
      const at = state.market[level].indexOf(cardId);
      if (at < 0) continue;
      if (state.decks[level].length) state.market[level][at] = state.decks[level].shift();
      else state.market[level].splice(at, 1);
      return;
    }
    throw Error('这张牌已经不在市场中');
  }
  function completeTurn(state) {
    const player = state.players[state.current];
    if (score(player) >= 15 && !state.finalRound) {
      state.finalRound = true;
      state.log.push(player.name + ' 达到 15 分，本轮结束后结算。');
    }
    if (state.finalRound && state.current === state.players.length - 1) {
      state.phase = 'gameover';
      const ranking = state.players.map((p, index) => ({ index, points: score(p), cards: p.owned.length }))
        .sort((a, b) => b.points - a.points || a.cards - b.cards);
      state.winners = ranking.filter(p => p.points === ranking[0].points && p.cards === ranking[0].cards).map(p => p.index);
      state.log.push('商会评选结束，' + state.winners.map(index => state.players[index].name).join('、') + ' 获胜。');
      return;
    }
    state.current = (state.current + 1) % state.players.length;
    state.turn++; if (!state.current) state.round++;
    state.phase = 'action';
  }
  function afterAction(state) {
    const player = state.players[state.current];
    if (sum(player.tokens) > 10) { state.phase = 'return'; return; }
    const eligible = eligibleNobles(state, state.current);
    if (eligible.length > 1) { state.phase = 'noble'; return; }
    if (eligible.length === 1) visitNoble(state, eligible[0]);
    completeTurn(state);
  }
  function visitNoble(state, id) {
    const player = state.players[state.current];
    insist(eligibleNobles(state, state.current).includes(id), '未达到这位贵族的永久加成要求');
    state.nobles.splice(state.nobles.indexOf(id), 1); player.nobles.push(id);
    state.log.push(player.name + ' 获得贵族来访，增加 3 分。');
  }
  function play(state, action) {
    insist(state.phase !== 'gameover', '对局已经结束');
    const player = state.players[state.current];
    if (state.phase === 'noble') {
      insist(action.type === 'noble', '请先选择一位来访贵族'); visitNoble(state, action.nobleId); completeTurn(state); return;
    }
    if (state.phase === 'return') {
      insist(action.type === 'return', '请先归还超过 10 枚的筹码');
      insist(action.tokens && Object.keys(action.tokens).every(color => TOKENS.includes(color)), '未知宝石');
      const amount = sum(action.tokens);
      insist(amount > 0 && amount <= sum(player.tokens) - 10, '只能归还超出的筹码数量');
      for (const color of TOKENS) insist(Number.isInteger(action.tokens[color] || 0) && (action.tokens[color] || 0) >= 0 &&
        (action.tokens[color] || 0) <= player.tokens[color], '归还筹码数量不正确');
      for (const color of TOKENS) { const n = action.tokens[color] || 0; player.tokens[color] -= n; state.bank[color] += n; }
      if (sum(player.tokens) <= 10) afterAction(state);
      return;
    }
    insist(state.phase === 'action', '当前不能执行这个操作');
    if (action.type === 'take') {
      insist(Array.isArray(action.colors), '请选择宝石');
      const reason = takeReason(state, action.colors); insist(!reason, reason);
      for (const color of action.colors) { state.bank[color]--; player.tokens[color]++; }
      state.log.push(player.name + ' 领取了 ' + action.colors.length + ' 枚宝石。');
    } else if (action.type === 'reserve') {
      insist(player.reserved.length < 3, '最多只能预留 3 张牌');
      let cardId = action.cardId;
      if (action.level != null) {
        insist([1, 2, 3].includes(action.level) && state.decks[action.level - 1].length, '这一级牌堆已经空了');
        cardId = state.decks[action.level - 1].shift();
      } else removeCard(state, player, cardId, false);
      player.reserved.push(cardId);
      if (state.bank.gold) { state.bank.gold--; player.tokens.gold++; }
      state.log.push(player.name + ' 预留了一张发展卡。');
    } else if (action.type === 'buy') {
      insist(player.reserved.includes(action.cardId) || state.market.flat().includes(action.cardId), '当前不能购买这张牌');
      const payment = quote(state, state.current, action.cardId, action.payment);
      insist(payment.valid, payment.reason);
      removeCard(state, player, action.cardId, true);
      for (const color of TOKENS) { player.tokens[color] -= payment.spend[color]; state.bank[color] += payment.spend[color]; }
      player.owned.push(action.cardId);
      state.log.push(player.name + ' 购买发展卡：永久加成抵扣 ' + payment.bonusTotal + '，支付筹码 ' + payment.tokenTotal + '。');
    } else if (action.type === 'pass') insist(actions(state).every(a => a.type === 'pass'), '还有可以执行的行动，不能跳过');
    else throw Error('未知操作');
    afterAction(state);
  }
  function chooseAI(state) {
    const player = state.players[state.current];
    if (state.phase === 'return') {
      const targets = [...player.reserved, ...state.market[0], ...state.market[1]];
      const need = Object.fromEntries(COLORS.map(color => [color, Math.max(0, ...targets.map(id => quote(state, state.current, id).needed[color]))]));
      const color = TOKENS.filter(c => player.tokens[c]).sort((a, b) =>
        (player.tokens[b] - (b === 'gold' ? 10 : need[b])) - (player.tokens[a] - (a === 'gold' ? 10 : need[a])))[0];
      return { type: 'return', tokens: { [color]: 1 } };
    }
    const legal = actions(state);
    if (state.phase === 'noble') return legal[0];
    const bonus = bonuses(player);
    const valueOf = id => {
      const card = CARD.get(id);
      const nobleGain = state.nobles.filter(n => (NOBLE.get(n).cost[card.bonus] || 0) > bonus[card.bonus]).length;
      return card.points * 3.4 + (bonus[card.bonus] < 4 ? 2.7 : 0.8) + nobleGain * 0.45;
    };
    const buys = legal.filter(a => a.type === 'buy');
    if (buys.length) return buys.map(action => ({ action, value: valueOf(action.cardId) - quote(state, state.current, action.cardId).tokenTotal * 0.14 + random(state) * 0.1 })).sort((a, b) => b.value - a.value)[0].action;
    const targets = [...player.reserved, ...state.market.flat()].map(id => ({ id, q: quote(state, state.current, id) }));
    const ranked = legal.map(action => {
      let value = -10;
      if (action.type === 'take') {
        value = Math.max(...targets.map(({ id, q }) => {
          const deficit = Object.fromEntries(COLORS.map(c => [c, Math.max(0, q.needed[c] - player.tokens[c])]));
          let helpful = 0; for (const c of action.colors) if (deficit[c]) { helpful++; deficit[c]--; }
          const distance = Math.max(0, sum(deficit) - player.tokens.gold);
          return helpful * 3 + valueOf(id) * 0.14 - distance * 0.9;
        })) - Math.max(0, sum(player.tokens) + action.colors.length - 10) * 1.8;
      } else if (action.type === 'reserve' && action.cardId && state.bank.gold) {
        const q = quote(state, state.current, action.cardId);
        const gap = Math.max(0, q.spend.gold - player.tokens.gold);
        value = gap === 1 ? 8 + valueOf(action.cardId) * 0.16 : -2;
      }
      return { action, value: value + random(state) * 0.1 };
    });
    return ranked.sort((a, b) => b.value - a.value)[0].action;
  }
  function validate(state) {
    insist(state?.version === 1 && state.kind === 'splendor-classic' && state.players?.length >= 2 && state.players.length <= 4, '存档版本或人数不正确');
    insist(Number.isInteger(state.current) && state.current >= 0 && state.current < state.players.length &&
      ['action', 'return', 'noble', 'gameover'].includes(state.phase), '存档进度不正确');
    const allCards = [...state.decks.flat(), ...state.market.flat(), ...state.players.flatMap(p => [...p.owned, ...p.reserved])];
    insist(allCards.length === 90 && new Set(allCards).size === 90 && allCards.every(id => CARD.has(id)), '存档卡牌不完整或重复');
    const allNobles = [...state.nobles, ...state.unusedNobles, ...state.players.flatMap(p => p.nobles)];
    insist(allNobles.length === 10 && new Set(allNobles).size === 10 && allNobles.every(id => NOBLE.has(id)), '存档贵族不正确');
    for (const color of TOKENS) {
      insist(Number.isInteger(state.bank[color]) && state.bank[color] >= 0, '银行筹码不正确');
      for (let index = 0; index < state.players.length; index++) {
        const p = state.players[index];
        insist(p.reserved.length <= 3 && Number.isInteger(p.tokens[color]) && p.tokens[color] >= 0 &&
          (sum(p.tokens) <= 10 || (state.phase === 'return' && index === state.current)), '玩家筹码或预留不正确');
      }
      const total = state.bank[color] + state.players.reduce((n, p) => n + p.tokens[color], 0);
      insist(total === (color === 'gold' ? 5 : state.players.length === 2 ? 4 : state.players.length === 3 ? 5 : 7), '筹码总量不正确');
    }
    return true;
  }
  root.BaseSplendorEngine = Object.freeze({ D, COLORS, TOKENS, CARD, NOBLE, zero, sum, bonuses, score,
    newGame, quote, eligibleNobles, takeReason, actions, play, chooseAI, validate });
})(typeof window === 'undefined' ? globalThis : window);
