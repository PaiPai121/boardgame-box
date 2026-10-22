(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BurgundyData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const types = ['castle', 'building', 'animal', 'ship', 'mine', 'knowledge'];
  const names = { castle: '城堡', building: '建筑', animal: '畜牧', ship: '船舶', mine: '矿山', knowledge: '知识',
    cattle: '牛', sheep: '羊', pigs: '猪', chickens: '鸡' };
  const colors = { castle: '#3c7854', building: '#c7a67d', animal: '#9cb954', ship: '#4f99b5', mine: '#89929b', knowledge: '#d7bb50' };
  const buildings = [
    { id: 'warehouse', name: '仓库', effect: '立即免费出售一种货物的全部库存，照常获得银币、分数与知识加成。' },
    { id: 'watchtower', name: '瞭望塔', effect: '立即获得 4 分。' },
    { id: 'carpenters-workshop', name: '木工作坊', effect: '立即从任意编号货站免费取一块建筑，放入暂存区。不能取黑市地块。' },
    { id: 'church', name: '教堂', effect: '立即从任意编号货站免费取一块城堡、矿山或知识，放入暂存区。不能取黑市地块。' },
    { id: 'market', name: '市场', effect: '立即从任意编号货站免费取一块船舶或畜牧，放入暂存区。不能取黑市地块。' },
    { id: 'boarding-house', name: '旅舍', effect: '立即获得 4 名工人。知识 13、14 不会增加这项收益。' },
    { id: 'bank', name: '银行', effect: '立即获得 2 枚银币。' },
    { id: 'city-hall', name: '市政厅', effect: '立即从暂存区免费放置另一块地块，忽略骰子点数，仍须同色、相邻且遵守同城建筑限制。' }
  ];
  const effects = [
    '同一片城市中，可以建造多座同名建筑。',
    '每个阶段结束时，每座矿山除银币外再提供 1 名工人。',
    '每次出售一种货物获得 2 枚银币，替代通常的 1 枚。也适用于仓库。',
    '每次出售一种货物，额外获得 1 名工人。也适用于仓库。',
    '放置船舶时，可从两个相邻编号货站收货；1 号与 6 号也相邻。仍最多持有三种货物。',
    '每回合的 2 银币购买也可选择六个编号货站，次数仍限一次。',
    '畜牧计分时，每块参与计分的畜牧地块额外加 1 分，包括被重复计分的旧地块。',
    '每支付 1 名工人，可将骰子调整至多两点，可在 1 与 6 之间循环。',
    '放置建筑时，骰子可免费调整一点。',
    '放置船舶或畜牧时，骰子可免费调整一点。',
    '放置城堡、矿山或知识时，骰子可免费调整一点。',
    '从编号货站取地块时，骰子可免费调整一点。',
    '使用骰子领取工人时，额外获得 1 枚银币。对旅舍无效。',
    '使用骰子领取工人时，获得 4 名工人，替代通常的 2 名。对旅舍无效。',
    '终局：每种曾经出售的货物获得 3 分。未出售的货物不计入种类。',
    ...buildings.map(b => '终局：领地内每座' + b.name + '获得 4 分。'),
    '终局：领地中每种不同的动物获得 4 分。',
    '终局：每块已出售的货物获得 1 分。',
    '终局：每枚领取的颜色完成奖励获得 2 分，大、小奖励都计入。'
  ];
  const knowledge = effects.map((effect, i) => ({ number: i + 1, name: '知识 ' + (i + 1), effect, final: i >= 14,
    black: [7, 12, 14, 15, 24, 25].includes(i + 1) }));
  const rows = [
    [['animal',6],['castle',5],['castle',4],['knowledge',3]],
    [['animal',2],['animal',1],['castle',6],['knowledge',5],['building',4]],
    [['animal',5],['animal',4],['building',3],['knowledge',1],['building',2],['building',3]],
    [['ship',6],['ship',1],['ship',2],['castle',6],['ship',5],['ship',4],['ship',3]],
    [['building',2],['building',5],['mine',4],['building',3],['building',1],['animal',2]],
    [['building',6],['mine',1],['knowledge',2],['building',5],['building',6]],
    [['mine',3],['knowledge',4],['knowledge',1],['building',3]]
  ];
  const cells = rows.flatMap((row, y) => row.map(([type, die], x) => ({ q: Math.max(-3, -y) + x, r: y - 3, type, die })));
  cells.forEach((cell, index) => { cell.index = index; cell.neighbors = cells.map((other, i) =>
    Math.max(Math.abs(cell.q - other.q), Math.abs(cell.r - other.r), Math.abs(cell.q + cell.r - other.q - other.r)) === 1 ? i : -1).filter(i => i >= 0); });
  const regions = [];
  for (const cell of cells) {
    if (cell.region != null) continue;
    const region = { index: regions.length, type: cell.type, cells: [] }, queue = [cell.index];
    cell.region = region.index;
    while (queue.length) {
      const i = queue.pop(); region.cells.push(i);
      for (const n of cells[i].neighbors) if (cells[n].region == null && cells[n].type === region.type) { cells[n].region = region.index; queue.push(n); }
    }
    regions.push(region);
  }
  // Slot colors and 2/3/4-player marks, read from the classic central board.
  const depotSlots = [
    [['knowledge',2],['building',2],['ship',3],['animal',4]],
    [['knowledge',2],['building',4],['castle',2],['building',3]],
    [['animal',2],['ship',2],['building',3],['knowledge',4]],
    [['mine',4],['ship',2],['building',2],['animal',3]],
    [['building',4],['mine',2],['building',2],['knowledge',3]],
    [['castle',3],['building',4],['ship',2],['animal',2]]
  ];
  const tiles = [];
  function add(type, count, black, extra = {}) {
    for (let i = 0; i < count; i++) tiles.push({ id: 'bu-' + tiles.length, type, black, ...extra });
  }
  for (const b of buildings) { add('building', 5, false, { building: b.id }); add('building', 2, true, { building: b.id }); }
  for (const species of ['cattle','sheep','pigs','chickens']) {
    for (const count of [2,2,3,3,4]) add('animal', 1, false, { species, count });
    for (const count of [4,4]) add('animal', 1, true, { species, count });
  }
  for (const k of knowledge) add('knowledge', 1, k.black, { number: k.number });
  add('castle', 14, false); add('castle', 2, true);
  add('mine', 10, false); add('mine', 2, true);
  add('ship', 20, false); add('ship', 6, true);
  const tileById = Object.fromEntries(tiles.map(t => [t.id, t]));
  const buildingById = Object.fromEntries(buildings.map(b => [b.id, b]));
  function name(id) {
    const t = typeof id === 'object' ? id : tileById[id];
    return !t ? '未知地块' : t.type === 'building' ? buildingById[t.building].name : t.type === 'animal' ? t.count + ' 只' + names[t.species] : t.type === 'knowledge' ? '知识 ' + t.number : names[t.type];
  }
  function description(id) {
    const t = typeof id === 'object' ? id : tileById[id];
    if (!t) return '';
    if (t.type === 'building') return buildingById[t.building].effect;
    if (t.type === 'knowledge') return knowledge[t.number - 1].effect;
    if (t.type === 'castle') return '立即获得一个任意点数的额外骰子行动，可取地块、放置地块、售货或领取工人。';
    if (t.type === 'mine') return '每个阶段结束时提供 1 枚银币，包括最后一个阶段。';
    if (t.type === 'ship') return '立即前进一格行动顺序轨，并从任意一个编号货站收取货物。行动顺序的变化从下一轮起生效。';
    return '立即按 ' + t.count + ' 只' + names[t.species] + '计分，并再次计算同一片牧场内全部' + names[t.species] + '地块。不同牧场不互相加分。';
  }
  function art(id) {
    const t = typeof id === 'object' ? id : tileById[id];
    const base = 'assets/burgundy/';
    if (t.type === 'building') return base + 'original/' + t.building + '.jpeg';
    if (t.type === 'knowledge') return t.number === 22 ? base + 'knowledge/knowledge22.jpg' : base + 'original/knowledge-' + t.number + '.jpeg';
    if (t.type === 'animal') return base + 'animals/' + t.count + t.species + '.jpg';
    return base + 'original/' + t.type + '.jpeg';
  }
  return Object.freeze({ types, names, colors, buildings, buildingById, knowledge, cells, regions, depotSlots, tiles, tileById,
    regionPoints: [0,1,3,6,10,15,21,28,36], name, description, art,
    rulesURL: 'https://cdn.1j1ju.com/medias/04/f5/f9-the-castles-of-burgundy-rulebook.pdf',
    errataURL: 'https://www.yucata.de/en/Rules/CastlesOfBurgundy' });
});
