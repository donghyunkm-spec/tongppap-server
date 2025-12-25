// ===== 전역 변수 =====
let currentUser = null;
let currentTab = 'schedule';
let calendarDate = new Date();
let currentSubTab = 'daily';
let currentFixStore = 'base1';
let analysisData = null;
let dailyHistoryData = [];

let staffListData = []; // 직원 목록 데이터
let historyMonth = new Date(); // 입력내역 조회 월
let predMonth = new Date(); // 예상순익 조회 월
let dashMonth = new Date(); // 월간분석 조회 월


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
    
    // 월 표시 초기화
    updateMonthDisplays();
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

function switchSubTab(tab) {
    currentSubTab = tab;
    
    // 모든 서브탭 버튼 비활성화
    const parentCard = event.target.closest('.accounting-card') || event.target.closest('.status-container');
    if (parentCard) {
        parentCard.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
    }
    
    // 모든 컨텐츠 숨기기
    document.getElementById('staff-view-only').style.display = 'none';
    document.getElementById('manager-schedule-view').style.display = 'none';
    document.getElementById('admin-staff-manage').style.display = 'none';
    
    if (tab === 'daily' || tab === 'weekly' || tab === 'monthly') {
        document.getElementById('manager-schedule-view').style.display = 'block';
        renderCalendar();
    } else if (tab === 'staff-manage') {
        document.getElementById('admin-staff-manage').style.display = 'block';
        loadStaffList();
    }
}

function switchAccSubTab(subTab) {
    // 모든 서브탭 버튼 비활성화
    document.querySelectorAll('#accounting-content .tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    // 모든 서브 컨텐츠 숨기기
    document.querySelectorAll('.acc-sub-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    // 선택한 탭 표시
    const targetEl = document.getElementById(subTab);
    if (targetEl) {
        targetEl.style.display = 'block';
        targetEl.classList.add('active');
    }
    
    // 탭별 데이터 로드
    if (subTab === 'history') {
        loadHistory();
    } else if (subTab === 'prediction') {
        renderPrediction();
    } else if (subTab === 'dashboard') {
        renderDashboard();
    } else if (subTab === 'fixed-cost') {
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

// ===== 직원 관리 기능 =====

// 직원 목록 불러오기
async function loadStaffList() {
    try {
        const res = await fetch('/api/staff/list');
        const data = await res.json();
        
        if (data.success) {
            // 사장, 매니저 제외하고 직원/알바만
            staffListData = data.staff.filter(s => s.role === 'staff');
            renderStaffList();
        }
    } catch (e) {
        console.error('직원 목록 로드 실패:', e);
    }
}

// 직원 목록 렌더링
function renderStaffList() {
    const container = document.getElementById('staffListArea');
    if (!container) return;
    
    if (staffListData.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">등록된 직원/알바가 없습니다.</p>';
        return;
    }
    
    let html = '<div style="display:grid; gap:10px;">';
    
    staffListData.forEach(staff => {
        const typeText = staff.employee_type === 'monthly' ? '직원(월급)' : '알바(시급)';
        const typeColor = staff.employee_type === 'monthly' ? '#1976d2' : '#ff9800';
        
        let salaryText = '';
        if (staff.employee_type === 'monthly') {
            salaryText = staff.monthly_salary > 0 ? `${staff.monthly_salary.toLocaleString()}원/월` : '미설정';
        } else {
            salaryText = staff.hourly_wage > 0 ? `${staff.hourly_wage.toLocaleString()}원/시간` : '미설정';
        }
        
        const startDate = staff.start_date ? new Date(staff.start_date).toLocaleDateString('ko-KR') : '-';
        const endDate = staff.end_date ? new Date(staff.end_date).toLocaleDateString('ko-KR') : '재직중';
        const isActive = !staff.end_date || new Date(staff.end_date) >= new Date();
        
        html += `
            <div style="background:white; border:1px solid #ddd; border-left:4px solid ${isActive ? '#2e7d32' : '#999'}; padding:15px; border-radius:5px; ${!isActive ? 'opacity:0.7;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="font-size:16px; font-weight:bold; margin-bottom:5px;">
                            ${staff.name} 
                            <span style="background:${typeColor}; color:white; padding:2px 8px; border-radius:10px; font-size:11px;">${typeText}</span>
                            ${!isActive ? '<span style="background:#999; color:white; padding:2px 8px; border-radius:10px; font-size:11px;">퇴사</span>' : ''}
                        </div>
                        <div style="font-size:13px; color:#666; margin-bottom:3px;">
                            ID: <strong>${staff.username}</strong> | 급여: <strong>${salaryText}</strong>
                        </div>
                        <div style="font-size:12px; color:#999;">
                            입사: ${startDate} | 퇴사: ${endDate}
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button onclick="openEditStaffModal(${staff.id})" 
                                class="btn" style="background:#1976d2; padding:8px 15px; font-size:12px;">
                            ✏️ 수정
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// 직원 추가 모달 열기
function openAddStaffModal() {
    document.getElementById('staffModalTitle').textContent = '➕ 직원 추가';
    document.getElementById('editStaffId').value = '';
    document.getElementById('staffName').value = '';
    document.getElementById('staffType').value = 'hourly';
    document.getElementById('staffHourlyWage').value = '';
    document.getElementById('staffMonthlySalary').value = '';
    document.getElementById('staffStartDate').value = '';
    document.getElementById('staffEndDate').value = '';
    toggleSalaryFields();
    document.getElementById('staffModal').style.display = 'flex';
}

// 직원 수정 모달 열기
function openEditStaffModal(staffId) {
    const staff = staffListData.find(s => s.id === staffId);
    if (!staff) return;
    
    document.getElementById('staffModalTitle').textContent = '✏️ 직원 정보 수정';
    document.getElementById('editStaffId').value = staff.id;
    document.getElementById('staffName').value = staff.name;
    document.getElementById('staffType').value = staff.employee_type;
    document.getElementById('staffHourlyWage').value = staff.hourly_wage || '';
    document.getElementById('staffMonthlySalary').value = staff.monthly_salary || '';
    document.getElementById('staffStartDate').value = staff.start_date || '';
    document.getElementById('staffEndDate').value = staff.end_date || '';
    toggleSalaryFields();
    document.getElementById('staffModal').style.display = 'flex';
}

// 급여 필드 토글
function toggleSalaryFields() {
    const type = document.getElementById('staffType').value;
    const hourlyFields = document.getElementById('hourlyFields');
    const monthlyFields = document.getElementById('monthlyFields');
    
    if (type === 'hourly') {
        hourlyFields.style.display = 'block';
        monthlyFields.style.display = 'none';
    } else {
        hourlyFields.style.display = 'none';
        monthlyFields.style.display = 'block';
    }
}

// 직원 저장
async function saveStaff() {
    const staffId = document.getElementById('editStaffId').value;
    const name = document.getElementById('staffName').value.trim();
    const type = document.getElementById('staffType').value;
    const hourlyWage = parseInt(document.getElementById('staffHourlyWage').value) || 0;
    const monthlySalary = parseInt(document.getElementById('staffMonthlySalary').value) || 0;
    const startDate = document.getElementById('staffStartDate').value;
    const endDate = document.getElementById('staffEndDate').value;
    
    if (!name) {
        alert('이름을 입력하세요.');
        return;
    }
    
    const staffData = {
        name,
        employeeType: type,
        hourlyWage,
        monthlySalary,
        startDate,
        endDate
    };
    
    try {
        let res;
        if (staffId) {
            // 수정
            res = await fetch(`/api/staff/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(staffData)
            });
        } else {
            // 추가
            res = await fetch('/api/staff/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(staffData)
            });
        }
        
        const data = await res.json();
        
        if (data.success) {
            if (!staffId && data.credentials) {
                // 신규 등록 시 계정 정보 표시
                showSingleRegisterResult(data.credentials);
            } else {
                alert('저장되었습니다.');
            }
            closeStaffModal();
            loadStaffList();
        } else {
            alert('저장 실패: ' + (data.message || '알 수 없는 오류'));
        }
    } catch (e) {
        console.error('저장 오류:', e);
        alert('서버 통신 오류가 발생했습니다.');
    }
}

// 단일 등록 결과 표시
function showSingleRegisterResult(credentials) {
    const modal = document.getElementById('staffRegisterModal');
    const listEl = document.getElementById('registeredStaffList');
    
    listEl.innerHTML = `
        <div style="background:white; padding:15px; border-radius:5px; border-left:4px solid #4caf50;">
            <div style="font-weight:bold; margin-bottom:8px; font-size:15px;">${credentials.name}</div>
            <div style="background:#f1f3f5; padding:10px; border-radius:4px; font-family:monospace;">
                <div style="margin-bottom:5px;">🆔 아이디: <strong style="color:#1976d2;">${credentials.username}</strong></div>
                <div>🔐 비밀번호: <strong style="color:#d32f2f;">${credentials.password}</strong></div>
            </div>
            <div style="font-size:12px; color:#666; margin-top:8px;">
                ⚠️ 이 정보를 직원에게 전달하세요. 다시 확인할 수 없습니다!
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// 모달 닫기
function closeStaffModal() {
    document.getElementById('staffModal').style.display = 'none';
}

// 일괄 등록 처리
async function processBulkText() {
    const text = document.getElementById('bulkText').value.trim();
    if (!text) {
        alert('등록할 직원 정보를 입력하세요.');
        return;
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    const staffToRegister = [];
    
    lines.forEach(line => {
        let parts = line.split(',').map(p => p.trim());
        if (parts.length < 3) {
            parts = line.split(/\s+/);
        }
        
        if (parts.length >= 3) {
            const name = parts[0];
            const dayStr = parts[1];
            let timeStr = parts[2];
            
            const workDays = [];
            const dayMap = {
                '일': 'Sun', '월': 'Mon', '화': 'Tue', '수': 'Wed',
                '목': 'Thu', '금': 'Fri', '토': 'Sat'
            };
            
            for (let [kor, eng] of Object.entries(dayMap)) {
                if (dayStr.includes(kor)) {
                    workDays.push(eng);
                }
            }
            
            timeStr = timeStr.replace('시', '').replace(' ', '');
            if (timeStr.includes('~')) {
                const [start, end] = timeStr.split('~');
                const cleanStart = start.includes(':') ? start : start + ':00';
                const cleanEnd = end.includes(':') ? end : end + ':00';
                timeStr = `${cleanStart}~${cleanEnd}`;
            }
            
            if (name && workDays.length > 0) {
                staffToRegister.push({
                    name: name,
                    workDays: workDays,
                    workTime: timeStr
                });
            }
        }
    });
    
    if (staffToRegister.length === 0) {
        alert('올바른 형식으로 입력하세요.\n예시: 홍길동, 월화수, 18~23');
        return;
    }
    
    if (!confirm(`${staffToRegister.length}명의 알바를 등록하시겠습니까?`)) {
        return;
    }
    
    try {
        const res = await fetch('/api/staff/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff: staffToRegister })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showRegisterResult(data.registered);
            document.getElementById('bulkText').value = '';
            loadStaffList();
        } else {
            alert('등록 실패: ' + (data.message || '알 수 없는 오류'));
        }
    } catch (e) {
        console.error('등록 오류:', e);
        alert('서버 통신 오류가 발생했습니다.');
    }
}

// 등록 결과 모달 표시
function showRegisterResult(registered) {
    const modal = document.getElementById('staffRegisterModal');
    const listEl = document.getElementById('registeredStaffList');
    
    let html = '';
    registered.forEach((staff, idx) => {
        html += `
            <div style="background:white; padding:15px; margin-bottom:10px; border-radius:5px; border-left:4px solid #4caf50;">
                <div style="font-weight:bold; margin-bottom:8px; font-size:15px;">${idx + 1}. ${staff.name}</div>
                <div style="background:#f1f3f5; padding:10px; border-radius:4px; font-family:monospace;">
                    <div style="margin-bottom:5px;">🆔 아이디: <strong style="color:#1976d2;">${staff.username}</strong></div>
                    <div>🔐 비밀번호: <strong style="color:#d32f2f;">${staff.password}</strong></div>
                </div>
                <div style="font-size:12px; color:#666; margin-top:8px;">
                    근무: ${staff.workDays.map(d => {
                        const dayNames = {Sun:'일', Mon:'월', Tue:'화', Wed:'수', Thu:'목', Fri:'금', Sat:'토'};
                        return dayNames[d];
                    }).join(', ')}요일 ${staff.workTime}
                </div>
            </div>
        `;
    });
    
    listEl.innerHTML = html;
    modal.style.display = 'flex';
}

function closeRegisterModal() {
    document.getElementById('staffRegisterModal').style.display = 'none';
}

// 시급 모달 (기존 기능 유지)
function openEditWage(userId, name, currentWage) {
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserName').value = name;
    document.getElementById('editWage').value = currentWage || '';
    document.getElementById('editWageModal').style.display = 'flex';
}

async function saveWage() {
    const userId = document.getElementById('editUserId').value;
    const wage = parseInt(document.getElementById('editWage').value) || 0;
    
    if (wage < 0) {
        alert('시급은 0 이상이어야 합니다.');
        return;
    }
    
    try {
        const res = await fetch('/api/staff/wage', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, wage })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('시급이 저장되었습니다.');
            closeEditWageModal();
            loadStaffList();
        } else {
            alert('저장 실패: ' + (data.message || '알 수 없는 오류'));
        }
    } catch (e) {
        console.error('시급 저장 오류:', e);
        alert('서버 통신 오류가 발생했습니다.');
    }
}

function closeEditWageModal() {
    document.getElementById('editWageModal').style.display = 'none';
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

// ===== 일일입력 날짜 이동 =====
function changeDailyDate(days) {
    const dateInput = document.getElementById('accDate');
    if (!dateInput) return;
    
    const currentDate = new Date(dateInput.value);
    currentDate.setDate(currentDate.getDate() + days);
    
    const newDateStr = currentDate.toISOString().split('T')[0];
    dateInput.value = newDateStr;
    loadDailyData();
}

function goToToday() {
    const dateInput = document.getElementById('accDate');
    if (!dateInput) return;
    
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    loadDailyData();
}

// ===== 입력내역 월 이동 =====
function changeHistoryMonth(months) {
    historyMonth.setMonth(historyMonth.getMonth() + months);
    updateMonthDisplays();
    loadHistory();
}

function goToCurrentMonth() {
    historyMonth = new Date();
    updateMonthDisplays();
    loadHistory();
}

// ===== 예상순익 월 이동 =====
function changePredMonth(months) {
    predMonth.setMonth(predMonth.getMonth() + months);
    updateMonthDisplays();
    renderPrediction();
}

function goToPredCurrentMonth() {
    predMonth = new Date();
    updateMonthDisplays();
    renderPrediction();
}

// ===== 월간분석 월 이동 =====
function changeDashMonth(months) {
    dashMonth.setMonth(dashMonth.getMonth() + months);
    updateMonthDisplays();
    renderDashboard();
}

function goToDashCurrentMonth() {
    dashMonth = new Date();
    updateMonthDisplays();
    renderDashboard();
}

// ===== 월 표시 업데이트 =====
function updateMonthDisplays() {
    const historyDisplay = document.getElementById('historyMonthDisplay');
    if (historyDisplay) {
        historyDisplay.textContent = `${historyMonth.getFullYear()}년 ${historyMonth.getMonth() + 1}월`;
    }
    
    const predDisplay = document.getElementById('predMonthDisplay');
    if (predDisplay) {
        predDisplay.textContent = `${predMonth.getFullYear()}년 ${predMonth.getMonth() + 1}월`;
    }
    
    const dashDisplay = document.getElementById('dashMonthDisplay');
    if (dashDisplay) {
        dashDisplay.textContent = `${dashMonth.getFullYear()}년 ${dashMonth.getMonth() + 1}월`;
    }
}

// ===== 입력내역 로드 =====
async function loadHistory() {
    const yearMonth = `${historyMonth.getFullYear()}-${String(historyMonth.getMonth() + 1).padStart(2, '0')}`;
    
    try {
        const res = await fetch(`/api/accounting/history?month=${yearMonth}`);
        const data = await res.json();
        
        if (data.success) {
            renderHistory(data.history);
        }
    } catch (e) {
        console.error('입력내역 로드 실패:', e);
    }
}

function renderHistory(history) {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:40px;">입력된 데이터가 없습니다.</p>';
        return;
    }
    
    // 날짜별로 정렬 (최신순)
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let html = '<div style="display:grid; gap:15px;">';
    
    history.forEach(item => {
        const date = new Date(item.date);
        const dateStr = `${date.getMonth() + 1}월 ${date.getDate()}일 (${['일','월','화','수','목','금','토'][date.getDay()]})`;
        
        const b1Total = (item.b1_card || 0) + (item.b1_cash || 0) + (item.b1_delivery || 0);
        const b3Total = (item.b3_card || 0) + (item.b3_cash || 0) + (item.b3_delivery || 0);
        const grandTotal = b1Total + b3Total;
        const expenseTotal = (item.ex_gosen || 0) + (item.ex_hangang || 0) + (item.ex_etc || 0);
        
        html += `
            <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:15px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #eee;">
                    <div>
                        <div style="font-size:16px; font-weight:bold; color:#333;">${dateStr}</div>
                        <div style="font-size:12px; color:#999; margin-top:3px;">통합 매출: ${grandTotal.toLocaleString()}원</div>
                    </div>
                    <button onclick="goToEditDate('${item.date}')" style="background:#1976d2; color:white; border:none; padding:6px 12px; border-radius:5px; cursor:pointer; font-size:12px;">
                        ✏️ 수정
                    </button>
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                    <div style="background:#e3f2fd; padding:10px; border-radius:5px;">
                        <div style="font-size:11px; color:#1976d2; margin-bottom:5px;">⚾ 1루 매출</div>
                        <div style="font-size:15px; font-weight:bold; color:#1976d2;">${b1Total.toLocaleString()}원</div>
                        <div style="font-size:10px; color:#666; margin-top:3px;">
                            카드 ${(item.b1_card || 0).toLocaleString()} | 현금 ${(item.b1_cash || 0).toLocaleString()} | 배달 ${(item.b1_delivery || 0).toLocaleString()}
                        </div>
                    </div>
                    <div style="background:#fbe9e7; padding:10px; border-radius:5px;">
                        <div style="font-size:11px; color:#e64a19; margin-bottom:5px;">⚾ 3루 매출</div>
                        <div style="font-size:15px; font-weight:bold; color:#e64a19;">${b3Total.toLocaleString()}원</div>
                        <div style="font-size:10px; color:#666; margin-top:3px;">
                            카드 ${(item.b3_card || 0).toLocaleString()} | 현금 ${(item.b3_cash || 0).toLocaleString()} | 배달 ${(item.b3_delivery || 0).toLocaleString()}
                        </div>
                    </div>
                </div>
                
                <div style="background:#fff3cd; padding:10px; border-radius:5px;">
                    <div style="font-size:11px; color:#f57f17; margin-bottom:5px;">💸 공통 지출 (${expenseTotal.toLocaleString()}원)</div>
                    <div style="font-size:10px; color:#666;">
                        고센 ${(item.ex_gosen || 0).toLocaleString()} | 한강 ${(item.ex_hangang || 0).toLocaleString()} | 기타 ${(item.ex_etc || 0).toLocaleString()}
                    </div>
                    ${item.ex_note ? `<div style="font-size:10px; color:#999; margin-top:5px; font-style:italic;">📝 ${item.ex_note}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// 수정 버튼 클릭 시 일일입력 탭으로 이동
function goToEditDate(dateStr) {
    document.getElementById('accDate').value = dateStr;
    switchAccSubTab('daily-input');
    loadDailyData();
}

// ===== 예상순익 렌더링 =====
async function renderPrediction() {
    const storeType = document.getElementById('predStoreSelect').value;
    const yearMonth = `${predMonth.getFullYear()}-${String(predMonth.getMonth() + 1).padStart(2, '0')}`;
    
    try {
        const res = await fetch(`/api/accounting/prediction?month=${yearMonth}&store=${storeType}`);
        const data = await res.json();
        
        if (data.success) {
            displayPrediction(data.analysis);
        }
    } catch (e) {
        console.error('예상순익 로드 실패:', e);
    }
}

function displayPrediction(analysis) {
    const container = document.getElementById('predictionResult');
    if (!container) return;
    
    const {
        totalSales = 0,
        totalExpense = 0,
        commissionFee = 0,
        deliveryFee = 0,
        fixedCost = 0,
        totalCost = 0,
        netProfit = 0,
        margin = 0,
        daysElapsed = 0,
        daysInMonth = 0
    } = analysis;
    
    const profitColor = netProfit >= 0 ? '#2e7d32' : '#d32f2f';
    
    let html = `
        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:20px;">
            <div style="font-size:13px; color:#666; margin-bottom:10px;">
                📅 분석 기준: ${daysElapsed}일 / ${daysInMonth}일 경과 (${((daysElapsed/daysInMonth)*100).toFixed(1)}%)
            </div>
        </div>
        
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:15px; margin-bottom:25px;">
            <div style="background:linear-gradient(135deg, #1976d2, #42a5f5); color:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size:13px; opacity:0.9; margin-bottom:5px;">💰 총 매출</div>
                <div style="font-size:24px; font-weight:bold;">${totalSales.toLocaleString()}원</div>
            </div>
            <div style="background:linear-gradient(135deg, #f57c00, #ff9800); color:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size:13px; opacity:0.9; margin-bottom:5px;">💸 총 비용</div>
                <div style="font-size:24px; font-weight:bold;">${totalCost.toLocaleString()}원</div>
            </div>
            <div style="background:linear-gradient(135deg, ${netProfit >= 0 ? '#2e7d32, #43a047' : '#d32f2f, #f44336'}); color:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size:13px; opacity:0.9; margin-bottom:5px;">📊 예상 순익</div>
                <div style="font-size:24px; font-weight:bold;">${netProfit.toLocaleString()}원</div>
                <div style="font-size:12px; opacity:0.8; margin-top:5px;">마진율: ${margin.toFixed(1)}%</div>
            </div>
        </div>
        
        <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:20px;">
            <h4 style="margin:0 0 15px 0; color:#333;">📉 비용 상세 내역</h4>
            <div style="display:grid; gap:10px;">
                <div style="display:flex; justify-content:space-between; padding:10px; background:#f8f9fa; border-radius:5px;">
                    <span style="color:#666;">🛒 일일 지출 (고센+한강+기타)</span>
                    <strong>${totalExpense.toLocaleString()}원</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:10px; background:#f8f9fa; border-radius:5px;">
                    <span style="color:#666;">💳 수수료 (매출의 30%)</span>
                    <strong>${commissionFee.toLocaleString()}원</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:10px; background:#f8f9fa; border-radius:5px;">
                    <span style="color:#666;">🛵 배달타자 수수료 (4.95%)</span>
                    <strong>${deliveryFee.toLocaleString()}원</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:10px; background:#e3f2fd; border-radius:5px;">
                    <span style="color:#666;">🔧 월 고정비 (일할 계산)</span>
                    <strong>${fixedCost.toLocaleString()}원</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:12px; background:#fff3cd; border-radius:5px; border-top:2px solid #fbc02d;">
                    <span style="font-weight:bold; color:#f57f17;">합계</span>
                    <strong style="font-size:18px; color:#f57f17;">${totalCost.toLocaleString()}원</strong>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ===== 월간분석 렌더링 =====
async function renderDashboard() {
    const storeType = document.getElementById('dashStoreSelect').value;
    const yearMonth = `${dashMonth.getFullYear()}-${String(dashMonth.getMonth() + 1).padStart(2, '0')}`;
    
    try {
        const res = await fetch(`/api/accounting/dashboard?month=${yearMonth}&store=${storeType}`);
        const data = await res.json();
        
        if (data.success) {
            displayDashboard(data.analysis);
        }
    } catch (e) {
        console.error('월간분석 로드 실패:', e);
    }
}

function displayDashboard(analysis) {
    const container = document.getElementById('dashboardResult');
    if (!container) return;
    
    const {
        totalSales = 0,
        salesByType = {},
        totalExpense = 0,
        commissionFee = 0,
        deliveryFee = 0,
        fixedCost = 0,
        totalCost = 0,
        netProfit = 0,
        margin = 0
    } = analysis;
    
    const profitColor = netProfit >= 0 ? '#2e7d32' : '#d32f2f';
    
    let html = `
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:15px; margin-bottom:25px;">
            <div style="background:linear-gradient(135deg, #1976d2, #42a5f5); color:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size:13px; opacity:0.9; margin-bottom:5px;">💰 총 매출</div>
                <div style="font-size:24px; font-weight:bold;">${totalSales.toLocaleString()}원</div>
            </div>
            <div style="background:linear-gradient(135deg, #f57c00, #ff9800); color:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size:13px; opacity:0.9; margin-bottom:5px;">💸 총 비용</div>
                <div style="font-size:24px; font-weight:bold;">${totalCost.toLocaleString()}원</div>
            </div>
            <div style="background:linear-gradient(135deg, ${netProfit >= 0 ? '#2e7d32, #43a047' : '#d32f2f, #f44336'}); color:white; padding:20px; border-radius:10px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size:13px; opacity:0.9; margin-bottom:5px;">📊 순수익</div>
                <div style="font-size:24px; font-weight:bold;">${netProfit.toLocaleString()}원</div>
                <div style="font-size:12px; opacity:0.8; margin-top:5px;">순이익률: ${margin.toFixed(1)}%</div>
            </div>
        </div>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px;">
            <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:20px;">
                <h4 style="margin:0 0 15px 0; color:#333;">💳 매출 구성</h4>
                <div style="display:grid; gap:8px;">
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#f8f9fa; border-radius:4px;">
                        <span>카드</span>
                        <strong>${(salesByType.card || 0).toLocaleString()}원</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#f8f9fa; border-radius:4px;">
                        <span>현금</span>
                        <strong>${(salesByType.cash || 0).toLocaleString()}원</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#f8f9fa; border-radius:4px;">
                        <span>배달타자</span>
                        <strong>${(salesByType.delivery || 0).toLocaleString()}원</strong>
                    </div>
                </div>
            </div>
            
            <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:20px;">
                <h4 style="margin:0 0 15px 0; color:#333;">💸 비용 구성</h4>
                <div style="display:grid; gap:8px;">
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#f8f9fa; border-radius:4px;">
                        <span>일일 지출</span>
                        <strong>${totalExpense.toLocaleString()}원</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#f8f9fa; border-radius:4px;">
                        <span>수수료 (30%)</span>
                        <strong>${commissionFee.toLocaleString()}원</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#f8f9fa; border-radius:4px;">
                        <span>배달 수수료</span>
                        <strong>${deliveryFee.toLocaleString()}원</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:8px; background:#e3f2fd; border-radius:4px;">
                        <span>월 고정비</span>
                        <strong>${fixedCost.toLocaleString()}원</strong>
                    </div>
                </div>
            </div>
        </div>
        
        <div style="background:${netProfit >= 0 ? '#e8f5e9' : '#ffebee'}; padding:20px; border-radius:8px; text-align:center;">
            <div style="font-size:16px; font-weight:bold; color:${profitColor};">
                ${netProfit >= 0 ? '🎉 흑자 달성!' : '⚠️ 적자 상태'}
            </div>
            <div style="font-size:14px; color:#666; margin-top:5px;">
                ${netProfit >= 0 
                    ? `이번 달 순수익: ${netProfit.toLocaleString()}원` 
                    : `손익분기까지: ${Math.abs(netProfit).toLocaleString()}원 남음`}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
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

// ===== 직원 관리 기능 =====

// 직원 목록 불러오기
async function loadStaffList() {
    try {
        const res = await fetch('/api/staff/list');
        const data = await res.json();
        
        if (data.success) {
            staffListData = data.staff;
            renderStaffList();
        }
    } catch (e) {
        console.error('직원 목록 로드 실패:', e);
    }
}

// 직원 목록 렌더링
function renderStaffList() {
    const container = document.getElementById('staffListArea');
    if (!container) return;
    
    if (staffListData.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">등록된 직원이 없습니다.</p>';
        return;
    }
    
    let html = '<div style="display:grid; gap:10px;">';
    
    staffListData.forEach(staff => {
        const roleText = staff.role === 'admin' ? '사장' : 
                        staff.role === 'manager' ? '매니저' : '알바';
        const wageText = staff.hourly_wage > 0 ? `${staff.hourly_wage.toLocaleString()}원/시간` : '미설정';
        
        html += `
            <div style="background:white; border:1px solid #ddd; border-left:4px solid #2e7d32; padding:15px; border-radius:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:16px; font-weight:bold; margin-bottom:5px;">
                            ${staff.name} <span style="background:#e8f5e9; color:#2e7d32; padding:2px 8px; border-radius:10px; font-size:11px;">${roleText}</span>
                        </div>
                        <div style="font-size:13px; color:#666;">
                            ID: <strong>${staff.username}</strong> | 시급: <strong>${wageText}</strong>
                        </div>
                    </div>
                    <div>
                        ${staff.role === 'staff' ? `
                            <button onclick="openEditWage(${staff.id}, '${staff.name}', ${staff.hourly_wage})" 
                                    class="btn" style="background:#ff9800; padding:8px 15px; font-size:12px;">
                                💰 시급설정
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// 일괄 등록 처리
async function processBulkText() {
    const text = document.getElementById('bulkText').value.trim();
    if (!text) {
        alert('등록할 직원 정보를 입력하세요.');
        return;
    }
    
    const lines = text.split('\n').filter(line => line.trim());
    const staffToRegister = [];
    
    lines.forEach(line => {
        // 쉼표 또는 공백으로 구분
        let parts = line.split(',').map(p => p.trim());
        if (parts.length < 3) {
            parts = line.split(/\s+/);
        }
        
        if (parts.length >= 3) {
            const name = parts[0];
            const dayStr = parts[1];
            let timeStr = parts[2];
            
            // 요일 파싱
            const workDays = [];
            const dayMap = {
                '일': 'Sun', '월': 'Mon', '화': 'Tue', '수': 'Wed',
                '목': 'Thu', '금': 'Fri', '토': 'Sat'
            };
            
            for (let [kor, eng] of Object.entries(dayMap)) {
                if (dayStr.includes(kor)) {
                    workDays.push(eng);
                }
            }
            
            // 시간 파싱 (18~23 -> 18:00~23:00)
            timeStr = timeStr.replace('시', '').replace(' ', '');
            if (timeStr.includes('~')) {
                const [start, end] = timeStr.split('~');
                const cleanStart = start.includes(':') ? start : start + ':00';
                const cleanEnd = end.includes(':') ? end : end + ':00';
                timeStr = `${cleanStart}~${cleanEnd}`;
            }
            
            if (name && workDays.length > 0) {
                staffToRegister.push({
                    name: name,
                    workDays: workDays,
                    workTime: timeStr
                });
            }
        }
    });
    
    if (staffToRegister.length === 0) {
        alert('올바른 형식으로 입력하세요.\n예시: 홍길동, 월화수, 18~23');
        return;
    }
    
    if (!confirm(`${staffToRegister.length}명의 직원을 등록하시겠습니까?`)) {
        return;
    }
    
    try {
        const res = await fetch('/api/staff/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff: staffToRegister })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showRegisterResult(data.registered);
            document.getElementById('bulkText').value = '';
            loadStaffList();
        } else {
            alert('등록 실패: ' + (data.message || '알 수 없는 오류'));
        }
    } catch (e) {
        console.error('등록 오류:', e);
        alert('서버 통신 오류가 발생했습니다.');
    }
}

// 등록 결과 모달 표시
function showRegisterResult(registered) {
    const modal = document.getElementById('staffRegisterModal');
    const listEl = document.getElementById('registeredStaffList');
    
    let html = '';
    registered.forEach((staff, idx) => {
        html += `
            <div style="background:white; padding:15px; margin-bottom:10px; border-radius:5px; border-left:4px solid #4caf50;">
                <div style="font-weight:bold; margin-bottom:8px; font-size:15px;">${idx + 1}. ${staff.name}</div>
                <div style="background:#f1f3f5; padding:10px; border-radius:4px; font-family:monospace;">
                    <div style="margin-bottom:5px;">🆔 아이디: <strong style="color:#1976d2;">${staff.username}</strong></div>
                    <div>🔐 비밀번호: <strong style="color:#d32f2f;">${staff.password}</strong></div>
                </div>
                <div style="font-size:12px; color:#666; margin-top:8px;">
                    근무: ${staff.workDays.map(d => {
                        const dayNames = {Sun:'일', Mon:'월', Tue:'화', Wed:'수', Thu:'목', Fri:'금', Sat:'토'};
                        return dayNames[d];
                    }).join(', ')}요일 ${staff.workTime}
                </div>
            </div>
        `;
    });
    
    listEl.innerHTML = html;
    modal.style.display = 'flex';
}

// 모달 닫기
function closeRegisterModal() {
    document.getElementById('staffRegisterModal').style.display = 'none';
}

// 시급 설정 모달 열기
function openEditWage(userId, name, currentWage) {
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserName').value = name;
    document.getElementById('editWage').value = currentWage || '';
    document.getElementById('editWageModal').style.display = 'flex';
}

// 시급 저장
async function saveWage() {
    const userId = document.getElementById('editUserId').value;
    const wage = parseInt(document.getElementById('editWage').value) || 0;
    
    if (wage < 0) {
        alert('시급은 0 이상이어야 합니다.');
        return;
    }
    
    try {
        const res = await fetch('/api/staff/wage', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, wage })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('시급이 저장되었습니다.');
            closeEditWageModal();
            loadStaffList();
        } else {
            alert('저장 실패: ' + (data.message || '알 수 없는 오류'));
        }
    } catch (e) {
        console.error('시급 저장 오류:', e);
        alert('서버 통신 오류가 발생했습니다.');
    }
}

// 시급 모달 닫기
function closeEditWageModal() {
    document.getElementById('editWageModal').style.display = 'none';
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