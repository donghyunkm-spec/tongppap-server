-- ===== 기존 테이블 삭제 (순서 중요: 외래키 참조 역순) =====
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS monthly_costs CASCADE;
DROP TABLE IF EXISTS daily_expenses CASCADE;
DROP TABLE IF EXISTS daily_sales CASCADE;
DROP TABLE IF EXISTS clock_records CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ===== 인덱스 삭제 (테이블 삭제 시 자동 삭제되지만 명시) =====
DROP INDEX IF EXISTS idx_schedules_date;
DROP INDEX IF EXISTS idx_clock_records_date;
DROP INDEX IF EXISTS idx_daily_sales_date;
DROP INDEX IF EXISTS idx_daily_expenses_date;
DROP INDEX IF EXISTS idx_monthly_costs_month;
DROP INDEX IF EXISTS idx_audit_logs_timestamp;

-- ===== 테이블 생성 =====

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(50),
    role VARCHAR(20) CHECK (role IN ('admin', 'manager', 'staff')),
    hourly_wage INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work schedules (for manager/admin to set staff schedules)
CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    type VARCHAR(20) DEFAULT 'work',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Clock in/out records (for staff to record actual work time)
CREATE TABLE clock_records (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIME,
    clock_out TIME,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Daily sales (base1, base3)
CREATE TABLE daily_sales (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    store_type VARCHAR(10) CHECK (store_type IN ('base1', 'base3')),
    card INT DEFAULT 0,
    cash INT DEFAULT 0,
    delivery_app INT DEFAULT 0,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, store_type)
);

-- Daily expenses (shared)
CREATE TABLE daily_expenses (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    gosen INT DEFAULT 0,
    hangang INT DEFAULT 0,
    etc INT DEFAULT 0,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
);

-- Monthly fixed costs (base1, base3 separate)
CREATE TABLE monthly_costs (
    id SERIAL PRIMARY KEY,
    year_month VARCHAR(7) NOT NULL,
    store_type VARCHAR(10) CHECK (store_type IN ('base1', 'base3')),
    water INT DEFAULT 0,
    internet INT DEFAULT 0,
    electricity INT DEFAULT 0,
    cleaning INT DEFAULT 0,
    card_fee INT DEFAULT 0,
    operation INT DEFAULT 0,
    caps INT DEFAULT 0,
    etc1 INT DEFAULT 0,
    etc2 INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year_month, store_type)
);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actor VARCHAR(50),
    action VARCHAR(50),
    target VARCHAR(100),
    details TEXT
);

-- ===== 인덱스 생성 =====
CREATE INDEX idx_schedules_date ON schedules(date);
CREATE INDEX idx_clock_records_date ON clock_records(date);
CREATE INDEX idx_daily_sales_date ON daily_sales(date);
CREATE INDEX idx_daily_expenses_date ON daily_expenses(date);
CREATE INDEX idx_monthly_costs_month ON monthly_costs(year_month);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- ===== 완료 메시지 =====
DO $$
BEGIN
    RAISE NOTICE '✅ 통빵 관리 시스템 DB 초기화 완료!';
    RAISE NOTICE '📌 다음 단계: 테스트 계정을 생성하세요.';
END $$;