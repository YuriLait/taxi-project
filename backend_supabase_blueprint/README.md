# Taxi Bonus — Supabase / backend blueprint

Это стартовая заготовка, а не полностью развёрнутый сервер.
Она нужна, чтобы быстро перейти от локального `localStorage` к нормальной БД.

## Что внутри
- `schema.sql` — таблицы и связи
- `.env.example` — переменные окружения
- `package.json` — минимальный Node/Express скелет
- `src/server.js` — примеры API-роутов

## Предлагаемый стек
- Supabase Postgres
- Supabase Auth
- Express для собственной бизнес-логики
- Vercel / Render / Railway для выкладки API

## Таблицы
- users
- clients
- drivers
- routes
- orders
- token_transactions
- order_history

## Следующие шаги
1. Создать проект в Supabase
2. Выполнить `schema.sql`
3. Включить Email/Password auth
4. Добавить RLS policies
5. Подключить React или текущий фронтенд к API

## Что ещё нужно доделать
- полноценная авторизация ролей director/dispatcher
- серверная валидация
- аудит действий
- реалтайм обновление заказов
- хранение закрытия смен и кассы

## Realtime SSE

Добавлен endpoint:

```txt
GET /events
```

Он нужен фронту для автообновления заказов и водителей без ручного refresh. Работает и в demo-memory режиме, и при подключённом Supabase.
