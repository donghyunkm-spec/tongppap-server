require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24시간
}));

// 미들웨어: 로그인 체크
const isAuthenticated = (req, res, next) => {
    if (req.session.user) next();
    else res.status(401).json({ success: false, message: '로그인 필요' });
};

// 미들웨어: 관리자 체크
const isAdminOrManager = (req, res, next) => {
    if (req.session.user && ['admin', 'manager'].includes(req.session.user.role)) next();
    else res.status(403).json({ success: false, message: '권한 없음' });
};

// --- [API] 인증 ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
                return res.json({ success: true, user: req.session.user });
            }
        }
        res.status(401).json({ success: false, message: 'ID 또는 비밀번호 불일치' });
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
app.get('/api/schedules', isAuthenticated, async (req, res) => {
    try {
        let query = `SELECT s.*, u.name, u.role FROM schedules s JOIN users u ON s.user_id = u.id`;
        // 알바는 자기 것만
        if (req.session.user.role === 'staff') {
            query += ` WHERE s.user_id = ${req.session.user.id}`;
        }
        const result = await pool.query(query);
        res.json({ data: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- [API] 매입/매출 (관리자 전용) ---
app.get('/api/accounting/daily', isAdminOrManager, async (req, res) => {
    const { date } = req.query;
    try {
        // 1루, 3루 매출 + 공통 지출 조회
        const sales = await pool.query("SELECT * FROM daily_sales WHERE date = $1", [date]);
        const expenses = await pool.query("SELECT * FROM daily_expenses WHERE date = $1", [date]);
        
        let base1 = sales.rows.find(r => r.store_type === 'base1') || {};
        let base3 = sales.rows.find(r => r.store_type === 'base3') || {};
        let exp = expenses.rows[0] || {};

        res.json({ base1, base3, expense: exp });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/accounting/daily', isAdminOrManager, async (req, res) => {
    const { date, base1, base3, expense } = req.body; // base1: {card, cash, delivery}, expense: {gosen...}
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. 매출 저장 (Upsert)
        const upsertSale = `
            INSERT INTO daily_sales (date, store_type, card, cash, delivery_app)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (date, store_type) 
            DO UPDATE SET card=$3, cash=$4, delivery_app=$5`;
        
        await client.query(upsertSale, [date, 'base1', base1.card || 0, base1.cash || 0, base1.delivery || 0]);
        await client.query(upsertSale, [date, 'base3', base3.card || 0, base3.cash || 0, base3.delivery || 0]);

        // 2. 지출 저장 (Upsert)
        const upsertExp = `
            INSERT INTO daily_expenses (date, gosen, hangang, etc, note)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (date)
            DO UPDATE SET gosen=$2, hangang=$3, etc=$4, note=$5`;
        
        await client.query(upsertExp, [date, expense.gosen||0, expense.hangang||0, expense.etc||0, expense.note||'']);
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// --- [API] 월간 고정비 ---
app.get('/api/accounting/monthly', isAdminOrManager, async (req, res) => {
    const { month } = req.query; // YYYY-MM
    try {
        const result = await pool.query("SELECT * FROM monthly_costs WHERE year_month = $1", [month]);
        let base1 = result.rows.find(r => r.store_type === 'base1') || {};
        let base3 = result.rows.find(r => r.store_type === 'base3') || {};
        res.json({ base1, base3 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/accounting/monthly', isAdminOrManager, async (req, res) => {
    const { month, base1, base3 } = req.body;
    const upsert = `
        INSERT INTO monthly_costs (year_month, store_type, internet, electricity, cleaning, card_fee, operation, caps, etc1, etc2)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (year_month, store_type)
        DO UPDATE SET internet=$3, electricity=$4, cleaning=$5, card_fee=$6, operation=$7, caps=$8, etc1=$9, etc2=$10`;

    try {
        await pool.query(upsert, [month, 'base1', base1.internet, base1.electricity, base1.cleaning, base1.card_fee, base1.operation, base1.caps, base1.etc1, base1.etc2]);
        await pool.query(upsert, [month, 'base3', base3.internet, base3.electricity, base3.cleaning, base3.card_fee, base3.operation, base3.caps, base3.etc1, base3.etc2]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- [API] 분석 (순익 계산) ---
app.get('/api/analysis', isAdminOrManager, async (req, res) => {
    const { month } = req.query; // YYYY-MM
    try {
        // 1. 해당 월 전체 매출 합계
        const salesRes = await pool.query(`
            SELECT store_type, SUM(card) as card, SUM(cash) as cash, SUM(delivery_app) as delivery
            FROM daily_sales WHERE to_char(date, 'YYYY-MM') = $1 GROUP BY store_type
        `, [month]);

        // 2. 해당 월 전체 공통 지출 합계
        const expRes = await pool.query(`
            SELECT SUM(gosen) as gosen, SUM(hangang) as hangang, SUM(etc) as etc
            FROM daily_expenses WHERE to_char(date, 'YYYY-MM') = $1
        `, [month]);

        // 3. 고정비 조회
        const fixedRes = await pool.query(`SELECT * FROM monthly_costs WHERE year_month = $1`, [month]);

        // 데이터 정리
        const s1 = salesRes.rows.find(r => r.store_type === 'base1') || { card:0, cash:0, delivery:0 };
        const s3 = salesRes.rows.find(r => r.store_type === 'base3') || { card:0, cash:0, delivery:0 };
        
        // 숫자 변환 (Postgres SUM은 문자열로 올 수 있음)
        const parse = (val) => parseInt(val) || 0;
        
        const sales1 = parse(s1.card) + parse(s1.cash) + parse(s1.delivery);
        const sales3 = parse(s3.card) + parse(s3.cash) + parse(s3.delivery);
        const totalSales = sales1 + sales3;

        // 공통비용
        const commonExp = parse(expRes.rows[0]?.gosen) + parse(expRes.rows[0]?.hangang) + parse(expRes.rows[0]?.etc);
        
        // 비율 계산 (매출 기준)
        const ratio1 = totalSales > 0 ? sales1 / totalSales : 0;
        const ratio3 = totalSales > 0 ? sales3 / totalSales : 0;

        // 고정비 계산 (자동 계산 로직 포함)
        const calcFixed = (fixedRow, salesObj, totalS) => {
            if (!fixedRow) fixedRow = {};
            const manual = parse(fixedRow.internet) + parse(fixedRow.electricity) + parse(fixedRow.cleaning) +
                           parse(fixedRow.card_fee) + parse(fixedRow.operation) + parse(fixedRow.caps) +
                           parse(fixedRow.etc1) + parse(fixedRow.etc2);
            
            // 자동 계산: 수수료 30%, 배달수수료 4.95%
            const commission = Math.floor(totalS * 0.30);
            const delivFee = Math.floor(parse(salesObj.delivery) * 0.0495);
            
            return {
                manual,
                commission,
                delivFee,
                total: manual + commission + delivFee,
                details: fixedRow
            };
        };

        const f1 = fixedRes.rows.find(r => r.store_type === 'base1');
        const f3 = fixedRes.rows.find(r => r.store_type === 'base3');

        const fixed1 = calcFixed(f1, s1, sales1);
        const fixed3 = calcFixed(f3, s3, sales3);

        res.json({
            base1: { sales: sales1, variableCost: Math.floor(commonExp * ratio1), fixedCost: fixed1, profit: sales1 - Math.floor(commonExp * ratio1) - fixed1.total },
            base3: { sales: sales3, variableCost: Math.floor(commonExp * ratio3), fixedCost: fixed3, profit: sales3 - Math.floor(commonExp * ratio3) - fixed3.total },
            combined: { 
                sales: totalSales, 
                cost: commonExp + fixed1.total + fixed3.total, 
                profit: totalSales - (commonExp + fixed1.total + fixed3.total) 
            }
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// [임시 코드] 서버 시작 시 관리자 & 매니저 계정 자동 생성
(async () => {
    // 1. 사장님 (admin) 계정 생성
    const adminHash = await bcrypt.hash("25@fndksvnem", 10);
    try {
        await pool.query(
            "INSERT INTO users (username, password, name, role) VALUES ('admin', $1, '사장님', 'admin')", 
            [adminHash]
        );
        console.log("✅ 사장님(admin) 계정 생성 완료!");
    } catch(e) {
        console.log("ℹ️ 사장님 계정이 이미 존재합니다.");
    }

    // 2. 매니저 (manager) 계정 생성
    // ID: manager / PW: tongbob1234!
    const managerHash = await bcrypt.hash("tongbob1234!", 10);
    try {
        await pool.query(
            "INSERT INTO users (username, password, name, role) VALUES ('manager', $1, '매니저', 'manager')", 
            [managerHash]
        );
        console.log("✅ 매니저(manager) 계정 생성 완료!");
    } catch(e) {
        console.log("ℹ️ 매니저 계정이 이미 존재합니다.");
    }
})();