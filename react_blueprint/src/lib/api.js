const API_BASE =
    import.meta.env.VITE_API_BASE || 'https://taxi-backend-21nq.onrender.com';

const TOKEN_KEY = 'taxi_bonus_demo_token';

export function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
    const token = getAuthToken();

    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error((data && data.error) || 'Ошибка API');
    }

    return data;
}

/* ================= AUTH ================= */

export async function login(login, password) {
    const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password })
    });

    setAuthToken(data.token);
    return data;
}

export function getMe() {
    return request('/me');
}

export function logout() {
    setAuthToken('');
}

/* ================= ORDERS ================= */

export function getOrders() {
    return request('/orders');
}

export function createOrder(payload) {
    return request('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export function updateOrder(id, payload) {
    return request(`/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
}

/* ================= CLIENTS ================= */

export function getClients() {
    return request('/clients');
}

export function searchClients(phone) {
    return request(`/clients/search?phone=${encodeURIComponent(phone)}`);
}

/* ================= DRIVERS ================= */

export function getDrivers() {
    return request('/drivers');
}

export function updateDriver(id, payload) {
    return request(`/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
}

/* ================= REALTIME ================= */

export function subscribeRealtime(onMessage, onError) {
    if (!window.EventSource) return () => {};

    const source = new EventSource(`${API_BASE}/events`);

    source.onmessage = (event) => {
        try {
            onMessage(JSON.parse(event.data));
        } catch (error) {
            if (onError) onError(error);
        }
    };

    source.onerror = () => {
        if (onError) onError(new Error('Realtime переподключается'));
    };

    return () => source.close();
}