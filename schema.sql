-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(50),
    role VARCHAR(20) CHECK (role IN ('admin', 'manager', 'staff')),
    hourly_wage INT DEFAULT 0
);

-- 근무 일정
CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    date DATE NOT NULL,
    start_time VARCHAR(10),
    end_time VARCHAR(10),
    type VARCHAR(20) DEFAULT 'work', -- work, off
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 일일 매출 (1루, 3루 구분)
CREATE TABLE IF NOT EXISTS daily_sales (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    store_type VARCHAR(10) CHECK (store_type IN ('base1', 'base3')),
    card INT DEFAULT 0,
    cash INT DEFAULT 0,
    delivery_app INT DEFAULT 0, -- 배달타자
    note TEXT,
    UNIQUE(date, store_type)
);

-- 일일 지출 (공통)
CREATE TABLE IF NOT EXISTS daily_expenses (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    gosen INT DEFAULT 0,    -- 고센유통
    hangang INT DEFAULT 0,  -- 한강유통
    etc INT DEFAULT 0,      -- 기타잡비
    note TEXT,
    UNIQUE(date)
);

-- 월 고정비 (1루, 3루 구분)
CREATE TABLE IF NOT EXISTS monthly_costs (
    id SERIAL PRIMARY KEY,
    year_month VARCHAR(7) NOT NULL, -- YYYY-MM
    store_type VARCHAR(10) CHECK (store_type IN ('base1', 'base3')),
    rent INT DEFAULT 0,           -- (예시) 월세 등 필요한 경우 사용
    internet INT DEFAULT 0,
    electricity INT DEFAULT 0,
    cleaning INT DEFAULT 0,
    card_fee INT DEFAULT 0,
    operation INT DEFAULT 0,
    caps INT DEFAULT 0,
    etc1 INT DEFAULT 0,
    etc2 INT DEFAULT 0,
    UNIQUE(year_month, store_type)
);

-- 로그
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actor VARCHAR(50),
    action VARCHAR(50),
    details TEXT
);