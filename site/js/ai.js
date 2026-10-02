(function (root, factory) {
  const engine = typeof module !== 'undefined' && module.exports ? require('./engine') : root.SplendorEngine;
  const api = factory(engine);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SplendorAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  function visibleTargets(state, cards) {
    const targets = [];
    for (const tier of E.TIERS) {
      state.display[tier].forEach((id, index) => {
        if (id) targets.push({ card: E.getCard(cards, id), source: { zone: 'display', tier, index } });
      });
    }
    state.players[state.current].reserved.forEach((id, index) => {
      if (id) targets.push({ card: E.getCard(cards, id), source: { zone: 'reserved', index } });
    });
    return targets;
  }
  function gapToCard(player, card, cards) {
    const details = E.requiredPayment(player, card, cards);
    let missing = 0;
    for (const color of E.COLORS) missing += Math.max(0, details.need[color] - player.tokens[color]);
    return Math.max(0, details.fixedMaster - player.tokens.purple) + Math.max(0, missing - Math.max(0, player.tokens.purple - details.fixedMaster));
  }
  function cardValue(state, card, cards) {
    const player = state.players[state.current];
    const urgent = state.players.some((other, index) => index !== state.current && E.score(other, cards) >= 13);
    const turnsPlayed = Math.floor((state.turn - 1) / state.players.length);
    let value = card.vp * (urgent ? 7 : turnsPlayed < 16 ? 4.2 : 5.5);
    value += card.bonusCount * (turnsPlayed < 20 ? 3.8 : 2.1);
    if (player.owned.some(id => E.getCard(cards, id)?.evolvesTo === card.name)) value += 2.4;
    if (card.evolvesTo) value += 0.9;
    return value;
  }
  function bestTarget(state, cards) {
    const player = state.players[state.current];
    return visibleTargets(state, cards).map(target => {
      const gap = gapToCard(player, target.card, cards);
      const required = E.requiredPayment(player, target.card, cards);
      const masterPenalty = required.fixedMaster > player.tokens.purple ? 1.5 : 0;
      return { ...target, gap, value: cardValue(state, target.card, cards) / (1 + gap * 0.62 + masterPenalty) };
    }).sort((a, b) => b.value - a.value || a.gap - b.gap)[0] || null;
  }
  function actionCard(state, cards, action) {
    return E.getCard(cards, E.sourceCardId(state, action.source, state.players[state.current]));
  }
  function chooseAction(state, cards) {
    const legal = E.legalActions(state, cards);
    if (!legal.length) return null;
    const player = state.players[state.current];
    const buys = legal.filter(action => action.type === 'buy');
    if (buys.length) {
      buys.sort((a, b) => {
        const cardA = actionCard(state, cards, a);
        const cardB = actionCard(state, cards, b);
        const scoreA = cardValue(state, cardA, cards) + (E.score(player, cards) + cardA.vp >= 18 ? 100 : 0);
        const scoreB = cardValue(state, cardB, cards) + (E.score(player, cards) + cardB.vp >= 18 ? 100 : 0);
        return scoreB - scoreA;
      });
      return buys[0];
    }
    const target = bestTarget(state, cards);
    const takes = legal.filter(action => action.type === 'take');
    const before = target ? gapToCard(player, target.card, cards) : 0;
    let bestTake = null;
    let bestGain = -Infinity;
    for (const action of takes) {
      const pretend = { ...player, tokens: { ...player.tokens } };
      for (const color of action.colors) pretend.tokens[color]++;
      const after = target ? gapToCard(pretend, target.card, cards) : 0;
      let gain = (before - after) * 5;
      for (const color of action.colors) {
        gain += E.COLORS.reduce((sum, tint) => sum + (tint === color ? 0.16 : 0), 0);
        if (player.tokens[color] >= 3) gain -= 0.8;
      }
      gain -= Math.max(0, E.tokenTotal(pretend.tokens) - 10) * 1.3;
      if (action.colors.length === 2 && action.colors[0] === action.colors[1]) gain += 0.2;
      if (gain > bestGain) { bestGain = gain; bestTake = action; }
    }
    const canReserve = target && target.source.zone === 'display' && !['rare', 'legend'].includes(target.card.tier) && player.reserved.length < 3;
    if (canReserve && state.bank.purple > 0 && (bestGain <= 0.8 || (target.gap <= 2 && target.card.vp >= 3))) {
      return { type: 'reserve', source: target.source };
    }
    if (bestTake && bestGain > -2) return bestTake;
    if (canReserve) return { type: 'reserve', source: target.source };
    return bestTake || legal.find(action => action.type === 'reserve') || legal[0];
  }
  function chooseDiscard(state, cards) {
    const player = state.players[state.current];
    const target = bestTarget(state, cards);
    const details = target ? E.requiredPayment(player, target.card, cards) : null;
    const choices = E.ALL_COLORS.filter(color => player.tokens[color] > 0);
    choices.sort((a, b) => {
      const usefulness = color => color === 'purple' ? 100 : (details?.need[color] || 0) - player.tokens[color] * 0.5;
      return usefulness(a) - usefulness(b);
    });
    return choices[0];
  }
  function chooseEvolution(state, cards) {
    const options = E.evolutionOptions(state, cards);
    if (!options.length) return null;
    const player = state.players[state.current];
    options.sort((a, b) => {
      const value = option => {
        const oldCard = E.getCard(cards, option.from);
        const nextCard = E.getCard(cards, option.to);
        return (nextCard.vp - oldCard.vp) * 6 + (nextCard.bonusCount - oldCard.bonusCount) * 2 + (nextCard.evolvesTo ? 0.5 : 0);
      };
      return value(b) - value(a);
    });
    const best = options[0];
    const oldCard = E.getCard(cards, best.from);
    const nextCard = E.getCard(cards, best.to);
    return nextCard.vp >= oldCard.vp || E.score(player, cards) >= 15 ? best : null;
  }
  function takeTurn(state, cards) {
    const player = state.players[state.current];
    if (!player.ai) throw new Error('当前玩家不是电脑');
    const action = chooseAction(E.observe(state, state.current), cards);
    if (!action) throw new Error('电脑没有合法行动');
    E.perform(state, cards, action);
    while (state.phase === 'discard') E.discardToken(state, chooseDiscard(E.observe(state, state.current), cards));
    const option = chooseEvolution(E.observe(state, state.current), cards);
    if (option) E.evolve(state, cards, option);
    E.finishTurn(state, cards);
    return action;
  }
  return { chooseAction, chooseDiscard, chooseEvolution, takeTurn, gapToCard };
});
