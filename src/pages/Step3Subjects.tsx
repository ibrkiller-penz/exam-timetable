import React, { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { MSG } from '../domain/messages';
import { buildSubjectTables } from '../domain/baseData';

export const Step3Subjects: React.FC = () => {
  const { subjectSummary, subjectBans, neis, stages, setStepConfirmed } = useAppStore();

  const data = useMemo(() => {
    if (subjectSummary.length > 0) {
      return { summary: subjectSummary, bans: subjectBans };
    }
    if (neis.length > 0) {
      const res = buildSubjectTables(neis, 1);
      return { summary: res.subjectSummary, bans: res.subjectBans };
    }
    return { summary: [], bans: [] };
  }, [subjectSummary, subjectBans, neis]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={3}
        stageTitle="과목 및 분반 현황 (조회)"
        isConfirmed={!!stages.step3}
        confirmLabel="과목현황 확인"
        cancelLabel="확인 취소"
        onConfirm={() => setStepConfirmed(3, true)}
        onCancel={() => setStepConfirmed(3, false)}
        guideMessage={MSG.S3_NEXT}
      />

      <div className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden bg-white">
        <div className="flex flex-col border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="bg-white px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-[17.5px] font-black text-[#005691]">1. 개설 과목별 학생수</h3>
            <span className="text-[15px] text-[#0f172a] font-bold">총 {data.summary.length}개 과목</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[16px] text-left border-collapse">
              <thead className="bg-gray-50 text-gray-900 sticky top-0 font-black border-b border-gray-200">
                <tr className="divide-x divide-gray-200">
                  <th className="py-3 px-3.5">과목명</th>
                  <th className="py-3 px-3.5 text-center">반수</th>
                  <th className="py-3 px-3.5 text-center">학생수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-normal">
                {data.summary.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-[#0f172a] font-normal">
                      편성현황 데이터가 없습니다. 1단계에서 엑셀을 업로드하세요.
                    </td>
                  </tr>
                ) : (
                  data.summary.map(s => (
                    <tr key={s.subject} className="divide-x divide-gray-200 hover:bg-white">
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{s.subject}</td>
                      <td className="py-2.5 px-3.5 text-center text-[#005691] font-normal">{s.banCount}반</td>
                      <td className="py-2.5 px-3.5 text-center font-normal text-[#0f172a]">{s.stuCount}명</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="bg-white px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-[17.5px] font-black text-[#005691]">2. 과목별 강의실별 학생수 (과목반)</h3>
            <span className="text-[15px] text-[#0f172a] font-bold">총 {data.bans.length}개 분반</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[16px] text-left border-collapse">
              <thead className="bg-gray-50 text-gray-900 sticky top-0 font-black border-b border-gray-200">
                <tr className="divide-x divide-gray-200">
                  <th className="py-3 px-3.5">과목명</th>
                  <th className="py-3 px-3.5">강의실</th>
                  <th className="py-3 px-3.5 text-center">학생수</th>
                  <th className="py-3 px-3.5 text-center">과목연번</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-normal">
                {data.bans.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-[#0f172a] font-normal">
                      편성현황 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.bans.map((b, idx) => (
                    <tr key={idx} className="divide-x divide-gray-200 hover:bg-white">
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{b.subject}</td>
                      <td className="py-2.5 px-3.5 font-normal text-[#0f172a]">{b.room}</td>
                      <td className="py-2.5 px-3.5 text-center font-normal text-[#0f172a]">{b.stuCount}명</td>
                      <td className="py-2.5 px-3.5 text-center text-[#0f172a]">{b.subjectSeq}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
