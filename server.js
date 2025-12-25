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
    secret: process.env.SESSION_SECRET || 'tongppap_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24시간
}));

// --- 미들웨어 ---
const isAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.status(401).json({ success: false, message: '로그인 필요' });
};

const isAdmin = (req, res, next) => { // 사장님 전용
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).json({ success: false, message: '사장님만 접근 가능합니다.' });
};

const isManagerOrAdmin = (req, res, next) => { // 사장+점장
    if (req.session.user && ['admin', 'manager'].includes(req.session.user.role)) next();
    else res.status(403).json({ success: false, message: '권한이 없습니다.' });
};

// --- [API] 인증 ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, message: '존재하지 않는 ID' });
        
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: '비밀번호 불일치' });

        req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
        res.json({ success: true, user: req.session.user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    res.json({ user: req.session.user || null });
});

// --- [API] 근무 관리 ---
// 알바는 본인 것만, 관리자는 전체 조회
app.get('/api/schedules', isAuth, async (req, res) => {
    const { start, end } = req.query; // 기간 조회 (캘린더용)
    try {
        let query = `SELECT s.*, u.name, u.role FROM schedules s JOIN users u ON s.user_id = u.id WHERE s.date BETWEEN $1 AND $2`;
        const params = [start, end];

        // 알바생은 자기 스케줄만 보임
        if (req.session.user.role === 'staff') {
            query += ` AND s.user_id = $3`;
            params.push(req.session.user.id);
        }
        
        const result = await pool.query(query + ' ORDER BY s.date, s.start_time', params);
        res.json({ data: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 일정 등록/수정 (관리자 이상)
app.post('/api/schedules', isManagerOrAdmin, async (req, res) => {
    const { user_id, date, start_time, end_time, type } = req.body;
    try {
        await pool.query(
            `INSERT INTO schedules (user_id, date, start_time, end_time, type) VALUES ($1, $2, $3, $4, $5)`,
            [user_id, date, start_time, end_time, type]
        );
        // 로그 기록
        await pool.query(`INSERT INTO audit_logs (actor, action, details) VALUES ($1, $2, $3)`, 
            [req.session.user.name, '일정등록', `${date} 유저ID:${user_id}`]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- [API] 직원 관리 (사장님 전용) ---
app.get('/api/users', isAdmin, async (req, res) => {
    const result = await pool.query("SELECT id, username, name, role, hourly_wage FROM users ORDER BY name");
    res.json({ data: result.rows });
});
// (직원 등록/수정/삭제 API는 생략하되 필요시 추가)

// --- [API] 매입/매출 (관리자 이상) ---
app.get('/api/accounting/daily', isManagerOrAdmin, async (req, res) => {
    const { date } = req.query;
    try {
        const sales = await pool.query("SELECT * FROM daily_sales WHERE date = $1", [date]);
        const expense = await pool.query("SELECT * FROM daily_expenses WHERE date = $1", [date]);
        
        res.json({
            base1: sales.rows.find(r => r.store_type === 'base1') || {},
            base3: sales.rows.find(r => r.store_type === 'base3') || {},
            expense: expense.rows[0] || {}
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/accounting/daily', isManagerOrAdmin, async (req, res) => {
    const { date, base1, base3, expense } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 매출 저장 (1루, 3루)
        const saveSale = async (type, data) => {
            await client.query(`
                INSERT INTO daily_sales (date, store_type, card, cash, delivery_app)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (date, store_type) DO UPDATE SET card=$3, cash=$4, delivery_app=$5`,
                [date, type, data.card||0, data.cash||0, data.delivery||0]
            );
        };
        await saveSale('base1', base1);
        await saveSale('base3', base3);

        // 지출 저장
        await client.query(`
            INSERT INTO daily_expenses (date, gosen, hangang, etc, note)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (date) DO UPDATE SET gosen=$2, hangang=$3, etc=$4, note=$5`,
            [date, expense.gosen||0, expense.hangang||0, expense.etc||0, expense.note||'']
        );

        await client.query(`INSERT INTO audit_logs (actor, action, details) VALUES ($1, $2, $3)`,
            [req.session.user.name, '매출입력', `${date} 매출 저장`]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

// --- [API] 월 고정비 (사장님 전용) ---
app.get('/api/accounting/monthly', isAdmin, async (req, res) => {
    const { month } = req.query;
    const result = await pool.query("SELECT * FROM monthly_costs WHERE year_month = $1", [month]);
    res.json({
        base1: result.rows.find(r => r.store_type === 'base1') || {},
        base3: result.rows.find(r => r.store_type === 'base3') || {}
    });
});

app.post('/api/accounting/monthly', isAdmin, async (req, res) => {
    const { month, base1, base3 } = req.body;
    // (Upsert 로직은 생략 - 위와 유사함. water 컬럼 등 3루 전용 필드 주의)
    const upsert = (type, d) => pool.query(`
        INSERT INTO monthly_costs (year_month, store_type, internet, electricity, cleaning, card_fee, operation, caps, water, etc1, etc2)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (year_month, store_type) 
        DO UPDATE SET internet=$3, electricity=$4, cleaning=$5, card_fee=$6, operation=$7, caps=$8, water=$9, etc1=$10, etc2=$11`,
        [month, type, d.internet, d.electricity, d.cleaning, d.card_fee, d.operation, d.caps, d.water||0, d.etc1, d.etc2]
    );
    try {
        await Promise.all([upsert('base1', base1), upsert('base3', base3)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- [API] 손익 분석 (사장님 전용) ---
app.get('/api/analysis', isAdmin, async (req, res) => {
    const { month } = req.query; // YYYY-MM
    try {
        // 1. 월 매출 합계
        const salesRes = await pool.query(`
            SELECT store_type, SUM(card) as card, SUM(cash) as cash, SUM(delivery_app) as delivery
            FROM daily_sales WHERE to_char(date, 'YYYY-MM') = $1 GROUP BY store_type
        `, [month]);

        // 2. 월 지출 합계
        const expRes = await pool.query(`
            SELECT SUM(gosen) as gosen, SUM(hangang) as hangang, SUM(etc) as etc
            FROM daily_expenses WHERE to_char(date, 'YYYY-MM') = $1
        `, [month]);

        // 3. 고정비
        const fixRes = await pool.query("SELECT * FROM monthly_costs WHERE year_month = $1", [month]);

        // --- 계산 로직 ---
        const s1 = salesRes.rows.find(r => r.store_type === 'base1') || { card:0, cash:0, delivery:0 };
        const s3 = salesRes.rows.find(r => r.store_type === 'base3') || { card:0, cash:0, delivery:0 };
        
        const parse = n => parseInt(n) || 0;
        const sumSales = (s) => parse(s.card) + parse(s.cash) + parse(s.delivery);
        
        const totalSales1 = sumSales(s1);
        const totalSales3 = sumSales(s3);
        const grandTotal = totalSales1 + totalSales3;

        // 공통 변동비 (비율 배분)
        const commonVarCost = parse(expRes.rows[0]?.gosen) + parse(expRes.rows[0]?.hangang) + parse(expRes.rows[0]?.etc);
        const ratio1 = grandTotal > 0 ? totalSales1 / grandTotal : 0;
        const ratio3 = grandTotal > 0 ? totalSales3 / grandTotal : 0;

        const varCost1 = Math.floor(commonVarCost * ratio1);
        const varCost3 = Math.floor(commonVarCost * ratio3);

        // 고정비 + 수수료 계산 함수
        const calcFixed = (fRow, sales, delivSales) => {
            const manual = parse(fRow?.internet) + parse(fRow?.electricity) + parse(fRow?.cleaning) + 
                           parse(fRow?.card_fee) + parse(fRow?.operation) + parse(fRow?.caps) + 
                           parse(fRow?.water) + parse(fRow?.etc1) + parse(fRow?.etc2);
            
            // **자동 계산 항목**
            const commission = Math.floor(sales * 0.30); // 총매출의 30%
            const delivFee = Math.floor(delivSales * 0.0495); // 배달매출의 4.95%
            
            return { manual, commission, delivFee, total: manual + commission + delivFee };
        };

        const f1 = fixRes.rows.find(r => r.store_type === 'base1');
        const f3 = fixRes.rows.find(r => r.store_type === 'base3');

        const fix1 = calcFixed(f1, totalSales1, parse(s1.delivery));
        const fix3 = calcFixed(f3, totalSales3, parse(s3.delivery));

        res.json({
            base1: { sales: totalSales1, variable: varCost1, fixed: fix1, profit: totalSales1 - varCost1 - fix1.total },
            base3: { sales: totalSales3, variable: varCost3, fixed: fix3, profit: totalSales3 - varCost3 - fix3.total },
            grand: { 
                sales: grandTotal, 
                cost: commonVarCost + fix1.total + fix3.total,
                profit: grandTotal - (commonVarCost + fix1.total + fix3.total)
            }
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tongppap Server running on port ${PORT}`));