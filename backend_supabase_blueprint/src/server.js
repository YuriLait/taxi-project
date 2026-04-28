import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Backend работает 🚀");
});

const ORDER_STATUSES = ['new', 'accepted', 'car_assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'];
const DEMO_USERS = [
    { id: 'demo-admin', full_name: 'Администратор', role: 'admin', phone: '+7 900 000-00-01', login: 'admin', password: 'admin' },
    { id: 'demo-dispatcher', full_name: 'Диспетчер', role: 'dispatcher', phone: '+7 900 000-00-02', login: 'dispatcher', password: 'dispatcher' },
    { id: 'demo-driver-1', full_name: 'Алексей Волков', role: 'driver', phone: '+7 918 100-20-01', login: 'driver', password: 'driver', driver_id: 1 }
];

function publicUser(user) { if (!user) return null; const { password, login, ...safe } = user; return safe; }

function encodeDemoToken(user) { return Buffer.from(JSON.stringify({ id: user.id, role: user.role, driver_id: user.driver_id || null })).toString('base64url'); }

function decodeDemoToken(token) { try { const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); return DEMO_USERS.find((user) => user.id === payload.id) || null; } catch { return null; } }

function authUserFromRequest(req) { const header = req.headers.authorization || ''; const token = header.startsWith('Bearer ') ? header.slice(7) : ''; return decodeDemoToken(token); }

function requireAuth(roles = []) { return (req, res, next) => { if (hasSupabase) return next(); const user = authUserFromRequest(req); if (!user) return res.status(401).json({ error: 'Нужна авторизация' }); if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Недостаточно прав' });
        req.user = user;
        next(); }; }

const DRIVER_STATUSES = ['free', 'busy', 'offline'];

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabase ?
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) :
    null;

const realtimeClients = new Set();

function broadcast(type, payload = {}) {
    const event = { type, payload, at: new Date().toISOString() };
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of realtimeClients) client.write(data);
}

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders ? .();
    res.write(`data: ${JSON.stringify({ type: 'connected', payload: { mode: hasSupabase ? 'supabase' : 'demo-memory' }, at: new Date().toISOString() })}\n\n`);
    realtimeClients.add(res);
    req.on('close', () => realtimeClients.delete(res));
});

setInterval(() => broadcast('heartbeat', { clients: realtimeClients.size }), 25000).unref ? .();


let nextOrderId = 4;
const demoClients = [
    { id: 1, full_name: 'Анна Петрова', phone: '+7 918 000-10-01', note: 'VIP клиент', created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 2, full_name: 'Иван Сидоров', phone: '+7 918 000-10-02', note: '', created_at: new Date(Date.now() - 7000000).toISOString() }
];
let demoDrivers = [
    { id: 1, full_name: 'Алексей Волков', phone: '+7 918 100-20-01', car: 'Kia Rio', plate: 'А123ВС', status: 'free', created_at: new Date().toISOString() },
    { id: 2, full_name: 'Марат Алиев', phone: '+7 918 100-20-02', car: 'Hyundai Solaris', plate: 'М777КМ', status: 'busy', created_at: new Date().toISOString() },
    { id: 3, full_name: 'Олег Морозов', phone: '+7 918 100-20-03', car: 'Skoda Rapid', plate: 'О456РР', status: 'offline', created_at: new Date().toISOString() }
];
let demoOrders = [
    { id: 1, order_number: 'TB-0001', client_name: 'Анна Петрова', pickup: 'Краснодар, Красная 10', final_point: 'Аэропорт Краснодар', reference_phone: '+7 918 000-10-01', payment_mode: 'Карта', price: 1200, total_paid: 1200, status: 'completed', driver_id: 1, created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 2, order_number: 'TB-0002', client_name: 'Иван Сидоров', pickup: 'ТРЦ Галерея', final_point: 'ул. Ставропольская 25', reference_phone: '+7 918 000-10-02', payment_mode: 'Наличка', price: 450, total_paid: 0, status: 'new', driver_id: null, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, order_number: 'TB-0003', client_name: 'Без имени', pickup: 'ЖД вокзал Краснодар-1', final_point: 'ул. Северная 320', reference_phone: '+7 918 000-10-03', payment_mode: 'Перевод', price: 600, total_paid: 600, status: 'car_assigned', driver_id: 2, created_at: new Date(Date.now() - 900000).toISOString() }
];

function orderNumber(id) {
    return `TB-${String(id).padStart(4, '0')}`;
}

function validateStatus(value, allowed, field) {
    if (!allowed.includes(value)) throw new Error(`Некорректный ${field}: ${value}`);
}

function mapOrderRelations(order) {
    if (!order) return order;
    if (order.drivers && !order.driver) return {...order, driver: order.drivers };
    return order;
}

async function selectOrders() {
    if (!supabase) {
        return [...demoOrders]
            .map((order) => ({...order, driver: demoDrivers.find((driver) => driver.id === Number(order.driver_id)) || null }))
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }

    const { data, error } = await supabase
        .from('orders')
        .select('*, drivers(id, full_name, phone, car, plate, status)')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) throw error;
    return data.map(mapOrderRelations);
}

async function selectAll(table) {
    if (!supabase) {
        const source = table === 'clients' ? demoClients : demoDrivers;
        return [...source].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data;
}

function cleanOrderPayload(body) {
    const payload = {
        client_name: String(body.client_name || 'Без имени').trim(),
        pickup: String(body.pickup || '').trim(),
        final_point: String(body.final_point || '').trim(),
        reference_phone: String(body.reference_phone || '').trim(),
        payment_mode: String(body.payment_mode || 'Наличка').trim(),
        price: Number(body.price || 0),
        total_paid: Number(body.total_paid || 0),
        status: String(body.status || 'new').trim(),
        driver_id: body.driver_id ? Number(body.driver_id) : null,
        comment: String(body.comment || '').trim()
    };
    if (!payload.pickup || !payload.final_point) throw new Error('Укажите адрес подачи и конечную точку');
    validateStatus(payload.status, ORDER_STATUSES, 'статус заказа');
    return payload;
}

app.post('/auth/demo-login', (req, res) => {
    const login = String(req.body.login || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const user = DEMO_USERS.find((item) => item.login === login && item.password === password);
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    res.json({ token: encodeDemoToken(user), user: publicUser(user), mode: hasSupabase ? 'supabase' : 'demo-memory' });
});

app.get('/me', (req, res) => {
    if (hasSupabase) return res.json({ user: null, mode: 'supabase', note: 'Подключите Supabase Auth на этом шаге' });
    const user = authUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Нужна авторизация' });
    res.json({ user: publicUser(user), mode: 'demo-memory' });
});

app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'taxi-bonus-backend', mode: hasSupabase ? 'supabase' : 'demo-memory' });
});

app.get('/orders', async(_req, res) => {
    try {
        res.json(await selectOrders());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/orders', requireAuth(['admin', 'dispatcher']), async(req, res) => {
    try {
        const payload = cleanOrderPayload(req.body);
        if (payload.driver_id && payload.status === 'new') payload.status = 'car_assigned';

        if (!supabase) {
            const id = nextOrderId++;
            const order = { id, order_number: orderNumber(id), ...payload, created_at: new Date().toISOString() };
            demoOrders = [order, ...demoOrders];
            if (payload.driver_id) demoDrivers = demoDrivers.map((driver) => driver.id === payload.driver_id ? {...driver, status: 'busy' } : driver);
            const created = {...order, driver: demoDrivers.find((driver) => driver.id === payload.driver_id) || null };
            broadcast('order.created', created);
            return res.status(201).json(created);
        }

        const { data, error } = await supabase
            .from('orders')
            .insert({ order_number: `TB-${Date.now()}`, ...payload })
            .select('*, drivers(id, full_name, phone, car, plate, status)')
            .single();
        if (error) return res.status(400).json({ error: error.message });

        if (payload.driver_id) {
            await supabase.from('drivers').update({ status: 'busy' }).eq('id', payload.driver_id);
        }

        const created = mapOrderRelations(data);
        broadcast('order.created', created);
        res.status(201).json(created);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.patch('/orders/:id', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const id = Number(req.params.id);
        if (!supabase && req.user ? .role === 'driver') {
            const current = demoOrders.find((order) => order.id === id);
            if (!current || Number(current.driver_id) !== Number(req.user.driver_id)) return res.status(403).json({ error: 'Водитель может менять только свои заказы' });
            if (Object.keys(req.body).some((field) => field !== 'status')) return res.status(403).json({ error: 'Водитель может менять только статус заказа' });
        }
        const patch = {};
        if ('status' in req.body) {
            patch.status = String(req.body.status || '').trim();
            validateStatus(patch.status, ORDER_STATUSES, 'статус заказа');
        }
        if ('driver_id' in req.body) {
            patch.driver_id = req.body.driver_id ? Number(req.body.driver_id) : null;
            if (patch.driver_id && !patch.status) patch.status = 'car_assigned';
        }
        ['client_name', 'pickup', 'final_point', 'reference_phone', 'payment_mode', 'comment', 'cancel_reason'].forEach((field) => {
            if (field in req.body) patch[field] = String(req.body[field] || '').trim();
        });
        ['price', 'total_paid'].forEach((field) => {
            if (field in req.body) patch[field] = Number(req.body[field] || 0);
        });

        if (!supabase) {
            const before = demoOrders.find((order) => order.id === id);
            if (!before) return res.status(404).json({ error: 'Заказ не найден' });
            demoOrders = demoOrders.map((order) => order.id === id ? {...order, ...patch, updated_at: new Date().toISOString() } : order);
            const updated = demoOrders.find((order) => order.id === id);
            if (patch.driver_id) demoDrivers = demoDrivers.map((driver) => driver.id === patch.driver_id ? {...driver, status: 'busy' } : driver);
            if (patch.status === 'completed' || patch.status === 'cancelled') {
                demoDrivers = demoDrivers.map((driver) => driver.id === Number(updated.driver_id) ? {...driver, status: 'free' } : driver);
            }
            const result = {...updated, driver: demoDrivers.find((driver) => driver.id === Number(updated.driver_id)) || null };
            broadcast('order.updated', result);
            return res.json(result);
        }

        const { data, error } = await supabase
            .from('orders')
            .update(patch)
            .eq('id', id)
            .select('*, drivers(id, full_name, phone, car, plate, status)')
            .single();
        if (error) return res.status(400).json({ error: error.message });

        if (patch.driver_id) await supabase.from('drivers').update({ status: 'busy' }).eq('id', patch.driver_id);
        if (['completed', 'cancelled'].includes(patch.status) && data.driver_id) {
            await supabase.from('drivers').update({ status: 'free' }).eq('id', data.driver_id);
        }

        const result = mapOrderRelations(data);
        broadcast('order.updated', result);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});


app.get('/drivers/:id/orders', async(req, res) => {
    try {
        const driverId = Number(req.params.id);
        const orders = await selectOrders();
        res.json(orders.filter((order) => Number(order.driver_id) === driverId));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/clients', async(_req, res) => {
    try {
        res.json(await selectAll('clients'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/drivers', async(_req, res) => {
    try {
        res.json(await selectAll('drivers'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/drivers/:id', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const id = Number(req.params.id);
        if (!supabase && req.user ? .role === 'driver' && Number(req.user.driver_id) !== id) return res.status(403).json({ error: 'Водитель может менять только свой статус' });
        const status = String(req.body.status || '').trim();
        validateStatus(status, DRIVER_STATUSES, 'статус водителя');

        if (!supabase) {
            demoDrivers = demoDrivers.map((driver) => driver.id === id ? {...driver, status } : driver);
            const updated = demoDrivers.find((driver) => driver.id === id);
            if (!updated) return res.status(404).json({ error: 'Водитель не найден' });
            broadcast('driver.updated', updated);
            return res.json(updated);
        }

        const { data, error } = await supabase.from('drivers').update({ status }).eq('id', id).select('*').single();
        if (error) return res.status(400).json({ error: error.message });
        broadcast('driver.updated', data);
        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
    console.log(`Taxi Bonus backend listening on http://localhost:${port} (${hasSupabase ? 'supabase' : 'demo-memory'})`);
});