/**
 * Unit tests for code generator
 */
import { mapFieldType, mapType } from './generator.js';
import { TYPE_MAPPING, ID_TYPE_MAPPING } from './types.js';

// Test mapType function
describe('mapType', () => {
  test('should map TypeScript types to Java types', () => {
    expect(mapType('string')).toBe('String');
    expect(mapType('number')).toBe('Integer');
    expect(mapType('boolean')).toBe('Boolean');
    expect(mapType('Date')).toBe('LocalDateTime');
    expect(mapType('any')).toBe('Object');
    expect(mapType('void')).toBe('void');
    expect(mapType('null')).toBe('null');
    expect(mapType('undefined')).toBe('null');
  });

  test('should return unknown types as-is', () => {
    expect(mapType('User')).toBe('User');
    expect(mapType('CustomType')).toBe('CustomType');
  });
});

// Test mapFieldType function
describe('mapFieldType', () => {
  test('should map id field to Long by default', () => {
    const field = {
      name: 'id',
      type: 'number',
      decorators: []
    };
    expect(mapFieldType(field)).toBe(ID_TYPE_MAPPING.default);
  });

  test('should map id field to String for Redis entities', () => {
    const field = {
      name: 'id',
      type: 'number',
      decorators: [{ name: 'Id' }]
    };
    expect(mapFieldType(field)).toBe(ID_TYPE_MAPPING.redis);
  });

  test('should map age field to Integer', () => {
    const field = {
      name: 'age',
      type: 'number',
      decorators: []
    };
    expect(mapFieldType(field)).toBe(ID_TYPE_MAPPING.age);
  });

  test('should map count field to Integer', () => {
    const field = {
      name: 'count',
      type: 'number',
      decorators: []
    };
    expect(mapFieldType(field)).toBe(ID_TYPE_MAPPING.age);
  });

  test('should map regular number fields to Integer', () => {
    const field = {
      name: 'value',
      type: 'number',
      decorators: []
    };
    expect(mapFieldType(field)).toBe('Integer');
  });

  test('should map string fields to String', () => {
    const field = {
      name: 'name',
      type: 'string',
      decorators: []
    };
    expect(mapFieldType(field)).toBe('String');
  });

  test('should map boolean fields to Boolean', () => {
    const field = {
      name: 'active',
      type: 'boolean',
      decorators: []
    };
    expect(mapFieldType(field)).toBe('Boolean');
  });

  test('should map Date fields to LocalDateTime', () => {
    const field = {
      name: 'createdAt',
      type: 'Date',
      decorators: []
    };
    expect(mapFieldType(field)).toBe('LocalDateTime');
  });

  test('should map string literal union to a PascalCase enum name derived from the field name', () => {
    const field = { name: 'status', type: "'done' | 'failed'", decorators: [] };
    expect(mapFieldType(field)).toBe('Status');
  });

  test('should map multi-value string literal union to enum name from field name', () => {
    const field = { name: 'paymentStatus', type: "'pending' | 'paid' | 'refunded'", decorators: [] };
    expect(mapFieldType(field)).toBe('PaymentStatus');
  });

  test('should reuse the same enum name for the same TS union type', () => {
    // Two different field names with the same union type — first one registered wins
    const field1 = { name: 'result', type: "'ok' | 'error'", decorators: [] };
    const field2 = { name: 'outcome', type: "'ok' | 'error'", decorators: [] };
    const name1 = mapFieldType(field1);
    const name2 = mapFieldType(field2);
    expect(name1).toBe('Result');
    expect(name2).toBe('Result'); // same key → same enum
  });
});

// Test mapType fallbacks for non-field contexts
describe('mapType — additional', () => {
  test('should map unknown to Object', () => {
    expect(mapType('unknown')).toBe('Object');
  });

  test('should map string literal union to String (non-field fallback)', () => {
    expect(mapType("'done' | 'failed'")).toBe('String');
    expect(mapType("'pending' | 'paid'")).toBe('String');
  });

  test('should map Record<K, V> to Map<K_java, V_java>', () => {
    expect(mapType('Record<string, unknown>')).toBe('Map<String, Object>');
    expect(mapType('Record<string, number>')).toBe('Map<String, Integer>');
    expect(mapType('Record<string, string>')).toBe('Map<String, String>');
  });
});
