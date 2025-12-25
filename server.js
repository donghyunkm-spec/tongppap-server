require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'tongppap_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// ===== Middleware =====
const isAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.status(401).json({ success: false, message: 'Login required' });
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).json({ success: false, message: 'Admin only' });
};

const isManagerOrAdmin = (req, res, next) => {
    if (req.session.user && ['admin', 'manager'].includes(req.session.user.role)) next();
    else res.status(403).json({ success: false, message: 'Manager or Admin only' });
};

// ===== Auth APIs =====
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        req.session.user = { 
            id: user.id, 
            username: user.username, 
            name: user.name, 
            role: user.role 
        };
        
        await pool.query(
            'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
            [user.name, 'LOGIN', username, `Role: ${user.role}`]
        );
        
        res.json({ success: true, user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', (req, res) => {
    const userName = req.session.user?.name || 'Unknown';
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    res.json({ user: req.session.user || null });
});

// ===== Schedule APIs =====
app.get('/api/schedules', isAuth, async (req, res) => {
    const { start, end } = req.query;
    try {
        let query = `
            SELECT s.*, u.name, u.role 
            FROM schedules s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.date BETWEEN $1 AND $2
        `;
        const params = [start, end];

        if (req.session.user.role === 'staff') {
            query += ` AND s.user_id = $3`;
            params.push(req.session.user.id);
        }
        
        const result = await pool.query(query + ' ORDER BY s.date, s.start_time', params);
        res.json({ data: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/schedules', isManagerOrAdmin, async (req, res) => {
    const { user_id, date, start_time, end_time, type } = req.body;
    try {
        await pool.query(
            `INSERT INTO schedules (user_id, date, start_time, end_time, type) 
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, date) DO UPDATE 
             SET start_time=$3, end_time=$4, type=$5`,
            [user_id, date, start_time, end_time, type || 'work']
        );
        
        await pool.query(
            'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
            [req.session.user.name, 'SCHEDULE_ADD', `User ID: ${user_id}`, `Date: ${date}, Time: ${start_time}-${end_time}`]
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', isManagerOrAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
        await pool.query(
            'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
            [req.session.user.name, 'SCHEDULE_DELETE', `Schedule ID: ${req.params.id}`, '']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Clock In/Out APIs (for staff) =====
app.post('/api/clock', isAuth, async (req, res) => {
    const { type, lat, lng } = req.body; // type: 'in' or 'out'
    const today = new Date().toISOString().split('T')[0];
    
    try {
        if (type === 'in') {
            await pool.query(
                `INSERT INTO clock_records (user_id, date, clock_in, location_lat, location_lng)
                 VALUES ($1, $2, CURRENT_TIME, $3, $4)
                 ON CONFLICT (user_id, date) DO UPDATE SET clock_in = CURRENT_TIME`,
                [req.session.user.id, today, lat, lng]
            );
        } else {
            await pool.query(
                `UPDATE clock_records SET clock_out = CURRENT_TIME 
                 WHERE user_id = $1 AND date = $2`,
                [req.session.user.id, today]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== User Management (Admin only) =====
app.get('/api/users', isAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, name, role, hourly_wage FROM users ORDER BY name'
        );
        res.json({ data: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', isAdmin, async (req, res) => {
    const { hourly_wage } = req.body;
    try {
        await pool.query(
            'UPDATE users SET hourly_wage = $1 WHERE id = $2',
            [hourly_wage, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Accounting APIs =====
app.get('/api/accounting/daily', isManagerOrAdmin, async (req, res) => {
    const { date } = req.query;
    try {
        const sales = await pool.query(
            'SELECT * FROM daily_sales WHERE date = $1', 
            [date]
        );
        const expense = await pool.query(
            'SELECT * FROM daily_expenses WHERE date = $1', 
            [date]
        );
        
        res.json({
            base1: sales.rows.find(r => r.store_type === 'base1') || {},
            base3: sales.rows.find(r => r.store_type === 'base3') || {},
            expense: expense.rows[0] || {}
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/accounting/daily', isManagerOrAdmin, async (req, res) => {
    const { date, base1, base3, expense } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        const upsertSale = async (type, data) => {
            await client.query(
                `INSERT INTO daily_sales (date, store_type, card, cash, delivery_app, note)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (date, store_type) 
                 DO UPDATE SET card=$3, cash=$4, delivery_app=$5, note=$6`,
                [date, type, data.card || 0, data.cash || 0, data.delivery || 0, data.note || '']
            );
        };

        await upsertSale('base1', base1);
        await upsertSale('base3', base3);

        await client.query(
            `INSERT INTO daily_expenses (date, gosen, hangang, etc, note)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (date) 
             DO UPDATE SET gosen=$2, hangang=$3, etc=$4, note=$5`,
            [date, expense.gosen || 0, expense.hangang || 0, expense.etc || 0, expense.note || '']
        );

        await client.query(
            'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
            [req.session.user.name, 'SALES_INPUT', date, `Base1+Base3 sales recorded`]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/accounting/monthly', isAdmin, async (req, res) => {
    const { month } = req.query;
    try {
        const result = await pool.query(
            'SELECT * FROM monthly_costs WHERE year_month = $1',
            [month]
        );
        res.json({
            base1: result.rows.find(r => r.store_type === 'base1') || {},
            base3: result.rows.find(r => r.store_type === 'base3') || {}
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/accounting/monthly', isAdmin, async (req, res) => {
    const { month, base1, base3 } = req.body;
    
    const upsert = (type, d) => pool.query(
        `INSERT INTO monthly_costs 
         (year_month, store_type, water, internet, electricity, cleaning, card_fee, operation, caps, etc1, etc2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (year_month, store_type) 
         DO UPDATE SET water=$3, internet=$4, electricity=$5, cleaning=$6, 
                       card_fee=$7, operation=$8, caps=$9, etc1=$10, etc2=$11`,
        [month, type, d.water || 0, d.internet || 0, d.electricity || 0, d.cleaning || 0,
         d.card_fee || 0, d.operation || 0, d.caps || 0, d.etc1 || 0, d.etc2 || 0]
    );
    
    try {
        await Promise.all([upsert('base1', base1), upsert('base3', base3)]);
        
        await pool.query(
            'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
            [req.session.user.name, 'FIXED_COST', month, 'Monthly costs updated']
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Analysis API =====
app.get('/api/analysis', isAdmin, async (req, res) => {
    const { month } = req.query;
    
    try {
        const salesRes = await pool.query(
            `SELECT store_type, 
                    SUM(card) as card, 
                    SUM(cash) as cash, 
                    SUM(delivery_app) as delivery
             FROM daily_sales 
             WHERE to_char(date, 'YYYY-MM') = $1 
             GROUP BY store_type`,
            [month]
        );

        const expRes = await pool.query(
            `SELECT SUM(gosen) as gosen, 
                    SUM(hangang) as hangang, 
                    SUM(etc) as etc
             FROM daily_expenses 
             WHERE to_char(date, 'YYYY-MM') = $1`,
            [month]
        );

        const fixRes = await pool.query(
            'SELECT * FROM monthly_costs WHERE year_month = $1',
            [month]
        );

        const s1 = salesRes.rows.find(r => r.store_type === 'base1') || { card: 0, cash: 0, delivery: 0 };
        const s3 = salesRes.rows.find(r => r.store_type === 'base3') || { card: 0, cash: 0, delivery: 0 };
        
        const parse = n => parseInt(n) || 0;
        const sumSales = (s) => parse(s.card) + parse(s.cash) + parse(s.delivery);
        
        const totalSales1 = sumSales(s1);
        const totalSales3 = sumSales(s3);
        const grandTotal = totalSales1 + totalSales3;

        const commonVarCost = parse(expRes.rows[0]?.gosen) + 
                             parse(expRes.rows[0]?.hangang) + 
                             parse(expRes.rows[0]?.etc);
        
        const ratio1 = grandTotal > 0 ? totalSales1 / grandTotal : 0;
        const ratio3 = grandTotal > 0 ? totalSales3 / grandTotal : 0;

        const varCost1 = Math.floor(commonVarCost * ratio1);
        const varCost3 = Math.floor(commonVarCost * ratio3);

        const calcFixed = (fRow, sales, delivSales) => {
            const manual = parse(fRow?.internet) + parse(fRow?.electricity) + 
                          parse(fRow?.cleaning) + parse(fRow?.card_fee) + 
                          parse(fRow?.operation) + parse(fRow?.caps) + 
                          parse(fRow?.water) + parse(fRow?.etc1) + parse(fRow?.etc2);
            
            const commission = Math.floor(sales * 0.30);
            const delivFee = Math.floor(delivSales * 0.0495);
            
            return { manual, commission, delivFee, total: manual + commission + delivFee };
        };

        const f1 = fixRes.rows.find(r => r.store_type === 'base1');
        const f3 = fixRes.rows.find(r => r.store_type === 'base3');

        const fix1 = calcFixed(f1, totalSales1, parse(s1.delivery));
        const fix3 = calcFixed(f3, totalSales3, parse(s3.delivery));

        res.json({
            base1: { 
                sales: totalSales1, 
                variable: varCost1, 
                fixed: fix1, 
                profit: totalSales1 - varCost1 - fix1.total 
            },
            base3: { 
                sales: totalSales3, 
                variable: varCost3, 
                fixed: fix3, 
                profit: totalSales3 - varCost3 - fix3.total 
            },
            grand: { 
                sales: grandTotal, 
                cost: commonVarCost + fix1.total + fix3.total,
                profit: grandTotal - (commonVarCost + fix1.total + fix3.total)
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tongppap Server running on port ${PORT}`));