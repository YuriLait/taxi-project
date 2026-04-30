import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_SECRET = process.env.APP_SECRET || 'taxi-app-secret-change-me';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ORDER_STATUSES = ['new', 'accepted', 'car_assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'];
const DRIVER_STATUSES = ['free', 'busy', 'offline'];

function signToken(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verifyToken(token) {
    if (!token || !token.includes('.')) return null;

    const parts = token.split('.');
    const body = parts[0];
    const sig = parts[1];

    const expected = crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64url');
    if (sig !== expected) return null;

    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}

async function getUserFromRequest(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = verifyToken(token);

    if (!payload || !payload.id) return null;

    const { data, error } = await supabase
        .from('app_users')
        .select('id, login, full_name, role, driver_id')
        .eq('id', payload.id)
        .single();

    if (error) return null;
    return data;
}

function requireAuth(roles = []) {
    return async(req, res, next) => {
        const user = await getUserFromRequest(req);

        if (!user) {
            return res.status(401).json({ error: 'Нужна авторизация' });
        }

        if (roles.length && !roles.includes(user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        req.user = user;
        next();
    };
}

function publicUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        login: user.login,
        full_name: user.full_name,
        role: user.role,
        driver_id: user.driver_id
    };
}

function validateStatus(value, allowed, field) {
    if (!allowed.includes(value)) {
        throw new Error(`Некорректный ${field}: ${value}`);
    }
}

function orderNumber(id) {
    return `TB-${String(id).padStart(4, '0')}`;
}

const realtimeClients = new Set();

function broadcast(type, payload = {}) {
    const event = {
        type,
        payload,
        at: new Date().toISOString()
    };

    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of realtimeClients) {
        client.write(data);
    }
}

app.get('/', (_req, res) => {
    res.send('Backend работает 🚀');
});

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'taxi-backend',
        database: 'supabase'
    });
});

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (res.flushHeaders) res.flushHeaders();

    res.write(`data: ${JSON.stringify({
        type: 'connected',
        payload: { mode: 'supabase' },
        at: new Date().toISOString()
    })}\n\n`);

    realtimeClients.add(res);

    req.on('close', () => {
        realtimeClients.delete(res);
    });
});

setInterval(() => {
    broadcast('heartbeat', { clients: realtimeClients.size });
}, 25000);

async function loginHandler(req, res) {
    try {
        const login = String(req.body.login || '').trim().toLowerCase();
        const password = String(req.body.password || '').trim();

        if (!login || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        const { data: user, error } = await supabase
            .from('app_users')
            .select('id, login, password, full_name, role, driver_id')
            .eq('login', login)
            .single();

        if (error || !user || user.password !== password) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const token = signToken({
            id: user.id,
            role: user.role,
            driver_id: user.driver_id
        });

        res.json({
            token,
            user: publicUser(user),
            mode: 'supabase'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

app.post('/auth/login', loginHandler);
app.post('/auth/demo-login', loginHandler);

app.get('/me', requireAuth(), async(req, res) => {
    res.json({
        user: publicUser(req.user),
        mode: 'supabase'
    });
});

app.get('/orders', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        let query = supabase
            .from('orders')
            .select('*, drivers(id, full_name, phone, car, plate, status), clients(id, full_name, phone, note)')
            .order('created_at', { ascending: false });

        if (req.user.role === 'driver') {
            query = query.eq('driver_id', req.user.driver_id);
        }

        const { data, error } = await query;
        if (error) throw error;

        const result = data.map((order) => {
            return {
                ...order,
                driver: order.drivers || null,
                client: order.clients || null
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/orders', requireAuth(['admin', 'dispatcher']), async(req, res) => {
    try {
        const payload = {
            client_name: String(req.body.client_name || 'Без имени').trim(),
            pickup: String(req.body.pickup || '').trim(),
            final_point: String(req.body.final_point || '').trim(),
            reference_phone: String(req.body.reference_phone || '').trim(),
            payment_mode: String(req.body.payment_mode || 'Наличка').trim(),
            price: Number(req.body.price || 0),
            total_paid: Number(req.body.total_paid || 0),
            status: String(req.body.status || 'new').trim(),
            driver_id: req.body.driver_id ? Number(req.body.driver_id) : null,
            comment: String(req.body.comment || '').trim()
        };

        if (!payload.pickup || !payload.final_point) {
            return res.status(400).json({ error: 'Укажите адрес подачи и конечную точку' });
        }

        validateStatus(payload.status, ORDER_STATUSES, 'статус заказа');

        if (payload.driver_id && payload.status === 'new') {
            payload.status = 'car_assigned';
        }

        let clientId = null;

        if (payload.reference_phone) {
            const { data: existing, error: existingError } = await supabase
                .from('clients')
                .select('id')
                .eq('phone', payload.reference_phone)
                .maybeSingle();

            if (existingError) throw existingError;

            if (existing) {
                clientId = existing.id;
            } else {
                const { data: newClient, error: clientError } = await supabase
                    .from('clients')
                    .insert({
                        full_name: payload.client_name,
                        phone: payload.reference_phone
                    })
                    .select('id')
                    .single();

                if (clientError) throw clientError;
                clientId = newClient.id;
            }
        }

        const { data: inserted, error } = await supabase
            .from('orders')
            .insert({
                ...payload,
                client_id: clientId
            })
            .select('*, drivers(id, full_name, phone, car, plate, status), clients(id, full_name, phone, note)')
            .single();

        if (error) throw error;

        const order_number = orderNumber(inserted.id);

        const { data: updated, error: updateError } = await supabase
            .from('orders')
            .update({ order_number })
            .eq('id', inserted.id)
            .select('*, drivers(id, full_name, phone, car, plate, status), clients(id, full_name, phone, note)')
            .single();

        if (updateError) throw updateError;

        if (payload.driver_id) {
            await supabase
                .from('drivers')
                .update({ status: 'busy' })
                .eq('id', payload.driver_id);
        }

        const result = {
            ...updated,
            driver: updated.drivers || null,
            client: updated.clients || null
        };

        broadcast('order.created', result);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.patch('/orders/:id', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const id = Number(req.params.id);

        if (req.user.role === 'driver') {
            const { data: current, error: currentError } = await supabase
                .from('orders')
                .select('*')
                .eq('id', id)
                .single();

            if (currentError || !current) {
                return res.status(404).json({ error: 'Заказ не найден' });
            }

            if (Number(current.driver_id) !== Number(req.user.driver_id)) {
                return res.status(403).json({ error: 'Водитель может менять только свои заказы' });
            }

            const fields = Object.keys(req.body);
            if (fields.some((field) => field !== 'status')) {
                return res.status(403).json({ error: 'Водитель может менять только статус заказа' });
            }
        }

        const patch = {};

        if ('status' in req.body) {
            patch.status = String(req.body.status || '').trim();
            validateStatus(patch.status, ORDER_STATUSES, 'статус заказа');
        }

        if ('driver_id' in req.body) {
            patch.driver_id = req.body.driver_id ? Number(req.body.driver_id) : null;
            if (patch.driver_id && !patch.status) {
                patch.status = 'car_assigned';
            }
        }

        ['client_name', 'pickup', 'final_point', 'reference_phone', 'payment_mode', 'comment', 'cancel_reason'].forEach((field) => {
            if (field in req.body) {
                patch[field] = String(req.body[field] || '').trim();
            }
        });

        ['price', 'total_paid'].forEach((field) => {
            if (field in req.body) {
                patch[field] = Number(req.body[field] || 0);
            }
        });

        const { data, error } = await supabase
            .from('orders')
            .update(patch)
            .eq('id', id)
            .select('*, drivers(id, full_name, phone, car, plate, status), clients(id, full_name, phone, note)')
            .single();

        if (error) throw error;

        if (patch.driver_id) {
            await supabase
                .from('drivers')
                .update({ status: 'busy' })
                .eq('id', patch.driver_id);
        }

        if (['completed', 'cancelled'].includes(patch.status) && data.driver_id) {
            await supabase
                .from('drivers')
                .update({ status: 'free' })
                .eq('id', data.driver_id);
        }

        const result = {
            ...data,
            driver: data.drivers || null,
            client: data.clients || null
        };

        broadcast('order.updated', result);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/drivers/:id/orders', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const driverId = Number(req.params.id);

        if (req.user.role === 'driver' && Number(req.user.driver_id) !== driverId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }

        const { data, error } = await supabase
            .from('orders')
            .select('*, drivers(id, full_name, phone, car, plate, status), clients(id, full_name, phone, note)')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data.map((order) => ({
            ...order,
            driver: order.drivers || null,
            client: order.clients || null
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/clients/search', requireAuth(['admin', 'dispatcher']), async(req, res) => {
    try {
        const phone = String(req.query.phone || '').trim();

        if (!phone) {
            return res.json([]);
        }

        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .ilike('phone', `%${phone}%`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/clients', requireAuth(['admin', 'dispatcher']), async(_req, res) => {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/drivers', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        let query = supabase
            .from('drivers')
            .select('*')
            .order('created_at', { ascending: false });

        if (req.user.role === 'driver') {
            query = query.eq('id', req.user.driver_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/drivers/:id', requireAuth(['admin', 'dispatcher', 'driver']), async(req, res) => {
    try {
        const id = Number(req.params.id);

        if (req.user.role === 'driver' && Number(req.user.driver_id) !== id) {
            return res.status(403).json({ error: 'Водитель может менять только свой статус' });
        }

        const status = String(req.body.status || '').trim();
        validateStatus(status, DRIVER_STATUSES, 'статус водителя');

        const { data, error } = await supabase
            .from('drivers')
            .update({ status })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        broadcast('driver.updated', data);
        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
    console.log(`Taxi backend listening on port ${port}`);
});