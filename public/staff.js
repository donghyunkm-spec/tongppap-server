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
        const res = await fetch('/api/me', {
            credentials: 'include'
        });
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
            credentials: 'include',
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
    await fetch('/api/logout', { 
        method: 'POST',
        credentials: 'include'
    });
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
    
    // 서브탭 버튼들 활성화/비활성화
    const subtabContainer = document.getElementById('schedule-subtabs');
    if (subtabContainer) {
        subtabContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
    }
    
    // 모든 뷰 숨기기
    document.getElementById('daily-schedule-view').style.display = 'none';
    document.getElementById('weekly-schedule-view').style.display = 'none';
    document.getElementById('monthly-schedule-view').style.display = 'none';
    document.getElementById('admin-staff-manage').style.display = 'none';
    
    // 선택된 뷰 표시
    if (tab === 'daily') {
        document.getElementById('daily-schedule-view').style.display = 'block';
        renderCalendar();
    } else if (tab === 'weekly') {
        document.getElementById('weekly-schedule-view').style.display = 'block';
        // TODO: 주간 뷰 렌더링
    } else if (tab === 'monthly') {
        document.getElementById('monthly-schedule-view').style.display = 'block';
        // TODO: 월간 뷰 렌더링
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
    } else if (subTab === 'daily-input') {
        loadDailyData();
    }
}

// ===== 스태프 뷰 - 내 근무일정 =====
async function loadMySchedule() {
    const today = new Date();
    const start = new Date(today);
    start.setDate(1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    try {
        const res = await fetch(`/api/schedules?start=${start.toISOString().split('T')[0]}&end=${end.toISOString().split('T')[0]}`, {
            credentials: 'include'
        });
        const data = await res.json();
        
        const area = document.getElementById('myScheduleList');
        area.innerHTML = '';
        
        if (data.data.length === 0) {
            area.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">등록된 근무 일정이 없습니다.</div>';
        } else {
            data.data.forEach(s => {
                area.innerHTML += `
                    <div style="background:white; padding:15px; margin-bottom:10px; border-radius:5px; border-left:4px solid #4caf50;">
                        <div style="font-weight:bold; margin-bottom:5px;">${new Date(s.date).toLocaleDateString('ko-KR')}</div>
                        <div style="color:#007bff;">${s.start_time} ~ ${s.end_time}</div>
                    </div>
                `;
            });
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadTodayClockStatus() {
    try {
        const res = await fetch('/api/clock/status', {
            credentials: 'include'
        });
        const data = await res.json();
        
        if (data.success && data.record) {
            document.getElementById('clockInTime').textContent = data.record.clock_in || '-';
            document.getElementById('clockOutTime').textContent = data.record.clock_out || '-';
        }
    } catch (e) {
        console.error(e);
    }
}

async function clockIn() {
    if (!confirm('출근 처리하시겠습니까?')) return;
    
    try {
        const res = await fetch('/api/clock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ type: 'in' })
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
            credentials: 'include',
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

// ===== 관리자/매니저 뷰 - 캘린더 =====
async function renderCalendar() {
    const dateStr = calendarDate.toISOString().split('T')[0];
    document.getElementById('calendarTitle').textContent = 
        `${calendarDate.getFullYear()}년 ${calendarDate.getMonth() + 1}월 ${calendarDate.getDate()}일`;
    
    const area = document.getElementById('calendarArea');
    area.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> 로딩중...</div>';
    
    if (currentSubTab === 'daily') {
        try {
            const res = await fetch(`/api/schedules?start=${dateStr}&end=${dateStr}`, {
                credentials: 'include'
            });
            const data = await res.json();
            
            area.innerHTML = '';
            
            if (data.data.length === 0) {
                area.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">이 날짜에 근무자가 없습니다.</div>';
            } else {
                data.data.forEach(s => {
                    const statusClass = s.status === 'off' ? 'schedule-off' : '';
                    area.innerHTML += `
                        <div class="schedule-item ${statusClass}" style="background:white; padding:15px; margin-bottom:10px; border-radius:5px; display:flex; justify-content:space-between; align-items:center; ${s.status === 'off' ? 'opacity:0.5;' : ''}">
                            <div>
                                <strong style="font-size:18px;">${s.name}</strong> 
                                <span style="font-size:12px; color:#666;">(${s.role === 'staff' ? '알바' : '매니저'})</span><br>
                                <span style="color:#007bff; font-weight:bold;">${s.start_time} ~ ${s.end_time}</span>
                                ${s.status === 'off' ? '<span style="color:#dc3545; font-weight:bold; margin-left:10px;">임시휴무</span>' : ''}
                            </div>
                            <div style="display:flex; gap:5px;">
                                ${s.status !== 'off' ? `
                                    <button onclick="openEditScheduleModal(${s.id}, ${s.user_id}, '${s.date}', '${s.start_time}', '${s.end_time}')" 
                                            style="background:#1976d2; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">수정</button>
                                    <button onclick="toggleScheduleOff(${s.id})" 
                                            style="background:#ff9800; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">임시휴무</button>
                                ` : `
                                    <button onclick="toggleScheduleOn(${s.id})" 
                                            style="background:#4caf50; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">활성화</button>
                                `}
                            </div>
                        </div>
                    `;
                });
            }
            
            area.innerHTML += `
                <div style="text-align:center; margin-top:20px;">
                    <button onclick="openAddScheduleModal()" style="background:#28a745; color:white; padding:12px 20px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">+ 근무/대타 추가</button>
                </div>
            `;
        } catch (e) {
            console.error(e);
        }
    }
}

function moveCalendar(delta) {
    calendarDate.setDate(calendarDate.getDate() + delta);
    renderCalendar();
}

// 근무 추가 모달 열기
function openAddScheduleModal() {
    document.getElementById('scheduleModalTitle').textContent = '➕ 근무/대타 추가';
    document.getElementById('scheduleEditId').value = '';
    document.getElementById('scheduleUserId').value = '';
    document.getElementById('scheduleDate').value = calendarDate.toISOString().split('T')[0];
    document.getElementById('scheduleStartTime').value = '';
    document.getElementById('scheduleEndTime').value = '';
    document.getElementById('scheduleType').value = 'work';
    
    loadStaffSelectList();
    document.getElementById('scheduleModal').style.display = 'flex';
}

// 근무 수정 모달 열기
function openEditScheduleModal(scheduleId, userId, date, startTime, endTime) {
    document.getElementById('scheduleModalTitle').textContent = '✏️ 근무 시간 수정';
    document.getElementById('scheduleEditId').value = scheduleId;
    document.getElementById('scheduleUserId').value = userId;
    document.getElementById('scheduleDate').value = date;
    document.getElementById('scheduleStartTime').value = startTime;
    document.getElementById('scheduleEndTime').value = endTime;
    
    loadStaffSelectList(userId);
    document.getElementById('scheduleModal').style.display = 'flex';
}

// 근무 저장
async function saveSchedule() {
    const scheduleId = document.getElementById('scheduleEditId').value;
    const userId = document.getElementById('scheduleUserId').value || document.getElementById('scheduleStaffSelect').value;
    const date = document.getElementById('scheduleDate').value;
    const startTime = document.getElementById('scheduleStartTime').value;
    const endTime = document.getElementById('scheduleEndTime').value;
    const type = document.getElementById('scheduleType').value;
    
    if (!userId || !date || !startTime || !endTime) {
        alert('모든 필드를 입력하세요.');
        return;
    }
    
    try {
        let res;
        if (scheduleId) {
            // 수정
            res = await fetch(`/api/schedules/${scheduleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ start_time: startTime, end_time: endTime })
            });
        } else {
            // 추가
            res = await fetch('/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ user_id: userId, date, start_time: startTime, end_time: endTime, type })
            });
        }
        
        if (res.ok) {
            alert('저장되었습니다.');
            closeScheduleModal();
            renderCalendar();
        } else {
            alert('저장 실패');
        }
    } catch (e) {
        console.error(e);
        alert('서버 통신 오류');
    }
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').style.display = 'none';
}

// 임시휴무 처리
async function toggleScheduleOff(id) {
    if (!confirm('이 근무를 임시휴무 처리하시겠습니까?')) return;
    
    try {
        const res = await fetch(`/api/schedules/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'off' })
        });
        
        if (res.ok) {
            alert('임시휴무 처리되었습니다.');
            renderCalendar();
        }
    } catch (e) {
        alert('처리 실패');
    }
}

// 근무 활성화
async function toggleScheduleOn(id) {
    if (!confirm('이 근무를 다시 활성화하시겠습니까?')) return;
    
    try {
        const res = await fetch(`/api/schedules/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'active' })
        });
        
        if (res.ok) {
            alert('활성화되었습니다.');
            renderCalendar();
        }
    } catch (e) {
        alert('처리 실패');
    }
}

// 직원 셀렉트 로드
async function loadStaffSelectList(selectedId = null) {
    try {
        const res = await fetch('/api/staff/list', {
            credentials: 'include'
        });
        const data = await res.json();
        
        const select = document.getElementById('scheduleStaffSelect');
        select.innerHTML = '<option value="">선택하세요</option>';
        
        if (data.success) {
            data.staff.forEach(staff => {
                if (!staff.end_date || new Date(staff.end_date) >= new Date()) {
                    const option = document.createElement('option');
                    option.value = staff.id;
                    option.textContent = `${staff.name} (${staff.employee_type === 'monthly' ? '직원' : '알바'})`;
                    if (selectedId && staff.id == selectedId) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                }
            });
        }
    } catch (e) {
        console.error(e);
    }
}

// ===== 직원 관리 기능 =====

// 직원 목록 조회
async function loadStaffList() {
    try {
        const res = await fetch('/api/staff/list', {
            credentials: 'include'
        });
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
                         ${staff.role === 'staff' ? `
                            <button onclick="openEditWage(${staff.id}, '${staff.name}', ${staff.hourly_wage})" 
                                    class="btn" style="background:#ff9800; padding:8px 15px; font-size:12px;">
                                💰 시급
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
    document.getElementById('staffStartTime').value = '18:00';
    document.getElementById('staffEndTime').value = '23:00';
    
    // 체크박스 초기화
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(day => {
        document.getElementById(`day_${day}`).checked = false;
    });
    
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
    
    // 선택된 요일 수집
    const workDays = [];
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(day => {
        if (document.getElementById(`day_${day}`).checked) {
            workDays.push(day);
        }
    });
    
    const startTime = document.getElementById('staffStartTime').value;
    const endTime = document.getElementById('staffEndTime').value;
    const workTime = startTime && endTime ? `${startTime}~${endTime}` : '';
    
    const staffData = {
        name,
        employeeType: type,
        hourlyWage,
        monthlySalary,
        startDate,
        endDate,
        workDays,
        workTime
    };
    
    try {
        let res;
        if (staffId) {
            // 수정
            res = await fetch(`/api/staff/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(staffData)
            });
        } else {
            // 추가
            res = await fetch('/api/staff/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
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
            
            // 시간 형식 정규화 (18:00~23:00 또는 18~23 모두 지원)
            timeStr = timeStr.replace('시', '').replace(/\s/g, '');
            if (timeStr.includes('~')) {
                const [start, end] = timeStr.split('~');
                // :가 없으면 추가
                const cleanStart = start.includes(':') ? start : start + ':00';
                const cleanEnd = end.includes(':') ? end : end + ':00';
                timeStr = `${cleanStart}~${cleanEnd}`;
            }
            
            if (name && workDays.length > 0 && timeStr) {
                staffToRegister.push({
                    name: name,
                    workDays: workDays,
                    workTime: timeStr
                });
            }
        }
    });
    
    if (staffToRegister.length === 0) {
        alert('올바른 형식으로 입력하세요.\n예시: 홍길동, 월화수, 18:00~23:00');
        return;
    }
    
    if (!confirm(`${staffToRegister.length}명의 알바를 등록하시겠습니까?`)) {
        return;
    }
    
    try {
        const res = await fetch('/api/staff/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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

// 시급 모달
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
            credentials: 'include',
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

// ===== 매입/매출 관리 =====
async function loadDailyData() {
    const dateStr = document.getElementById('accDate').value;
    if (!dateStr) return;
    
    try {
        const res = await fetch(`/api/accounting/daily?date=${dateStr}`, {
            credentials: 'include'
        });
        
        if (res.ok) {
            const data = await res.json();
            
            document.getElementById('base1_card').value = data.base1_card || '';
            document.getElementById('base1_cash').value = data.base1_cash || '';
            document.getElementById('base1_delivery').value = data.base1_delivery || '';
            
            document.getElementById('base3_card').value = data.base3_card || '';
            document.getElementById('base3_cash').value = data.base3_cash || '';
            document.getElementById('base3_delivery').value = data.base3_delivery || '';
            
            document.getElementById('gosen').value = data.gosen || '';
            document.getElementById('hangang').value = data.hangang || '';
            document.getElementById('etc_cost').value = data.etc_cost || '';
            
            document.getElementById('remarks').value = data.remarks || '';
        }
    } catch (e) {
        console.error(e);
    }
}

async function saveDailyData() {
    const dateStr = document.getElementById('accDate').value;
    
    const dailyData = {
        date: dateStr,
        base1_card: parseInt(document.getElementById('base1_card').value) || 0,
        base1_cash: parseInt(document.getElementById('base1_cash').value) || 0,
        base1_delivery: parseInt(document.getElementById('base1_delivery').value) || 0,
        
        base3_card: parseInt(document.getElementById('base3_card').value) || 0,
        base3_cash: parseInt(document.getElementById('base3_cash').value) || 0,
        base3_delivery: parseInt(document.getElementById('base3_delivery').value) || 0,
        
        gosen: parseInt(document.getElementById('gosen').value) || 0,
        hangang: parseInt(document.getElementById('hangang').value) || 0,
        etc_cost: parseInt(document.getElementById('etc_cost').value) || 0,
        
        remarks: document.getElementById('remarks').value
    };
    
    try {
        const res = await fetch('/api/accounting/daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(dailyData)
        });
        
        if (res.ok) {
            alert('저장되었습니다.');
        } else {
            alert('저장 실패');
        }
    } catch (e) {
        console.error(e);
        alert('저장 실패');
    }
}

// ===== 고정비 관리 =====
let loadedFixData = { base1: {}, base3: {} };

async function loadFixedCost() {
    const month = document.getElementById('fixMonthDisplay').innerText;
    
    try {
        const res = await fetch(`/api/accounting/monthly?month=${month}`, {
            credentials: 'include'
        });
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
            credentials: 'include',
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
        const res = await fetch(`/api/analysis?month=${month}`, {
            credentials: 'include'
        });
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

function renderAnalysis(store, btn) {
    if (btn) {
        btn.parentElement.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    
    const result = document.getElementById('analysisResult');
    if (!analysisData) {
        result.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">데이터를 불러오는 중...</p>';
        return;
    }
    
    // 분석 결과 렌더링 로직 (기존과 동일)
    result.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">분석 데이터 구현 예정</p>';
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
        const res = await fetch(`/api/accounting/history?month=${yearMonth}`, {
            credentials: 'include'
        });
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
    
    let html = '';
    history.forEach(item => {
        const date = new Date(item.date).toLocaleDateString('ko-KR');
        const total = (item.base1_card + item.base1_cash + item.base1_delivery + 
                      item.base3_card + item.base3_cash + item.base3_delivery);
        
        html += `
            <div style="background:white; border:1px solid #ddd; border-radius:5px; padding:15px; margin-bottom:10px;">
                <div style="font-weight:bold; margin-bottom:10px;">${date}</div>
                <div style="font-size:13px; color:#666;">
                    총 매출: <strong style="color:#2e7d32;">${total.toLocaleString()}원</strong><br>
                    1루: ${(item.base1_card + item.base1_cash + item.base1_delivery).toLocaleString()}원 / 
                    3루: ${(item.base3_card + item.base3_cash + item.base3_delivery).toLocaleString()}원
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderPrediction() {
    const result = document.getElementById('predictionResult');
    if (!result) return;
    
    result.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">예상순익 분석 구현 예정</p>';
}

function renderDashboard() {
    const result = document.getElementById('dashboardResult');
    if (!result) return;
    
    result.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">월간분석 구현 예정</p>';
}