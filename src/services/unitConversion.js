// Ported from StockMgmt_WebApp/src/View/StockManagement/unitConversion.js so
// entry-unit conversion (sub-units and pack sizes) behaves identically on
// mobile. `units` is the list from unitsApi.list(): { name, sub_unit,
// conversion_factor, pack_sizes: [{ name, pack_quantity }] }.

function normalize(unit) {
  return (unit || '').trim().toLowerCase();
}

function findUnit(units, baseUnit) {
  const normalized = normalize(baseUnit);
  return units.find((u) => normalize(u.name) === normalized) || null;
}

function findPackSize(unit, entryUnit) {
  return (unit?.pack_sizes || []).find((p) => p.name === entryUnit) || null;
}

export function getEntryUnitOptions(baseUnit, units = []) {
  const unit = findUnit(units, baseUnit);
  const options = [baseUnit];
  if (unit?.sub_unit) options.push(unit.sub_unit);
  (unit?.pack_sizes || []).filter((p) => p.is_active).forEach((p) => options.push(p.name));
  return options;
}

export function toBaseQuantity(value, entryUnit, baseUnit, units = []) {
  const numeric = Number(value) || 0;
  const unit = findUnit(units, baseUnit);
  if (unit?.sub_unit && entryUnit === unit.sub_unit) {
    return numeric / Number(unit.conversion_factor || 1);
  }
  const pack = findPackSize(unit, entryUnit);
  if (pack) {
    return numeric * Number(pack.pack_quantity);
  }
  return numeric;
}

export function fromBaseQuantity(value, entryUnit, baseUnit, units = []) {
  const numeric = Number(value) || 0;
  const unit = findUnit(units, baseUnit);
  if (unit?.sub_unit && entryUnit === unit.sub_unit) {
    return Math.round(numeric * Number(unit.conversion_factor || 1) * 1000) / 1000;
  }
  const pack = findPackSize(unit, entryUnit);
  if (pack) {
    return Math.round((numeric / Number(pack.pack_quantity)) * 1000) / 1000;
  }
  return numeric;
}

export function toBaseUnitPrice(pricePerEntryUnit, entryUnit, baseUnit, units = []) {
  const price = Number(pricePerEntryUnit) || 0;
  const oneEntryUnitInBase = toBaseQuantity(1, entryUnit, baseUnit, units);
  return oneEntryUnitInBase > 0 ? price / oneEntryUnitInBase : price;
}

export function fromBaseUnitPrice(pricePerBaseUnit, entryUnit, baseUnit, units = []) {
  const price = Number(pricePerBaseUnit) || 0;
  const oneEntryUnitInBase = toBaseQuantity(1, entryUnit, baseUnit, units);
  return oneEntryUnitInBase > 0 ? price * oneEntryUnitInBase : price;
}

export function getSubUnit(baseUnit, units = []) {
  const unit = findUnit(units, baseUnit);
  return unit?.sub_unit || null;
}
