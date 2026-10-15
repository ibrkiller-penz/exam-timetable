import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { StepHelp } from '../components/StepHelp';
import { MSG } from '../domain/messages';
import { Search } from 'lucide-react';
import { buildStudents } from '../domain/subjects';
import { Student } from '../domain/types';

export const Step5StudentSubjects: React.FC = () => {
  const { students, neis, subjectSummary, evalTargets, stages, setStepConfirmed, consignedStudents, setConsigned } = useAppStore();
  const consigned = consignedStudents ?? {};
  const keyOf = (s: { ban: string; num: number }) => `${s.ban}-${s.num}`;
  const [searchTerm, setSearchTerm] = useState('');

  const displayStudents = useMemo<Student[]>(() => {
    if (students && students.length > 0) return students;
    if (neis && neis.length > 0) {
      const activeTargets = subjectSummary.filter(s => evalTargets[s.subject]);
      const targets = activeTargets.length > 0 ? activeTargets : subjectSummary;
      return buildStudents(neis, targets);
    }
    return [];
  }, [students, neis, subjectSummary, evalTargets]);

  const filteredStudents = useMemo<Student[]>(() => {
    if (!searchTerm) return displayStudents;
    const t = searchTerm.toLowerCase();
    return displayStudents.filter(
      (s: Student) => s.name.toLowerCase().includes(t) || s.ban.toLowerCase().includes(t)
    );
  }, [displayStudents, searchTerm]);

  // 나이스 자료에서 반이나 강의실 이름에 '위탁'이 들어간 학생. 한 번에 표시할 때 씁니다.
  const autoConsigned = useMemo(() => {
    const keys = new Set<string>();
    for (const r of neis ?? []) {
      if (r.ban?.includes('위탁') || r.room?.includes('위탁') || r.room2?.includes('위탁')) keys.add(keyOf(r));
    }
    return displayStudents.map(keyOf).filter(k => keys.has(k));
  }, [neis, displayStudents]);

  const consignedCount = displayStudents.filter(s => consigned[keyOf(s)]).length;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={5}
        stageTitle="학생별 평가 과목 현황 (조회)"
        help={
          <StepHelp title="5. 학생과목">
            <p>학생 한 명 한 명이 <strong>어떤 평가 과목을 듣는지</strong> 보여 주는 화면입니다. 고치는 곳이 아니라 확인하는 곳입니다.</p>
            <p>여기가 맞아야 뒤가 다 맞습니다.</p>
            <ul>
              <li>한 교시에 <strong>누가 시험을 보고 누가 대기인지</strong>를 이 표로 가릅니다.</li>
              <li>같은 분반 학생을 한 고사실에 모으는 것도 이 자료가 근거입니다.</li>
            </ul>
            <p>빠진 과목이 보이면 1단계 편성현황부터 다시 확인하세요.</p>
            <p><strong>위탁</strong> 칸을 체크해 두면 고사실 명단·좌석배치도·응시현황 엑셀의 <strong>비고에 '위탁'</strong>으로 나갑니다. 배치나 좌석은 바뀌지 않으며, 배치를 확정한 뒤에도 언제든 고칠 수 있습니다.</p>
          </StepHelp>
        }
        isConfirmed={!!stages.step5}
        confirmLabel="학생과목 확인"
        cancelLabel="확인 취소"
        onConfirm={() => setStepConfirmed(5, true)}
        onCancel={() => setStepConfirmed(5, false)}
        guideMessage={MSG.S5_READONLY}
      />

      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[17px] font-normal text-gray-700">
              총 학생수: <strong className="text-[#005691]">{displayStudents.length}명</strong>
              <span className="ml-3">위탁: <strong className="text-red-700">{consignedCount}명</strong></span>
            </span>
            {autoConsigned.length > 0 && (
              <button
                onClick={() => setConsigned(autoConsigned, true)}
                className="px-3 py-1.5 bg-white hover:bg-gray-50 text-[#005691] border border-gray-300 rounded-lg text-[14.5px] font-bold"
                title="나이스 자료에서 반·강의실 이름에 '위탁'이 들어간 학생을 위탁으로 표시합니다."
              >
                위탁반 학생 표시 ({autoConsigned.length}명)
              </button>
            )}
          </div>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="성명, 반 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-[15px] bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 border border-gray-200 rounded-xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-[15px] text-left border-collapse">
            <thead className="bg-gray-100 text-gray-700 sticky top-0 font-normal border-b border-gray-200">
              <tr className="divide-x divide-gray-200">
                <th className="py-2.5 px-3 text-center w-16">위탁</th>
                <th className="py-2.5 px-3">학년</th>
                <th className="py-2.5 px-3">반</th>
                <th className="py-2.5 px-3 text-center">번호</th>
                <th className="py-2.5 px-3">성명</th>
                <th className="py-2.5 px-3">응시 과목 목록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-normal">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    평가 과목을 확정하면 학생 목록이 표시됩니다.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => (
                  <tr key={idx} className={`divide-x divide-gray-100 hover:bg-gray-50 ${consigned[keyOf(s)] ? 'bg-red-50' : ''}`}>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${s.name} 위탁 표시`}
                        checked={Boolean(consigned[keyOf(s)])}
                        onChange={e => setConsigned([keyOf(s)], e.target.checked)}
                        className="w-4 h-4 accent-red-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-2 px-3">{s.grade}</td>
                    <td className="py-2 px-3 font-normal">{s.ban}</td>
                    <td className="py-2 px-3 text-center">{s.num}</td>
                    <td className="py-2 px-3 font-normal text-gray-900">{s.name}</td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {s.subjects.map(sub => (
                          <span
                            key={sub}
                            className="bg-[#e6f1f8] text-red-800 border border-[#b3d4e8] px-2 py-0.5 rounded text-[13.5px] font-normal"
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
