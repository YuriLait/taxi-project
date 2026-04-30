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

const statusFlow = ['new','accepted','car_assigned','on_the_way','in_progress','completed','cancelled'];
const driverStatusLabels = { free: 'На линии', busy: 'Занят', offline: 'Оффлайн' };

export default function App() {
  const [screen, setScreen] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(emptyOrder);

  useEffect(() => {
    getMe()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
    return subscribeRealtime(loadData);
  }, [user]);

  async function loadData() {
    const [o, d] = await Promise.all([getOrders(), getDrivers()]);
    setOrders(o || []);
    setDrivers(d || []);
  }

  function updateForm(field, value) {
    setForm((c) => ({ ...c, [field]: value }));
  }

  async function create(e) {
    e.preventDefault();
    await createOrder(form);
    setForm(emptyOrder);
    loadData();
  }

  async function patch(id, data) {
    await updateOrder(id, data);
    loadData();
  }

  if (!authChecked) return <div className="login-shell"><div className="login-card">Проверяю вход...</div></div>;
  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="app-layout">

      <aside className="side">
        <div className="side-brand">
          <div className="logo-badge">🚕</div>
          <div>
            <div className="brand-name">Такси Бонус</div>
            <div className="brand-sub">Админ панель</div>
          </div>
        </div>

        <nav className="side-nav">
          <button className={screen==='dashboard'?'side-link active':'side-link'} onClick={()=>setScreen('dashboard')}>Главная</button>
          <button className={screen==='orders'?'side-link active':'side-link'} onClick={()=>setScreen('orders')}>Заказы</button>
        </nav>

        <button className="side-logout" onClick={()=>{logout();setUser(null)}}>Выйти</button>
      </aside>

      <main className="main">

        <header className="topbar">
          <h1>Dashboard</h1>
        </header>

        {screen === 'dashboard' && (
          <div className="panel">
            <h2>Статистика</h2>
            <p>Всего заказов: {orders.length}</p>
          </div>
        )}

        {screen === 'orders' && (
          <div className="orders-workspace">

            <div className="panel">
              <h2>Заказы</h2>

              {orders.map(o => (
                <div key={o.id} className="orders-row">
                  <span>{o.order_number}</span>
                  <span>{o.pickup}</span>
                  <span>{o.final_point}</span>

                  <select value={o.status} onChange={e=>patch(o.id,{status:e.target.value})}>
                    {statusFlow.map(s => <option key={s}>{s}</option>)}
                  </select>

                  <span>{o.price} ₽</span>
                </div>
              ))}
            </div>

            <form className="panel" onSubmit={create}>
              <h2>Новый заказ</h2>

              <input placeholder="Откуда" value={form.pickup} onChange={e=>updateForm('pickup',e.target.value)} />
              <input placeholder="Куда" value={form.final_point} onChange={e=>updateForm('final_point',e.target.value)} />

              <button className="orange-btn">Создать</button>
            </form>

          </div>
        )}

      </main>
    </div>
  );
}