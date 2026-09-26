-- Справочник моделей авто для совместимости товара: список с сайта поставщика
-- vanproject.ru (docs/PRD.md, M3). Отдельной миграцией: новое значение enum
-- `CAR_MODEL` нельзя использовать в той же транзакции, где его добавили.
-- ON CONFLICT: если модель с таким названием уже завели руками, не дублируем.

INSERT INTO "DictionaryItem" ("id", "type", "name", "sortOrder", "isActive", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CAR_MODEL', 'Mercedes Sprinter Classic',                    10, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Mercedes Sprinter W906',                       20, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Mercedes Sprinter W907',                       30, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Volkswagen LT',                                40, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Volkswagen Crafter W906',                      50, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Volkswagen Crafter 2017',                      60, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Volkswagen Transporter T5',                    70, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Ford Transit 2000–2014',                       80, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Ford Transit 2015+',                           90, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Fiat Ducato 244',                             100, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290', 110, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Citroen Jumpy / Peugeot Expert 2017+',        120, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Iveco Daily 2006–2014',                       130, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Iveco Daily 2015+',                           140, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'Renault Master III',                          150, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗель Бизнес',                               160, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗ Соболь',                                  170, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗ Баргузин',                                180, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗель Next',                                 190, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗель NN',                                   200, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗель Next CitiLine',                        210, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CAR_MODEL', 'ГАЗон Next',                                  220, true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "name") DO NOTHING;
