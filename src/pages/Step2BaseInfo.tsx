import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { Plus, Trash2, Calendar, Clock, Building2, Sparkles, Check, RefreshCw, Copy, Layers, Save, CheckCircle2 } from 'lucide-react';
import { MSG } from '../domain/messages';
import { DEFAULT_PERIOD_TIMES } from '../domain/constants';
import { calculateExamDates, getDayOfWeekKorean } from '../domain/util/dateUtils';
import { saveBaseInfoDefaults } from '../store/persistence';
import { selGrade, selTotalStudents } from '../store/selectors';
import dayjs from 'dayjs';
import { isExtraRoom } from '../domain/types';

export const Step2BaseInfo: React.FC = () => {
  const {
    stages,
    days,
    times,
    rooms,
    setExamDays,
    setExamTimes,
    updateRoom,
    generateRooms,
    addRegularRoom,
    addExtraRoom,
    deleteRoom,
    setStepConfirmed,
    activeGrade,
    copyBaseInfoFromGrade,
  } = useAppStore();

  const grade = useAppStore(selGrade);
  const totalStudents = useAppStore(selTotalStudents);

  // 1. Exam Dates State
  const initialStartDate = days.find(d => d.date)?.date || dayjs().format('YYYY-MM-DD');
  const [startDate, setStartDate] = useState<string>(initialStartDate);
  
  // Initialize duration from actual active dates count (default 3 or 4)
  const activeDateCount = days.filter(d => d.date).length;
  const [examDuration, setExamDuration] = useState<number>(activeDateCount >= 3 ? activeDateCount : 3);

  // Save feedback toast
  const [showSaveToast, setShowSaveToast] = useState<boolean>(false);

  // 2. Exam Rooms Bulk Generation State
  const defaultBanCount = Math.max(1, rooms.filter(r => !r.roomName.startsWith('별도실') && r.banName !== '').length || 8);
  const [bulkBanCount, setBulkBanCount] = useState<number>(defaultBanCount);
  const [bulkCapacity, setBulkCapacity] = useState<number>(25);
  const [bulkPadZero, setBulkPadZero] = useState<boolean>(false); // 3학년 1반부터 시작: false

  // Determine which periods are currently active
  const hasPeriod4 = times.some(t => t.period === 4 && t.time && t.time.trim() !== '');
  const hasPeriod5 = times.some(t => t.period === 5 && t.time && t.time.trim() !== '');

  // Handle exam duration switch (3일, 4일, 5일)
  const handleDurationChange = (cnt: number) => {
    setExamDuration(cnt);
    // Clear dates for days beyond selected duration
    const nextDays = days.map(d => (d.day > cnt ? { ...d, date: null } : d));
    setExamDays(nextDays);
    // Also clear times for days beyond selected duration
    const nextTimes = times.map(t => (t.day > cnt ? { ...t, time: null } : t));
    setExamTimes(nextTimes);
  };

  // Auto calculate consecutive dates excluding weekends
  const handleAutoCalculateDates = () => {
    if (!startDate) return;
    const calculated = calculateExamDates(startDate, examDuration);
    const nextDays = days.map(d => {
      const dateVal = d.day <= examDuration ? (calculated[d.day - 1] ?? null) : null;
      return { ...d, date: dateVal };
    });
    setExamDays(nextDays);

    // Auto-fill default 3 periods for active days
    const nextTimes = times.map(t => {
      const isDayActive = t.day <= examDuration && !!calculated[t.day - 1];
      if (!isDayActive) return { ...t, time: null };
      if (t.period <= 3 && !t.time) {
        return { ...t, time: DEFAULT_PERIOD_TIMES[t.period] };
      }
      return t;
    });
    setExamTimes(nextTimes);
  };

  const handleDateChange = (dayIdx: number, val: string) => {
    const nextDays = days.map(d => (d.day === dayIdx ? { ...d, date: val || null } : d));
    setExamDays(nextDays);
  };

  const handleTimeChange = (dayIdx: number, periodIdx: number, val: string) => {
    const nextTimes = times.map(t =>
      t.day === dayIdx && t.period === periodIdx ? { ...t, time: val || null } : t
    );
    setExamTimes(nextTimes);
  };

  // Set default 3 periods (1~3 periods) for all visible days
  const handleApplyDefault3Periods = () => {
    const nextTimes = times.map(t => {
      if (t.day <= examDuration) {
        if (t.period <= 3) {
          return { ...t, time: DEFAULT_PERIOD_TIMES[t.period] };
        }
        return { ...t, time: null };
      }
      return { ...t, time: null };
    });
    setExamTimes(nextTimes);
  };

  // Add/Remove 4th period
  const handleTogglePeriod4 = () => {
    const nextEnable = !hasPeriod4;
    const nextTimes = times.map(t => {
      if (t.period === 4) {
        if (nextEnable) {
          const isActive = t.day <= examDuration;
          return { ...t, time: isActive ? DEFAULT_PERIOD_TIMES[4] : null };
        }
        return { ...t, time: null };
      }
      return t;
    });
    setExamTimes(nextTimes);
  };

  // Add/Remove 5th period
  const handleTogglePeriod5 = () => {
    const nextEnable = !hasPeriod5;
    const nextTimes = times.map(t => {
      if (t.period === 5) {
        if (nextEnable) {
          const isActive = t.day <= examDuration;
          return { ...t, time: isActive ? DEFAULT_PERIOD_TIMES[5] : null };
        }
        return { ...t, time: null };
      }
      return t;
    });
    setExamTimes(nextTimes);
  };

  // Copy all period times from Day 1 to other visible days (1일차 전체복사)
  const copyFirstDayTimes = () => {
    const day1Times = new Map<number, string | null>();
    for (const t of times.filter(t => t.day === 1)) {
      day1Times.set(t.period, t.time);
    }
    const nextTimes = times.map(t => {
      if (t.day <= examDuration && t.day !== 1) {
        return { ...t, time: day1Times.get(t.period) ?? null };
      }
      return t;
    });
    setExamTimes(nextTimes);
  };

  const handleBulkGenerateRooms = () => {
    generateRooms(bulkBanCount, bulkCapacity, bulkPadZero);
  };

  const handleSave = () => {
    saveBaseInfoDefaults({
      days,
      times,
      rooms,
    });
    setShowSaveToast(true);
    setTimeout(() => {
      setShowSaveToast(false);
    }, 3500);
  };

  const guideMsg = !stages.stage1 ? MSG.S2_GUIDE_NOCONFIRM : MSG.S2_GUIDE_NEXT;

  // Filter visible days strictly according to selected examDuration (3일 -> 3일만, 4일 -> 4일만)
  const visibleDays = days.filter(d => d.day <= examDuration);

  return (
    <div className="flex flex-col h-full bg-white overflow-auto relative">
      <StageHeader
        stageNumber={2}
        stageTitle="기초정보 설정"
        isConfirmed={!!stages.step2}
        confirmLabel="기초정보 확정"
        cancelLabel="확정 취소"
        onConfirm={() => setStepConfirmed(2, true)}
        onCancel={() => setStepConfirmed(2, false)}
        guideMessage={guideMsg}
        actions={
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-[#005691] hover:bg-indigo-700 text-white rounded-lg text-[15px] font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
            title="현재 기초정보 설정 저장"
          >
            <Save className="w-4 h-4" /> 저장하기
          </button>
        }
      />

      {/* Save Toast Notification */}
      {showSaveToast && (
        <div className="fixed top-20 right-8 z-50 bg-white text-indigo-700 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-indigo-500/40 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#005691]" />
          <div>
            <div className="text-[15px] font-bold">기초정보가 브라우저에 안전하게 저장되었습니다.</div>
            <div className="text-[13.5px] text-gray-300">새 파일을 업로드하거나 업데이트해도 시험일자, 시간표, 고사실 설정이 그대로 유지됩니다.</div>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Summary Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
          <div className="flex items-center gap-7">
            <div>
              <span className="text-[14.5px] font-bold text-[#0f172a] uppercase block">대상 학년</span>
              <span className="text-[21px] font-black text-[#005691]">{grade}학년</span>
            </div>
            <div className="h-9 w-px bg-indigo-700/40" />
            <div>
              <span className="text-[14.5px] font-bold text-[#0f172a] uppercase block">총 학생수</span>
              <span className="text-[21px] font-black text-[#005691]">{totalStudents.toLocaleString()}명</span>
            </div>
            <div className="h-9 w-px bg-indigo-700/40" />
            <div>
              <span className="text-[14.5px] font-bold text-[#0f172a] uppercase block">설정 시험일수</span>
              <span className="text-[21px] font-black text-[#005691]">{examDuration}일간</span>
            </div>
            <div className="h-9 w-px bg-indigo-700/40" />
            <div>
              <span className="text-[14.5px] font-bold text-[#0f172a] uppercase block">등록 고사실 수</span>
              <span className="text-[21px] font-black text-[#005691]">{rooms.length}실</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const other = (activeGrade || '2') === '2' ? '3' : '2';
                if (window.confirm(`${other}학년의 시험일정(날짜/시간)과 고사실 설정을 현재 ${(activeGrade || '2')}학년으로 복사하시겠습니까?`)) {
                  copyBaseInfoFromGrade(other);
                  setShowSaveToast(true);
                  setTimeout(() => setShowSaveToast(false), 3000);
                }
              }}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-[14.5px] font-black flex items-center gap-1.5 border border-slate-300 shadow-2xs transition active:scale-95"
              title={`${(activeGrade || '2') === '2' ? '3' : '2'}학년의 기초정보 복사`}
            >
              <Copy className="w-4 h-4 text-indigo-600" /> {(activeGrade || '2') === '2' ? '3' : '2'}학년 일정/고사실 복사
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-[#005691] hover:bg-[#005691] text-white rounded-xl text-[15.5px] font-black flex items-center gap-1.5 shadow-sm transition active:scale-95"
            >
              <Save className="w-4 h-4" /> 저장
            </button>
          </div>
        </div>

        {/* 3 Main Setup Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 1. Exam Dates Column */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 flex-1 flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-3.5 border-b border-gray-200 pb-2.5">
                <h3 className="text-[17.5px] font-black text-[#005691] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#005691]" /> 1. 고사 시행 일자 설정
                </h3>
              </div>

              {/* Auto Calculator Bar */}
              <div className="bg-[#e6f1f8]/70 p-4 rounded-xl border border-gray-200 mb-4 space-y-3 shadow-2xs">
                <div className="text-[15px] font-black text-[#005691] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#005691]" /> 시험일수 및 연속일자 자동 계산
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[14.5px] font-bold text-gray-800 block mb-1">첫째 날(시작일)</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[15px] border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-[#00A651] focus:outline-none font-normal"
                    />
                  </div>
                  <div>
                    <label className="text-[14.5px] font-bold text-gray-800 block mb-1">시험 일수</label>
                    <div className="flex items-center gap-1">
                      {[3, 4, 5].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleDurationChange(cnt)}
                          className={`flex-1 py-1.5 text-[15px] font-black rounded-xl transition ${
                            examDuration === cnt
                              ? 'bg-indigo-700 text-white shadow-2xs'
                              : 'bg-white text-gray-800 border border-gray-200 hover:bg-white'
                          }`}
                        >
                          {cnt}일
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAutoCalculateDates}
                  className="w-full py-2 bg-[#005691] hover:bg-[#005691] text-white rounded-xl text-[15px] font-black flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" /> 주말(휴일) 제외 연속일 자동 적용
                </button>
                <p className="text-[13px] text-[#0f172a] text-center leading-tight font-normal">
                  ※ 토·일요일 등 휴일을 건너뛰고 연속 평일로 자동 편성됩니다.
                </p>
              </div>

              {/* Day List: Strictly show only visibleDays (3일이면 3일만, 4일이면 4일만) */}
              <div className="space-y-2.5 flex-1">
                {visibleDays.map(d => {
                  const dayOfWeek = getDayOfWeekKorean(d.date);
                  return (
                    <div key={d.day} className="flex items-center gap-2.5 bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
                      <span className="w-16 text-[16px] font-black text-gray-900">
                        {d.day}일차 <span className="text-[#005691]">{dayOfWeek}</span>
                      </span>
                      <input
                        type="date"
                        value={d.date ?? ''}
                        onChange={e => handleDateChange(d.day, e.target.value)}
                        className="flex-1 px-3 py-1.5 text-[15.5px] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#00A651] focus:outline-none font-normal"
                      />
                      {d.date && (
                        <button
                          type="button"
                          onClick={() => handleDateChange(d.day, '')}
                          className="text-[#0f172a] hover:text-red-500 text-[17px] font-bold px-1.5"
                          title="날짜 비우기"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Exam Periods/Times Column */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex-1 flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
                <h3 className="text-[17px] font-bold text-[#005691] flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#005691]" /> 2. 고사 시행 시간 설정
                </h3>
              </div>

              {/* Quick Period Buttons Bar */}
              <div className="bg-white p-3 rounded-lg border border-gray-200 mb-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[15px] font-bold text-gray-700">교시 빠른 편성:</span>
                  <button
                    type="button"
                    onClick={copyFirstDayTimes}
                    className="text-[13.5px] text-[#005691] hover:underline flex items-center gap-1 font-normal bg-[#e6f1f8] px-2 py-0.5 rounded border border-[#b3d4e8]"
                    title="1일차의 모든 교시 시간을 다른 날짜에 그대로 복사"
                  >
                    <Copy className="w-3 h-3 text-[#005691]" /> 1일차 전체복사
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={handleApplyDefault3Periods}
                    className="py-1.5 px-2 bg-[#e6f1f8] hover:bg-[#cce3f0] text-red-900 border border-[#b3d4e8] rounded text-[15px] font-normal text-center transition"
                    title="기본 하루 3시간(1~3교시)으로 시간대 초기화"
                  >
                    기본 3시간 적용
                  </button>

                  <button
                    type="button"
                    onClick={handleTogglePeriod4}
                    className={`py-1.5 px-2 rounded text-[15px] font-normal text-center border transition ${
                      hasPeriod4
                        ? 'bg-[#e6f1f8] text-amber-900 border-gray-200'
                        : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                    }`}
                  >
                    {hasPeriod4 ? '✓ 4교시 편성됨' : '+ 4교시 추가'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTogglePeriod5}
                    className={`py-1.5 px-2 rounded text-[15px] font-normal text-center border transition ${
                      hasPeriod5
                        ? 'bg-[#fee2e2] text-[#005691] border-gray-200'
                        : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                    }`}
                  >
                    {hasPeriod5 ? '✓ 5교시 편성됨' : '+ 5교시 추가'}
                  </button>
                </div>
              </div>

              {/* Periods List: Only show visibleDays (3일이면 3일만, 4일이면 4일만) */}
              <div className="flex-1 overflow-auto max-h-[460px] space-y-3 pr-1">
                {visibleDays.map(d => {
                  const dayOfWeek = getDayOfWeekKorean(d.date);
                  const dayTimes = times.filter(t => t.day === d.day);
                  const activePeriodCount = hasPeriod5 ? 5 : hasPeriod4 ? 4 : 3;

                  return (
                    <div key={d.day} className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                      <div className="flex items-center justify-between font-bold text-[15px] text-gray-800 border-b border-gray-100 pb-1.5">
                        <span className="text-blue-900">
                          {d.day}일차 {dayOfWeek} <span className="text-gray-500 font-normal">({d.date || '날짜 미지정'})</span>
                        </span>
                        <span className="text-[13.5px] font-normal text-gray-500">{activePeriodCount}교시 체제</span>
                      </div>

                      <div className="space-y-1.5">
                        {dayTimes
                          .filter(t => t.period <= activePeriodCount)
                          .map(t => (
                            <div key={`${t.day}_${t.period}`} className="flex items-center gap-2 text-[15px]">
                              <span className={`w-12 font-bold px-1.5 py-0.5 rounded text-center text-[13.5px] ${
                                t.period > 3 ? 'bg-[#e6f1f8] text-amber-900' : 'bg-blue-100 text-blue-900'
                              }`}>
                                {t.period}교시
                              </span>
                              <input
                                type="text"
                                placeholder={DEFAULT_PERIOD_TIMES[t.period] || '09:00 ~ 09:50'}
                                value={t.time ?? ''}
                                onChange={e => handleTimeChange(t.day, t.period, e.target.value)}
                                className="flex-1 px-2.5 py-1 text-[15px] border border-gray-300 rounded font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Exam Rooms Column */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex-1 flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
                <h3 className="text-[17px] font-bold text-[#005691] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#005691]" /> 3. 고사실 정보 관리
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => addRegularRoom()}
                    className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded text-[15px] font-normal flex items-center gap-1 transition"
                    title="일반 반 추가"
                  >
                    <Plus className="w-3.5 h-3.5" /> 반 추가
                  </button>
                  <button
                    type="button"
                    onClick={addExtraRoom}
                    className="px-2 py-1 bg-[#005691] hover:bg-[#004270] text-white rounded text-[15px] font-normal flex items-center gap-1 shadow-sm transition"
                    title="별도 고사실 추가"
                  >
                    <Plus className="w-3.5 h-3.5" /> 별도실
                  </button>
                </div>
              </div>

              {/* Bulk Generation Box */}
              <div className="bg-[#e6f1f8]/60 p-3 rounded-lg border border-[#b3d4e8]/70 mb-3 space-y-2">
                <div className="text-[15px] font-bold text-blue-900 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#005691]" /> 반의 수 & 정원 일괄 깔기
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[13.5px] font-normal text-gray-600 block mb-0.5">반의 수</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={bulkBanCount}
                      onChange={e => setBulkBanCount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-2 py-1 text-[15px] border border-gray-300 rounded bg-white font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[13.5px] font-normal text-gray-600 block mb-0.5">학급 정원</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={bulkCapacity}
                      onChange={e => setBulkCapacity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-2 py-1 text-[15px] border border-gray-300 rounded bg-white font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[13.5px] font-normal text-gray-600 block mb-0.5">반 명칭</label>
                    <select
                      value={bulkPadZero ? '01' : '1'}
                      onChange={e => setBulkPadZero(e.target.value === '01')}
                      className="w-full px-1.5 py-1 text-[15px] border border-gray-300 rounded bg-white"
                    >
                      <option value="1">1반, 2반..</option>
                      <option value="01">01반, 02반..</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBulkGenerateRooms}
                  className="w-full py-1.5 bg-[#005691] hover:bg-indigo-700 text-white rounded text-[15px] font-normal flex items-center justify-center gap-1.5 shadow-sm transition"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {bulkBanCount}개 반 고사실 일괄 생성 및 적용
                </button>
              </div>

              {/* Rooms Table */}
              <div className="flex-1 overflow-auto max-h-[440px] border border-gray-200 rounded-xl bg-white shadow-inner">
                <table className="w-full text-[15.5px] text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-900 sticky top-0 font-black border-b border-gray-200 shadow-xs z-10">
                    <tr className="divide-x divide-gray-200">
                      <th className="py-2.5 px-3 w-24">반명</th>
                      <th className="py-2.5 px-2 text-center w-16">인원</th>
                      <th className="py-2.5 px-3">고사실명</th>
                      <th className="py-2.5 px-2 text-center w-18">정원</th>
                      <th className="py-2.5 px-2 text-center w-12">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-normal">
                    {rooms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[#0f172a] font-normal">
                          등록된 고사실이 없습니다. 상단에서 일괄 생성하세요.
                        </td>
                      </tr>
                    ) : (
                      rooms.map(r => {
                        const isExtra = isExtraRoom(r) || r.id.startsWith('extra_') || r.banName === '' || r.roomName.startsWith('별도');
                        return (
                          <tr key={r.id} className="divide-x divide-gray-200 hover:bg-white">
                            {/* Ban Name Input (Editable) */}
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={r.banName}
                                placeholder="(별도실)"
                                onChange={e => updateRoom(r.id, { banName: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-200 rounded-lg font-bold text-[#0f172a] bg-transparent focus:bg-white text-[15px]"
                              />
                            </td>

                            {/* Student Count */}
                            <td className="py-1.5 px-2 text-center text-gray-800 font-normal text-[15px]">
                              {r.stuCount ?? '-'}
                            </td>

                            {/* Room Name Input (Editable) */}
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={r.roomName}
                                onChange={e => updateRoom(r.id, { roomName: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-200 rounded-lg font-black text-[#005691] bg-transparent focus:bg-white text-[15px]"
                              />
                            </td>

                            {/* Capacity Input (Editable) */}
                            <td className="py-1.5 px-2 text-center">
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={r.capacity}
                                onChange={e => updateRoom(r.id, { capacity: Number(e.target.value) || 0 })}
                                className="w-14 px-1.5 py-1 border border-gray-200 rounded-lg text-center font-black text-[#005691] text-[15px]"
                              />
                            </td>

                            {/* Delete Room */}
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => deleteRoom(r.id)}
                                className="text-[#0f172a] hover:text-red-500 p-1.5 rounded-lg hover:bg-[#e6f1f8] transition"
                                title="고사실 삭제"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-white font-black text-gray-900 border-t border-gray-200 sticky bottom-0 z-10 text-[15px]">
                    <tr>
                      <td className="py-2.5 px-3 text-[#0f172a]">총 {rooms.length}실</td>
                      <td className="py-2.5 px-2 text-center text-[#005691] font-normal">{totalStudents}명</td>
                      <td colSpan={3} className="text-right pr-3 text-[#0f172a] font-bold text-[14.5px]">
                        수용총합: <strong className="text-[#005691] font-black">{rooms.reduce((acc, r) => acc + (r.capacity || 0), 0)}석</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
