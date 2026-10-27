UPDATE products
SET name = 'Hotfix',
    roast = 'Tueste medio-oscuro',
    grinds = '["Grano entero", "Molido para espresso", "Molido para cafetera tradicional", "Molido para AeroPress"]'::jsonb
WHERE slug = 'monteverde';
