const express = require('express');
const path = require('path');

const app = express();
const session          = require('express-session');
const schedulingRoutes = require('./scheduling-routes');

const PORT = process.env.PORT || 4000;

function setNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

app.get(['/domino', '/dominoes', '/dominoes.html'], (req, res) => {
    setNoCacheHeaders(res);
    res.sendFile(path.join(__dirname, 'domino.html'));
});

app.get('/domino.css', (req, res) => {
    setNoCacheHeaders(res);
    res.sendFile(path.join(__dirname, 'domino.css'));
});

app.get('/domino.js', (req, res) => {
    setNoCacheHeaders(res);
    res.sendFile(path.join(__dirname, 'domino.js'));
});

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'sched-dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 }, // 8 h
}));
app.use('/api/schedule', schedulingRoutes);
const FETCH_TIMEOUT_MS = 10000;

function isPrivateOrLocalHostname(hostname) {
    if (!hostname) return true;
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower === '::1' || lower.endsWith('.local')) return true;

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) {
        const parts = lower.split('.').map(Number);
        if (parts.some(part => Number.isNaN(part) || part < 0 || part > 255)) return true;
        return (
            parts[0] === 10
            || parts[0] === 127
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && parts[1] === 168)
            || (parts[0] === 169 && parts[1] === 254)
        );
    }

    return false;
}

function normalizePublicUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }
    try {
        const parsed = new URL(normalized);
        if (!/^https?:$/i.test(parsed.protocol)) return null;
        if (isPrivateOrLocalHostname(parsed.hostname)) return null;
        return parsed.toString();
    } catch (error) {
        return null;
    }
}

app.get('/proxy/fetch', async (req, res) => {
    const targetUrl = normalizePublicUrl(req.query.url);
    if (!targetUrl) {
        return res.status(400).json({ error: 'Invalid or non-public URL' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal
        });

        if (!response.ok) {
            return res.status(502).json({ error: `Upstream request failed with status ${response.status}` });
        }

        const text = await response.text();
        return res.type('text/plain; charset=utf-8').send(text);
    } catch (error) {
        return res.status(502).json({ error: 'Failed to fetch remote content' });
    } finally {
        clearTimeout(timeoutId);
    }
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
