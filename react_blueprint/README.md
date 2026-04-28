# Taxi Bonus — React + Driver Cabinet + Realtime

Инкремент добавляет второй рабочий экран: кабинет водителя. Диспетчерская и водитель синхронизируются через backend realtime-канал на Server-Sent Events.

## Запуск

Backend:
```bash
cd backend_supabase_blueprint
npm install
npm run dev
```

Frontend:
```bash
cd react_blueprint
npm install
npm run dev
```

Открой `http://localhost:5173`.

## Что добавлено

- Кнопка **Кабинет водителя** в диспетчерской
- Выбор водителя
- Онлайн/оффлайн статус водителя
- Заказы, назначенные конкретному водителю
- Кнопки статусов: принять, ехать к клиенту, начать поездку, завершить, отменить
- Автообновление диспетчерской и кабинета водителя через `/events`
- Demo-режим работает без Supabase

## Realtime

Backend отдаёт SSE-канал:
```txt
GET /events
```

События:
- `order.created`
- `order.updated`
- `driver.updated`
- `heartbeat`

## Переменные окружения

Если Supabase не задан, backend работает в памяти.

```env
PORT=3001
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```
