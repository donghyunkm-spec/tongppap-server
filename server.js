require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();

// ===== 프록시 신뢰 설정 (Railway용) =====
app.set('trust proxy', 1);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static('public'));

// ===== 세션 설정 수정 =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'tongppap_secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// ===== 세션 디버깅 미들웨어 =====
app.use((req, res, next) => {
    console.log('📍 Request:', req.method, req.path);
    console.log('👤 Session User:', req.session.user);
    next();
});

// ===== Middleware =====
const isAuth = (req, res, next) => {
    console.log('🔐 isAuth check:', req.session.user);
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Login required' });
    }
};

const isAdmin = (req, res, next) => {
    console.log('👑 isAdmin check:', req.session.user);
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin only' });
    }
};

const isManagerOrAdmin = (req, res, next) => {
    console.log('💼 isManagerOrAdmin check:', req.session.user);
    if (req.session.user && ['admin', 'manager'].includes(req.session.user.role)) {
        next();
    } else {
        res.status(403).json({ 
            success: false, 
            message: 'Manager or Admin only',
            debug: { user: req.session.user }
        });
    }
};

// ===== Auth APIs =====
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('🔑 Login attempt:', username);
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            console.log('❌ User not found:', username);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            console.log('❌ Password mismatch for:', username);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        req.session.user = { 
            id: user.id, 
            username: user.username, 
            name: user.name, 
            role: user.role 
        };
        
        console.log('✅ Login success:', req.session.user);
        
        // 세션 저장 강제 실행
        req.session.save((err) => {
            if (err) {
                console.error('❌ Session save error:', err);
                return res.status(500).json({ error: 'Session save failed' });
            }
            
            console.log('💾 Session saved successfully');
            
            pool.query(
                'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
                [user.name, 'LOGIN', username, `Role: ${user.role}`]
            ).catch(e => console.error('Audit log error:', e));
            
            res.json({ success: true, user: req.session.user });
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', (req, res) => {
    const userName = req.session.user?.name || 'Unknown';
    console.log('👋 Logout:', userName);
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    console.log('👤 /api/me called, session:', req.session.user);
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
    const { type, lat, lng } = req.body;
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

// ===== 직원 관리 API =====

// 직원 목록 조회
app.get('/api/staff/list', isAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, name, role, hourly_wage FROM users ORDER BY created_at DESC'
        );
        res.json({ success: true, staff: result.rows });
    } catch (e) {
        console.error('직원 목록 조회 실패:', e);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 직원 일괄 등록
app.post('/api/staff/register', isAdmin, async (req, res) => {
    const { staff } = req.body;
    
    if (!staff || !Array.isArray(staff) || staff.length === 0) {
        return res.status(400).json({ success: false, message: '직원 정보가 없습니다.' });
    }
    
    const registered = [];
    
    try {
        for (let person of staff) {
            // 랜덤 ID 생성 (이름 + 4자리 숫자)
            const namePrefix = person.name.replace(/\s/g, '').substring(0, 4);
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const username = `${namePrefix}${randomNum}`;
            
            // 랜덤 비밀번호 생성 (8자리 영숫자)
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let password = '';
            for (let i = 0; i < 8; i++) {
                password += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            // 비밀번호 해시화
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // DB에 사용자 생성
            const userResult = await pool.query(
                'INSERT INTO users (username, password, name, role, hourly_wage) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [username, hashedPassword, person.name, 'staff', 0]
            );
            
            const userId = userResult.rows[0].id;
            
            // 스케줄 생성 (앞으로 30일간)
            const today = new Date();
            for (let i = 0; i < 30; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(today.getDate() + i);
                
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayName = dayNames[checkDate.getDay()];
                
                if (person.workDays.includes(dayName)) {
                    const dateStr = checkDate.toISOString().split('T')[0];
                    const [startTime, endTime] = person.workTime.split('~');
                    
                    await pool.query(
                        `INSERT INTO schedules (user_id, date, start_time, end_time, type) 
                         VALUES ($1, $2, $3, $4, $5) 
                         ON CONFLICT (user_id, date) DO NOTHING`,
                        [userId, dateStr, startTime, endTime, 'work']
                    );
                }
            }
            
            // 감사 로그
            await pool.query(
                'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
                [req.session.user.name, '직원등록', person.name, `ID: ${username}`]
            );
            
            registered.push({
                name: person.name,
                username: username,
                password: password, // 평문 비밀번호 (최초 1회만 전달)
                workDays: person.workDays,
                workTime: person.workTime
            });
        }
        
        res.json({ success: true, registered });
        
    } catch (e) {
        console.error('직원 등록 실패:', e);
        res.status(500).json({ success: false, message: '등록 중 오류 발생' });
    }
});

// 시급 수정
app.put('/api/staff/wage', isAdmin, async (req, res) => {
    const { userId, wage } = req.body;
    
    try {
        await pool.query(
            'UPDATE users SET hourly_wage = $1 WHERE id = $2',
            [wage, userId]
        );
        
        const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = userResult.rows[0]?.name || '알 수 없음';
        
        await pool.query(
            'INSERT INTO audit_logs (actor, action, target, details) VALUES ($1, $2, $3, $4)',
            [req.session.user.name, '시급수정', userName, `${wage}원`]
        );
        
        res.json({ success: true });
    } catch (e) {
        console.error('시급 수정 실패:', e);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Tongppap Server running on port ${PORT}`));