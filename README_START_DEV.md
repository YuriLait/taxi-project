# Taxi Bonus MVP — второй инкремент

Что добавлено:

- Supabase-ready backend: реальные таблицы `orders`, `drivers`, `clients`.
- Demo-memory режим без Supabase, чтобы проект запускался сразу.
- Создание заказа с назначением водителя.
- Изменение статуса заказа из интерфейса диспетчера.
- Переназначение водителя на существующий заказ.
- Управление статусом водителя: свободен / занят / оффлайн.
- Схема БД обновлена: `schema.sql`.

## Запуск backend

```bash
cd backend_supabase_blueprint
cp .env.example .env
npm install
npm run dev
```

Если `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` не заполнены, backend запустится в demo-memory режиме.

## Подключение Supabase

1. Создай проект в Supabase.
2. Открой SQL Editor.
3. Выполни `backend_supabase_blueprint/schema.sql`.
4. Вставь значения в `backend_supabase_blueprint/.env`:

```env
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Важно: `SERVICE_ROLE_KEY` нельзя использовать во фронте. Он только для backend.

## Запуск frontend

```bash
cd react_blueprint
npm install
npm run dev
```

По умолчанию frontend ждёт API на `http://localhost:3001`.
Можно переопределить через `.env`:

```env
VITE_API_BASE=http://localhost:3001
```

## Что проверять

1. Создать заказ без водителя.
2. Создать заказ с водителем.
3. Изменить статус заказа.
4. Назначить/сменить водителя.
5. Поменять статус водителя во вкладке «Водители».

## Следующий инкремент

Рекомендуемый следующий шаг: добавить авторизацию и роли через Supabase Auth: админ, диспетчер, водитель.

## Третий инкремент: demo-авторизация и роли

Добавлено:

- экран входа во фронтенде;
- demo-токен в `localStorage`;
- backend endpoints `POST /auth/demo-login` и `GET /me`;
- ограничение прав на создание/изменение заказов;
- водитель может менять только свои заказы и только статус;
- водитель может менять только свой статус.

Demo-пользователи:

| Роль | Логин | Пароль |
|---|---|---|
| Админ | `admin` | `admin` |
| Диспетчер | `dispatcher` | `dispatcher` |
| Водитель | `driver` | `driver` |

Важно: это demo-авторизация для MVP. Для production следующий шаг — заменить demo-token на Supabase Auth JWT и RLS policies.
