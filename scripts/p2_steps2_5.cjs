const fs = require('fs');

// Step2BaseInfo.tsx
fs.writeFileSync('src/pages/Step2BaseInfo.tsx', `import React from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { Plus, Trash2 } from 'lucide-react';
import { MSG } from '../domain/messages';
import { selGrade, selTotalStudents } from '../store/selectors';

export const Step2BaseInfo: React.FC = () => {
  const { stages, days, times, rooms, setExamDays, setExamTimes, updateRoom, addExtraRoom, deleteRoom } = useAppStore();
  const grade = useAppStore(selGrade);
  const totalStudents = useAppStore(selTotalStudents);

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

  const copyFirstPeriodTimes = () => {
    const p1Time = times.find(t => t.day === 1 && t.period === 1)?.time ?? '09:00 ~ 9:50';
    const nextTimes = times.map(t => (t.period === 1 ? { ...t, time: p1Time } : t));
    setExamTimes(nextTimes);
  };

  const guideMsg = !stages.stage1 ? MSG.S2_GUIDE_NOCONFIRM : MSG.S2_GUIDE_NEXT;

  return (
    <div className="flex flex-col h-full bg-white overflow-auto">
      <StageHeader
        stageNumber={2}
        stageTitle="기초정보 설정"
        isConfirmed={stages.stage1}
        guideMessage={guideMsg}
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-3">1. 학년 정보</h3>
            <div className="bg-white p-3 rounded-lg border border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">대상 학년</span>
              <span className="text-base font-extrabold text-blue-700">{grade}학년</span>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-3">2. 고사 시행 일자 설정</h3>
            <div className="space-y-2">
              {days.map(d => (
                <div key={d.day} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="w-14 text-xs font-bold text-gray-700">{d.day}일차</span>
                  <input
                    type="date"
                    value={d.date ?? ''}
                    onChange={e => handleDateChange(d.day, e.target.value)}
                    className="flex-1 px-3 py-1 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">3. 고사 시행 시간 설정</h3>
              <button
                onClick={copyFirstPeriodTimes}
                className="text-xs text-blue-700 hover:underline font-medium"
              >
                1교시 시간 전체복사
              </button>
            </div>
            <div className="flex-1 overflow-auto max-h-[500px] space-y-2 pr-1">
              {times.map(t => (
                <div key={\`\${t.day}_\${t.period}\`} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 text-xs">
                  <span className="w-12 font-bold text-gray-700">{t.day}일차</span>
                  <span className="w-12 font-semibold text-blue-800">{t.period}교시</span>
                  <input
                    type="text"
                    placeholder="09:00 ~ 9:50"
                    value={t.time ?? ''}
                    onChange={e => handleTimeChange(t.day, t.period, e.target.value)}
                    className="flex-1 px-2.5 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">4. 고사실 정보 수정</h3>
              <button
                onClick={addExtraRoom}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" /> 별도실 추가
              </button>
            </div>

            <div className="flex-1 overflow-auto max-h-[500px] border border-gray-200 rounded-lg bg-white shadow-inner">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-100 text-gray-700 sticky top-0 font-semibold border-b border-gray-200">
                  <tr className="divide-x divide-gray-200">
                    <th className="py-2 px-2">반명</th>
                    <th className="py-2 px-1 text-center">인원</th>
                    <th className="py-2 px-2">고사실명</th>
                    <th className="py-2 px-1 text-center">수용</th>
                    <th className="py-2 px-1 text-center">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rooms.map(r => {
                    const isExtra = r.roomName.startsWith('별도실') || r.banName === '';
                    return (
                      <tr key={r.id} className="divide-x divide-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-2 font-medium text-gray-800">{r.banName || '(별도실)'}</td>
                        <td className="py-1.5 px-1 text-center text-gray-500">{r.stuCount ?? '-'}</td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={r.roomName}
                            onChange={e => updateRoom(r.id, { roomName: e.target.value })}
                            className="w-full px-1.5 py-0.5 border border-gray-300 rounded font-semibold text-gray-900"
                          />
                        </td>
                        <td className="py-1.5 px-1 text-center">
                          <input
                            type="number"
                            value={r.capacity}
                            onChange={e => updateRoom(r.id, { capacity: Number(e.target.value) || 0 })}
                            className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center"
                          />
                        </td>
                        <td className="py-1.5 px-1 text-center">
                          {isExtra && (
                            <button
                              onClick={() => deleteRoom(r.id)}
                              className="text-rose-600 hover:text-rose-800 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-100 font-bold text-gray-800 border-t border-gray-200 sticky bottom-0">
                  <tr>
                    <td className="py-2 px-2">총 학생수</td>
                    <td className="py-2 px-1 text-center text-blue-700">{totalStudents}명</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
`, 'utf8');

// Step3Subjects.tsx
fs.writeFileSync('src/pages/Step3Subjects.tsx', `import React from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { MSG } from '../domain/messages';

export const Step3Subjects: React.FC = () => {
  const { subjectSummary, subjectBans, stages } = useAppStore();

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={3}
        stageTitle="과목 및 분반 현황 (조회)"
        isConfirmed={stages.stage1}
        guideMessage={MSG.S3_NEXT}
      />

      <div className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">1. 개설 과목별 학생수</h3>
            <span className="text-xs text-gray-500 font-medium">총 {subjectSummary.length}개 과목</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 text-gray-700 sticky top-0 font-semibold border-b border-gray-200">
                <tr className="divide-x divide-gray-200">
                  <th className="py-2 px-3">과목명</th>
                  <th className="py-2 px-3 text-center">반수</th>
                  <th className="py-2 px-3 text-center">학생수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjectSummary.map(s => (
                  <tr key={s.subject} className="divide-x divide-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-semibold text-gray-900">{s.subject}</td>
                    <td className="py-2 px-3 text-center text-blue-700 font-bold">{s.banCount}반</td>
                    <td className="py-2 px-3 text-center">{s.stuCount}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">2. 과목별 강의실별 학생수 (과목반)</h3>
            <span className="text-xs text-gray-500 font-medium">총 {subjectBans.length}개 분반</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 text-gray-700 sticky top-0 font-semibold border-b border-gray-200">
                <tr className="divide-x divide-gray-200">
                  <th className="py-2 px-3">과목명</th>
                  <th className="py-2 px-3">강의실</th>
                  <th className="py-2 px-3 text-center">학생수</th>
                  <th className="py-2 px-3 text-center">과목연번</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjectBans.map((b, idx) => (
                  <tr key={idx} className="divide-x divide-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-900">{b.subject}</td>
                    <td className="py-2 px-3 font-semibold text-gray-700">{b.room}</td>
                    <td className="py-2 px-3 text-center">{b.stuCount}명</td>
                    <td className="py-2 px-3 text-center text-gray-400">{b.subjectSeq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
`, 'utf8');

// Step4EvalSubjects.tsx
fs.writeFileSync('src/pages/Step4EvalSubjects.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { MSG } from '../domain/messages';
import { CheckSquare, Square } from 'lucide-react';

export const Step4EvalSubjects: React.FC = () => {
  const {
    subjectSummary,
    evalTargets,
    compat,
    compatOverflow,
    stages,
    toggleEvalTarget,
    setAllEvalTargets,
    confirmStage2,
    cancelStage2,
  } = useAppStore();

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);

  const selectedCount = Object.values(evalTargets).filter(Boolean).length;

  const handleConfirm = () => {
    if (!stages.stage1) {
      setAlertModal({ isOpen: true, message: MSG.S4_NEED_S1, isError: true });
      return;
    }
    if (selectedCount === 0) {
      setAlertModal({ isOpen: true, message: MSG.S4_NEED_O, isError: true });
      return;
    }

    setConfirmModal({
      isOpen: true,
      message: MSG.S4_CONFIRM_N(selectedCount),
      onConfirm: () => {
        try {
          confirmStage2();
          setConfirmModal(null);
        } catch (err: any) {
          setAlertModal({ isOpen: true, message: err.message, isError: true });
        }
      },
    });
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: stages.stage3 ? MSG.S4_CANCEL_TT : MSG.S1_CANCEL_CONFIRM,
      onConfirm: () => {
        cancelStage2();
        setConfirmModal(null);
      },
    });
  };

  const guideMsg = stages.stage2
    ? MSG.S4_GUIDE_DONE
    : selectedCount === 0
    ? MSG.S4_GUIDE_ENTER_O
    : MSG.S4_GUIDE_CLICK;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={4}
        stageTitle="평가 대상 과목 지정"
        isConfirmed={stages.stage2}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        actions={
          !stages.stage2 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAllEvalTargets(true)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition"
              >
                전체 선택
              </button>
              <button
                onClick={() => setAllEvalTargets(false)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition"
              >
                전체 해제
              </button>
            </div>
          )
        }
      />

      <div className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        <div className="lg:col-span-5 flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">1. 평가 대상 과목 선택</h3>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              {selectedCount}개 선택됨
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 text-gray-700 sticky top-0 font-semibold border-b border-gray-200">
                <tr className="divide-x divide-gray-200">
                  <th className="py-2.5 px-3 text-center w-12">선택</th>
                  <th className="py-2.5 px-3">과목명</th>
                  <th className="py-2.5 px-3 text-center">반수</th>
                  <th className="py-2.5 px-3 text-center">학생수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjectSummary.map(s => {
                  const isChecked = !!evalTargets[s.subject];
                  return (
                    <tr
                      key={s.subject}
                      onClick={() => !stages.stage2 && toggleEvalTarget(s.subject)}
                      className={\`divide-x divide-gray-100 cursor-pointer transition \${
                        isChecked ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                      } \${stages.stage2 ? 'cursor-not-allowed opacity-90' : ''}\`}
                    >
                      <td className="py-2 px-3 text-center">
                        <button
                          disabled={stages.stage2}
                          className="text-blue-600 focus:outline-none"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-3 font-semibold text-gray-900">{s.subject}</td>
                      <td className="py-2 px-3 text-center text-blue-700 font-bold">{s.banCount}</td>
                      <td className="py-2 px-3 text-center text-gray-600">{s.stuCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">2. 동시 시험 가능 과목 조합 (자동 산출)</h3>
            <span className="text-xs text-gray-500 font-medium">총 {compat.length}개 조합</span>
          </div>

          {compatOverflow && (
            <div className="bg-rose-50 text-rose-700 px-4 py-2 text-xs font-semibold border-b border-rose-200">
              {MSG.S4_TOO_MANY}
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 text-gray-700 sticky top-0 font-semibold border-b border-gray-200">
                <tr className="divide-x divide-gray-200">
                  <th className="py-2 px-3">과목1</th>
                  <th className="py-2 px-3">과목2</th>
                  <th className="py-2 px-3">과목3</th>
                  <th className="py-2 px-3">과목4</th>
                  <th className="py-2 px-2 text-center">반수</th>
                  <th className="py-2 px-2 text-center">응시</th>
                  <th className="py-2 px-2 text-center">미응시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compat.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      평가 대상을 확정하면 동시 시험 가능 과목 조합이 여기에 표시됩니다.
                    </td>
                  </tr>
                ) : (
                  compat.map((c, idx) => (
                    <tr key={idx} className="divide-x divide-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{c.subjects[0] || '-'}</td>
                      <td className="py-2 px-3 font-medium">{c.subjects[1] || '-'}</td>
                      <td className="py-2 px-3 font-medium">{c.subjects[2] || '-'}</td>
                      <td className="py-2 px-3 font-medium">{c.subjects[3] || '-'}</td>
                      <td className="py-2 px-2 text-center font-bold text-blue-700">{c.banCount}</td>
                      <td className="py-2 px-2 text-center">{c.stuCount}</td>
                      <td className="py-2 px-2 text-center text-amber-700">{c.nonTakers}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          message={alertModal.message}
          isError={alertModal.isError}
          onClose={() => setAlertModal(null)}
        />
      )}
    </div>
  );
};
`, 'utf8');

// Step5StudentSubjects.tsx
fs.writeFileSync('src/pages/Step5StudentSubjects.tsx', `import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { MSG } from '../domain/messages';
import { Search } from 'lucide-react';

export const Step5StudentSubjects: React.FC = () => {
  const { students, stages } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students;
    const t = searchTerm.toLowerCase();
    return students.filter(
      s => s.name.toLowerCase().includes(t) || s.ban.toLowerCase().includes(t)
    );
  }, [students, searchTerm]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={5}
        stageTitle="학생별 평가 과목 현황 (조회)"
        isConfirmed={stages.stage2}
        guideMessage={MSG.S5_READONLY}
      />

      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-4 mb-3">
          <span className="text-sm font-semibold text-gray-700">
            총 학생수: <strong className="text-blue-700">{students.length}명</strong>
          </span>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="성명, 반 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 border border-gray-200 rounded-xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-gray-100 text-gray-700 sticky top-0 font-semibold border-b border-gray-200">
              <tr className="divide-x divide-gray-200">
                <th className="py-2.5 px-3">학년</th>
                <th className="py-2.5 px-3">반</th>
                <th className="py-2.5 px-3 text-center">번호</th>
                <th className="py-2.5 px-3">성명</th>
                <th className="py-2.5 px-3">응시 과목 목록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    평가 과목을 확정하면 학생 목록이 표시됩니다.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => (
                  <tr key={idx} className="divide-x divide-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3">{s.grade}</td>
                    <td className="py-2 px-3 font-semibold">{s.ban}</td>
                    <td className="py-2 px-3 text-center">{s.num}</td>
                    <td className="py-2 px-3 font-bold text-gray-900">{s.name}</td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {s.subjects.map(sub => (
                          <span
                            key={sub}
                            className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium"
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
`, 'utf8');

console.log('Steps 2-5 written');
