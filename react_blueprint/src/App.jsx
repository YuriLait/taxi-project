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
import StatCard from './components/StatCard.jsx';

const tabs = [
  { key: 'dashboard', label: 'Главная' },
  { key: 'orders', label: 'Заказы' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'drivers', label: 'Водители' },
  { key: 'reports', label: 'Отчёты' }
];

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

const statusFlow = ['new', 'accepted', 'car_assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'];

const driverStatusLabels = {
  free: 'Свободен',
  busy: 'Занят',
  offline: 'Оффлайн'
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
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

      setOrders(ordersData);
      setClients(clientsData);
      setDrivers(driversData);
    } catch (err) {
      setError(err.message);
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
        if (['order.created', 'order.updated', 'driver.updated'].includes(event.type)) {
          loadData();
        }
      },
      () => setRealtimeStatus('переподключение')
    );

    return unsubscribe;
  }, [user]);

  const stats = useMemo(() => {
    const paid = orders.reduce((sum, item) => sum + Number(item.total_paid || 0), 0);
    const revenue = orders.reduce((sum, item) => sum + Number(item.price || 0), 0);

    return {
      orders: orders.length,
      active: orders.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
      paid,
      revenue,
      freeDrivers: drivers.filter((item) => item.status === 'free').length,
      onlineDrivers: drivers.filter((item) => item.status !== 'offline').length
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

      setOrders((current) => [created, ...current]);
      setForm(emptyOrder);
      setNotice(`Заказ ${created.order_number || `#${created.id}`} создан`);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleOrderPatch(orderId, patch) {
    setError('');
    setNotice('');

    try {
      const updated = await updateOrder(orderId, patch);
      setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
      setNotice(`Заказ ${updated.order_number || `#${updated.id}`} обновлён`);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDriverStatus(driverId, status) {
    setError('');

    try {
      const updated = await updateDriver(driverId, { status });
      setDrivers((current) => current.map((driver) => (driver.id === updated.id ? updated : driver)));
    } catch (err) {
      setError(err.message);
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

  return (
    <div className="shell dark-shell">
      <aside className="sidebar dark-sidebar">
        <div className="brand-row">
          <div className="brand-icon">🚕</div>
          <div>
            <div className="brand">Такси Бонус</div>
            <div className="sidebar-note">{user.full_name} · {user.role}</div>
          </div>
        </div>

        <div className="nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button className="logout-link" onClick={handleLogout}>Выйти</button>
      </aside>

      <main className="content dark-content">
        <section className="dark-topbar">
          <div>
            <h1>Такси Бонус</h1>
            <p>Панель управления заказами, клиентами и водителями</p>
          </div>

          <div className="hero-actions">
            <span className="realtime-pill">Realtime: {realtimeStatus}</span>
            <button className="secondary-btn" onClick={loadData} disabled={isLoading}>
              {isLoading ? 'Обновление...' : 'Обновить'}
            </button>
            <button className="primary-small" onClick={() => setActiveTab('orders')}>
              + Новый заказ
            </button>
          </div>
        </section>

        <section className="dark-stats">
          <StatCard label="Всего заказов" value={stats.orders} />
          <StatCard label="Активные заказы" value={stats.active} />
          <StatCard label="Водители на линии" value={stats.onlineDrivers} />
          <StatCard label="Выручка сегодня" value={`${stats.revenue} ₽`} />
          <StatCard label="Оплачено" value={`${stats.paid} ₽`} />
        </section>

        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="notice-box">{notice}</div> : null}

        {activeTab === 'dashboard' && (
          <section className="dashboard-grid">
            <div className="dark-panel wide">
              <div className="panel-head">
                <h2>Активные заказы</h2>
                <button className="ghost-btn" onClick={() => setActiveTab('orders')}>Смотреть все</button>
              </div>

              <OrdersTable orders={orders.slice(0, 6)} drivers={drivers} onPatch={handleOrderPatch} />
            </div>

            <div className="dark-panel">
              <h2>Заказы по статусам</h2>
              <StatusSummary orders={orders} />
            </div>

            <div className="dark-panel">
              <h2>Водители на линии</h2>
              <DriversMiniList drivers={drivers} />
            </div>

            <div className="dark-panel wide">
              <h2>Последние события</h2>
              <div className="events-list">
                {orders.slice(0, 5).map((order) => (
                  <div className="event-row" key={order.id}>
                    <span>Новый заказ {order.order_number || `#${order.id}`}</span>
                    <b>{Number(order.price || 0)} ₽</b>
                  </div>
                ))}
                {orders.length === 0 ? <div className="empty-dark">Событий пока нет.</div> : null}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'orders' && (
          <section className="dashboard-grid orders-screen">
            <div className="dark-panel wide">
              <div className="panel-head">
                <h2>Заказы</h2>
                <input className="dark-search" placeholder="Поиск по заказам..." />
              </div>

              <OrdersTable orders={orders} drivers={drivers} onPatch={handleOrderPatch} />
            </div>

            <form className="dark-panel order-form-dark" onSubmit={handleCreateOrder}>
              <h2>Новый заказ</h2>

              <label>Клиент
                <input value={form.client_name} onChange={(e) => updateForm('client_name', e.target.value)} placeholder="Имя клиента" />
              </label>

              <label>Телефон
                <input value={form.reference_phone} onChange={(e) => updateForm('reference_phone', e.target.value)} placeholder="+7..." />
              </label>

              <label>Подача
                <input value={form.pickup} onChange={(e) => updateForm('pickup', e.target.value)} placeholder="Адрес подачи" required />
              </label>

              <label>Назначение
                <input value={form.final_point} onChange={(e) => updateForm('final_point', e.target.value)} placeholder="Куда едем" required />
              </label>

              <label>Способ оплаты
                <select value={form.payment_mode} onChange={(e) => updateForm('payment_mode', e.target.value)}>
                  <option>Наличка</option>
                  <option>Карта</option>
                  <option>Перевод</option>
                </select>
              </label>

              <label>Цена
                <input type="number" min="0" value={form.price} onChange={(e) => updateForm('price', e.target.value)} />
              </label>

              <label>Водитель
                <select value={form.driver_id} onChange={(e) => updateForm('driver_id', e.target.value)}>
                  <option value="">Не назначен</option>
                  {drivers.filter((d) => d.status !== 'offline').map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.full_name} · {driver.car}</option>
                  ))}
                </select>
              </label>

              <button className="primary-btn" disabled={isSaving}>
                {isSaving ? 'Создаю...' : 'Создать заказ'}
              </button>
            </form>
          </section>
        )}

        {activeTab === 'clients' && (
          <section className="dark-panel">
            <div className="panel-head">
              <h2>Клиенты</h2>
              <input className="dark-search" placeholder="Поиск по клиентам..." />
            </div>

            <div className="dark-table">
              <div className="dark-table-head">
                <span>Клиент</span>
                <span>Телефон</span>
                <span>Заметка</span>
              </div>

              {clients.map((client) => (
                <div className="dark-table-row" key={client.id}>
                  <span>{client.full_name}</span>
                  <span>{client.phone}</span>
                  <span>{client.note || '—'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'drivers' && (
          <section className="dark-panel">
            <div className="panel-head">
              <h2>Водители</h2>
              <input className="dark-search" placeholder="Поиск по водителям..." />
            </div>

            <div className="dark-table">
              <div className="dark-table-head">
                <span>Водитель</span>
                <span>Телефон</span>
                <span>Авто</span>
                <span>Статус</span>
              </div>

              {drivers.map((driver) => (
                <div className="dark-table-row" key={driver.id}>
                  <span>{driver.full_name}</span>
                  <span>{driver.phone}</span>
                  <span>{driver.car} · {driver.plate}</span>
                  <span>
                    <select value={driver.status} onChange={(e) => handleDriverStatus(driver.id, e.target.value)}>
                      <option value="free">Свободен</option>
                      <option value="busy">Занят</option>
                      <option value="offline">Оффлайн</option>
                    </select>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'reports' && (
          <section className="dashboard-grid">
            <div className="dark-panel">
              <h2>Выручка</h2>
              <div className="big-number">{stats.revenue} ₽</div>
            </div>

            <div className="dark-panel">
              <h2>Оплачено</h2>
              <div className="big-number">{stats.paid} ₽</div>
            </div>

            <div className="dark-panel">
              <h2>Долг</h2>
              <div className="big-number">{Math.max(stats.revenue - stats.paid, 0)} ₽</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function OrdersTable({ orders, drivers, onPatch }) {
  if (!orders.length) return <div className="empty-dark">Заказов пока нет.</div>;

  return (
    <div className="dark-table">
      <div className="dark-table-head orders-head">
        <span>№ заказа</span>
        <span>Клиент</span>
        <span>Подача</span>
        <span>Назначение</span>
        <span>Статус</span>
        <span>Водитель</span>
        <span>Цена</span>
      </div>

      {orders.map((order) => (
        <div className="dark-table-row orders-row" key={order.id}>
          <span>{order.order_number || `#${order.id}`}</span>
          <span>{order.client_name || 'Без имени'}</span>
          <span>{order.pickup}</span>
          <span>{order.final_point}</span>
          <span>
            <select value={order.status} onChange={(e) => onPatch(order.id, { status: e.target.value })}>
              {statusFlow.map((status) => (
                <option key={status} value={status}>{statusLabels[status]}</option>
              ))}
            </select>
          </span>
          <span>
            <select value={order.driver_id || ''} onChange={(e) => onPatch(order.id, { driver_id: e.target.value || null })}>
              <option value="">—</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.full_name}</option>
              ))}
            </select>
          </span>
          <span>{Number(order.price || 0)} ₽</span>
        </div>
      ))}
    </div>
  );
}

function StatusSummary({ orders }) {
  const counts = statusFlow.map((status) => ({
    status,
    label: statusLabels[status],
    count: orders.filter((order) => order.status === status).length
  }));

  return (
    <div className="status-list">
      {counts.map((item) => (
        <div className="status-line" key={item.status}>
          <span>{item.label}</span>
          <b>{item.count}</b>
        </div>
      ))}
    </div>
  );
}

function DriversMiniList({ drivers }) {
  if (!drivers.length) return <div className="empty-dark">Водителей пока нет.</div>;

  return (
    <div className="drivers-mini">
      {drivers.slice(0, 6).map((driver) => (
        <div className="driver-mini" key={driver.id}>
          <span>{driver.full_name}</span>
          <b>{driverStatusLabels[driver.status] || driver.status}</b>
        </div>
      ))}
    </div>
  );
}