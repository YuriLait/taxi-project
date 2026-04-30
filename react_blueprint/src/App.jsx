import { useEffect, useMemo, useState } from 'react';
import {
  createOrder,
  getClients,
  getDrivers,
  getMe,
  getOrders,
  logout,
  subscribeRealtime,
  updateDriver,
  updateOrder
} from './lib/api.js';
import LoginScreen from './components/LoginScreen.jsx';

const emptyOrder = {
  client_name: '',
  reference_phone: '',
  pickup: '',
  final_point: '',
  payment_mode: 'Наличка',
  price: 0,
  total_paid: 0,
  status: 'new',
  driver_id: ''
};

const statusLabels = {
  new: 'Новый',
  accepted: 'Принят',
  car_assigned: 'Назначен',
  on_the_way: 'В пути',
  in_progress: 'В работе',
  completed: 'Завершён',
  cancelled: 'Отменён'
};

const statusFlow = [
  'new',
  'accepted',
  'car_assigned',
  'on_the_way',
  'in_progress',
  'completed',
  'cancelled'
];

const driverStatusLabels = {
  free: 'На линии',
  busy: 'Занят',
  offline: 'Оффлайн'
};

export default function App() {
  const [screen, setScreen] = useState('dashboard');
  const [roleView, setRoleView] = useState('dispatcher');
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('подключение');

  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [form, setForm] = useState(emptyOrder);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    setError('');
    setIsLoading(true);

    try {
      const [ordersData, clientsData, driversData] = await Promise.all([
        getOrders(),
        getClients(),
        getDrivers()
      ]);

      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setDrivers(Array.isArray(driversData) ? driversData : []);
    } catch (err) {
      setError(err.message || 'Ошибка API');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    getMe()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    loadData();

    const unsubscribe = subscribeRealtime(
      (event) => {
        setRealtimeStatus('онлайн');

        if (event && ['order.created', 'order.updated', 'driver.updated'].includes(event.type)) {
          loadData();
        }
      },
      () => setRealtimeStatus('переподключение')
    );

    return unsubscribe;
  }, [user]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const paid = orders.reduce((sum, item) => sum + Number(item.total_paid || 0), 0);
    const active = orders.filter((item) => !['completed', 'cancelled'].includes(item.status)).length;
    const onlineDrivers = drivers.filter((item) => item.status !== 'offline').length;

    return {
      revenue,
      paid,
      active,
      onlineDrivers,
      ordersCount: orders.length,
      average: orders.length ? Math.round(revenue / orders.length) : 0
    };
  }, [orders, drivers]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateOrder(event) {
    event.preventDefault();

    setError('');
    setNotice('');
    setIsSaving(true);

    try {
      const created = await createOrder({
        ...form,
        driver_id: form.driver_id || null,
        price: Number(form.price || 0),
        total_paid: Number(form.total_paid || 0)
      });

      setForm(emptyOrder);
      setNotice(`Заказ ${created.order_number || `#${created.id}`} создан`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Ошибка создания заказа');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleOrderPatch(orderId, patch) {
    setError('');

    try {
      await updateOrder(orderId, patch);
      await loadData();
    } catch (err) {
      setError(err.message || 'Ошибка обновления заказа');
    }
  }

  async function handleDriverStatus(driverId, status) {
    setError('');

    try {
      await updateDriver(driverId, { status });
      await loadData();
    } catch (err) {
      setError(err.message || 'Ошибка обновления водителя');
    }
  }

  function handleLogout() {
    logout();
    setUser(null);
    setOrders([]);
    setClients([]);
    setDrivers([]);
  }

  if (!authChecked) {
    return (
      <div className="login-shell">
        <div className="login-card">Проверяю вход...</div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={setUser} />;

  if (roleView === 'driver') {
    return (
      <DriverView
        user={user}
        orders={orders}
        stats={stats}
        onBack={() => setRoleView('dispatcher')}
        onPatch={handleOrderPatch}
      />
    );
  }

  if (roleView === 'developer') {
    return (
      <DeveloperView
        user={user}
        stats={stats}
        orders={orders}
        clients={clients}
        drivers={drivers}
        onBack={() => setRoleView('dispatcher')}
      />
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        title={roleView === 'admin' ? 'Панель администратора' : 'Панель диспетчера'}
        screen={screen}
        setScreen={setScreen}
        onLogout={handleLogout}
      />

      <main className="main">
        <Topbar
          user={user}
          realtimeStatus={realtimeStatus}
          roleView={roleView}
          setRoleView={setRoleView}
          onRefresh={loadData}
          isLoading={isLoading}
        />

        {error ? <div className="alert error">{error}</div> : null}
        {notice ? <div className="alert success">{notice}</div> : null}

        {screen === 'dashboard' && (
          <Dashboard
            stats={stats}
            orders={orders}
            drivers={drivers}
            setScreen={setScreen}
            onPatch={handleOrderPatch}
          />
        )}

        {screen === 'orders' && (
          <OrdersScreen
            orders={orders}
            drivers={drivers}
            form={form}
            updateForm={updateForm}
            onCreate={handleCreateOrder}
            isSaving={isSaving}
            onPatch={handleOrderPatch}
          />
        )}

        {screen === 'clients' && <ClientsScreen clients={clients} />}

        {screen === 'drivers' && (
          <DriversScreen drivers={drivers} onStatus={handleDriverStatus} />
        )}

        {screen === 'reports' && <ReportsScreen stats={stats} orders={orders} />}
      </main>
    </div>
  );
}

function Sidebar({ title, screen, setScreen, onLogout }) {
  const items = [
    ['dashboard', '⌂', 'Главная'],
    ['orders', '▣', 'Заказы'],
    ['clients', '♙', 'Клиенты'],
    ['drivers', '♙', 'Водители'],
    ['reports', '⌁', 'Отчёты']
  ];

  return (
    <aside className="side">
      <div className="side-brand">
        <div className="logo-badge">🚕</div>
        <div>
          <div className="brand-name">Такси Бонус</div>
          <div className="brand-sub">{title}</div>
        </div>
      </div>

      <nav className="side-nav">
        {items.map(([key, icon, label]) => (
          <button
            key={key}
            className={screen === key ? 'side-link active' : 'side-link'}
            onClick={() => setScreen(key)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <button className="side-logout" onClick={onLogout}>↪ Выйти</button>
      <div className="version-dot">● Версия 1.2.0</div>
    </aside>
  );
}

function Topbar({ user, realtimeStatus, roleView, setRoleView, onRefresh, isLoading }) {
  return (
    <header className="topbar">
      <div>
        <h1>{roleView === 'admin' ? 'Админ-панель' : 'Рабочий стол диспетчера'}</h1>
        <p>Заказы, клиенты, водители и оперативная статистика</p>
      </div>

      <div className="top-actions">
        <div className="search">⌕ Поиск по заказам, клиентам, водителям...</div>
        <span className="online-dot">● Realtime: {realtimeStatus}</span>

        <button
          className="dark-btn"
          onClick={() => setRoleView(roleView === 'admin' ? 'dispatcher' : 'admin')}
        >
          {roleView === 'admin' ? 'Диспетчер' : 'Админ'}
        </button>

        <button className="dark-btn" onClick={() => setRoleView('driver')}>Водитель</button>
        <button className="dark-btn" onClick={() => setRoleView('developer')}>Разработчик</button>
        <button className="orange-btn" onClick={onRefresh}>{isLoading ? '...' : 'Обновить'}</button>

        <div className="user-pill">
          <div className="avatar">👤</div>
          <div>
            <b>{user.full_name}</b>
            <small>{user.login}</small>
          </div>
        </div>
      </div>
    </header>
  );
}

function KpiCards({ stats }) {
  return (
    <section className="kpi-grid">
      <Kpi title="Всего заказов" value={stats.ordersCount} trend="+12 за сегодня" />
      <Kpi title="Активные заказы" value={stats.active} trend="Сейчас в работе" />
      <Kpi title="Водители на линии" value={stats.onlineDrivers} trend="доступны" />
      <Kpi title="Выручка сегодня" value={`${stats.revenue} ₽`} trend={`оплачено ${stats.paid} ₽`} />
      <Kpi title="Средний чек" value={`${stats.average} ₽`} trend="+5%" />
    </section>
  );
}

function Kpi({ title, value, trend }) {
  return (
    <div className="kpi-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </div>
  );
}

function Dashboard({ stats, orders, drivers, setScreen, onPatch }) {
  return (
    <>
      <KpiCards stats={stats} />

      <section className="dash-grid">
        <div className="panel large">
          <div className="panel-title">
            <h2>Активные заказы</h2>
            <button onClick={() => setScreen('orders')}>Смотреть все</button>
          </div>

          <OrdersTable orders={orders.slice(0, 6)} drivers={drivers} onPatch={onPatch} compact />
        </div>

        <MapPanel />
        <StatusDonut orders={orders} />
        <RevenueChart />
        <EventsPanel orders={orders} />
        <DriversOnline drivers={drivers} />
      </section>
    </>
  );
}

function OrdersScreen({ orders, drivers, form, updateForm, onCreate, isSaving, onPatch }) {
  return (
    <>
      <KpiCards
        stats={{
          ordersCount: orders.length,
          active: orders.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
          onlineDrivers: drivers.filter((item) => item.status !== 'offline').length,
          revenue: orders.reduce((sum, item) => sum + Number(item.price || 0), 0),
          paid: orders.reduce((sum, item) => sum + Number(item.total_paid || 0), 0),
          average: orders.length
            ? Math.round(orders.reduce((sum, item) => sum + Number(item.price || 0), 0) / orders.length)
            : 0
        }}
      />

      <section className="orders-workspace">
        <div className="panel orders-list-panel">
          <div className="panel-title">
            <h2>Заказы</h2>
            <div className="filters">
              <select>
                <option>Все статусы</option>
              </select>
              <input placeholder="Поиск по заказам..." />
            </div>
          </div>

          <OrdersTable orders={orders} drivers={drivers} onPatch={onPatch} />
        </div>

        <MapPanel />

        <form className="panel new-order-panel" onSubmit={onCreate}>
          <h2>Новый заказ</h2>

          <Field label="Клиент">
            <input
              value={form.client_name}
              onChange={(e) => updateForm('client_name', e.target.value)}
              placeholder="Имя клиента"
            />
          </Field>

          <Field label="Телефон">
            <input
              value={form.reference_phone}
              onChange={(e) => updateForm('reference_phone', e.target.value)}
              placeholder="+7..."
            />
          </Field>

          <Field label="Подача">
            <input
              value={form.pickup}
              onChange={(e) => updateForm('pickup', e.target.value)}
              placeholder="Адрес подачи"
              required
            />
          </Field>

          <Field label="Назначение">
            <input
              value={form.final_point}
              onChange={(e) => updateForm('final_point', e.target.value)}
              placeholder="Куда едем"
              required
            />
          </Field>

          <div className="two">
            <Field label="Оплата">
              <select value={form.payment_mode} onChange={(e) => updateForm('payment_mode', e.target.value)}>
                <option>Наличка</option>
                <option>Карта</option>
                <option>Перевод</option>
              </select>
            </Field>

            <Field label="Цена">
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => updateForm('price', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Назначить водителя">
            <select value={form.driver_id} onChange={(e) => updateForm('driver_id', e.target.value)}>
              <option value="">Выберите водителя</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name} · {driver.car || 'Авто'}
                </option>
              ))}
            </select>
          </Field>

          <button className="orange-btn full" disabled={isSaving}>
            {isSaving ? 'Создаю...' : 'Создать заказ'}
          </button>
        </form>
      </section>
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function OrdersTable({ orders, drivers, onPatch, compact }) {
  if (!orders.length) return <div className="empty-state">Заказов пока нет</div>;

  return (
    <div className={compact ? 'orders-table compact' : 'orders-table'}>
      <div className="orders-head">
        <span>№ заказа</span>
        <span>Клиент</span>
        <span>Подача</span>
        <span>Назначение</span>
        <span>Статус</span>
        <span>Водитель</span>
        <span>Цена</span>
      </div>

      {orders.map((order) => (
        <div className="orders-row" key={order.id}>
          <span>{order.order_number || `#${order.id}`}</span>
          <span>{order.client_name || 'Без имени'}</span>
          <span>{order.pickup}</span>
          <span>{order.final_point}</span>
          <span>
            <select
              className={`status-select st-${order.status}`}
              value={order.status}
              onChange={(e) => onPatch(order.id, { status: e.target.value })}
            >
              {statusFlow.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </span>
          <span>
            <select
              value={order.driver_id || ''}
              onChange={(e) => onPatch(order.id, { driver_id: e.target.value || null })}
            >
              <option value="">—</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                </option>
              ))}
            </select>
          </span>
          <span>{Number(order.price || 0)} ₽</span>
        </div>
      ))}
    </div>
  );
}

function MapPanel() {
  return (
    <div className="panel map-panel">
      <div className="panel-title">
        <h2>Заказы на карте</h2>
        <button>Фильтры</button>
      </div>

      <div className="fake-map">
        <div className="map-line"></div>
        <span className="pin p1">1</span>
        <span className="pin p2">2</span>
        <span className="pin p3">3</span>
        <span className="car c1">▰</span>
        <span className="car c2">▰</span>
      </div>
    </div>
  );
}

function StatusDonut({ orders }) {
  return (
    <div className="panel">
      <h2>Заказы по статусам</h2>

      <div className="donut-wrap">
        <div className="donut"></div>

        <div className="legend">
          {statusFlow.slice(0, 5).map((status) => (
            <p key={status}>
              <i></i>
              {statusLabels[status]}
              <b>{orders.filter((order) => order.status === status).length}</b>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function RevenueChart() {
  return (
    <div className="panel">
      <h2>Выручка за неделю</h2>

      <div className="bars">
        {[45, 62, 58, 78, 92, 64, 82].map((height, index) => (
          <span key={index} style={{ height: `${height}%` }}></span>
        ))}
      </div>
    </div>
  );
}

function EventsPanel({ orders }) {
  return (
    <div className="panel">
      <h2>Последние события</h2>

      {orders.slice(0, 5).map((order) => (
        <div className="event" key={order.id}>
          Заказ {order.order_number || order.id} обновлён
          <small>{Number(order.price || 0)} ₽</small>
        </div>
      ))}

      {!orders.length ? <div className="empty-state">Событий пока нет</div> : null}
    </div>
  );
}

function DriversOnline({ drivers }) {
  return (
    <div className="panel">
      <h2>Водители на линии</h2>

      {drivers.slice(0, 6).map((driver) => (
        <div className="driver-line" key={driver.id}>
          <span>👤 {driver.full_name}</span>
          <b className={`driver-status ${driver.status}`}>
            {driverStatusLabels[driver.status] || driver.status}
          </b>
        </div>
      ))}

      {!drivers.length ? <div className="empty-state">Водителей пока нет</div> : null}
    </div>
  );
}

function ClientsScreen({ clients }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Клиенты</h2>
        <input placeholder="Поиск по клиентам..." />
      </div>

      <SimpleTable
        head={['Клиент', 'Телефон', 'Заметка']}
        rows={clients.map((client) => [
          client.full_name,
          client.phone,
          client.note || '—'
        ])}
      />
    </section>
  );
}

function DriversScreen({ drivers, onStatus }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Водители</h2>
        <button className="orange-btn">+ Добавить водителя</button>
      </div>

      <div className="drivers-grid">
        {drivers.map((driver) => (
          <div className="driver-card-pro" key={driver.id}>
            <h3>{driver.full_name}</h3>
            <p>{driver.phone}</p>
            <p>{driver.car} · {driver.plate}</p>

            <select value={driver.status} onChange={(e) => onStatus(driver.id, e.target.value)}>
              <option value="free">На линии</option>
              <option value="busy">Занят</option>
              <option value="offline">Оффлайн</option>
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportsScreen({ stats, orders }) {
  return (
    <>
      <KpiCards stats={stats} />

      <section className="dash-grid">
        <RevenueChart />
        <StatusDonut orders={orders} />

        <div className="panel">
          <h2>Итоги</h2>
          <div className="big-num">{stats.revenue} ₽</div>
        </div>
      </section>
    </>
  );
}

function SimpleTable({ head, rows }) {
  return (
    <div className="simple-table">
      <div className="simple-head">
        {head.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      {rows.map((row, index) => (
        <div className="simple-row" key={index}>
          {row.map((cell, cellIndex) => (
            <span key={cellIndex}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function DriverView({ user, orders, stats, onBack, onPatch }) {
  const current = orders.find((order) => !['completed', 'cancelled'].includes(order.status));

  return (
    <div className="app-layout">
      <aside className="side">
        <div className="side-brand">
          <div className="logo-badge">🚕</div>
          <div>
            <div className="brand-name">Такси Бонус</div>
            <div className="brand-sub">Панель водителя</div>
          </div>
        </div>

        <nav className="side-nav">
          <button className="side-link active">Рабочий стол</button>
          <button className="side-link">Мои заказы</button>
          <button className="side-link">История</button>
          <button className="side-link">Профиль</button>
        </nav>

        <button className="side-logout" onClick={onBack}>← Назад</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Рабочий стол</h1>
            <p>{user.full_name} · водитель</p>
          </div>

          <span className="online-dot">● На линии</span>
        </header>

        <section className="kpi-grid">
          <Kpi title="Сегодня" value={orders.length} trend="заказов" />
          <Kpi title="Выполнено" value={orders.filter((order) => order.status === 'completed').length} trend="заказов" />
          <Kpi title="Выручка" value={`${stats.revenue} ₽`} trend="+18%" />
          <Kpi title="Рейтинг" value="4.9★" trend="128 оценок" />
        </section>

        <section className="driver-workspace">
          <div className="panel large">
            <h2>Доступные заказы</h2>

            {orders.slice(0, 4).map((order) => (
              <div className="driver-order" key={order.id}>
                <b>{order.pickup}</b>
                <span>{order.final_point}</span>
                <strong>{Number(order.price || 0)} ₽</strong>
                <button onClick={() => onPatch(order.id, { status: 'accepted' })}>Принять</button>
              </div>
            ))}
          </div>

          <MapPanel />

          <div className="panel">
            <h2>Текущий заказ</h2>
            {current ? (
              <OrderCard order={current} onPatch={onPatch} />
            ) : (
              <div className="empty-state">Нет активного заказа</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function OrderCard({ order, onPatch }) {
  return (
    <div className="current-order">
      <b>{order.order_number}</b>
      <p>{order.pickup}</p>
      <p>{order.final_point}</p>
      <p>{order.client_name} · {order.reference_phone}</p>
      <h3>{Number(order.price || 0)} ₽</h3>

      <button className="green-btn" onClick={() => onPatch(order.id, { status: 'completed' })}>
        Завершить
      </button>

      <button className="danger-btn" onClick={() => onPatch(order.id, { status: 'cancelled' })}>
        Отменить
      </button>
    </div>
  );
}

function DeveloperView({ user, stats, orders, clients, drivers, onBack }) {
  return (
    <div className="app-layout developer">
      <aside className="side">
        <div className="side-brand">
          <div className="logo-badge">⌘</div>
          <div>
            <div className="brand-name">Такси Бонус</div>
            <div className="brand-sub">Панель разработчика</div>
          </div>
        </div>

        <nav className="side-nav">
          <button className="side-link active">Дашборд</button>
          <button className="side-link">API</button>
          <button className="side-link">База данных</button>
          <button className="side-link">Логи</button>
          <button className="side-link">Мониторинг</button>
        </nav>

        <button className="side-logout" onClick={onBack}>← Назад</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Developer Dashboard</h1>
            <p>{user.login} · системный мониторинг</p>
          </div>
        </header>

        <KpiCards stats={stats} />

        <section className="dev-grid">
          <RevenueChart />

          <div className="panel">
            <h2>Сервисы</h2>
            {['API Server', 'Database', 'SSE', 'WebSocket'].map((item) => (
              <div className="driver-line" key={item}>
                <span>{item}</span>
                <b className="online">Online</b>
              </div>
            ))}
          </div>

          <div className="panel api-test">
            <h2>Тестирование API</h2>
            <input value="/api/orders" readOnly />
            <button className="orange-btn">Отправить</button>
            <pre>
              {JSON.stringify(
                {
                  orders: orders.length,
                  clients: clients.length,
                  drivers: drivers.length
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="panel">
            <h2>Логи системы</h2>
            {['INFO Order created', 'WARNING High response time', 'ERROR Validation error'].map((item) => (
              <div className="event" key={item}>{item}</div>
            ))}
          </div>

          <div className="panel">
            <h2>База данных</h2>
            <SimpleTable
              head={['Таблица', 'Записей']}
              rows={[
                ['orders', orders.length],
                ['clients', clients.length],
                ['drivers', drivers.length]
              ]}
            />
          </div>

          <div className="panel">
            <h2>Переменные окружения</h2>
            <p>SUPABASE_URL https://********</p>
            <p>SUPABASE_KEY ************</p>
            <p>APP_SECRET ************</p>
          </div>
        </section>
      </main>
    </div>
  );
}