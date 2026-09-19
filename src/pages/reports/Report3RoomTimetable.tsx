import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { ReportGate } from './ReportGate';
import { usePrintAll } from './usePrintAll';
import { buildRoomTimetableReport } from '../../domain/reports/roomTimetable';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';

export const Report3RoomTimetable: React.FC = () => {
  const { attendance, rooms, days, times, stages } = useAppStore();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? '');
  const { printingAll, printAll } = usePrintAll();

  const room = rooms.find(r => r.id === selectedRoomId) ?? rooms[0];
  const report = room ? buildRoomTimetableReport(room, attendance, days, times) : null;

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">10-3. 고사실 시험시간표</h2>
          <select
            value={selectedRoomId}
            onChange={e => setSelectedRoomId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg"
          >
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.roomName || r.banName || '(별도실)'} {r.banName && r.banName !== r.roomName ? `(${r.banName})` : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={printAll}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#00426e] hover:bg-[#003356] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
          title="모든 고사실을 한 번에 인쇄합니다."
        >
          <Printer className="w-4 h-4" /> 전체 출력
        </button>
        <button
          onClick={() => window.print()}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> 인쇄하기
        </button>
        <button
          onClick={() => {
            const specs = rooms
              .filter(r => r.roomName && r.roomName !== '0')
              .map(r => ({ r, rep: buildRoomTimetableReport(r, attendance, days, times) }))
              .filter(x => Boolean(x.rep))
              .map(({ r, rep }) => {
                const body: (string | number)[][] = [];
                for (const p of rep!.activePeriods) {
                  body.push([`${p}교시`, '과목', ...rep!.activeDays.map(d => rep!.grid[p][d.day]?.subject || '-')]);
                  body.push(['', '응시자수', ...rep!.activeDays.map(d => rep!.grid[p][d.day]?.stuCount ?? '')]);
                  // 별도 고사실로 간 학생이 있으면 그 줄도 남깁니다. 인원이 맞지 않아 보이니까요.
                  if (rep!.activeDays.some(d => rep!.grid[p][d.day]?.separateCount > 0)) {
                    body.push(['', '별도 응시', ...rep!.activeDays.map(d => rep!.grid[p][d.day]?.separateCount || '')]);
                  }
                  body.push(['', '시험시간', ...rep!.activeDays.map(d => rep!.grid[p][d.day]?.timeStr || '-')]);
                }
                return {
                  name: r.roomName,
                  title: '고사실 시험시간표',
                  subtitle: `고사실 ${r.roomName}${r.banName && r.banName !== r.roomName ? ` (${r.banName})` : ''}`,
                  headers: [['교시', '구분', ...rep!.activeDays.map(d => `${d.label}\n${d.dateText}`)]],
                  rows: body,
                  widths: [9, 11, ...rep!.activeDays.map(() => 17)],
                  landscape: true,
                };
              });
            if (specs.length === 0) return;
            downloadWorkbook(specs, '고사실 시험시간표.xlsx');
          }}
          disabled={!stages.stage5}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 엑셀 내보내기
        </button>
      </div>

      {!report || !stages.stage5 ? (
        <ReportGate what="고사실 시험시간표" />
      ) : (
        <div className="print-pages flex flex-col gap-8">
        {(printingAll ? rooms.filter(r => r.roomName && r.roomName !== '0') : [room]).map(rm => {
        const rep = rm.id === room.id ? report : buildRoomTimetableReport(rm, attendance, days, times);
        if (!rep) return null;
        return (
        <div key={rm.id} className="print-page page-landscape bg-white border border-gray-300 p-8 print:p-4 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none">
          {/* 교실 문에 붙이는 종이입니다. 고사실 이름이 제목만큼 커야 복도에서 찾습니다. */}
          <div className="flex justify-between items-end mb-5 gap-4 border-b-4 border-[#005691] pb-3">
            <div>
              <h1 className="font-black text-[34px] leading-none text-[#005691] tracking-tight">고사실 시험시간표</h1>
              <p className="text-[15px] font-bold text-slate-500 mt-1.5">교시별 시험 과목과 응시 인원입니다.</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[13px] font-bold text-slate-400">고사실</div>
              <div className="font-black text-[38px] leading-none text-slate-900 tracking-tight">{rm.roomName}</div>
              {rm.banName && rm.banName !== rm.roomName && (
                <div className="text-[14px] font-bold text-slate-500 mt-0.5">{rm.banName}</div>
              )}
            </div>
          </div>

          <table className="w-full text-[15px] print:text-[14px] text-center border-collapse">
            <thead>
              <tr className="bg-[#eef4f9] text-[#00426e] border-b-2 border-[#005691]">
                <th className="py-2.5 px-2 w-20 text-[15px] font-black border-r border-[#cfe0ed]">교시</th>
                <th className="py-2.5 px-2 w-24 text-[15px] font-black border-r border-[#cfe0ed]">구분</th>
                {rep.activeDays.map(d => (
                  <th key={d.day} className="py-2.5 px-2 font-black text-[16px] border-r border-[#cfe0ed] last:border-r-0">
                    <div>{d.label}</div>
                    <div className="text-[13px] text-gray-600 font-semibold">{d.dateText}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rep.activePeriods.map(p => (
                <React.Fragment key={p}>
                  <tr>
                    <td rowSpan={3} className="py-2 font-black text-[19px] bg-[#f4f7fa] align-middle border-t-2 border-[#005691] border-r border-[#e2e8f0]">
                      {p}교시
                    </td>
                    <td className="py-2 bg-[#f8fafc] font-bold text-[13px] text-slate-500 border-t-2 border-[#005691] border-r border-[#e2e8f0]">과목</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-2.5 font-black text-[17px] text-gray-900 break-keep leading-tight border-t-2 border-[#005691] border-r border-[#e2e8f0] last:border-r-0">
                        {rep.grid[p][d.day]?.subject || '-'}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2 bg-[#f8fafc] font-bold text-[13px] text-slate-500 border-r border-[#e2e8f0]">응시자수</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-2 font-black text-[17px] text-[#b91c1c] border-r border-[#e2e8f0] last:border-r-0">
                        {rep.grid[p][d.day]?.stuCount ? `${rep.grid[p][d.day].stuCount}명` : '-'}
                        {/* 별도 고사실로 간 학생은 이 교실에 없습니다.
                            감독 선생님이 인원을 맞출 때 그만큼이 빈 것을 알아야 합니다. */}
                        {rep.grid[p][d.day]?.separateCount > 0 && (
                          <span className="block text-[12px] font-bold text-amber-700">
                            별도 {rep.grid[p][d.day].separateCount}명
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-1.5 bg-[#f8fafc] text-[12px] text-slate-400 font-bold border-r border-[#e2e8f0]">시험시간</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-1.5 text-[13px] text-slate-500 font-semibold border-r border-[#e2e8f0] last:border-r-0">
                        {rep.grid[p][d.day]?.timeStr || '-'}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        );
        })}
        </div>
      )}
    </div>
  );
};
