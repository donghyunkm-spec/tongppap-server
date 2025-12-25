let currentUser = null;
let currentTab = 'schedule';
let calendarDate = new Date(); // 캘린더 기준 날짜
let currentFixStore = 'base1'; // 고정비 탭 상태
let analysisData = null; // 분석 데이터 캐싱

document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    
    // 날짜 초기값 설정
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().slice(0, 7);
    
    const accDate = document.getElementById('accDate');
    if(accDate) accDate.value = today;
    
    const anMonth = document.getElementById('anMonth');
    if(anMonth) anMonth.value = month;
    
    document.getElementById('fixMonthDisplay').innerText = month;
});

// --- 로그인/로그아웃 ---
async function checkLogin() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data.user) onLoginSuccess(data.user);
        else document.getElementById('loginOverlay').style.display = 'flex';
    } catch(e) { console.error(e); }
}

async function doLogin() {
    const id = document.getElementById('loginId').value;
    const pw = document.getElementById('loginPw').value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: id, password: pw })
        });
        const data = await res.json();
        if (data.success) {
            onLoginSuccess(data.user);
            document.getElementById('loginOverlay').style.display = 'none';
        } else alert(data.message);
    } catch(e) { alert("서버 통신 오류"); }
}

function onLoginSuccess(user) {
    currentUser = user;
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('userInfo').innerText = `${user.name} (${user.role === 'admin' ? '사장님' : user.role === 'manager' ? '매니저' : '스태프'})`;
    
    // 권한별 UI 제어
    const admins = document.querySelectorAll('.admin-only');
    const managers = document.querySelectorAll('.manager-only');
    
    if (user.role === 'staff') {
        admins.forEach(el => el.style.display = 'none');
        managers.forEach(el => el.style.display = 'none');
        document.getElementById('staff-view-only').style.display = 'block';
        document.getElementById('manager-schedule-view').style.display = 'none';
        loadMySchedule();
    } else {
        // 매니저/사장님
        if (user.role === 'manager') admins.forEach(el => el.style.display = 'none');
        else admins.forEach(el => el.style.display = 'inline-block'); // block 대신 inline-block/flex 등 상황에 맞게
        
        document.getElementById('staff-view-only').style.display = 'none';
        document.getElementById('manager-schedule-view').style.display = 'block';
        renderCalendar('daily'); // 기본 뷰
    }
}

async function doLogout() {
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
}

function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabName}-content`).classList.add('active');
    
    document.querySelectorAll('.tabs > button').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    if (tabName === 'accounting' && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
        loadDailyData();
        if(currentUser.role === 'admin') loadFixedCost(); // 고정비는 사장만
    }
    if (tabName === 'analysis') loadAnalysis();
}

// ==========================================
// 1. 근무 일정 (Staff: 단순 조회 / Admin: 캘린더)
// ==========================================

// 알바용 조회
async function loadMySchedule() {
    // 이번달 기준으로 가져오기
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
    
    const res = await fetch(`/api/schedules?start=${start}&end=${end}`);
    const json = await res.json();
    const list = document.getElementById('myScheduleList');
    list.innerHTML = '';
    
    if(!json.data || json.data.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">등록된 근무가 없습니다.</div>';
        return;
    }
    
    json.data.forEach(s => {
        list.innerHTML += `
            <div class="accounting-card" style="padding:15px; margin-bottom:10px; border-left:5px solid #4CAF50;">
                <div style="font-weight:bold; font-size:16px;">${s.date}</div>
                <div style="margin-top:5px; color:#333;">⏰ ${s.start_time} ~ ${s.end_time}</div>
            </div>
        `;
    });
}

// 관리자용 캘린더 (간소화된 버전)
async function renderCalendar(viewType) {
    // 실제 캘린더 구현은 코드 양이 많으므로, _ref 파일의 로직을 참고하여
    // "오늘의 근무자 목록"을 보여주는 Daily View를 기본으로 구현합니다.
    const title = document.getElementById('calendarTitle');
    const area = document.getElementById('calendarArea');
    const dateStr = calendarDate.toISOString().split('T')[0];
    
    title.innerText = `${calendarDate.getFullYear()}년 ${calendarDate.getMonth()+1}월 ${calendarDate.getDate()}일`;
    
    // 하루치 데이터 로드
    const res = await fetch(`/api/schedules?start=${dateStr}&end=${dateStr}`);
    const json = await res.json();
    
    area.innerHTML = '';
    if (json.data.length === 0) {
        area.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">근무자가 없습니다.</div>';
    } else {
        json.data.forEach(s => {
            area.innerHTML += `
                <div class="accounting-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px; margin-bottom:10px;">
                    <div>
                        <strong style="font-size:18px;">${s.name}</strong> <span style="font-size:12px; color:#666;">(${s.role})</span><br>
                        <span style="color:#007bff; font-weight:bold;">${s.start_time} ~ ${s.end_time}</span>
                    </div>
                    <div>
                        <button onclick="deleteSchedule(${s.id})" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px;">삭제</button>
                    </div>
                </div>
            `;
        });
    }
    
    // 대타 등록 버튼
    area.innerHTML += `
        <div style="text-align:right; margin-top:10px;">
            <button onclick="alert('직원 이름을 입력하여 대타를 등록하는 모달을 띄웁니다.')" style="background:#28a745; color:white; padding:10px; border:none; border-radius:5px;">+ 근무/대타 추가</button>
        </div>
    `;
    
    document.getElementById('admin-staff-manage').style.display = 'none';
    document.getElementById('calendarArea').parentElement.style.display = 'block';
}

function moveCalendar(delta) {
    calendarDate.setDate(calendarDate.getDate() + delta);
    renderCalendar('daily');
}

function showStaffManage() {
    document.getElementById('calendarArea').parentElement.style.display = 'none';
    document.getElementById('admin-staff-manage').style.display = 'block';
    loadStaffList();
}

// 직원 목록 로드 (급여 포함)
async function loadStaffList() {
    const res = await fetch('/api/users'); // 사장님 전용 API 필요
    const json = await res.json();
    const area = document.getElementById('staffListArea');
    area.innerHTML = '';
    
    json.data.forEach(u => {
        if(u.role === 'admin') return;
        area.innerHTML += `
            <div class="accounting-card" style="padding:10px; margin-bottom:10px; display:flex; justify-content:space-between;">
                <div>
                    <strong>${u.name}</strong> (${u.role === 'staff' ? '알바' : '매니저'})<br>
                    <span style="color:#d32f2f;">💰 시급: ${u.hourly_wage.toLocaleString()}원</span>
                </div>
                <button onclick="alert('정보 수정')" style="height:30px;">수정</button>
            </div>
        `;
    });
}

// ==========================================
// 2. 매입/매출 (1루/3루 분리)
// ==========================================
async function loadDailyData() {
    const date = document.getElementById('accDate').value;
    const res = await fetch(`/api/accounting/daily?date=${date}`);
    const data = await res.json();
    
    // 1루
    document.getElementById('b1_card').value = data.base1.card || '';
    document.getElementById('b1_cash').value = data.base1.cash || '';
    document.getElementById('b1_deliv').value = data.base1.delivery_app || '';
    // 3루
    document.getElementById('b3_card').value = data.base3.card || '';
    document.getElementById('b3_cash').value = data.base3.cash || '';
    document.getElementById('b3_deliv').value = data.base3.delivery_app || '';
    // 공통 지출
    document.getElementById('ex_gosen').value = data.expense.gosen || '';
    document.getElementById('ex_hangang').value = data.expense.hangang || '';
    document.getElementById('ex_etc').value = data.expense.etc || '';
    document.getElementById('ex_note').value = data.expense.note || '';
}

async function saveDailyData() {
    const date = document.getElementById('accDate').value;
    const body = {
        date,
        base1: {
            card: document.getElementById('b1_card').value,
            cash: document.getElementById('b1_cash').value,
            delivery: document.getElementById('b1_deliv').value
        },
        base3: {
            card: document.getElementById('b3_card').value,
            cash: document.getElementById('b3_cash').value,
            delivery: document.getElementById('b3_deliv').value
        },
        expense: {
            gosen: document.getElementById('ex_gosen').value,
            hangang: document.getElementById('ex_hangang').value,
            etc: document.getElementById('ex_etc').value,
            note: document.getElementById('ex_note').value
        }
    };
    
    await fetch('/api/accounting/daily', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    alert('저장되었습니다.');
}

// --- 고정비 설정 (매장별 탭) ---
function showFixTab(store, btn) {
    currentFixStore = store;
    btn.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFixForm(store);
}

// 탭 전환 시 폼 렌더링
let loadedFixData = { base1: {}, base3: {} }; // 캐싱

async function loadFixedCost() {
    const month = document.getElementById('anMonth').value; // 분석탭의 월을 공유하거나 별도 월 선택
    // 편의상 오늘 날짜 기준 월 사용
    const currentMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('fixMonthDisplay').innerText = currentMonth;
    
    const res = await fetch(`/api/accounting/monthly?month=${currentMonth}`);
    const data = await res.json();
    loadedFixData = data;
    renderFixForm('base1'); // 기본 1루 표시
}

function renderFixForm(store) {
    const d = loadedFixData[store] || {};
    const form = document.getElementById('fixFormArea');
    
    // 3루일 때만 상하수도 표시
    const waterInput = store === 'base3' ? 
        `<div><span class="category-label">💧 상하수도</span><input type="number" id="fix_water" class="money-input" value="${d.water||''}"></div>` : '';

    form.innerHTML = `
        <div class="input-grid">
            ${waterInput}
            <div><span class="category-label">🌐 인터넷</span><input type="number" id="fix_net" class="money-input" value="${d.internet||''}"></div>
            <div><span class="category-label">⚡ 전기료</span><input type="number" id="fix_elec" class="money-input" value="${d.electricity||''}"></div>
            <div><span class="category-label">🧹 청소용역</span><input type="number" id="fix_clean" class="money-input" value="${d.cleaning||''}"></div>
            <div><span class="category-label">💳 카드수수료(고정)</span><input type="number" id="fix_card" class="money-input" value="${d.card_fee||''}"></div>
            <div><span class="category-label">🛠 운영관리비</span><input type="number" id="fix_oper" class="money-input" value="${d.operation||''}"></div>
            <div><span class="category-label">🛡 캡스</span><input type="number" id="fix_caps" class="money-input" value="${d.caps||''}"></div>
            <div><span class="category-label">📦 기타1</span><input type="number" id="fix_etc1" class="money-input" value="${d.etc1||''}"></div>
            <div><span class="category-label">📦 기타2</span><input type="number" id="fix_etc2" class="money-input" value="${d.etc2||''}"></div>
        </div>
    `;
}

async function saveFixedCost() {
    const month = document.getElementById('fixMonthDisplay').innerText;
    
    // 현재 폼 데이터 읽기
    const newData = {
        internet: document.getElementById('fix_net').value,
        electricity: document.getElementById('fix_elec').value,
        cleaning: document.getElementById('fix_clean').value,
        card_fee: document.getElementById('fix_card').value,
        operation: document.getElementById('fix_oper').value,
        caps: document.getElementById('fix_caps').value,
        etc1: document.getElementById('fix_etc1').value,
        etc2: document.getElementById('fix_etc2').value,
        water: document.getElementById('fix_water') ? document.getElementById('fix_water').value : 0
    };
    
    // 현재 탭 데이터를 전역 변수에 업데이트
    loadedFixData[currentFixStore] = newData;

    await fetch('/api/accounting/monthly', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            month, 
            base1: loadedFixData.base1, 
            base3: loadedFixData.base3 
        })
    });
    alert('저장되었습니다.');
}

// ==========================================
// 3. 분석 (손익)
// ==========================================
async function loadAnalysis() {
    const month = document.getElementById('anMonth').value;
    const res = await fetch(`/api/analysis?month=${month}`);
    analysisData = await res.json();
    renderAnalysis('base1', document.querySelector('#analysis-content .active'));
}

function renderAnalysis(type, btn) {
    if (!analysisData) return;
    if(btn) {
        btn.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    const d = analysisData[type];
    const el = document.getElementById('analysisResult');
    
    // 숫자 포맷팅
    const f = (n) => n ? parseInt(n).toLocaleString() : '0';

    if (type === 'grand') {
        el.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <h2 style="color:#2e7d32;">통합 순이익: ${f(d.profit)}원</h2>
            </div>
            <div class="dashboard-summary">
                <div class="summary-card total-sales"><div class="lbl">총 매출</div><div class="val">${f(d.sales)}</div></div>
                <div class="summary-card total-cost"><div class="lbl">총 비용</div><div class="val">${f(d.cost)}</div></div>
            </div>
            <p style="text-align:center; font-size:12px; color:#666; margin-top:10px;">* 1루/3루의 모든 매출과 비용을 합산한 결과입니다.</p>
        `;
    } else {
        const fix = d.fixed; // 고정비 객체 (자동계산 포함)
        el.innerHTML = `
            <h3 style="border-bottom:2px solid #ddd; padding-bottom:10px;">
                ${type==='base1'?'1루':'3루'} 순익: <span style="color:${d.profit > 0 ? 'blue':'red'}">${f(d.profit)}원</span>
            </h3>
            
            <div style="margin-top:15px;">
                <h4 style="color:#1976D2;">➕ 총 매출: ${f(d.sales)}원</h4>
            </div>

            <div style="margin-top:15px;">
                <h4 style="color:#d32f2f;">➖ 총 비용: ${f(d.variable + fix.total)}원</h4>
                <div style="background:#fff3e0; padding:10px; font-size:13px; border-radius:5px;">
                    <p><strong>📦 변동비 배분:</strong> ${f(d.variable)}원 <span style="font-size:11px; color:#666;">(공통지출의 매출비율)</span></p>
                    <hr style="border-top:1px dashed #ccc; margin:5px 0;">
                    <p><strong>🏢 고정비 합계:</strong> ${f(fix.total)}원</p>
                    <ul style="padding-left:20px; margin-top:5px; color:#555;">
                        <li>매장 수수료(30%): ${f(fix.commission)}원</li>
                        <li>배달 수수료(4.95%): ${f(fix.delivFee)}원</li>
                        <li>수동 입력 고정비: ${f(fix.manual)}원</li>
                    </ul>
                </div>
            </div>
        `;
    }
}