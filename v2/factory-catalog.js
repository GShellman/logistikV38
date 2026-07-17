(() => {
  'use strict';

  const FACTORY_GROUPS = Object.freeze({
    agriculture: Object.freeze({id: 'agriculture', name: 'Landwirtschaft', icon: '🌾', desc: 'Felder, Plantagen und Tierhaltung'}),
    natural: Object.freeze({id: 'natural', name: 'Forst & Fischerei', icon: '🌲', desc: 'Natürliche Rohstoffe'}),
    mines: Object.freeze({id: 'mines', name: 'Minen', icon: '⛏️', desc: 'Erz und Aluminiumerz'}),
    food: Object.freeze({id: 'food', name: 'Lebensmittel', icon: '🥫', desc: 'Verarbeitung landwirtschaftlicher Waren'}),
    industry: Object.freeze({id: 'industry', name: 'Industrie', icon: '🏭', desc: 'Metall, Möbel, Textilien und Werkzeuge'}),
    tech: Object.freeze({id: 'tech', name: 'Chemie & Technik', icon: '⚗️', desc: 'Chemikalien, Medizin und Elektronik'}),
  });

  const FACTORY_CATALOG = Object.freeze([
    Object.freeze({id: 'farm', name: 'Landwirtschaft', icon: '🌾', group: 'agriculture', cost: 42000, desc: 'Basisbetrieb für Feldwirtschaft.', assetGlobal: 'HF_FARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'pigfarm', name: 'Schweinezucht', icon: '🐖', group: 'agriculture', cost: 72000, desc: 'Tierhaltungsbetrieb für die spätere Lebensmittelkette.', assetGlobal: 'HF_PIGFARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'tomatofarm', name: 'Tomatenhof', icon: '🍅', group: 'agriculture', cost: 52000, desc: 'Spezialisierter Gemüsehof für spätere Verarbeitung.', assetGlobal: 'HF_TOMATOFARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'zucchinifarm', name: 'Zucchinihof', icon: '🥒', group: 'agriculture', cost: 52000, desc: 'Spezialisierter Gemüsehof für spätere Verarbeitung.', assetGlobal: 'HF_ZUCCHINIFARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'potatofarm', name: 'Kartoffelfeld', icon: '🥔', group: 'agriculture', cost: 50000, desc: 'Ackerbaubetrieb für spätere Warenketten.', assetGlobal: 'HF_POTATOFARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'cornfarm', name: 'Maisfeld', icon: '🌽', group: 'agriculture', cost: 52000, desc: 'Ackerbaubetrieb für spätere Lebensmittelketten.', assetGlobal: 'HF_CORNFARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'peafarm', name: 'Erbsenfeld', icon: '🫛', group: 'agriculture', cost: 52000, desc: 'Ackerbaubetrieb für spätere Lebensmittelketten.', assetGlobal: 'HF_PEAFARM_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'appleorchard', name: 'Apfelplantage', icon: '🍎', group: 'agriculture', cost: 68000, desc: 'Obstbaubetrieb für spätere Warenketten.', assetGlobal: 'HF_APPLEORCHARD_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'pearorchard', name: 'Birnenplantage', icon: '🍐', group: 'agriculture', cost: 68000, desc: 'Obstbaubetrieb für spätere Warenketten.', assetGlobal: 'HF_PEARORCHARD_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'cherryorchard', name: 'Kirschplantage', icon: '🍒', group: 'agriculture', cost: 74000, desc: 'Obstbaubetrieb für spätere Warenketten.', assetGlobal: 'HF_CHERRYORCHARD_FACILITY_ASSET_DATA_URI', producesLater: true}),

    Object.freeze({id: 'forestry', name: 'Forstbetrieb', icon: '🌲', group: 'natural', cost: 48000, desc: 'Naturrohstoff-Betrieb für Holzketten.', assetGlobal: 'HF_FORESTRY_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'fishery', name: 'Fischerei', icon: '🐟', group: 'natural', cost: 68000, desc: 'Naturbetrieb für spätere Kühl- und Lebensmittelketten.', assetGlobal: 'HF_FISHERY_FACILITY_ASSET_DATA_URI', producesLater: true}),

    Object.freeze({id: 'mine', name: 'Bergwerk', icon: '⛏️', group: 'mines', cost: 65000, desc: 'Rohstoffbetrieb für Erzketten.', assetGlobal: 'HF_MINE_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'aluminum_mine', name: 'Aluminiummine', icon: '⛏️', group: 'mines', cost: 76000, desc: 'Rohstoffbetrieb für spätere Aluminiumketten.', assetGlobal: 'HF_ALUMINUM_MINE_FACILITY_ASSET_DATA_URI', producesLater: true}),

    Object.freeze({id: 'slaughterhouse', name: 'Schlachthof', icon: '🥩', group: 'food', cost: 98000, desc: 'Lebensmittelverarbeitung für spätere Warenketten.', assetGlobal: 'HF_SLAUGHTERHOUSE_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'cannery', name: 'Dosenfabrik', icon: '🥫', group: 'food', cost: 188000, desc: 'Verpackungsnaher Lebensmittelbetrieb für spätere Warenketten.', assetGlobal: 'HF_CANNERY_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'foodfactory', name: 'Lebensmittelfabrik', icon: '🥫', group: 'food', cost: 135000, desc: 'Flexible Lebensmittelverarbeitung für spätere Rezeptlogik.', assetGlobal: 'HF_RAVIOLI_MEAT_FACTORY_FACILITY_ASSET_DATA_URI', producesLater: true}),

    Object.freeze({id: 'aluminumworks', name: 'Aluminiumwerk', icon: '🔩', group: 'industry', cost: 118000, desc: 'Industriebetrieb für spätere Metallketten.', assetGlobal: 'HF_ALUMINUMWORKS_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'canfactory', name: 'Dosenfabrik', icon: '🥫', group: 'industry', cost: 96000, desc: 'Industriebetrieb für spätere Verpackungsketten.', assetGlobal: 'HF_CANFACTORY_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'furniture', name: 'Möbelfabrik', icon: '🪑', group: 'industry', cost: 92000, desc: 'Verarbeitender Betrieb für spätere Konsumgüterketten.', assetGlobal: 'HF_FURNITURE_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'toolworks', name: 'Werkzeugfabrik', icon: '🔧', group: 'industry', cost: 105000, desc: 'Verarbeitender Betrieb für spätere Werkzeugketten.', assetGlobal: 'HF_TOOLWORKS_FACILITY_ASSET_DATA_URI', producesLater: true}),

    Object.freeze({id: 'chemical', name: 'Chemiewerk', icon: '⚗️', group: 'tech', cost: 85000, desc: 'Technikbetrieb für spätere Chemieketten.', assetGlobal: 'HF_CHEMICAL_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'electronics', name: 'Elektronikwerk', icon: '💻', group: 'tech', cost: 142000, desc: 'Technikbetrieb für spätere Elektronikketten.', assetGlobal: 'HF_ELECTRONICS_FACILITY_ASSET_DATA_URI', producesLater: true}),
    Object.freeze({id: 'pharma', name: 'Pharmawerk', icon: '💊', group: 'tech', cost: 155000, desc: 'Technikbetrieb für spätere Medizinketten.', assetGlobal: 'HF_PHARMA_FACILITY_ASSET_DATA_URI', producesLater: true}),
  ]);

  function factoryImage(factoryId) {
    const factory = FACTORY_CATALOG.find((item) => item.id === factoryId);
    return factory?.assetGlobal ? window[factory.assetGlobal] || '' : '';
  }

  window.HFV2FactoryGroups = FACTORY_GROUPS;
  window.HFV2FactoryCatalog = FACTORY_CATALOG;
  window.HFV2FactoryAssets = Object.freeze({factoryImage});
})();
