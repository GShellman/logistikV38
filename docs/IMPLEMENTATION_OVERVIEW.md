# Implementation overview – v1.1.38

## Source of truth

- `state.supplyContracts`: one contract per destination city and good
- `state.sourceLogistics.cities`: stationiert fleets and departure settings for producing cities
- existing depot fleets: used when a depot is the delivery source
- `state.hfSupplyWeekPlan`: generated rolling seven-day delivery plan

## Contract fields

- destinationCityId
- goodId
- primarySource `{type, id}`
- frequency `daily|weekly`
- weekday `0..6`
- targetStockDays `1|7`
- allowFallback
- enabled
- openQuantity
- status and delivery metadata

## Planning model

1. Calculate target stock at destination.
2. Subtract current stock and active inbound quantities.
3. Keep unfulfilled remainder open.
4. Try primary source.
5. If permitted and required, score fallback sources.
6. Reserve virtual source availability to prevent double allocation.
7. Group allocations by source.
8. Combine compatible goods and nearby destinations.
9. Assign stationiert source vehicles and departure times.
10. Dispatch through existing multi-stop shipment mechanics.
11. Release the source vehicle after it returns home.

## Compatibility adapters

- the production commitment builder includes daily and weekly delivery commitments
- old depot daily-need calculation returns zero for city/good pairs handled by an enabled supply contract
- midnight processing regenerates the rolling plan
- completion processing updates contract status and releases the source fleet
