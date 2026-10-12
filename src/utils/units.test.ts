import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateUnitPriceAmount,
  convertFromBaseQuantity,
  convertQuantity,
  convertToBaseQuantity,
  getBaseUnit,
} from './units.js';

test('converts kilograms and grams without quantity rounding', () => {
  assert.equal(convertToBaseQuantity(1, 'Kg'), 1000);
  assert.equal(convertToBaseQuantity(1.5, 'Kg'), 1500);
  assert.equal(convertToBaseQuantity(2.25, 'Kg'), 2250);
  assert.equal(convertToBaseQuantity(500, 'g'), 500);
  assert.equal(convertToBaseQuantity(250, 'g'), 250);
  assert.equal(convertToBaseQuantity(100, 'g'), 100);
  assert.equal(convertToBaseQuantity(50, 'g'), 50);
  assert.equal(convertToBaseQuantity(0.001, 'Kg'), 1);
  assert.equal(convertFromBaseQuantity(750, 'Kg'), 0.75);
});

test('converts litres and millilitres to the same volume base', () => {
  assert.equal(convertToBaseQuantity(1, 'L'), 1000);
  assert.equal(convertToBaseQuantity(1.5, 'L'), 1500);
  assert.equal(convertToBaseQuantity(500, 'ml'), 500);
  assert.equal(convertToBaseQuantity(250, 'ml'), 250);
  assert.equal(convertFromBaseQuantity(750, 'L'), 0.75);
});

test('keeps pieces and legacy packets as individual stock units', () => {
  assert.equal(getBaseUnit('Pcs'), 'pcs');
  assert.equal(getBaseUnit('Pkt'), 'pcs');
  assert.equal(convertToBaseQuantity(3, 'Pcs'), 3);
  assert.equal(convertToBaseQuantity(10, 'Pkt'), 10);
});

test('calculates amounts in the configured price unit', () => {
  assert.equal(calculateUnitPriceAmount(500, 'g', 55, 'Kg'), 27.5);
  assert.equal(calculateUnitPriceAmount(250, 'g', 55, 'Kg'), 13.75);
  assert.equal(calculateUnitPriceAmount(1.5, 'Kg', 55, 'Kg'), 82.5);
  assert.equal(calculateUnitPriceAmount(500, 'ml', 120, 'L'), 60);
  assert.equal(calculateUnitPriceAmount(1.25, 'L', 120, 'L'), 150);
  assert.equal(calculateUnitPriceAmount(3, 'Pcs', 10, 'Pcs'), 30);
});

test('converts between compatible units and rejects different dimensions', () => {
  assert.equal(convertQuantity(500, 'g', 'Kg'), 0.5);
  assert.equal(convertQuantity(1.25, 'L', 'ml'), 1250);
  assert.throws(() => convertQuantity(1, 'Kg', 'L'), RangeError);
});