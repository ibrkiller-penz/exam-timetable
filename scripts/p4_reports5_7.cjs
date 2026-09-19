const fs = require('fs');

// Report5ClassTable.tsx (9-5)
fs.writeFileSync('src/pages/reports/Report5ClassTable.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { buildClassTableReport } from '../../domain/reports/classTable';
import { DayIdx } from '../../domain/types';
import { Printer } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const Report5ClassTable: React.FC = () => {
  const { students, attendance, days, times, rooms, stages } = useAppStore();

  const [selectedBan, setSelectedBan] = useState<string>('01반');
  const [selectedDay, setSelectedDay] = useState<DayIdx>(1);

  const uniqueBans = Array.from(new Set(students.map(s => s.ban))).filter(Boolean);
  const curBan = selectedBan || uniqueBans[0] || '01반';

  const report = buildClassTableReport(curBan, selectedDay, students, attendance, days, times, rooms);
  const dateFormatted = report.dayDateText ? dayjs(report.dayDateText).locale('ko').format('YYYY. M. D.(dd)') : '';

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">9-5. 학급 시험시간표</h2>
          <select
            value={curBan}
            onChange={e => setSelectedBan(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {uniqueBans.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={selectedDay}
            onChange={e => setSelectedDay(Number(e.target.value) as DayIdx)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {[1, 2, 3, 4, 5].map(d => (
              <option key={d} value={d}>{d}일차</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 확정되면 학급 시험시간표가 생성됩니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="font-extrabold text-2xl text-gray-900">
              {report.ban} 시험시간표 — {report.day}일차 {dateFormatted}
            </h1>
            <span className="text-sm font-bold text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
              소속 고사실: {report.roomName}
            </span>
          </div>

          <table className="w-full text-xs text-center border-collapse border border-gray-800">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-800 divide-x divide-gray-800">
                <th rowSpan={2} className="py-2.5 px-2 w-12">번호</th>
                <th rowSpan={2} className="py-2.5 px-3 w-20">성명</th>
                {report.activePeriods.map(p => (
                  <th key={p} colSpan={2} className="py-1 px-2 font-bold">
                    {p}교시
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50 border-b border-gray-800 divide-x divide-gray-800">
                {report.activePeriods.map(p => (
                  <React.Fragment key={p}>
                    <th className="py-1 px-1 font-semibold">과목명</th>
                    <th className="py-1 px-1 font-semibold w-16">고사실</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {report.students.map(s => (
                <tr key={s.num} className="divide-x divide-gray-800 h-7 hover:bg-gray-50">
                  <td className="font-medium">{s.num}</td>
                  <td className="font-bold text-gray-900">{s.name}</td>
                  {report.activePeriods.map(p => (
                    <React.Fragment key={p}>
                      <td className="font-medium">{s.periods[p]?.subject || '-'}</td>
                      <td className="font-bold text-blue-800">{s.periods[p]?.room || '-'}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
`, 'utf8');

// Report6StudentTable.tsx (9-6)
fs.writeFileSync('src/pages/reports/Report6StudentTable.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { buildStudentTableReport } from '../../domain/reports/studentTable';
import { Printer, AlertTriangle } from 'lucide-react';

export const Report6StudentTable: React.FC = () => {
  const { students, attendance, days, times, rooms, stages, settings, meta } = useAppStore();

  const [selectedBan, setSelectedBan] = useState<string>('01반');
  const [selectedNum, setSelectedNum] = useState<number>(1);

  const uniqueBans = Array.from(new Set(students.map(s => s.ban))).filter(Boolean);
  const curBan = selectedBan || uniqueBans[0] || '01반';

  const banStudents = students.filter(s => s.ban === curBan).sort((a, b) => a.num - b.num);
  const student = banStudents.find(s => s.num === selectedNum) ?? banStudents[0];

  const report = student ? buildStudentTableReport(student, attendance, days, times, rooms, settings.showSeatOnStudentTable) : null;

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">9-6. 학생별 시험시간표</h2>
          <select
            value={curBan}
            onChange={e => {
              setSelectedBan(e.target.value);
              setSelectedNum(1);
            }}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {uniqueBans.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={selectedNum}
            onChange={e => setSelectedNum(Number(e.target.value))}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {banStudents.map(s => (
              <option key={s.num} value={s.num}>
                {s.num}번 {s.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 확정되면 학생별 시험시간표가 생성됩니다.
        </div>
      ) : (
        <div className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs max-w-4xl mx-auto">
          <h1 className="text-center font-extrabold text-2xl mb-4 text-gray-900">
            {meta.title}
          </h1>

          <div className="flex justify-between items-center mb-6 text-sm font-semibold text-gray-800">
            <div>
              학번: <strong className="text-blue-800">{report.hakbun}</strong> &nbsp;|&nbsp; 성명: <strong className="text-gray-900">{report.student.name}</strong>
            </div>

            {report.unplacedSubjects.length > 0 && (
              <span className="text-rose-600 font-bold flex items-center gap-1 text-xs">
                <AlertTriangle className="w-4 h-4" /> 오류: {report.unplacedSubjects.join(', ')} 미배치
              </span>
            )}
          </div>

          <table className="w-full text-xs text-center border-collapse border border-gray-800">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-800 divide-x divide-gray-800">
                <th className="py-2.5 px-2 w-16">교시</th>
                <th className="py-2.5 px-2 w-20">구분</th>
                {report.activeDays.map(d => (
                  <th key={d.day} className="py-2 px-2 font-bold">
                    <div>{d.day}일차</div>
                    <div className="text-[11px] text-gray-600">{d.dateText}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {report.activePeriods.map(p => (
                <React.Fragment key={p}>
                  <tr className="divide-x divide-gray-800">
                    <td rowSpan={3} className="py-2 font-bold bg-gray-50 align-middle">
                      {p}교시
                    </td>
                    <td className="py-1.5 bg-gray-50 font-semibold">과목</td>
                    {report.activeDays.map(d => (
                      <td key={d.day} className="py-1.5 font-bold text-gray-900">
                        {report.grid[p][d.day]?.subject || '-'}
                      </td>
                    ))}
                  </tr>

                  <tr className="divide-x divide-gray-800">
                    <td className="py-1.5 bg-gray-50 font-semibold">고사실</td>
                    {report.activeDays.map(d => {
                      const c = report.grid[p][d.day];
                      return (
                        <td key={d.day} className="py-1.5 font-bold text-blue-800">
                          {c ? (
                            <span>
                              {c.examRoom} {c.seat ? \`(좌석 \${c.seat})\` : ''}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  <tr className="divide-x divide-gray-800 border-b-2 border-gray-800">
                    <td className="py-1 bg-gray-50 text-[11px] text-gray-500">시간</td>
                    {report.activeDays.map(d => (
                      <td key={d.day} className="py-1 text-[11px] text-gray-600">
                        {report.grid[p][d.day]?.timeStr || '-'}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
`, 'utf8');

// Report7Labels.tsx (9-7)
fs.writeFileSync('src/pages/reports/Report7Labels.tsx', `import React from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots, selSubjectBanEntries } from '../../store/selectors';
import { buildLabels } from '../../domain/reports/labels';
import { exportLabelsToExcel } from '../../utils/excelExport';
import { onlySubject } from '../../domain/util/text';
import { Printer, Download } from 'lucide-react';

export const Report7Labels: React.FC = () => {
  const { rooms, days, times, placement, evalSubjects, subjectCodes, setSubjectCode, stages } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const labels = buildLabels(placementSlots, placement, rooms, days, times, entries);

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <h2 className="text-xl font-bold text-gray-900">9-7. 문제지 봉투 라벨</h2>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportLabelsToExcel(labels)}
            disabled={labels.length === 0}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> 엑셀 내보내기
          </button>
          <button
            onClick={() => window.print()}
            disabled={!stages.stage5}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-40"
          >
            <Printer className="w-4 h-4" /> 라벨 인쇄 (2칸)
          </button>
        </div>
      </div>

      {!stages.stage5 ? (
        <div className="p-12 text-center text-gray-400 border border-gray-200 rounded-xl bg-gray-50">
          응시현황이 확정되면 문제지 봉투 라벨이 생성됩니다.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Subject code setup */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 no-print">
            <h3 className="text-xs font-bold text-gray-800 mb-3">과목코드 입력 (선택사항)</h3>
            <div className="flex flex-wrap gap-4">
              {evalSubjects.map(s => (
                <div key={s.subject} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                  <span className="text-xs font-semibold text-gray-700">{s.subject}:</span>
                  <input
                    type="text"
                    placeholder="KOR2 등"
                    value={subjectCodes[s.subject] ?? ''}
                    onChange={e => setSubjectCode(s.subject, e.target.value)}
                    className="w-24 px-2 py-0.5 text-xs border border-gray-300 rounded font-mono uppercase"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Labels Preview (2 per page) */}
          <div className="space-y-8 max-w-2xl mx-auto">
            {labels.map(l => {
              const code = subjectCodes[l.subject];
              return (
                <div
                  key={l.seq}
                  className="print-page border-2 border-gray-900 p-8 rounded-xl bg-white shadow-md space-y-4"
                >
                  <div className="flex justify-between border-b-2 border-gray-900 pb-3">
                    <span className="text-base font-extrabold text-gray-800">
                      일시: {l.date} ({l.day} {l.period}) {l.time}
                    </span>
                    <span className="text-xs font-bold bg-gray-100 px-2.5 py-1 rounded border border-gray-300">
                      연번 #{l.seq}
                    </span>
                  </div>

                  <div className="text-2xl font-black text-gray-900">
                    과목: {onlySubject(l.subject)} {code ? \`【 \${code} 】\` : ''}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-base pt-2 font-bold text-gray-800">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      고사실: <span className="text-xl text-blue-900 font-extrabold">{l.examRoom}</span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      응시분반: <span className="text-lg text-gray-900">{l.classRoom}</span>
                    </div>
                  </div>

                  <div className="bg-blue-50/80 p-3 rounded-lg border border-blue-200 text-center font-extrabold text-xl text-blue-900">
                    응시인원: {l.stuCount}명
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
`, 'utf8');

console.log('Reports 5-7 written.');
