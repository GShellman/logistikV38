// Central city catalog for Helvetic Freight.
// Keep city metadata here so the HTML shell stays compact and future changes remain small.
// Each entry is an object so updates are self-documenting; the app still accepts legacy tuple entries.
window.HF_CITY_CATALOG_SCHEMA = {
  version: 2,
  fields: ['id', 'name', 'coordinates.lat', 'coordinates.lng', 'tier', 'slots', 'population', 'wealthFactor', 'demandProfile']
};
window.HF_CITY_CATALOG = [
  {
    "id": "zurich",
    "name": "Zürich",
    "coordinates": {
      "lat": 47.3769,
      "lng": 8.5417
    },
    "tier": 3,
    "slots": 5,
    "population": 435000,
    "wealthFactor": 1.28,
    "demandProfile": "metropolis"
  },
  {
    "id": "winterthur",
    "name": "Winterthur",
    "coordinates": {
      "lat": 47.4988,
      "lng": 8.7241
    },
    "tier": 2,
    "slots": 3,
    "population": 116000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "baden",
    "name": "Baden",
    "coordinates": {
      "lat": 47.4738,
      "lng": 8.3079
    },
    "tier": 2,
    "slots": 3,
    "population": 20000,
    "wealthFactor": 1.18,
    "demandProfile": "industrial"
  },
  {
    "id": "aarau",
    "name": "Aarau",
    "coordinates": {
      "lat": 47.3904,
      "lng": 8.0457
    },
    "tier": 2,
    "slots": 3,
    "population": 22000,
    "wealthFactor": 1.10,
    "demandProfile": "regional"
  },
  {
    "id": "olten",
    "name": "Olten",
    "coordinates": {
      "lat": 47.3499,
      "lng": 7.9033
    },
    "tier": 2,
    "slots": 3,
    "population": 19000,
    "wealthFactor": 1.02,
    "demandProfile": "logistics"
  },
  {
    "id": "basel",
    "name": "Basel",
    "coordinates": {
      "lat": 47.5596,
      "lng": 7.5886
    },
    "tier": 3,
    "slots": 5,
    "population": 178000,
    "wealthFactor": 1.16,
    "demandProfile": "industrial"
  },
  {
    "id": "liestal",
    "name": "Liestal",
    "coordinates": {
      "lat": 47.4845,
      "lng": 7.7345
    },
    "tier": 2,
    "slots": 3,
    "population": 15000,
    "wealthFactor": 1.08,
    "demandProfile": "regional"
  },
  {
    "id": "sissach",
    "name": "Sissach",
    "coordinates": {
      "lat": 47.4645,
      "lng": 7.808
    },
    "tier": 1,
    "slots": 2,
    "population": 7000,
    "wealthFactor": 1.00,
    "demandProfile": "rural"
  },
  {
    "id": "solothurn",
    "name": "Solothurn",
    "coordinates": {
      "lat": 47.2088,
      "lng": 7.5323
    },
    "tier": 2,
    "slots": 3,
    "population": 17000,
    "wealthFactor": 1.07,
    "demandProfile": "regional"
  },
  {
    "id": "bern",
    "name": "Bern",
    "coordinates": {
      "lat": 46.948,
      "lng": 7.4474
    },
    "tier": 3,
    "slots": 5,
    "population": 134000,
    "wealthFactor": 1.12,
    "demandProfile": "metropolis"
  },
  {
    "id": "thun",
    "name": "Thun",
    "coordinates": {
      "lat": 46.758,
      "lng": 7.628
    },
    "tier": 2,
    "slots": 4,
    "population": 44000,
    "wealthFactor": 1.08,
    "demandProfile": "tourism"
  },
  {
    "id": "interlaken",
    "name": "Interlaken",
    "coordinates": {
      "lat": 46.6863,
      "lng": 7.8632
    },
    "tier": 1,
    "slots": 3,
    "population": 6000,
    "wealthFactor": 1.12,
    "demandProfile": "tourism"
  },
  {
    "id": "spiez",
    "name": "Spiez",
    "coordinates": {
      "lat": 46.6847,
      "lng": 7.6911
    },
    "tier": 1,
    "slots": 2,
    "population": 13000,
    "wealthFactor": 1.08,
    "demandProfile": "tourism"
  },
  {
    "id": "fribourg",
    "name": "Fribourg",
    "coordinates": {
      "lat": 46.8065,
      "lng": 7.1619
    },
    "tier": 2,
    "slots": 4,
    "population": 38000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "biel",
    "name": "Biel/Bienne",
    "coordinates": {
      "lat": 47.1368,
      "lng": 7.2468
    },
    "tier": 2,
    "slots": 4,
    "population": 56000,
    "wealthFactor": 1.04,
    "demandProfile": "industrial"
  },
  {
    "id": "neuchatel",
    "name": "Neuchâtel",
    "coordinates": {
      "lat": 46.9896,
      "lng": 6.9293
    },
    "tier": 2,
    "slots": 4,
    "population": 45000,
    "wealthFactor": 1.12,
    "demandProfile": "regional"
  },
  {
    "id": "yverdon",
    "name": "Yverdon",
    "coordinates": {
      "lat": 46.7785,
      "lng": 6.6412
    },
    "tier": 2,
    "slots": 3,
    "population": 30000,
    "wealthFactor": 1.02,
    "demandProfile": "regional"
  },
  {
    "id": "lausanne",
    "name": "Lausanne",
    "coordinates": {
      "lat": 46.5197,
      "lng": 6.6323
    },
    "tier": 3,
    "slots": 5,
    "population": 141000,
    "wealthFactor": 1.18,
    "demandProfile": "metropolis"
  },
  {
    "id": "montreux",
    "name": "Montreux",
    "coordinates": {
      "lat": 46.4312,
      "lng": 6.9107
    },
    "tier": 2,
    "slots": 4,
    "population": 26000,
    "wealthFactor": 1.18,
    "demandProfile": "tourism"
  },
  {
    "id": "vevey",
    "name": "Vevey",
    "coordinates": {
      "lat": 46.4628,
      "lng": 6.843
    },
    "tier": 2,
    "slots": 3,
    "population": 52000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "geneva",
    "name": "Genève",
    "coordinates": {
      "lat": 46.2044,
      "lng": 6.1432
    },
    "tier": 3,
    "slots": 5,
    "population": 203000,
    "wealthFactor": 1.30,
    "demandProfile": "metropolis"
  },
  {
    "id": "nyon",
    "name": "Nyon",
    "coordinates": {
      "lat": 46.3833,
      "lng": 6.2396
    },
    "tier": 2,
    "slots": 3,
    "population": 22000,
    "wealthFactor": 1.24,
    "demandProfile": "metropolis"
  },
  {
    "id": "sion",
    "name": "Sion",
    "coordinates": {
      "lat": 46.2333,
      "lng": 7.3606
    },
    "tier": 2,
    "slots": 4,
    "population": 35000,
    "wealthFactor": 1.05,
    "demandProfile": "alpine"
  },
  {
    "id": "martigny",
    "name": "Martigny",
    "coordinates": {
      "lat": 46.1024,
      "lng": 7.0724
    },
    "tier": 2,
    "slots": 3,
    "population": 20000,
    "wealthFactor": 1.05,
    "demandProfile": "alpine"
  },
  {
    "id": "brig",
    "name": "Brig",
    "coordinates": {
      "lat": 46.3167,
      "lng": 7.9878
    },
    "tier": 2,
    "slots": 3,
    "population": 13000,
    "wealthFactor": 1.04,
    "demandProfile": "alpine"
  },
  {
    "id": "visp",
    "name": "Visp",
    "coordinates": {
      "lat": 46.293,
      "lng": 7.882
    },
    "tier": 1,
    "slots": 3,
    "population": 8000,
    "wealthFactor": 1.08,
    "demandProfile": "industrial"
  },
  {
    "id": "luzern",
    "name": "Luzern",
    "coordinates": {
      "lat": 47.0502,
      "lng": 8.3093
    },
    "tier": 3,
    "slots": 5,
    "population": 82000,
    "wealthFactor": 1.15,
    "demandProfile": "tourism"
  },
  {
    "id": "zug",
    "name": "Zug",
    "coordinates": {
      "lat": 47.1662,
      "lng": 8.5155
    },
    "tier": 2,
    "slots": 4,
    "population": 31000,
    "wealthFactor": 1.42,
    "demandProfile": "metropolis"
  },
  {
    "id": "schwyz",
    "name": "Schwyz",
    "coordinates": {
      "lat": 47.0207,
      "lng": 8.6527
    },
    "tier": 2,
    "slots": 3,
    "population": 15000,
    "wealthFactor": 1.14,
    "demandProfile": "alpine"
  },
  {
    "id": "stans",
    "name": "Stans",
    "coordinates": {
      "lat": 46.9572,
      "lng": 8.365
    },
    "tier": 1,
    "slots": 3,
    "population": 8500,
    "wealthFactor": 1.12,
    "demandProfile": "alpine"
  },
  {
    "id": "altdorf",
    "name": "Altdorf",
    "coordinates": {
      "lat": 46.8804,
      "lng": 8.6444
    },
    "tier": 1,
    "slots": 3,
    "population": 9500,
    "wealthFactor": 1.02,
    "demandProfile": "alpine"
  },
  {
    "id": "andermatt",
    "name": "Andermatt",
    "coordinates": {
      "lat": 46.6356,
      "lng": 8.5939
    },
    "tier": 1,
    "slots": 2,
    "population": 1500,
    "wealthFactor": 1.20,
    "demandProfile": "tourism"
  },
  {
    "id": "glarus",
    "name": "Glarus",
    "coordinates": {
      "lat": 47.0406,
      "lng": 9.068
    },
    "tier": 1,
    "slots": 3,
    "population": 12500,
    "wealthFactor": 1.03,
    "demandProfile": "alpine"
  },
  {
    "id": "rapperswil",
    "name": "Rapperswil",
    "coordinates": {
      "lat": 47.2267,
      "lng": 8.8184
    },
    "tier": 2,
    "slots": 3,
    "population": 27000,
    "wealthFactor": 1.18,
    "demandProfile": "tourism"
  },
  {
    "id": "uster",
    "name": "Uster",
    "coordinates": {
      "lat": 47.3471,
      "lng": 8.7209
    },
    "tier": 2,
    "slots": 3,
    "population": 36000,
    "wealthFactor": 1.12,
    "demandProfile": "metropolis"
  },
  {
    "id": "schaffhausen",
    "name": "Schaffhausen",
    "coordinates": {
      "lat": 47.6965,
      "lng": 8.6349
    },
    "tier": 2,
    "slots": 4,
    "population": 37000,
    "wealthFactor": 1.07,
    "demandProfile": "border"
  },
  {
    "id": "frauenfeld",
    "name": "Frauenfeld",
    "coordinates": {
      "lat": 47.557,
      "lng": 8.8988
    },
    "tier": 2,
    "slots": 3,
    "population": 26000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "kreuzlingen",
    "name": "Kreuzlingen",
    "coordinates": {
      "lat": 47.6509,
      "lng": 9.175
    },
    "tier": 2,
    "slots": 3,
    "population": 23000,
    "wealthFactor": 1.05,
    "demandProfile": "border"
  },
  {
    "id": "stgallen",
    "name": "St. Gallen",
    "coordinates": {
      "lat": 47.4245,
      "lng": 9.3767
    },
    "tier": 3,
    "slots": 5,
    "population": 76000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "wil",
    "name": "Wil",
    "coordinates": {
      "lat": 47.4664,
      "lng": 9.0497
    },
    "tier": 2,
    "slots": 3,
    "population": 24000,
    "wealthFactor": 1.04,
    "demandProfile": "regional"
  },
  {
    "id": "herisau",
    "name": "Herisau",
    "coordinates": {
      "lat": 47.3862,
      "lng": 9.2792
    },
    "tier": 1,
    "slots": 3,
    "population": 16000,
    "wealthFactor": 1.02,
    "demandProfile": "rural"
  },
  {
    "id": "appenzell",
    "name": "Appenzell",
    "coordinates": {
      "lat": 47.331,
      "lng": 9.4096
    },
    "tier": 1,
    "slots": 2,
    "population": 6000,
    "wealthFactor": 1.06,
    "demandProfile": "tourism"
  },
  {
    "id": "chur",
    "name": "Chur",
    "coordinates": {
      "lat": 46.8508,
      "lng": 9.532
    },
    "tier": 2,
    "slots": 4,
    "population": 39000,
    "wealthFactor": 1.07,
    "demandProfile": "alpine"
  },
  {
    "id": "landquart",
    "name": "Landquart",
    "coordinates": {
      "lat": 46.9671,
      "lng": 9.554
    },
    "tier": 1,
    "slots": 3,
    "population": 9000,
    "wealthFactor": 1.04,
    "demandProfile": "logistics"
  },
  {
    "id": "davos",
    "name": "Davos",
    "coordinates": {
      "lat": 46.8027,
      "lng": 9.836
    },
    "tier": 2,
    "slots": 3,
    "population": 11000,
    "wealthFactor": 1.20,
    "demandProfile": "tourism"
  },
  {
    "id": "stmoritz",
    "name": "St. Moritz",
    "coordinates": {
      "lat": 46.4908,
      "lng": 9.8355
    },
    "tier": 2,
    "slots": 3,
    "population": 5000,
    "wealthFactor": 1.38,
    "demandProfile": "tourism"
  },
  {
    "id": "bellinzona",
    "name": "Bellinzona",
    "coordinates": {
      "lat": 46.195,
      "lng": 9.0222
    },
    "tier": 2,
    "slots": 4,
    "population": 44000,
    "wealthFactor": 1.05,
    "demandProfile": "regional"
  },
  {
    "id": "locarno",
    "name": "Locarno",
    "coordinates": {
      "lat": 46.169,
      "lng": 8.795
    },
    "tier": 2,
    "slots": 4,
    "population": 16000,
    "wealthFactor": 1.12,
    "demandProfile": "tourism"
  },
  {
    "id": "lugano",
    "name": "Lugano",
    "coordinates": {
      "lat": 46.0037,
      "lng": 8.9511
    },
    "tier": 3,
    "slots": 5,
    "population": 63000,
    "wealthFactor": 1.18,
    "demandProfile": "tourism"
  },
  {
    "id": "mendrisio",
    "name": "Mendrisio",
    "coordinates": {
      "lat": 45.8713,
      "lng": 8.9841
    },
    "tier": 2,
    "slots": 3,
    "population": 52000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "delémont",
    "name": "Delémont",
    "coordinates": {
      "lat": 47.3649,
      "lng": 7.3445
    },
    "tier": 1,
    "slots": 3,
    "population": 13000,
    "wealthFactor": 1.00,
    "demandProfile": "rural"
  },
  {
    "id": "sursee",
    "name": "Sursee",
    "coordinates": {
      "lat": 47.1714,
      "lng": 8.1111
    },
    "tier": 1,
    "slots": 3,
    "population": 11000,
    "wealthFactor": 1.07,
    "demandProfile": "regional"
  },
  {
    "id": "emmen",
    "name": "Emmen",
    "coordinates": {
      "lat": 47.0789,
      "lng": 8.273
    },
    "tier": 2,
    "slots": 3,
    "population": 31000,
    "wealthFactor": 1.04,
    "demandProfile": "regional"
  },
  {
    "id": "horgen",
    "name": "Horgen",
    "coordinates": {
      "lat": 47.2596,
      "lng": 8.5977
    },
    "tier": 1,
    "slots": 3,
    "population": 23000,
    "wealthFactor": 1.22,
    "demandProfile": "metropolis"
  },
  {
    "id": "wetzikon",
    "name": "Wetzikon",
    "coordinates": {
      "lat": 47.3264,
      "lng": 8.7978
    },
    "tier": 1,
    "slots": 3,
    "population": 25000,
    "wealthFactor": 1.10,
    "demandProfile": "regional"
  },
  {
    "id": "pfaffikon",
    "name": "Pfäffikon SZ",
    "coordinates": {
      "lat": 47.2006,
      "lng": 8.778
    },
    "tier": 1,
    "slots": 3,
    "population": 12000,
    "wealthFactor": 1.20,
    "demandProfile": "metropolis"
  },
  {
    "id": "einsiedeln",
    "name": "Einsiedeln",
    "coordinates": {
      "lat": 47.128,
      "lng": 8.7443
    },
    "tier": 1,
    "slots": 3,
    "population": 14000,
    "wealthFactor": 1.00,
    "demandProfile": "rural"
  },
  {
    "id": "lachen",
    "name": "Lachen",
    "coordinates": {
      "lat": 47.1919,
      "lng": 8.8543
    },
    "tier": 1,
    "slots": 2,
    "population": 9000,
    "wealthFactor": 1.17,
    "demandProfile": "metropolis"
  },
  {
    "id": "sarnen",
    "name": "Sarnen",
    "coordinates": {
      "lat": 46.8969,
      "lng": 8.245
    },
    "tier": 1,
    "slots": 3,
    "population": 10000,
    "wealthFactor": 1.09,
    "demandProfile": "alpine"
  },
  {
    "id": "arthgoldau",
    "name": "Arth-Goldau",
    "coordinates": {
      "lat": 47.0474,
      "lng": 8.5491
    },
    "tier": 1,
    "slots": 3,
    "population": 5500,
    "wealthFactor": 1.05,
    "demandProfile": "logistics"
  },
  {
    "id": "fluelen",
    "name": "Flüelen",
    "coordinates": {
      "lat": 46.903,
      "lng": 8.6218
    },
    "tier": 1,
    "slots": 2,
    "population": 2000,
    "wealthFactor": 1.02,
    "demandProfile": "alpine"
  },
  {
    "id": "airolo",
    "name": "Airolo",
    "coordinates": {
      "lat": 46.5286,
      "lng": 8.611
    },
    "tier": 1,
    "slots": 2,
    "population": 1500,
    "wealthFactor": 1.00,
    "demandProfile": "alpine"
  },
  {
    "id": "sargans",
    "name": "Sargans",
    "coordinates": {
      "lat": 47.0482,
      "lng": 9.4415
    },
    "tier": 1,
    "slots": 3,
    "population": 6500,
    "wealthFactor": 1.03,
    "demandProfile": "logistics"
  },
  {
    "id": "badragaz",
    "name": "Bad Ragaz",
    "coordinates": {
      "lat": 46.9993,
      "lng": 9.505
    },
    "tier": 1,
    "slots": 2,
    "population": 6500,
    "wealthFactor": 1.16,
    "demandProfile": "tourism"
  },
  {
    "id": "gossau",
    "name": "Gossau",
    "coordinates": {
      "lat": 47.415,
      "lng": 9.2548
    },
    "tier": 2,
    "slots": 3,
    "population": 52000,
    "wealthFactor": 1.06,
    "demandProfile": "regional"
  },
  {
    "id": "altstatten",
    "name": "Altstätten",
    "coordinates": {
      "lat": 47.3777,
      "lng": 9.5475
    },
    "tier": 1,
    "slots": 3,
    "population": 12000,
    "wealthFactor": 1.01,
    "demandProfile": "rural"
  },
  {
    "id": "romanshorn",
    "name": "Romanshorn",
    "coordinates": {
      "lat": 47.5659,
      "lng": 9.3787
    },
    "tier": 1,
    "slots": 3,
    "population": 11000,
    "wealthFactor": 1.03,
    "demandProfile": "regional"
  },
  {
    "id": "weinfelden",
    "name": "Weinfelden",
    "coordinates": {
      "lat": 47.5667,
      "lng": 9.1081
    },
    "tier": 1,
    "slots": 3,
    "population": 12000,
    "wealthFactor": 1.04,
    "demandProfile": "regional"
  },
  {
    "id": "bulle",
    "name": "Bulle",
    "coordinates": {
      "lat": 46.6179,
      "lng": 7.0569
    },
    "tier": 2,
    "slots": 3,
    "population": 25000,
    "wealthFactor": 1.04,
    "demandProfile": "regional"
  },
  {
    "id": "payerne",
    "name": "Payerne",
    "coordinates": {
      "lat": 46.8219,
      "lng": 6.9384
    },
    "tier": 1,
    "slots": 3,
    "population": 10000,
    "wealthFactor": 1.00,
    "demandProfile": "rural"
  },
  {
    "id": "morges",
    "name": "Morges",
    "coordinates": {
      "lat": 46.5112,
      "lng": 6.4985
    },
    "tier": 1,
    "slots": 3,
    "population": 16000,
    "wealthFactor": 1.19,
    "demandProfile": "metropolis"
  },
  {
    "id": "aigle",
    "name": "Aigle",
    "coordinates": {
      "lat": 46.3176,
      "lng": 6.9686
    },
    "tier": 1,
    "slots": 3,
    "population": 11000,
    "wealthFactor": 1.06,
    "demandProfile": "tourism"
  },
  {
    "id": "sierre",
    "name": "Sierre",
    "coordinates": {
      "lat": 46.2919,
      "lng": 7.5356
    },
    "tier": 2,
    "slots": 3,
    "population": 17000,
    "wealthFactor": 1.04,
    "demandProfile": "alpine"
  },
  {
    "id": "gland",
    "name": "Gland",
    "coordinates": {
      "lat": 46.4208,
      "lng": 6.2705
    },
    "tier": 1,
    "slots": 3,
    "population": 13000,
    "wealthFactor": 1.18,
    "demandProfile": "metropolis"
  },
  {
    "id": "lachauxdefonds",
    "name": "La Chaux-de-Fonds",
    "coordinates": {
      "lat": 47.1036,
      "lng": 6.828
    },
    "tier": 2,
    "slots": 3,
    "population": 37000,
    "wealthFactor": 0.98,
    "demandProfile": "industrial"
  },
  {
    "id": "moutier",
    "name": "Moutier",
    "coordinates": {
      "lat": 47.2782,
      "lng": 7.3691
    },
    "tier": 1,
    "slots": 3,
    "population": 7500,
    "wealthFactor": 0.98,
    "demandProfile": "rural"
  },
  {
    "id": "porrentruy",
    "name": "Porrentruy",
    "coordinates": {
      "lat": 47.4173,
      "lng": 7.0752
    },
    "tier": 1,
    "slots": 3,
    "population": 6500,
    "wealthFactor": 0.98,
    "demandProfile": "rural"
  },
  {
    "id": "chiasso",
    "name": "Chiasso",
    "coordinates": {
      "lat": 45.832,
      "lng": 9.0312
    },
    "tier": 1,
    "slots": 3,
    "population": 8000,
    "wealthFactor": 1.03,
    "demandProfile": "border"
  },
  {
    "id": "biasca",
    "name": "Biasca",
    "coordinates": {
      "lat": 46.3597,
      "lng": 8.9697
    },
    "tier": 1,
    "slots": 3,
    "population": 6500,
    "wealthFactor": 0.99,
    "demandProfile": "alpine"
  },
  {
    "id": "monthey",
    "name": "Monthey",
    "coordinates": {
      "lat": 46.2552,
      "lng": 6.9546
    },
    "tier": 2,
    "slots": 3,
    "population": 18000,
    "wealthFactor": 1.03,
    "demandProfile": "industrial"
  },
  {
    "id": "renens",
    "name": "Renens",
    "coordinates": {
      "lat": 46.5399,
      "lng": 6.5881
    },
    "tier": 1,
    "slots": 3,
    "population": 21000,
    "wealthFactor": 1.06,
    "demandProfile": "metropolis"
  }
];
