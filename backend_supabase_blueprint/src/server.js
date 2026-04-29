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

/* ================= SUPABASE ================= */

const hasSupabase = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

const supabase = hasSupabase ?
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) :
    null;

/* ================= AUTH ================= */

function requireAuth(roles = []) {
    return (req, res, next) => {
        // В проде просто пропускаем (потом добавим JWT)
        next();
    };
}

/* ================= REALTIME ================= */

const realtimeClients = new Set();

function broadcast(type, payload = {}) {
    const event = { type, payload, at: new Date().toISOString() };
    const data = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of realtimeClients) {
        client.write(data);
    }
}

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (res.flushHeaders) res.flushHeaders();

    res.write(`data: ${JSON.stringify({
        type: 'connected',
        at: new Date().toISOString()
    })}\n\n`);

    realtimeClients.add(res);

    req.on('close', () => {
        realtimeClients.delete(res);
    });
});

setInterval(() => {
    broadcast('heartbeat');
}, 25000);

/* ================= ORDERS ================= */

app.get('/orders', async(req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/orders', async(req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .insert(req.body)
            .select()
            .single();

        if (error) throw error;

        broadcast('order.created', data);

        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.patch('/orders/:id', async(req, res) => {
    try {
        const id = Number(req.params.id);

        const { data, error } = await supabase
            .from('orders')
            .update(req.body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        broadcast('order.updated', data);

        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/* ================= DRIVERS ================= */

app.get('/drivers', async(req, res) => {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('*');

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/drivers/:id', async(req, res) => {
    try {
        const id = Number(req.params.id);

        const { data, error } = await supabase
            .from('drivers')
            .update(req.body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        broadcast('driver.updated', data);

        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/* ================= HEALTH ================= */

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

/* ================= START ================= */

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
    console.log(`Server started on ${port}`);
});