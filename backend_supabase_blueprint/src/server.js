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

function publicUser(user) {
    if (!user) return null;
    const { password, login, ...safe } = user;
    return safe;
}

function encodeDemoToken(user) {
    return Buffer.from(JSON.stringify({ id: user.id, role: user.role, driver_id: user.driver_id || null })).toString('base64url');
}

function decodeDemoToken(token) {
    try {
        const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
        return DEMO_USERS.find((user) => user.id === payload.id) || null;
    } catch {
        return null;
    }
}

function authUserFromRequest(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return decodeDemoToken(token);
}

function requireAuth(roles = []) {
    return (req, res, next) => {
        if (hasSupabase) return next();

        const user = authUserFromRequest(req);

        if (!user) return res.status(401).json({ error: 'Нужна авторизация' });

        if (roles.length && !roles.includes(user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        req.user = user;
        next();
    };
}

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

    res.write(`data: ${JSON.stringify({
        type: 'connected',
        payload: { mode: hasSupabase ? 'supabase' : 'demo-memory' },
        at: new Date().toISOString()
    })}\n\n`);

    realtimeClients.add(res);

    req.on('close', () => realtimeClients.delete(res));
});

setInterval(
    () => broadcast('heartbeat', { clients: realtimeClients.size }),
    25000
).unref ? .();

let nextOrderId = 4;

const demoClients = [
    { id: 1, full_name: 'Анна Петрова', phone: '+7 918 000-10-01', note: 'VIP клиент', created_at: new Date().toISOString() },
    { id: 2, full_name: 'Иван Сидоров', phone: '+7 918 000-10-02', note: '', created_at: new Date().toISOString() }
];

let demoDrivers = [
    { id: 1, full_name: 'Алексей Волков', status: 'free' },
    { id: 2, full_name: 'Марат Алиев', status: 'busy' },
    { id: 3, full_name: 'Олег Морозов', status: 'offline' }
];

let demoOrders = [];

function orderNumber(id) {
    return `TB-${String(id).padStart(4, '0')}`;
}

function validateStatus(value, allowed, field) {
    if (!allowed.includes(value)) throw new Error(`Некорректный ${field}: ${value}`);
}

async function selectOrders() {
    if (!supabase) {
        return demoOrders;
    }

    const { data, error } = await supabase.from('orders').select('*');

    if (error) throw error;

    return data;
}

app.post('/auth/demo-login', (req, res) => {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '').trim();

    const user = DEMO_USERS.find(
        (item) => item.login === login && item.password === password
    );

    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    res.json({
        token: encodeDemoToken(user),
        user: publicUser(user)
    });
});

app.get('/orders', async(req, res) => {
    try {
        res.json(await selectOrders());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/orders/:id', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const id = Number(req.params.id);

        if (!supabase && req.user ? .role === 'driver') {
            const current = demoOrders.find((o) => o.id === id);

            if (!current || current.driver_id !== req.user.driver_id) {
                return res.status(403).json({ error: 'Нет доступа' });
            }
        }

        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.patch('/drivers/:id', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const id = Number(req.params.id);

        if (!supabase && req.user ? .role === 'driver' && req.user.driver_id !== id) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
    console.log(`Server started on ${port}`);
});