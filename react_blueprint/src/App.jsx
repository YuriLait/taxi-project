import { useEffect, useMemo, useState } from 'react';
import { createOrder, getClients, getDrivers, getMe, getOrders, logout, subscribeRealtime, updateDriver, updateOrder } from './lib/api.js';
import DriverDashboard from './components/DriverDashboard.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import StatCard from './components/StatCard.jsx';

const tabs = [
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
  car_assigned: 'Машина назначена',
  on_the_way: 'Водитель едет',
  in_progress: 'В поездке',
  completed: 'Завершён',
  cancelled: 'Отменён'
};

const statusFlow = ['new', 'accepted', 'car_assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'];
const driverStatusLabels = { free: 'Свободен', busy: 'Занят', offline: 'Оффлайн' };

export default function App() {
  const [activeTab, setActiveTab] = useState('orders');
  const [view, setView] = useState('dispatcher');
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
      const [ordersData, clientsData, driversData] = await Promise.all([getOrders(), getClients(), getDrivers()]);
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
    const unsubscribe = subscribeRealtime((event) => {
      setRealtimeStatus('онлайн');
      if (['order.created', 'order.updated', 'driver.updated'].includes(event.type)) loadData();
    }, () => setRealtimeStatus('переподключение'));
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
      freeDrivers: drivers.filter((item) => item.status === 'free').length
    };
  }, [orders, drivers]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function upsertOrder(updated) {
    setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
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
      upsertOrder(updated);
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

  if (!authChecked) return <div className="login-shell"><div className="login-card">Проверяю вход...</div></div>;
  if (!user) return <LoginScreen onLogin={setUser} />;

  function handleLogout() {
    logout();
    setUser(null);
    setOrders([]);
    setClients([]);
    setDrivers([]);
  }

  if (view === 'driver') return <DriverDashboard user={user} onBack={() => setView('dispatcher')} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Такси Бонус</div>
        <div className="sidebar-note">{user.full_name} · {user.role}</div>
        <div className="nav">
          {tabs.map((tab) => (
            <button key={tab.key} className={activeTab === tab.key ? 'nav-btn active' : 'nav-btn'} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <h1>Рабочий MVP</h1>
            <p>Добавлены реальные статусы заказов, назначение водителя и Supabase-ready backend.</p>
          </div>
          <div className="hero-actions"><span className="realtime-pill">Realtime: {realtimeStatus}</span><button className="secondary-btn" onClick={() => setView('driver')}>Кабинет водителя</button><button className="secondary-btn" onClick={loadData} disabled={isLoading}>{isLoading ? 'Обновление...' : 'Обновить'}</button><button className="secondary-btn" onClick={handleLogout}>Выйти</button></div>
        </section>

        <section className="stats-grid">
          <StatCard label="Заказов" value={stats.orders} />
          <StatCard label="Активных" value={stats.active} />
          <StatCard label="Свободных водителей" value={stats.freeDrivers} />
          <StatCard label="Выручка" value={`${stats.revenue} ₽`} />
          <StatCard label="Оплачено" value={`${stats.paid} ₽`} />
        </section>

        {error ? <div className="error-box">{error}</div> : null}
        {notice ? <div className="notice-box">{notice}</div> : null}

        <section className="panel">
          {activeTab === 'orders' && (
            <div className="orders-layout">
              <form className="order-form" onSubmit={handleCreateOrder}>
                <h2>Новый заказ</h2>
                <div className="form-grid">
                  <label>Клиент<input value={form.client_name} onChange={(e) => updateForm('client_name', e.target.value)} placeholder="Имя клиента" /></label>
                  <label>Телефон<input value={form.reference_phone} onChange={(e) => updateForm('reference_phone', e.target.value)} placeholder="+7..." /></label>
                  <label>Откуда<input value={form.pickup} onChange={(e) => updateForm('pickup', e.target.value)} placeholder="Адрес подачи" required /></label>
                  <label>Куда<input value={form.final_point} onChange={(e) => updateForm('final_point', e.target.value)} placeholder="Конечная точка" required /></label>
                  <label>Оплата<select value={form.payment_mode} onChange={(e) => updateForm('payment_mode', e.target.value)}><option>Наличка</option><option>Карта</option><option>Перевод</option></select></label>
                  <label>Водитель<select value={form.driver_id} onChange={(e) => updateForm('driver_id', e.target.value)}><option value="">Не назначен</option>{drivers.filter((d) => d.status !== 'offline').map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name} · {driver.car}</option>)}</select></label>
                  <label>Цена, ₽<input type="number" min="0" value={form.price} onChange={(e) => updateForm('price', e.target.value)} /></label>
                  <label>Оплачено, ₽<input type="number" min="0" value={form.total_paid} onChange={(e) => updateForm('total_paid', e.target.value)} /></label>
                </div>
                <button className="primary-btn" disabled={isSaving}>{isSaving ? 'Создаю...' : 'Создать заказ'}</button>
              </form>

              <div>
                <h2>Последние заказы</h2>
                <div className="list">
                  {orders.length === 0 ? <div className="empty">Заказов пока нет.</div> : orders.slice(0, 16).map((item) => (
                    <div key={item.id} className="list-item">
                      <div className="list-head">
                        <div className="list-title">{item.order_number || `#${item.id}`}</div>
                        <span className={`status status-${item.status}`}>{statusLabels[item.status] || item.status}</span>
                      </div>
                      <div className="list-subtitle">{item.pickup} → {item.final_point}</div>
                      <div className="list-meta">{item.client_name || 'Без имени'} · {item.payment_mode} · {Number(item.price || 0)} ₽</div>
                      <div className="list-meta">Водитель: {item.driver?.full_name || item.drivers?.full_name || 'не назначен'}</div>
                      <div className="order-actions">
                        <select value={item.status} onChange={(e) => handleOrderPatch(item.id, { status: e.target.value })}>{statusFlow.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
                        <select value={item.driver_id || ''} onChange={(e) => handleOrderPatch(item.id, { driver_id: e.target.value || null })}>
                          <option value="">Без водителя</option>{drivers.filter((d) => d.status !== 'offline' || d.id === item.driver_id).map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name} · {driver.car}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'clients' && (<><h2>Клиенты</h2><div className="table">{clients.map((client) => <div className="table-row" key={client.id}><strong>{client.full_name}</strong><span>{client.phone}</span><span>{client.note || '—'}</span></div>)}</div></>)}

          {activeTab === 'drivers' && (<><h2>Водители</h2><div className="cards-grid">{drivers.map((driver) => <div className="driver-card" key={driver.id}><div className="list-title">{driver.full_name}</div><div className="list-subtitle">{driver.car} · {driver.plate}</div><div className="list-meta">{driver.phone}</div><div className="driver-actions"><span className={`status status-driver-${driver.status}`}>{driverStatusLabels[driver.status] || driver.status}</span><select value={driver.status} onChange={(e) => handleDriverStatus(driver.id, e.target.value)}><option value="free">Свободен</option><option value="busy">Занят</option><option value="offline">Оффлайн</option></select></div></div>)}</div></>)}

          {activeTab === 'reports' && (<><h2>Отчёты</h2><div className="report-grid"><StatCard label="Плановая выручка" value={`${stats.revenue} ₽`} /><StatCard label="Получено" value={`${stats.paid} ₽`} /><StatCard label="Долг" value={`${Math.max(stats.revenue - stats.paid, 0)} ₽`} /></div></>)}
        </section>
      </main>
    </div>
  );
}
