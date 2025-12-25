let currentUser = null;
let analysisData = null;
let currentFixStore = 'base1'; // 현재 보고 있는 고정비 탭

document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    document.getElementById('accDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('anMonth').value = new Date().toISOString().slice(0, 7);
    document.getElementById('fixMonthDisplay').innerText = new Date().toISOString().slice(0, 7);
});

// --- 로그인/로그아웃 ---
async function checkLogin() {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.user) onLoginSuccess(data.user);
    else document.getElementById('loginOverlay').style.display = 'flex';
}

async function doLogin() {
    const id = document.getElementById('loginId').value;
    const pw = document.getElementById('loginPw').value;
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
}

function onLoginSuccess(user) {
    currentUser = user;
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('userInfo').innerText = `${user.name} (${user.role === 'admin' ? '사장님' : '직원'})`;
    
    // 권한별 UI 처리
    if (user.role === 'staff') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        switchTab('schedule');
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
        loadDailyData();
    }
    loadSchedules();
}

async function doLogout() {
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
}

// --- 탭 전환 ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tabName}-content`).classList.add('active');
    
    // 버튼 스타일
    document.querySelectorAll('.tabs > button').forEach(b => b.classList.remove('active'));
    // (단순화를 위해 버튼 active 처리는 생략하거나 onclick에서 처리)
}

// --- [근무 일정] ---
async function loadSchedules() {
    const res = await fetch('/api/schedules');
    const json = await res.json();
    const list = document.getElementById('scheduleList');
    list.innerHTML = '';
    
    if(!json.data || json.data.length === 0) {
        list.innerHTML = '<p>등록된 근무가 없습니다.</p>';
        return;
    }

    json.data.forEach(s => {
        list.innerHTML += `
            <div class="accounting-card" style="padding:10px; margin-bottom:5px;">
                <strong>${s.name}</strong> (${s.date.split('T')[0]})<br>
                ⏰ ${s.start_time} ~ ${s.end_time}
            </div>
        `;
    });
}

// --- [매입/매출] ---
async function loadDailyData() {
    if (!currentUser || currentUser.role === 'staff') return;
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
    // 지출
    document.getElementById('ex_gosen').value = data.expense.gosen || '';
    document.getElementById('ex_hangang').value = data.expense.hangang || '';
    document.getElementById('ex_etc').value = data.expense.etc || '';
    document.getElementById('ex_note').value = data.expense.note || '';

    // 고정비 로드도 같이
    loadFixedCost();
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

// --- [고정비] ---
async function loadFixedCost() {
    const month = document.getElementById('accDate').value.slice(0, 7);
    document.getElementById('fixMonthDisplay').innerText = month;
    const res = await fetch(`/api/accounting/monthly?month=${month}`);
    const data = await res.json();
    
    // 현재 탭에 맞는 데이터 표시
    const d = data[currentFixStore] || {};
    document.getElementById('fix_net').value = d.internet || '';
    document.getElementById('fix_elec').value = d.electricity || '';
    document.getElementById('fix_clean').value = d.cleaning || '';
    document.getElementById('fix_card').value = d.card_fee || '';
    document.getElementById('fix_oper').value = d.operation || '';
    document.getElementById('fix_caps').value = d.caps || '';
    document.getElementById('fix_etc1').value = d.etc1 || '';
    document.getElementById('fix_etc2').value = d.etc2 || '';
    
    // 자동계산 필드는 placeholder로 둠 (실제 값은 분석 탭에서 확인)
    document.getElementById('fix_comm').value = '';
    document.getElementById('fix_deliv').value = '';
}

function showFixTab(store, btn) {
    currentFixStore = store;
    // 탭 스타일
    btn.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadFixedCost(); // 데이터 다시 로드
}

async function saveFixedCost() {
    const month = document.getElementById('accDate').value.slice(0, 7);
    
    // 현재 탭의 데이터만 보낼 게 아니라 전체 구조 필요하지만, 편의상 현재 탭만 업데이트하는 API 호출
    // 여기선 단순화를 위해 현재 탭 데이터 구성
    const data = {
        internet: document.getElementById('fix_net').value,
        electricity: document.getElementById('fix_elec').value,
        cleaning: document.getElementById('fix_clean').value,
        card_fee: document.getElementById('fix_card').value,
        operation: document.getElementById('fix_oper').value,
        caps: document.getElementById('fix_caps').value,
        etc1: document.getElementById('fix_etc1').value,
        etc2: document.getElementById('fix_etc2').value
    };
    
    // 기존 데이터 읽어서 병합 후 저장해야 함 (생략: 실제 구현시 주의)
    // 여기서는 간단히: "현재 탭만 업데이트"한다고 가정하고, 실제론 DB에 두 매장 데이터가 다 있어야 함
    // (서버 API가 upsert이므로, 현재 탭 데이터만 채우고 나머지는 null로 보내면 덮어씌워질 수 있음. 
    //  -> 실무에선 불러온 전체 데이터를 가지고 있다가 수정된 것만 바꿔서 통째로 보내야 함)
    //  **간단 해결책**: 
    const res = await fetch(`/api/accounting/monthly?month=${month}`);
    const current = await res.json();
    current[currentFixStore] = { ...current[currentFixStore], ...data };
    
    await fetch('/api/accounting/monthly', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ month, base1: current.base1, base3: current.base3 })
    });
    alert(`${currentFixStore === 'base1'?'1루':'3루'} 고정비 저장 완료`);
}

// --- [분석] ---
async function loadAnalysis() {
    const month = document.getElementById('anMonth').value;
    const res = await fetch(`/api/analysis?month=${month}`);
    analysisData = await res.json();
    // 기본적으로 1루 보여줌
    renderAnalysis('base1', document.querySelector('#analysis-content .tab'));
}

function renderAnalysis(type, btn) {
    if (!analysisData) { loadAnalysis(); return; }
    
    // 탭 활성화
    if(btn) {
        btn.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    const d = analysisData[type];
    const el = document.getElementById('analysisResult');
    
    if (type === 'combined') {
        el.innerHTML = `
            <h3>📊 통합 손익 (${d.profit.toLocaleString()}원)</h3>
            <p>총 매출: ${d.sales.toLocaleString()}원</p>
            <p style="color:red;">총 비용: ${d.cost.toLocaleString()}원</p>
        `;
    } else {
        const f = d.fixedCost;
        el.innerHTML = `
            <h3>${type==='base1'?'1루':'3루'} 순익 (${d.profit.toLocaleString()}원)</h3>
            <p><strong>총 매출:</strong> ${d.sales.toLocaleString()}원</p>
            <hr>
            <p>➖ <strong>공통재료비 배분:</strong> ${d.variableCost.toLocaleString()}원</p>
            <p>➖ <strong>고정비 합계:</strong> ${f.total.toLocaleString()}원</p>
            <div style="font-size:12px; color:#666; padding-left:10px; border-left:2px solid #ccc;">
                ㄴ 매장수수료(30%): ${f.commission.toLocaleString()}원<br>
                ㄴ 배달수수료(4.95%): ${f.delivFee.toLocaleString()}원<br>
                ㄴ 수동입력(월세 등): ${f.manual.toLocaleString()}원
            </div>
        `;
    }
}