// Versioned save-state migrations for Helvetic Freight.
(function initHfSaveMigrations(global) {
  'use strict';

  const round = value => typeof global.roundCargo === 'function'
    ? global.roundCargo(Number(value) || 0)
    : Math.round((Number(value) || 0) * 1000) / 1000;

  global.HF_SAVE_MIGRATIONS = Object.freeze([
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
        city.inventory = city.inventory || {};
        city.demands = city.demands || {};
        const goods = {food: {max: 72, mult: 1.02, dailyRate: 0.22}, ...profile.goods};
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
        target.sissachDemandSchema = 137;
        target.sissachDemandProfile = 'small_town_plus';
        return target;
      }
    })
  ]);
})(window);
