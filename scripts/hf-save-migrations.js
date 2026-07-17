// Versioned save-state migrations for Helvetic Freight.
(function initHfSaveMigrations(global) {
  'use strict';

  const DEPRECATED_GOODS_SCHEMA = 138;

  const round = value => typeof global.roundCargo === 'function'
    ? global.roundCargo(Number(value) || 0)
    : Math.round((Number(value) || 0) * 1000) / 1000;

  function deprecatedGoods() {
    return new Set(global.HF_GOODS_DATABASE?.deprecations?.goods || []);
  }

  function activeGoods() {
    return new Set(Object.keys(global.HF_GOODS_DATABASE?.goods || {}));
  }

  function purgeDeprecatedGoods(target) {
    const deprecated = deprecatedGoods();
    const allowed = activeGoods();
    if (!deprecated.size && !allowed.size) return target;
    for (const city of Object.values(target?.cities || {})) {
      if (!city || typeof city !== 'object') continue;
      if (city.inventory && typeof city.inventory === 'object') {
        for (const id of deprecated) delete city.inventory[id];
        for (const id of Object.keys(city.inventory)) if (allowed.size && !allowed.has(id)) delete city.inventory[id];
      }
      if (city.demands && typeof city.demands === 'object') {
        for (const id of deprecated) delete city.demands[id];
        for (const id of Object.keys(city.demands)) if (allowed.size && !allowed.has(id)) delete city.demands[id];
      }
    }
    target.deprecatedGoodsSchema = DEPRECATED_GOODS_SCHEMA;
    return target;
  }

  global.HF_SAVE_MIGRATIONS = Object.freeze([
    Object.freeze({
      id: 'deprecated-goods-cleanup-v138',
      schemaKey: 'deprecatedGoodsSchema',
      schemaVersion: DEPRECATED_GOODS_SCHEMA,
      buildVersion: '1.1.38',
      description: 'Removes deprecated goods from city inventories and demand slots using HF_GOODS_DATABASE.',
      migrate: purgeDeprecatedGoods
    }),
    Object.freeze({
      id: 'sissach-demand-v137',
      schemaKey: 'sissachDemandSchema',
      schemaVersion: 137,
      buildVersion: '1.1.37',
      description: 'Migrates existing Sissach demand slots to the structured small_town_plus profile.',
      migrate(target) {
        const profile = global.HF_DEMAND_DATABASE?.cityDemandProfiles?.sissach;
        const city = target?.cities?.sissach;
        if (!profile || !city) return target;
        const deprecated = deprecatedGoods();
        city.inventory = city.inventory || {};
        city.demands = city.demands || {};
        const goods = Object.fromEntries(
          Object.entries(profile.goods || {}).filter(([good]) => !deprecated.has(good) && global.HF_GOODS_DATABASE?.goods?.[good])
        );
        for (const [good, preset] of Object.entries(goods)) {
          if (!Number.isFinite(Number(city.inventory[good]))) city.inventory[good] = 0;
          const previous = city.demands[good] && typeof city.demands[good] === 'object' ? city.demands[good] : {};
          const max = Math.max(0, Number(previous.max) || 0, Number(preset.max) || 0);
          city.demands[good] = {
            ...previous,
            max: round(max),
            need: round(Math.min(max, Math.max(Number(previous.need) || 0, max * 0.62))),
            mult: Number(previous.mult) > 0 ? Math.max(Number(previous.mult), Number(preset.mult) || 1) : Number(preset.mult) || 1,
            dailyRate: Number(preset.dailyRate)
          };
        }
        purgeDeprecatedGoods(target);
        target.sissachDemandSchema = 137;
        target.sissachDemandProfile = 'small_town_plus';
        return target;
      }
    })
  ]);
})(window);
