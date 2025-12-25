// ===== 전역 변수 =====
let currentUser = null;
let currentTab = 'schedule';
let calendarDate = new Date();
let currentSubTab = 'daily';
let currentFixStore = 'base1';
let analysisData = null;
let dailyHistoryData = [];

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().slice(0, 7);
    
    const accDate = document.getElementById('accDate');
    if (accDate) accDate.value = today;
    
    const anMonth = document.getElementById('anMonth');
    if (anMonth) anMonth.value = month;
    
    const fixDisplay = document.getElementById('fixMonthDisplay');
    if (fixDisplay) fixDisplay.innerText = month;
});

// ===== 로그인/로그아웃 =====
async function checkLogin() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data.user) {
            onLoginSuccess(data.user);
        } else {
            document.getElementById('loginOverlay').style.display = 'flex';
        }
    } catch (e) {
        console.error(e);
        document.getElementById('loginOverlay').style.display = 'flex';
    }
}

async function doLogin() {
    const id = document.getElementById('loginId').value.trim();
    const pw = document.getElementById('loginPw').value;
    const errEl = document.getElementById('loginError');
    
    if (!id || !pw) {
        errEl.style.display = 'block';
        errEl.textContent = '아이디와 비밀번호를 입력하세요.';
        return;
    }
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: id, password: pw })
        });
        
        const data = await res.json();
        
        if (data.success) {
            onLoginSuccess(data.user);
            document.getElementById('loginOverlay').style.display = 'none';
        } else {
            errEl.style.display = 'block';
            errEl.textContent = data.message || '로그인 실패';
        }
    } catch (e) {
        console.error(e);
        errEl.style.display = 'block';
        errEl.textContent = '서버 통신 오류';
    }
}

function onLoginSuccess(user) {
    currentUser = user;
    document.getElementById('mainContent').style.display = 'block';
    
    const roleText = user.role === 'admin' ? '사장님' : 
                     user.role === 'manager' ? '매니저' : '스태프';
    document.getElementById('userInfo').innerText = `${user.name} (${roleText})`;
    
    const admins = document.querySelectorAll('.admin-only');
    const managers = document.querySelectorAll('.manager-only');
    
    if (user.role === 'staff') {
        // 알바는 근무관리만
        admins.forEach(el => el.style.display = 'none');
        managers.forEach(el => el.style.display = 'none');
        document.getElementById('staff-view-only').style.display = 'block';
        document.getElementById('manager-schedule-view').style.display = 'none';
        loadMySchedule();
        loadTodayClockStatus();
    } else {
        // 매니저/사장
        if (user.role === 'manager') {
            admins.forEach(el => el.style.display = 'none');
        } else {
            admins.forEach(el => {
                if (el.tagName === 'BUTTON') el.style.display = 'inline-block';
                else el.style.display = 'block';
            });
        }
        managers.forEach(el => {
            if (el.tagName === 'BUTTON') el.style.display = 'inline-block';
            else el.style.display = 'block';
        });
        
        document.getElementById('staff-view-only').style.display = 'none';
        document.getElementById('manager-schedule-view').style.display = 'block';
        renderCalendar();
    }
}

async function doLogout() {
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
}

// ===== 탭 전환 =====
function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabName}-content`).classList.add('active');
    
    document.querySelectorAll('.tabs > button').forEach(b => b.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.tabs > button')).find(
        b => b.getAttribute('onclick')?.includes(`switchTab('${tabName}')`)
    );
    if (activeBtn) activeBtn.classList.add('active');

    if (tabName === 'accounting' && ['admin', 'manager'].includes(currentUser?.role)) {
        loadDailyData();
    }
    if (tabName === 'analysis' && currentUser?.role === 'admin') {
        const month = document.getElementById('anMonth').value;
        if (month) loadAnalysis();
    }
}

function switchSubTab(subTab) {
    currentSubTab = subTab;
    
    // 직원관리 탭인 경우
    if (subTab === 'staff-manage') {
        document.getElementById('calendarArea').parentElement.style.display = 'none';
        document.getElementById('admin-staff-manage').style.display = 'block';
        loadStaffList();
    } else {
        // 일별/주간/월별 탭인 경우
        document.getElementById('admin-staff-manage').style.display = 'none';
        document.getElementById('calendarArea').parentElement.style.display = 'block';
        renderCalendar();
    }
}

function switchAccSubTab(subId) {
    document.querySelectorAll('.acc-sub-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    const target = document.getElementById(subId);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
    }
    
    const parent = document.querySelector('#accounting-content .tabs');
    if (parent) {
        parent.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        const btn = Array.from(parent.querySelectorAll('.tab')).find(
            b => b.getAttribute('onclick')?.includes(`switchAccSubTab('${subId}')`)
        );
        if (btn) btn.classList.add('active');
    }
    
    if (subId === 'daily-input') loadDailyData();
    else if (subId === 'history') loadHistory();
    else if (subId === 'prediction') renderPrediction();
    else if (subId === 'dashboard') renderDashboard();
    else if (subId === 'fixed-cost') {
        const month = document.getElementById('anMonth')?.value || new Date().toISOString().slice(0, 7);
        document.getElementById('fixMonthDisplay').innerText = month;
        loadFixedCost();
    }
}

// ===== 근무 일정 (알바용) =====
async function loadMySchedule() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    
    try {
        const res = await fetch(`/api/schedules?start=${start}&end=${end}`);
        const json = await res.json();
        const list = document.getElementById('myScheduleList');
        list.innerHTML = '';
        
        if (!json.data || json.data.length === 0) {
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
    } catch (e) {
        console.error(e);
    }
}

async function loadTodayClockStatus() {
    // TODO: 출퇴근 기록 조회 API 구현 후 연동
    document.getElementById('clockInTime').textContent = '-';
    document.getElementById('clockOutTime').textContent = '-';
}

async function clockIn() {
    if (!confirm('출근 처리하시겠습니까?')) return;
    
    try {
        const res = await fetch('/api/clock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'in', lat: 0, lng: 0 })
        });
        
        if (res.ok) {
            alert('출근 처리되었습니다.');
            loadTodayClockStatus();
        }
    } catch (e) {
        alert('출근 처리 실패');
    }
}

async function clockOut() {
    if (!confirm('퇴근 처리하시겠습니까?')) return;
    
    try {
        const res = await fetch('/api/clock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'out' })
        });
        
        if (res.ok) {
            alert('퇴근 처리되었습니다.');
            loadTodayClockStatus();
        }
    } catch (e) {
        alert('퇴근 처리 실패');
    }
}

// ===== 캘린더 (관리자용) =====
async function renderCalendar() {
    const title = document.getElementById('calendarTitle');
    const area = document.getElementById('calendarArea');
    
    if (currentSubTab === 'daily') {
        const dateStr = calendarDate.toISOString().split('T')[0];
        title.innerText = `${calendarDate.getFullYear()}년 ${calendarDate.getMonth() + 1}월 ${calendarDate.getDate()}일`;
        
        try {
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
                                <strong style="font-size:18px;">${s.name}</strong> 
                                <span style="font-size:12px; color:#666;">(${s.role === 'staff' ? '알바' : '매니저'})</span><br>
                                <span style="color:#007bff; font-weight:bold;">${s.start_time} ~ ${s.end_time}</span>
                            </div>
                            <div>
                                <button onclick="deleteSchedule(${s.id})" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">삭제</button>
                            </div>
                        </div>
                    `;
                });
            }
            
            area.innerHTML += `
                <div style="text-align:center; margin-top:20px;">
                    <button onclick="alert('근무 추가 모달 구현 예정')" style="background:#28a745; color:white; padding:12px 20px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">+ 근무/대타 추가</button>
                </div>
            `;
        } catch (e) {
            console.error(e);
        }
    } else {
        area.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">주간/월별 뷰는 추후 구현 예정입니다.</div>';
    }
}

function moveCalendar(delta) {
    calendarDate.setDate(calendarDate.getDate() + delta);
    renderCalendar();
}

async function deleteSchedule(id) {
    if (!confirm('이 근무 일정을 삭제하시겠습니까?')) return;
    
    try {
        const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert('삭제되었습니다.');
            renderCalendar();
        }
    } catch (e) {
        alert('삭제 실패');
    }
}

// ===== 직원 관리 (사장님 전용) =====
async function loadStaffList() {
    try {
        const res = await fetch('/api/users');
        if (!res.ok) {
            throw new Error('권한이 없습니다.');
        }
        
        const json = await res.json();
        const area = document.getElementById('staffListArea');
        area.innerHTML = '';
        
        json.data.forEach(u => {
            if (u.role === 'admin') return;
            
            const roleText = u.role === 'staff' ? '알바' : '매니저';
            area.innerHTML += `
                <div class="accounting-card" style="padding:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:16px;">${u.name}</strong> 
                        <span style="font-size:13px; color:#666;">(${roleText})</span><br>
                        <span style="color:#d32f2f; font-weight:bold;">💰 시급: ${u.hourly_wage.toLocaleString()}원</span>
                    </div>
                    <button onclick="openEditWage(${u.id}, '${u.name}', ${u.hourly_wage})" style="background:#2e7d32; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">수정</button>
                </div>
            `;
        });
    } catch (e) {
        console.error(e);
        alert('직원 목록을 불러올 수 없습니다: ' + e.message);
    }
}

function openEditWage(id, name, wage) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserName').value = name;
    document.getElementById('editWage').value = wage;
    document.getElementById('editWageModal').style.display = 'flex';
}

function closeEditWageModal() {
    document.getElementById('editWageModal').style.display = 'none';
}

async function saveWage() {
    const id = document.getElementById('editUserId').value;
    const wage = document.getElementById('editWage').value;
    
    if (!wage || wage < 0) {
        alert('올바른 시급을 입력하세요.');
        return;
    }
    
    try {
        const res = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hourly_wage: parseInt(wage) })
        });
        
        if (res.ok) {
            alert('저장되었습니다.');
            closeEditWageModal();
            loadStaffList();
        }
    } catch (e) {
        alert('저장 실패');
    }
}

// ===== 매입/매출 관리 =====
async function loadDailyData() {
    const date = document.getElementById('accDate').value;
    if (!date) return;
    
    try {
        const res = await fetch(`/api/accounting/daily?date=${date}`);
        const data = await res.json();
        
        document.getElementById('b1_card').value = data.base1.card || '';
        document.getElementById('b1_cash').value = data.base1.cash || '';
        document.getElementById('b1_deliv').value = data.base1.delivery_app || '';
        
        document.getElementById('b3_card').value = data.base3.card || '';
        document.getElementById('b3_cash').value = data.base3.cash || '';
        document.getElementById('b3_deliv').value = data.base3.delivery_app || '';
        
        document.getElementById('ex_gosen').value = data.expense.gosen || '';
        document.getElementById('ex_hangang').value = data.expense.hangang || '';
        document.getElementById('ex_etc').value = data.expense.etc || '';
        document.getElementById('ex_note').value = data.expense.note || '';
    } catch (e) {
        console.error(e);
    }
}

async function saveDailyData() {
    const date = document.getElementById('accDate').value;
    if (!date) {
        alert('날짜를 선택하세요.');
        return;
    }
    
    const body = {
        date,
        base1: {
            card: parseInt(document.getElementById('b1_card').value) || 0,
            cash: parseInt(document.getElementById('b1_cash').value) || 0,
            delivery: parseInt(document.getElementById('b1_deliv').value) || 0
        },
        base3: {
            card: parseInt(document.getElementById('b3_card').value) || 0,
            cash: parseInt(document.getElementById('b3_cash').value) || 0,
            delivery: parseInt(document.getElementById('b3_deliv').value) || 0
        },
        expense: {
            gosen: parseInt(document.getElementById('ex_gosen').value) || 0,
            hangang: parseInt(document.getElementById('ex_hangang').value) || 0,
            etc: parseInt(document.getElementById('ex_etc').value) || 0,
            note: document.getElementById('ex_note').value || ''
        }
    };
    
    try {
        const res = await fetch('/api/accounting/daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (res.ok) {
            alert('저장되었습니다.');
        } else {
            const err = await res.json();
            alert('저장 실패: ' + (err.message || '권한이 없습니다'));
        }
    } catch (e) {
        alert('저장 실패');
    }
}

async function loadHistory() {
    const month = new Date().toISOString().slice(0, 7);
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">입력 내역 로드 중...</div>';
    
    // TODO: 월별 입력 내역 조회 API 구현 후 연동
    setTimeout(() => {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">입력 내역 표시 기능은 추후 구현 예정입니다.</div>';
    }, 500);
}

// ===== 고정비 관리 =====
let loadedFixData = { base1: {}, base3: {} };

async function loadFixedCost() {
    const month = document.getElementById('fixMonthDisplay').innerText;
    
    try {
        const res = await fetch(`/api/accounting/monthly?month=${month}`);
        if (!res.ok) {
            throw new Error('권한이 없거나 데이터를 불러올 수 없습니다.');
        }
        
        const data = await res.json();
        loadedFixData = data;
        renderFixForm(currentFixStore);
    } catch (e) {
        console.error(e);
        alert('고정비 데이터 로드 실패: ' + e.message);
    }
}

function showFixTab(store, btn) {
    currentFixStore = store;
    btn.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFixForm(store);
}

function renderFixForm(store) {
    const d = loadedFixData[store] || {};
    const form = document.getElementById('fixFormArea');
    
    const waterInput = store === 'base3' ? 
        `<div><span class="category-label">💧 상하수도</span><input type="number" id="fix_water" class="money-input" value="${d.water || ''}" placeholder="0"></div>` : '';

    form.innerHTML = `
        <div class="input-grid">
            ${waterInput}
            <div><span class="category-label">🌐 인터넷</span><input type="number" id="fix_net" class="money-input" value="${d.internet || ''}" placeholder="0"></div>
            <div><span class="category-label">⚡ 전기료</span><input type="number" id="fix_elec" class="money-input" value="${d.electricity || ''}" placeholder="0"></div>
            <div><span class="category-label">🧹 청소용역</span><input type="number" id="fix_clean" class="money-input" value="${d.cleaning || ''}" placeholder="0"></div>
            <div><span class="category-label">💳 카드수수료(고정)</span><input type="number" id="fix_card" class="money-input" value="${d.card_fee || ''}" placeholder="0"></div>
            <div><span class="category-label">🛠 운영관리비</span><input type="number" id="fix_oper" class="money-input" value="${d.operation || ''}" placeholder="0"></div>
            <div><span class="category-label">🛡 캡스</span><input type="number" id="fix_caps" class="money-input" value="${d.caps || ''}" placeholder="0"></div>
            <div><span class="category-label">📦 기타1</span><input type="number" id="fix_etc1" class="money-input" value="${d.etc1 || ''}" placeholder="0"></div>
            <div><span class="category-label">📦 기타2</span><input type="number" id="fix_etc2" class="money-input" value="${d.etc2 || ''}" placeholder="0"></div>
        </div>
    `;
}

async function saveFixedCost() {
    const month = document.getElementById('fixMonthDisplay').innerText;
    
    const newData = {
        internet: parseInt(document.getElementById('fix_net').value) || 0,
        electricity: parseInt(document.getElementById('fix_elec').value) || 0,
        cleaning: parseInt(document.getElementById('fix_clean').value) || 0,
        card_fee: parseInt(document.getElementById('fix_card').value) || 0,
        operation: parseInt(document.getElementById('fix_oper').value) || 0,
        caps: parseInt(document.getElementById('fix_caps').value) || 0,
        etc1: parseInt(document.getElementById('fix_etc1').value) || 0,
        etc2: parseInt(document.getElementById('fix_etc2').value) || 0,
        water: document.getElementById('fix_water') ? (parseInt(document.getElementById('fix_water').value) || 0) : 0
    };
    
    loadedFixData[currentFixStore] = newData;

    try {
        const res = await fetch('/api/accounting/monthly', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                month, 
                base1: loadedFixData.base1, 
                base3: loadedFixData.base3 
            })
        });
        
        if (res.ok) {
            alert('저장되었습니다.');
        } else {
            const err = await res.json();
            alert('저장 실패: ' + (err.message || '권한이 없습니다'));
        }
    } catch (e) {
        console.error(e);
        alert('저장 실패');
    }
}

// ===== 손익 분석 =====
async function loadAnalysis() {
    const month = document.getElementById('anMonth').value;
    if (!month) return;
    
    try {
        const res = await fetch(`/api/analysis?month=${month}`);
        if (!res.ok) {
            throw new Error('분석 데이터를 불러올 수 없습니다.');
        }
        
        analysisData = await res.json();
        renderAnalysis('grand');
    } catch (e) {
        console.error(e);
        alert('분석 데이터 로드 실패: ' + e.message);
    }
}

function renderAnalysis(type, btn) {
    if (!analysisData) {
        document.getElementById('analysisResult').innerHTML = '<div style="text-align:center; padding:20px; color:#999;">먼저 월을 선택하세요.</div>';
        return;
    }
    
    if (btn) {
        const parent = btn.parentElement;
        parent.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    const d = analysisData[type];
    const el = document.getElementById('analysisResult');
    
    const f = (n) => n ? parseInt(n).toLocaleString() : '0';
    const pct = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0';

    if (type === 'grand') {
        const margin = pct(d.profit, d.sales);
        el.innerHTML = `
            <div style="text-align:center; margin-bottom:30px;">
                <h2 style="color:${d.profit >= 0 ? '#2e7d32' : '#d32f2f'}; font-size:28px; margin:0;">
                    통합 순이익: ${f(d.profit)}원
                </h2>
                <div style="font-size:14px; color:#666; margin-top:5px;">마진율: ${margin}%</div>
            </div>
            
            <div class="dashboard-summary">
                <div class="summary-card total-sales">
                    <div class="lbl">총 매출</div>
                    <div class="val" style="color:#1976D2;">${f(d.sales)}</div>
                </div>
                <div class="summary-card total-cost">
                    <div class="lbl">총 비용</div>
                    <div class="val" style="color:#d32f2f;">${f(d.cost)}</div>
                </div>
                <div class="summary-card net-profit">
                    <div class="lbl">순수익</div>
                    <div class="val">${f(d.profit)}</div>
                </div>
            </div>
            
            <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-top:20px;">
                <h4 style="margin:0 0 10px 0; color:#333;">📊 손익 구조</h4>
                <div style="font-size:13px; color:#555; line-height:1.8;">
                    <div>✅ 1루 + 3루 모든 매출과 비용을 합산한 결과입니다.</div>
                    <div>✅ 공통 지출은 매출 비율로 자동 배분되었습니다.</div>
                    <div>✅ 수수료(30%)와 배달수수료(4.95%)가 자동 계산되었습니다.</div>
                </div>
            </div>
        `;
    } else {
        const storeName = type === 'base1' ? '1루' : '3루';
        const fix = d.fixed;
        const margin = pct(d.profit, d.sales);
        
        el.innerHTML = `
            <h3 style="border-bottom:2px solid #ddd; padding-bottom:10px; color:#333;">
                ${storeName} 순익: <span style="color:${d.profit >= 0 ? '#2e7d32' : '#d32f2f'}; font-size:24px;">${f(d.profit)}원</span>
                <span style="font-size:14px; color:#666; margin-left:10px;">마진율: ${margin}%</span>
            </h3>
            
            <div class="dashboard-summary" style="margin-top:20px;">
                <div class="summary-card total-sales">
                    <div class="lbl">매장 매출</div>
                    <div class="val" style="color:#1976D2;">${f(d.sales)}</div>
                </div>
                <div class="summary-card total-cost">
                    <div class="lbl">총 비용</div>
                    <div class="val" style="color:#d32f2f;">${f(d.variable + fix.total)}</div>
                </div>
            </div>

            <div style="margin-top:25px;">
                <h4 style="color:#1976D2; border-bottom:1px solid #e0e0e0; padding-bottom:8px;">➕ 매출 내역</h4>
                <div style="background:#e3f2fd; padding:12px; border-radius:5px; font-size:13px; margin-top:10px;">
                    <strong>총 매출: ${f(d.sales)}원</strong>
                </div>
            </div>

            <div style="margin-top:25px;">
                <h4 style="color:#d32f2f; border-bottom:1px solid #e0e0e0; padding-bottom:8px;">➖ 비용 내역</h4>
                
                <div style="background:#fff3e0; padding:12px; border-radius:5px; margin-top:10px;">
                    <div style="font-size:13px; color:#555; margin-bottom:8px;"><strong>📦 변동비 (배분):</strong> ${f(d.variable)}원</div>
                    <div style="font-size:11px; color:#999; padding-left:15px;">※ 공통 지출의 ${type === 'base1' ? '1루' : '3루'} 매출 비율 적용</div>
                </div>
                
                <div style="background:#f3e5f5; padding:12px; border-radius:5px; margin-top:10px;">
                    <div style="font-size:14px; font-weight:bold; color:#4a148c; margin-bottom:10px;">🏢 고정비 합계: ${f(fix.total)}원</div>
                    <ul style="padding-left:20px; margin:8px 0; color:#555; font-size:12px; line-height:1.8;">
                        <li><strong>매장 수수료 (30%):</strong> ${f(fix.commission)}원</li>
                        <li><strong>배달 수수료 (4.95%):</strong> ${f(fix.delivFee)}원</li>
                        <li><strong>수동 입력 고정비:</strong> ${f(fix.manual)}원</li>
                    </ul>
                </div>
            </div>
            
            <div style="margin-top:20px; padding:15px; background:#e8f5e9; border-left:4px solid #2e7d32; border-radius:5px;">
                <div style="font-size:13px; color:#1b5e20;">
                    💡 <strong>TIP:</strong> 고정비 중 수수료는 매출에 따라 자동 계산되므로 매출이 늘면 함께 증가합니다.
                </div>
            </div>
        `;
    }
}

// ===== 예상순익 (간이버전) =====
function renderPrediction() {
    const storeType = document.getElementById('predStoreSelect').value;
    const resultEl = document.getElementById('predictionResult');
    
    if (!analysisData) {
        resultEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">먼저 손익분석 탭에서 월을 선택하세요.</div>';
        return;
    }
    
    const d = analysisData[storeType];
    const f = (n) => n ? parseInt(n).toLocaleString() : '0';
    
    resultEl.innerHTML = `
        <div style="background:#f3e5f5; padding:20px; border-radius:10px; text-align:center;">
            <div style="font-size:14px; color:#666; margin-bottom:10px;">예상 손익 (현재까지)</div>
            <div style="font-size:32px; font-weight:bold; color:${d.profit >= 0 ? '#2e7d32' : '#d32f2f'};">
                ${f(d.profit)}원
            </div>
            <div style="margin-top:15px; font-size:13px; color:#555;">
                매출: ${f(d.sales)} | 비용: ${f(d.variable + (d.fixed?.total || 0))}
            </div>
        </div>
        <div style="margin-top:15px; padding:10px; background:#fff3cd; border-radius:5px; font-size:12px; color:#856404;">
            ℹ️ 현재까지 입력된 데이터 기준입니다. 일할 계산 등 고급 기능은 추후 추가 예정입니다.
        </div>
    `;
}

// ===== 월간분석 (간이버전) =====
function renderDashboard() {
    const storeType = document.getElementById('dashStoreSelect').value;
    const resultEl = document.getElementById('dashboardResult');
    
    if (!analysisData) {
        resultEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">먼저 손익분석 탭에서 월을 선택하세요.</div>';
        return;
    }
    
    renderAnalysis(storeType);
    
    const clone = document.getElementById('analysisResult').cloneNode(true);
    clone.id = 'dashboardResult';
    resultEl.parentNode.replaceChild(clone, resultEl);
}

// ===== 유틸리티 함수 =====
function formatNumber(num) {
    return num ? parseInt(num).toLocaleString() : '0';
}

function calculatePercentage(part, total) {
    return total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';
}

// ===== CSS 클래스 보조 =====
const style = document.createElement('style');
style.textContent = `
    .input-group-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        gap: 10px;
    }
    .input-group-row span {
        font-size: 13px;
        font-weight: bold;
        color: #555;
        min-width: 100px;
    }
    .money-input {
        flex: 1;
        text-align: right;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 15px;
    }
    .category-label {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 5px;
        font-weight: bold;
    }
    .input-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
    }
    @media (max-width: 600px) {
        .input-grid {
            grid-template-columns: 1fr;
        }
    }
    .acc-sub-content {
        display: none;
    }
    .acc-sub-content.active {
        display: block;
    }
    .list-group {
        margin-top: 10px;
    }
    .dashboard-summary {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
        margin-bottom: 15px;
    }
    .summary-card {
        background: white;
        padding: 15px 10px;
        border-radius: 10px;
        text-align: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        border: 1px solid #eee;
    }
    .summary-card .lbl {
        font-size: 12px;
        color: #666;
        margin-bottom: 5px;
    }
    .summary-card .val {
        font-size: 20px;
        font-weight: bold;
    }
    .summary-card.net-profit {
        background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
        color: white;
        border: none;
    }
    .summary-card.net-profit .lbl {
        color: rgba(255,255,255,0.8);
    }
    .summary-card.net-profit .val {
        color: #fff;
    }
`;
document.head.appendChild(style);

console.log('✅ 통빵 관리 시스템 초기화 완료');