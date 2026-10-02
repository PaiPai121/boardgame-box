(function (root, factory) {
  const data = factory(); if (typeof module === 'object' && module.exports) module.exports = data; else root.PuertoData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const goods = ['corn', 'indigo', 'sugar', 'tobacco', 'coffee'];
  const names = { corn: '玉米', indigo: '靛蓝', sugar: '蔗糖', tobacco: '烟草', coffee: '咖啡', quarry: '采石场' };
  const colors = { corn: '#e5bd32', indigo: '#2582a5', sugar: '#e7e7dc', tobacco: '#907332', coffee: '#514227', quarry: '#a6aea5' };
  const barrels = { corn: 10, indigo: 11, sugar: 11, tobacco: 9, coffee: 9 };
  const plantations = { corn: 10, indigo: 12, sugar: 11, tobacco: 9, coffee: 8 };
  const roles = [
    { id: 'settler', name: '拓荒者', action: '每人可选一块种植园。', privilege: '可改拿采石场。' },
    { id: 'mayor', name: '市长', action: '分配来船居民，重新安排所有工位。', privilege: '从供应区额外领取一位居民。' },
    { id: 'builder', name: '建造师', action: '每人可购买一座建筑。', privilege: '建筑费用减一金币。' },
    { id: 'craftsman', name: '工匠', action: '已进驻的种植园与加工厂生产货物。', privilege: '阶段末额外选一桶本阶段生产过的货物。' },
    { id: 'trader', name: '商人', action: '每人可向交易所出售一桶货物。', privilege: '出售时多得一金币。' },
    { id: 'captain', name: '船长', action: '轮流强制装运货物，每桶一胜利分。', privilege: '第一次装运额外得一分。' },
    { id: 'prospector', name: '淘金者', action: '其他玩家不行动。', privilege: '领取一金币。' }
  ];
  function production(id, name, cost, points, workers, stock, good) {
    return { id, name, cost, points, workers, stock, good, spaces: 1, description: '配合已进驻的' + names[good] + '种植园生产' + names[good] + '，每位加工工人最多加工一桶。' };
  }
  function special(id, name, cost, points, description, spaces = 1) {
    return { id, name, cost, points, workers: 1, stock: spaces === 2 ? 1 : 2, spaces, description };
  }
  const buildings = [
    production('small_indigo', '小靛蓝厂', 1, 1, 1, 4, 'indigo'),
    production('small_sugar', '小制糖厂', 2, 1, 1, 4, 'sugar'),
    production('large_indigo', '大靛蓝厂', 3, 2, 3, 3, 'indigo'),
    production('large_sugar', '大制糖厂', 4, 2, 3, 3, 'sugar'),
    production('tobacco', '烟草加工厂', 5, 3, 3, 3, 'tobacco'),
    production('coffee', '咖啡烘焙厂', 6, 3, 2, 3, 'coffee'),
    special('small_market', '小市场', 1, 1, '出售一桶货物时额外得 1 金币。'),
    special('hacienda', '庄园', 2, 1, '拓荒时，在正常选地前可额外暗抽一块种植园，必须放入岛屿。'),
    special('construction_hut', '建筑工棚', 2, 1, '拓荒阶段可用采石场代替正常种植园。'),
    special('small_warehouse', '小仓库', 3, 1, '船长阶段末，除一桶基本保留外，可保留一种货物的全部库存。'),
    special('hospice', '收容所', 4, 2, '拓荒正常取得的种植园或采石场可立即进驻一位居民；庄园额外暗抽的地块不享受此效果。'),
    special('office', '办公室', 5, 2, '可向交易所出售已有种类的货物；交易所已满仍不能出售。'),
    special('large_market', '大市场', 5, 2, '出售一桶货物时额外得 2 金币；与小市场叠加。'),
    special('large_warehouse', '大仓库', 6, 2, '船长阶段末，除一桶基本保留外，可保留两种货物的全部库存；与小仓库叠加。'),
    special('factory', '工厂', 7, 3, '本次实际生产 1/2/3/4/5 种货物时，分别获得 0/1/2/3/5 金币。工匠额外货物不计入种类。'),
    special('university', '大学', 8, 3, '建造新建筑时，可立即给新建筑进驻一位居民，即使建筑有多个工位也只进驻一位。'),
    special('harbor', '港口', 8, 3, '每次装运货物额外获得 1 分，包括使用私人码头的装运。'),
    special('wharf', '私人码头', 9, 3, '每个船长阶段可用一次：将一种货物的全部库存放回供应区并按装运计分，可代替公共货船。'),
    special('guild_hall', '行会大厅', 10, 4, '终局：每座小生产建筑额外 1 分，每座大生产建筑额外 2 分，不要求这些生产建筑进驻。', 2),
    special('residence', '官邸', 10, 4, '终局：岛屿使用 1–9/10/11/12 格时，额外获得 4/5/6/7 分。', 2),
    special('fortress', '要塞', 10, 4, '终局：每 3 位居民额外 1 分，包含未进驻的居民。', 2),
    special('customs_house', '海关', 10, 4, '终局：每 4 点装运胜利分额外 1 分；建筑分数和终局加分不计入。', 2),
    special('city_hall', '市政厅', 10, 4, '终局：每座非生产建筑额外 1 分，包含市政厅本身，不要求这些建筑进驻。', 2)
  ];
  return { goods, names, colors, barrels, plantations, roles, buildings,
    rulesSource: 'https://www.riograndegames.com/wp-content/uploads/2019/08/Puerto-Rico-Deluxe-Rules.pdf' };
});
