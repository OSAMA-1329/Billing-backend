export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeRoundOff(total: number): { roundOff: number; finalTotal: number } {
  const finalTotal = Math.round(total);
  const roundOff = roundCurrency(finalTotal - total);
  return { roundOff, finalTotal };
}
