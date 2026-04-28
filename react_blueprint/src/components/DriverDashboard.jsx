import { useEffect, useMemo, useState } from 'react';
import { getDriverOrders, getDrivers, subscribeRealtime, updateDriver, updateOrder } from '../lib/api.js';

const orderStatusLabels = {
  new: 'Новый',
  accepted: 'Принят',
  car_assigned: 'Назначен',
  on_the_way: 'Еду к клиенту',
  in_progress: 'В поездке',
  completed: 'Завершён',
  cancelled: 'Отменён'
};

const nextActions = {
  car_assigned: [{ status: 'accepted', label: 'Принять' }],
  accepted: [{ status: 'on_the_way', label: 'Еду к клиенту' }],
  on_the_way: [{ status: 'in_progress', label: 'Начать поездку' }],
  in_progress: [{ status: 'completed', label: 'Завершить' }]
};

export default function DriverDashboard({ user, onBack }) {
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState(String(user?.driver_id || '1'));
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const currentDriver = useMemo(() => drivers.find((item) => String(item.id) === String(driverId)), [drivers, driverId]);
  const activeOrders = orders.filter((item) => !['completed', 'cancelled'].includes(item.status));

  async function loadDriverData(id = driverId) {
    setError('');
    try {
      const [driversData, ordersData] = await Promise.all([getDrivers(), getDriverOrders(id)]);
      setDrivers(driversData);
      setOrders(ordersData);
      if (!driversData.find((driver) => String(driver.id) === String(id)) && driversData[0]) {
        setDriverId(String(driversData[0].id));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadDriverData(driverId);
    const unsubscribe = subscribeRealtime((event) => {
      if (['order.created', 'order.updated', 'driver.updated'].includes(event.type)) loadDriverData(driverId);
    }, () => {});
    return unsubscribe;
  }, [driverId]);

  async function changeOrderStatus(orderId, status) {
    setError('');
    setNotice('');
    try {
      await updateOrder(orderId, { status });
      setNotice('Статус заказа обновлён');
      await loadDriverData(driverId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeDriverStatus(status) {
    setError('');
    setNotice('');
    try {
      await updateDriver(driverId, { status });
      setNotice(`Вы ${status === 'free' ? 'онлайн' : 'оффлайн'}`);
      await loadDriverData(driverId);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="driver-shell">
      <header className="driver-header">
        <div>
          <button className="link-btn" onClick={onBack}>← Диспетчерская</button>
          <h1>Кабинет водителя</h1>
          <p>Заказы обновляются автоматически через realtime-канал backend.</p>
        </div>
        <button className="secondary-btn" onClick={() => loadDriverData(driverId)}>Обновить</button>
      </header>

      {error ? <div className="error-box">{error}</div> : null}
      {notice ? <div className="notice-box">{notice}</div> : null}

      <section className="panel driver-panel">
        <div className="driver-toolbar">
          <label>Водитель<select value={driverId} disabled={user?.role === 'driver'} onChange={(e) => setDriverId(e.target.value)}>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name} · {driver.car}</option>)}</select></label>
          <div className="driver-online-actions">
            <span className={`status status-driver-${currentDriver?.status || 'offline'}`}>{currentDriver?.status || 'offline'}</span>
            <button className="secondary-btn" onClick={() => changeDriverStatus('free')}>Онлайн</button>
            <button className="secondary-btn" onClick={() => changeDriverStatus('offline')}>Оффлайн</button>
          </div>
        </div>

        <h2>Мои активные заказы</h2>
        <div className="list">
          {activeOrders.length === 0 ? <div className="empty">Назначенных активных заказов нет.</div> : activeOrders.map((order) => (
            <article className="list-item driver-order" key={order.id}>
              <div className="list-head">
                <strong>{order.order_number || `#${order.id}`}</strong>
                <span className={`status status-${order.status}`}>{orderStatusLabels[order.status] || order.status}</span>
              </div>
              <div className="route-big">{order.pickup} → {order.final_point}</div>
              <div className="list-meta">Клиент: {order.client_name || 'Без имени'} · {order.reference_phone || 'без телефона'}</div>
              <div className="list-meta">Оплата: {order.payment_mode} · {Number(order.price || 0)} ₽</div>
              <div className="order-actions">
                {(nextActions[order.status] || []).map((action) => <button key={action.status} className="primary-small" onClick={() => changeOrderStatus(order.id, action.status)}>{action.label}</button>)}
                {!['completed', 'cancelled'].includes(order.status) ? <button className="danger-small" onClick={() => changeOrderStatus(order.id, 'cancelled')}>Отменить</button> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
