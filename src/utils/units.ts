export const PRODUCT_UNITS = ['Kg', 'g', 'L', 'ml', 'Pcs', 'Pkt'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export type BaseUnit = 'g' | 'ml' | 'pcs';

const unitDetails: Record<ProductUnit, { baseUnit: BaseUnit; factor: number }> = {
  Kg: { baseUnit: 'g', factor: 1000 },
  g: { baseUnit: 'g', factor: 1 },
  L: { baseUnit: 'ml', factor: 1000 },
  ml: { baseUnit: 'ml', factor: 1 },
  Pcs: { baseUnit: 'pcs', factor: 1 },
  Pkt: { baseUnit: 'pcs', factor: 1 },
};

export function normalizeUnit(unit: string): ProductUnit {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'kg' || normalized === 'kgs' || normalized === 'kilogram' || normalized === 'kilograms') return 'Kg';
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') return 'g';
  if (normalized === 'l' || normalized === 'liter' || normalized === 'litre' || normalized === 'liters' || normalized === 'litres') return 'L';
  if (normalized === 'ml' || normalized === 'milliliter' || normalized === 'millilitre' || normalized === 'milliliters' || normalized === 'millilitres') return 'ml';
  if (normalized === 'pcs' || normalized === 'pc' || normalized === 'piece' || normalized === 'pieces') return 'Pcs';
  if (normalized === 'pkt' || normalized === 'packet' || normalized === 'pack') return 'Pkt';
  throw new RangeError(`Unsupported unit: ${unit}`);
}

export function getBaseUnit(unit: string): BaseUnit {
  return unitDetails[normalizeUnit(unit)].baseUnit;
}

export function getUnitFactor(unit: string): number {
  return unitDetails[normalizeUnit(unit)].factor;
}

export function areUnitsCompatible(left: string, right: string): boolean {
  return getBaseUnit(left) === getBaseUnit(right);
}

export function convertToBaseQuantity(quantity: number, unit: string): number {
  if (!Number.isFinite(quantity)) throw new RangeError('Quantity must be finite');
  return quantity * getUnitFactor(unit);
}

export function convertFromBaseQuantity(baseQuantity: number, unit: string): number {
  if (!Number.isFinite(baseQuantity)) throw new RangeError('Base quantity must be finite');
  return baseQuantity / getUnitFactor(unit);
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  if (!areUnitsCompatible(fromUnit, toUnit)) {
    throw new RangeError(`Cannot convert ${fromUnit} to ${toUnit}`);
  }
  return convertFromBaseQuantity(convertToBaseQuantity(quantity, fromUnit), toUnit);
}

export function calculateUnitPriceAmount(
  quantity: number,
  quantityUnit: string,
  unitPrice: number,
  priceUnit: string
): number {
  if (!areUnitsCompatible(quantityUnit, priceUnit)) {
    throw new RangeError(`Cannot price ${quantityUnit} using a ${priceUnit} rate`);
  }
  return unitPrice * convertToBaseQuantity(quantity, quantityUnit) / getUnitFactor(priceUnit);
}