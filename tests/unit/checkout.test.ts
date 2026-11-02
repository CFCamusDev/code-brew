import { describe, expect, it } from 'vitest';
import { createOrderSchema, customerSchema, MAX_QUANTITY } from '../../src/lib/shop/checkout';

const customer = {
  name: 'Ana Pérez',
  email: 'ANA@Example.com ',
  phone: '+51 987 654 321',
  zone: 'lima',
  region: 'Lima',
  city: 'Lima',
  district: 'Miraflores',
  address: 'Av. Larco 123'
};

describe('customerSchema', () => {
  it('normaliza correo y celular', () => {
    const parsed = customerSchema.parse(customer);
    expect(parsed.email).toBe('ana@example.com');
    expect(parsed.phone).toBe('987654321');
    expect(parsed.reference).toBeUndefined();
  });

  it.each(['12345678', '98765432', '9876543210', '+1 987654321'])('rechaza el celular %s', phone => {
    expect(customerSchema.safeParse({ ...customer, phone }).success).toBe(false);
  });

  it('acepta DNI de 8 dígitos o CE y rechaza documentos mal formados', () => {
    expect(customerSchema.safeParse({ ...customer, document: '12345678' }).success).toBe(true);
    expect(customerSchema.safeParse({ ...customer, document: 'AB1234567' }).success).toBe(true);
    expect(customerSchema.safeParse({ ...customer, document: '1234' }).success).toBe(false);
  });

  it('exige dirección y zona', () => {
    expect(customerSchema.safeParse({ ...customer, address: '  ' }).success).toBe(false);
    expect(customerSchema.safeParse({ ...customer, zone: '' }).success).toBe(false);
  });
});

describe('createOrderSchema', () => {
  const item = { sku: 'espresso-250', grind: 'Grano entero', quantity: 1 };

  it('rechaza un carrito vacío', () => {
    expect(createOrderSchema.safeParse({ items: [], customer }).success).toBe(false);
  });

  it('limita la cantidad por línea', () => {
    expect(createOrderSchema.safeParse({ items: [{ ...item, quantity: MAX_QUANTITY + 1 }], customer }).success).toBe(false);
    expect(createOrderSchema.safeParse({ items: [{ ...item, quantity: 0 }], customer }).success).toBe(false);
  });

  it('ignora campos extra como un precio enviado por el navegador', () => {
    const parsed = createOrderSchema.parse({ items: [{ ...item, price: 1 }], customer, acceptedPolicies: true });
    expect(parsed.items[0]).toEqual(item);
  });
});
