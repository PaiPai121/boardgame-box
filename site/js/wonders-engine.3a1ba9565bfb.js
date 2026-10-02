(function (root) {
  'use strict';
  const D = root.WondersData;
  const CARD = new Map(D.allCards.map(item => [item.id, item]));
  const WONDER = new Map(D.WONDERS.map(item => [item.id, item]));
  const RAW = 'WSCO';
  const MANUFACTURED = 'GPL';
  function insist(ok, message) { if (!ok) throw new Error(message); }
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
  function wonder(player) { return WONDER.get(player.wonder); }
  function stages(player) { return wonder(player)[player.side]; }
  function chainKeys(card) { return Array.isArray(card.chain) ? card.chain : card.chain ? [card.chain] : []; }
  function allEffects(player) {
    return [
      ...player.built.map(id => CARD.get(id)?.effect).filter(Boolean),
      ...player.stages.map((_, index) => stages(player)[index]?.effect).filter(Boolean)
    ];
  }
  function production(player) {
    const slots = [{ options: wonder(player).resource }];
    for (const effect of allEffects(player)) {
      if (effect.produce) for (const symbol of effect.produce) slots.push({ options: symbol });
      if (effect.choose) slots.push({ options: effect.choose });
    }
    return slots;
  }
  function tradeProduction(player) {
    const slots = [{ options: wonder(player).resource }];
    for (const id of player.built) {
      const card = CARD.get(id);
      if (!['brown', 'gray'].includes(card.type)) continue;
      if (card.effect.produce) for (const symbol of card.effect.produce) slots.push({ options: symbol });
      if (card.effect.choose) slots.push({ options: card.effect.choose });
    }
    return slots;
  }
  function neighbors(state, index) {
    const count = state.players.length;
    return { left: (index - 1 + count) % count, right: (index + 1) % count };
  }
  function tradePrice(player, side, symbol) {
    const trades = allEffects(player).map(effect => effect.trade).filter(Boolean);
    if (RAW.includes(symbol) && (trades.includes('rawBoth') || trades.includes(side + 'Raw'))) return 1;
    if (MANUFACTURED.includes(symbol) && trades.includes('manufactured')) return 1;
    return 2;
  }
  function countOf(state, index, what) {
    const self = state.players[index];
    const { left, right } = neighbors(state, index);
    const countCards = (playerIndex, types) => state.players[playerIndex].built
      .filter(id => types.includes(CARD.get(id).type)).length;
    if (what === 'brownAll') return [left, index, right].reduce((sum, at) => sum + countCards(at, ['brown']), 0);
    if (what === 'grayAll') return [left, index, right].reduce((sum, at) => sum + countCards(at, ['gray']), 0);
    if (what === 'stagesSelf') return self.stages.length;
    if (what === 'stagesAll') return [left, index, right].reduce((sum, at) => sum + state.players[at].stages.length, 0);
    if (what === 'allStages') return self.stages.length === stages(self).length ? 1 : 0;
    if (what === 'brownGrayPurpleSelf') return countCards(index, ['brown', 'gray', 'purple']);
    if (what.endsWith('Self')) return countCards(index, [what.replace('Self', '')]);
    if (what.endsWith('Neighbors')) return countCards(left, [what.replace('Neighbors', '')]) +
      countCards(right, [what.replace('Neighbors', '')]);
    return 0;
  }
  function paymentFor(state, index, cost, free) {
    const player = state.players[index];
    if (free) return { bank: 0, left: 0, right: 0, total: 0, sources: [] };
    const required = [...cost].filter(symbol => symbol !== '$');
    const bank = [...cost].filter(symbol => symbol === '$').length;
    const { left, right } = neighbors(state, index);
    const slots = [
      ...production(player).map(slot => ({ ...slot, side: 'own' })),
      ...tradeProduction(state.players[left]).map(slot => ({ ...slot, side: 'left' })),
      ...tradeProduction(state.players[right]).map(slot => ({ ...slot, side: 'right' }))
    ];
    const ordered = required.sort((a, b) => slots.filter(slot => slot.options.includes(a)).length -
      slots.filter(slot => slot.options.includes(b)).length);
    let best = null;
    const used = new Set();
    const sources = [];
    function visit(position, leftCoins, rightCoins) {
      const total = bank + leftCoins + rightCoins;
      if (total > player.coins || (best && total >= best.total)) return;
      if (position === ordered.length) {
        best = { bank, left: leftCoins, right: rightCoins, total, sources: [...sources] };
        return;
      }
      const symbol = ordered[position];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const slot = slots[slotIndex];
        if (used.has(slotIndex) || !slot.options.includes(symbol)) continue;
        const price = slot.side === 'own' ? 0 : tradePrice(player, slot.side, symbol);
        used.add(slotIndex);
        sources.push({ symbol, side: slot.side, slot: slotIndex });
        visit(position + 1, leftCoins + (slot.side === 'left' ? price : 0),
          rightCoins + (slot.side === 'right' ? price : 0));
        sources.pop();
        used.delete(slotIndex);
      }
    }
    visit(0, 0, 0);
    return best;
  }
  function cardsForAge(state, age) {
    const count = state.players.length;
    const regular = D.ages[age - 1].filter(item => !item.guildCard && item.minPlayers <= count);
    if (age !== 3) return shuffle(state, regular.map(item => item.id));
    const guilds = shuffle(state, D.ages[2].filter(item => item.guildCard).map(item => item.id))
      .slice(0, count + 2);
    return shuffle(state, [...regular.map(item => item.id), ...guilds]);
  }
  function dealAge(state, age) {
    const deck = cardsForAge(state, age);
    insist(deck.length === state.players.length * 7, '时代牌数量不正确');
    state.age = age;
    state.round = 1;
    state.hands = state.players.map((_, index) => deck.slice(index * 7, index * 7 + 7));
    state.picks = state.players.map(() => null);
    state.current = 0;
    state.phase = 'draft';
  }
  function newGame(seats, seed) {
    insist(Array.isArray(seats) && seats.length >= 3 && seats.length <= 7, '七大奇迹需要 3–7 位玩家');
    const state = { version: 1, rng: (Number(seed) >>> 0) || 1, players: [], age: 1, round: 1,
      hands: [], picks: [], current: 0, phase: 'draft', discarded: [], conflicts: [], log: [], winners: [],
      bonusQueue: [], afterBonus: null };
    const wonders = shuffle(state, D.WONDERS.map(item => item.id));
    state.players = seats.map((seat, index) => ({
      name: String(seat.name || '玩家 ' + (index + 1)).trim().slice(0, 20),
      ai: Boolean(seat.ai), wonder: wonders[index], side: seat.side === 'b' ? 'b' : 'a',
      coins: 3, built: [], stages: [], military: [], freeUsed: [],
    }));
    dealAge(state, 1);
    state.log.push('七大奇迹开局，第一时代开始。');
    return state;
  }
  function actions(state, index) {
    if (state.phase !== 'draft' || state.picks[index]) return [];
    const player = state.players[index];
    const hand = state.hands[index];
    const result = [];
    const nextStage = stages(player)[player.stages.length];
    const stagePayment = nextStage ? paymentFor(state, index, nextStage.cost) : null;
    const hasFreeAge = allEffects(player).some(effect => effect.freeAge) && !player.freeUsed.includes(state.age);
    for (const cardId of hand) {
      const item = CARD.get(cardId);
      const duplicate = player.built.some(id => CARD.get(id).key === item.key);
      if (!duplicate) {
        const chained = chainKeys(item).some(key => player.built.some(id => CARD.get(id).key === key));
        const payment = paymentFor(state, index, item.cost, chained);
        if (payment) result.push({ cardId, mode: 'build', payment, chained: Boolean(chained) });
        if (chained) {
          const normalPayment = paymentFor(state, index, item.cost, false);
          if (normalPayment) result.push({ cardId, mode: 'paidBuild', payment: normalPayment, chained: false });
        }
        if (hasFreeAge && !chained && (!payment || payment.total > 0)) result.push({
          cardId, mode: 'freeBuild', payment: paymentFor(state, index, item.cost, true)
        });
      }
      if (stagePayment) result.push({ cardId, mode: 'stage', payment: stagePayment });
      result.push({ cardId, mode: 'sell', payment: null });
    }
    return result;
  }
  function effectCoins(state, index, effect) {
    return (effect.coins || 0) + (effect.coinsPer ? countOf(state, index, effect.coinsPer) *
      (effect.coinsRate || 1) : 0);
  }
  function play(state, index, cardId, mode) {
    insist(state.phase === 'draft' && state.current === index, '当前不是这位玩家的选牌时间');
    const chosen = actions(state, index).find(item => item.cardId === cardId && item.mode === mode);
    insist(chosen, '当前不能执行该操作');
    state.picks[index] = chosen;
    const next = state.picks.findIndex(item => !item);
    if (next >= 0) state.current = next;
    else resolveRound(state);
    return chosen;
  }
  function resolveRound(state) {
    const chosen = state.picks;
    const oldHands = state.hands.map((hand, index) => hand.filter(id => id !== chosen[index].cardId));
    const discardBonus = chosen.map((pick, index) => ({ pick, index })).filter(({ pick, index }) =>
      pick.mode === 'stage' && stages(state.players[index])[state.players[index].stages.length].effect.discardBuild)
      .map(({ index }) => ({ index, type: 'discardBuild' }));
    const incomes = chosen.map((pick, index) => {
      if (['build', 'paidBuild', 'freeBuild'].includes(pick.mode)) return effectCoins(state, index, CARD.get(pick.cardId).effect);
      if (pick.mode === 'stage') return effectCoins(state, index, stages(state.players[index])[state.players[index].stages.length].effect);
      return 3;
    });
    chosen.forEach((pick, index) => {
      const player = state.players[index];
      const pay = pick.payment;
      if (pay) {
        player.coins -= pay.total;
        const { left, right } = neighbors(state, index);
        state.players[left].coins += pay.left;
        state.players[right].coins += pay.right;
      }
      if (['build', 'paidBuild', 'freeBuild'].includes(pick.mode)) {
        player.built.push(pick.cardId);
        if (pick.mode === 'freeBuild') player.freeUsed.push(state.age);
      } else if (pick.mode === 'stage') player.stages.push(pick.cardId);
      else state.discarded.push(pick.cardId);
    });
    incomes.forEach((coins, index) => { state.players[index].coins += coins; });
    state.log.push('第 ' + state.age + ' 时代第 ' + state.round + ' 轮完成。');
    if (state.round < 6) {
      const count = state.players.length;
      const nextHands = state.players.map(() => []);
      oldHands.forEach((hand, index) => {
        const recipient = state.age === 2 ? (index - 1 + count) % count : (index + 1) % count;
        nextHands[recipient] = hand;
      });
      state.hands = nextHands;
      state.round++;
      state.picks = state.players.map(() => null);
      state.current = 0;
      state.afterBonus = 'continue';
      state.bonusQueue = discardBonus;
      return advanceBonus(state);
    }
    const lastCardBonus = [];
    oldHands.forEach((hand, index) => {
      if (allEffects(state.players[index]).some(effect => effect.lastCard)) {
        lastCardBonus.push({ index, type: 'lastCard', cardId: hand[0] });
      } else state.discarded.push(...hand);
    });
    state.hands = state.players.map(() => []);
    state.afterBonus = 'endAge';
    state.bonusQueue = [...lastCardBonus, ...discardBonus];
    advanceBonus(state);
  }
  function advanceBonus(state) {
    if (state.bonusQueue.length) {
      state.phase = 'bonus';
      state.current = state.bonusQueue[0].index;
      return;
    }
    const next = state.afterBonus;
    state.afterBonus = null;
    if (next === 'endAge') {
      settleMilitary(state);
      if (state.age < 3) dealAge(state, state.age + 1);
      else finish(state);
    } else {
      state.phase = 'draft';
      state.current = 0;
    }
  }
  function bonusActions(state) {
    if (state.phase !== 'bonus' || !state.bonusQueue.length) return [];
    const bonus = state.bonusQueue[0];
    const player = state.players[bonus.index];
    if (bonus.type === 'discardBuild') {
      const available = state.discarded.filter(id => !player.built.some(owned => CARD.get(owned).key === CARD.get(id).key));
      return available.length ? available.map(cardId => ({ cardId, mode: 'reclaim', payment: null })) :
        [{ cardId: null, mode: 'skip', payment: null }];
    }
    if (bonus.type === 'lastCard') {
      const oldPhase = state.phase;
      const oldHand = state.hands[bonus.index];
      const oldPick = state.picks[bonus.index];
      state.phase = 'draft';
      state.hands[bonus.index] = [bonus.cardId];
      state.picks[bonus.index] = null;
      try { return actions(state, bonus.index); }
      finally {
        state.phase = oldPhase;
        state.hands[bonus.index] = oldHand;
        state.picks[bonus.index] = oldPick;
      }
    }
    return [];
  }
  function playBonus(state, index, cardId, mode) {
    insist(state.phase === 'bonus' && state.current === index, '当前不是这位玩家的特殊行动时间');
    const chosen = bonusActions(state).find(action => action.cardId === cardId && action.mode === mode);
    insist(chosen, '无法执行此特殊行动');
    const bonus = state.bonusQueue.shift();
    const player = state.players[index];
    if (mode === 'reclaim') {
      state.discarded.splice(state.discarded.indexOf(cardId), 1);
      const coins = effectCoins(state, index, CARD.get(cardId).effect);
      player.built.push(cardId);
      player.coins += coins;
      state.log.push(player.name + ' 从弃牌堆建造了' + CARD.get(cardId).name + '。');
    } else if (mode !== 'skip') {
      if (chosen.payment) {
        player.coins -= chosen.payment.total;
        const { left, right } = neighbors(state, index);
        state.players[left].coins += chosen.payment.left;
        state.players[right].coins += chosen.payment.right;
      }
      if (['build', 'paidBuild', 'freeBuild'].includes(mode)) {
        const coins = effectCoins(state, index, CARD.get(cardId).effect);
        player.built.push(cardId);
        player.coins += coins;
        if (mode === 'freeBuild') player.freeUsed.push(state.age);
      } else if (mode === 'stage') {
        const effect = stages(player)[player.stages.length].effect;
        const coins = effectCoins(state, index, effect);
        player.stages.push(cardId);
        player.coins += coins;
        if (effect.discardBuild) state.bonusQueue.push({ index, type: 'discardBuild' });
      } else {
        state.discarded.push(cardId);
        player.coins += 3;
      }
      state.log.push(player.name + ' 使用了时代末最后一张牌。');
    }
    advanceBonus(state);
    return chosen;
  }
  function shields(player) {
    return allEffects(player).reduce((sum, effect) => sum + (effect.shields || 0), 0);
  }
  function settleMilitary(state) {
    const value = [0, 1, 3, 5][state.age];
    if (!Array.isArray(state.conflicts)) state.conflicts = [];
    for (let index = 0; index < state.players.length; index++) {
      const right = (index + 1) % state.players.length;
      const strength = [shields(state.players[index]), shields(state.players[right])];
      const difference = strength[0] - strength[1];
      const points = difference > 0 ? [value, -1] : difference < 0 ? [-1, value] : [0, 0];
      state.conflicts.push({ age: state.age, players: [index, right], shields: strength, points });
      if (difference > 0) {
        state.players[index].military.push(value);
        state.players[right].military.push(-1);
      } else if (difference < 0) {
        state.players[index].military.push(-1);
        state.players[right].military.push(value);
      }
    }
    state.log.push('第 ' + state.age + ' 时代军事冲突结算完成。');
  }
  function scienceDetail(effects) {
    const counts = { compass: 0, gear: 0, tablet: 0 };
    let wild = 0;
    for (const effect of effects) {
      if (effect.science === 'wild') wild++;
      else if (effect.science) counts[effect.science]++;
    }
    function score(c) {
      return c.compass ** 2 + c.gear ** 2 + c.tablet ** 2 +
        7 * Math.min(c.compass, c.gear, c.tablet);
    }
    const base = { ...counts };
    let best = -1, selected = { ...counts };
    function choose(n) {
      if (!n) {
        const total = score(counts);
        if (total > best) { best = total; selected = { ...counts }; }
        return;
      }
      for (const key of Object.keys(counts)) {
        counts[key]++;
        choose(n - 1);
        counts[key]--;
      }
    }
    choose(wild);
    const allocated = Object.fromEntries(Object.keys(counts).map(key => [key, selected[key] - base[key]]));
    const sets = Math.min(selected.compass, selected.gear, selected.tablet);
    return { total: best, base, counts: selected, wild, allocated, sets, setPoints: sets * 7 };
  }
  function scienceScore(effects) { return scienceDetail(effects).total; }
  function countDetail(state, index, what) {
    const { left, right } = neighbors(state, index);
    const cardCount = (at, types) => state.players[at].built.filter(id => types.includes(CARD.get(id).type)).length;
    let basis;
    if (what === 'allStages') basis = [{ player: index, count: state.players[index].stages.length,
      required: stages(state.players[index]).length, unit: 'stages' }];
    else if (what === 'brownGrayPurpleSelf') basis = ['brown', 'gray', 'purple'].map(type =>
      ({ player: index, type, count: cardCount(index, [type]), unit: 'cards' }));
    else {
      const indices = what.endsWith('All') ? [left, index, right] : what.endsWith('Neighbors') ? [left, right] : [index];
      const type = what.replace(/(All|Neighbors|Self)$/, '');
      basis = indices.map(at => ({ player: at, count: type === 'stages' ? state.players[at].stages.length : cardCount(at, [type]),
        unit: type === 'stages' ? 'stages' : 'cards', ...(type !== 'stages' ? { type } : {}) }));
    }
    return { what, count: countOf(state, index, what), basis };
  }
  function scoreBreakdown(state, index) {
    const player = state.players[index];
    const categories = { military: [], treasury: [], wonder: [], civilian: [], science: [], commerce: [], guild: [] };
    const remaining = [...player.military];
    for (const conflict of state.conflicts || []) {
      if (!Array.isArray(conflict.players) || !Array.isArray(conflict.points) || !Array.isArray(conflict.shields)) continue;
      const position = conflict.players.indexOf(index);
      if (position < 0) continue;
      const points = conflict.points[position], opponent = conflict.players[1 - position];
      if (points) {
        const token = remaining.indexOf(points);
        if (token < 0) continue;
        remaining.splice(token, 1);
      }
      categories.military.push({ kind: 'conflict', age: conflict.age, opponent,
        side: opponent === neighbors(state, index).left ? 'left' : 'right',
        shields: conflict.shields[position], opponentShields: conflict.shields[1 - position], points });
    }
    const legacy = new Map();
    for (const points of remaining) legacy.set(points, (legacy.get(points) || 0) + 1);
    for (const [value, count] of legacy) categories.military.push({ kind: 'legacyMilitary', value, count, points: value * count });
    categories.treasury.push({ kind: 'treasury', coins: player.coins, remainder: player.coins % 3,
      points: Math.floor(player.coins / 3) });
    const scienceSources = [];
    for (const cardId of player.built) {
      const card = CARD.get(cardId);
      const effect = card.effect;
      const source = { kind: 'card', cardId, name: card.name };
      if (card.type === 'blue') categories.civilian.push({ kind: 'fixed', source, points: effect.points || 0 });
      if (card.type === 'yellow' || card.type === 'purple') {
        const key = card.type === 'yellow' ? 'commerce' : 'guild';
        const condition = card.type === 'yellow' ? effect.pointsPer : effect.guild;
        const fixed = card.type === 'yellow' ? effect.points || 0 : 0;
        const rate = condition ? (card.type === 'yellow' ? effect.pointsRate : effect.guildRate) || 1 : 0;
        const counted = condition ? countDetail(state, index, condition) : null;
        categories[key].push({ kind: 'conditional', source, fixed, rate, counted, points: fixed + (counted?.count || 0) * rate,
          ...(effect.science ? { science: effect.science } : {}),
          ...(effect.coins || effect.coinsPer || effect.trade ? { incomeOrTrade: true } : {}) });
      }
      if (effect.science) scienceSources.push({ ...source, symbol: effect.science });
    }
    for (let stage = 0; stage < player.stages.length; stage++) {
      const effect = stages(player)[stage].effect;
      const source = { kind: 'stage', stage: stage + 1, wonder: player.wonder, side: player.side };
      categories.wonder.push({ kind: 'fixed', source, points: effect.points || 0,
        ...(effect.science ? { science: effect.science } : {}),
        ...(effect.coins || effect.coinsPer || effect.trade ? { incomeOrTrade: true } : {}) });
      if (effect.science) scienceSources.push({ ...source, symbol: effect.science });
    }
    const science = scienceDetail(scienceSources.map(source => ({ science: source.symbol })));
    const allocation = Object.entries(science.allocated).flatMap(([symbol, count]) => Array(count).fill(symbol));
    for (const source of scienceSources) source.assigned = source.symbol === 'wild' ? allocation.shift() : source.symbol;
    science.sources = scienceSources;
    for (const [symbol, count] of Object.entries(science.counts)) categories.science.push({ kind: 'scienceSymbol', symbol, count,
      sources: scienceSources.filter(source => source.assigned === symbol), points: count ** 2 });
    categories.science.push({ kind: 'scienceSets', count: science.sets, rate: 7, points: science.setPoints });
    const totals = Object.fromEntries(Object.entries(categories).map(([key, rows]) =>
      [key, rows.reduce((sum, row) => sum + row.points, 0)]));
    totals.total = Object.values(totals).reduce((sum, points) => sum + points, 0);
    return { totals, categories, science, final: state.phase === 'gameover' };
  }
  function score(state, index) { return scoreBreakdown(state, index).totals; }
  function civilizationInfo(state, index) {
    insist(Number.isInteger(index) && state?.players?.[index], '没有这位玩家的文明');
    const player = state.players[index], board = wonder(player), effects = allEffects(player);
    const counts = Object.fromEntries(Object.keys(D.TYPES).map(type => [type, 0]));
    const cards = player.built.map(id => {
      const card = CARD.get(id); counts[card.type]++;
      return { id: card.id, key: card.key, name: card.name, type: card.type, age: card.age,
        cost: card.cost, effect: { ...card.effect }, chain: [...chainKeys(card)] };
    });
    const science = { compass: 0, gear: 0, tablet: 0, wild: 0 };
    for (const effect of effects) if (effect.science) science[effect.science]++;
    return { name: player.name, coins: player.coins, shields: shields(player), science, counts, cards,
      wonder: { id: board.id, name: board.name, city: board.city, resource: board.resource, side: player.side,
        completed: player.stages.length, total: stages(player).length },
      stages: stages(player).map((stage, at) => ({ number: at + 1, built: at < player.stages.length,
        next: state.phase !== 'gameover' && at === player.stages.length, cost: stage.cost, effect: { ...stage.effect } })),
      production: production(player), tradeProduction: tradeProduction(player),
      tradeDiscounts: [...new Set(effects.map(effect => effect.trade).filter(Boolean))],
      military: [...player.military], score: score(state, index) };
  }
  function finish(state) {
    state.phase = 'gameover';
    const ranking = state.players.map((player, index) => ({ index, total: score(state, index).total,
      coins: player.coins })).sort((a, b) => b.total - a.total || b.coins - a.coins);
    state.winners = ranking.filter(item => item.total === ranking[0].total && item.coins === ranking[0].coins)
      .map(item => item.index);
    state.log.push('对局结束，' + state.winners.map(index => state.players[index].name).join('、') + ' 获胜。');
  }
  function actionValue(state, index, action) {
    if (action.mode === 'sell') return 1.4 + (state.players[index].coins < 3 ? 2 : 0);
    const effect = action.mode === 'stage' ? stages(state.players[index])[state.players[index].stages.length].effect :
      CARD.get(action.cardId).effect;
    let value = (effect.points || 0) + (effect.shields || 0) * (state.age === 3 ? 1.6 : 1.25);
    if (effect.produce) value += effect.produce.length * (4 - state.age);
    if (effect.choose) value += 1.4 * (4 - state.age);
    if (effect.science) value += scoreAfterScience(state, index, effect);
    if (effect.trade) value += state.age === 3 ? 0.5 : 3;
    if (effect.coins || effect.coinsPer) value += effectCoins(state, index, effect) / 3;
    if (effect.guild) value += countOf(state, index, effect.guild) * (effect.guildRate || 1);
    if (effect.pointsPer) value += countOf(state, index, effect.pointsPer) * (effect.pointsRate || 1);
    if (effect.freeAge) value += 2;
    if (effect.discardBuild) value += 3;
    if (effect.lastCard) value += 2;
    if (action.chained) value += 0.5;
    value -= (action.payment?.total || 0) * (state.players[index].coins <= 5 ? 0.55 : 0.3);
    if (action.mode === 'stage') value += 0.15;
    return value;
  }
  function scoreAfterScience(state, index, effect) {
    const before = scienceScore(allEffects(state.players[index]));
    const after = scienceScore([...allEffects(state.players[index]), effect]);
    return after - before + (state.age < 3 ? 1.5 : 0);
  }
  function chooseAI(state, index) {
    const choices = state.phase === 'bonus' ? bonusActions(state) : actions(state, index);
    insist(choices.length > 0, '电脑无可执行操作');
    return choices.map(action => ({ action, value: action.mode === 'skip' ? 0 :
      actionValue(state, index, action) + random(state) * 0.1 }))
      .sort((a, b) => b.value - a.value)[0].action;
  }
  function validate(state) {
    insist(state && state.version === 1 && Array.isArray(state.players) &&
      state.players.length >= 3 && state.players.length <= 7, '存档人数或版本不正确');
    insist([1, 2, 3].includes(state.age) && Number.isInteger(state.round) &&
      state.round >= 1 && state.round <= 6, '存档时代进度不正确');
    insist(['draft', 'bonus', 'gameover'].includes(state.phase), '存档阶段不正确');
    insist(Array.isArray(state.hands) && state.hands.length === state.players.length &&
      Array.isArray(state.picks) && state.picks.length === state.players.length, '存档手牌不正确');
    insist(Array.isArray(state.bonusQueue), '存档特殊行动不正确');
    for (const player of state.players) {
      insist(WONDER.has(player.wonder) && ['a', 'b'].includes(player.side), '存档奇迹不正确');
      insist(Number.isInteger(player.coins) && player.coins >= 0 &&
        Array.isArray(player.built) && Array.isArray(player.stages) &&
        player.stages.length <= stages(player).length, '存档玩家数据不正确');
    }
    for (const id of [...state.hands.flat(), ...state.players.flatMap(player => player.built),
      ...state.players.flatMap(player => player.stages), ...state.discarded]) {
      insist(CARD.has(id), '存档包含未知卡牌');
    }
    return true;
  }
  root.WondersEngine = Object.freeze({ D, CARD, WONDER, newGame, actions, bonusActions, play, playBonus, score, scoreBreakdown, civilizationInfo, shields,
    production, tradeProduction, paymentFor, chooseAI, validate, neighbors, stages, chainKeys });
})(typeof window === 'undefined' ? globalThis : window);
