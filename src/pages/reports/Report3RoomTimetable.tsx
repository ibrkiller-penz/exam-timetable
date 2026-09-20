import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { ReportSheetHeader } from './ReportSheetHeader';
import { PrintPageSize } from './PrintPageSize';
import { ReportActions } from './ReportActions';
import { ReportHeader } from './ReportHeader';
import { usePrintAll } from './usePrintAll';
import { printAsImage } from './printAsImage';
import { buildRoomTimetableReport } from '../../domain/reports/roomTimetable';
import { Printer, Download} from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';

export const Report3RoomTimetable: React.FC = () => {
  const { rooms, days, times, stages } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id ?? '');
  const { printingAll, setPrintingAll, printAll } = usePrintAll();

  const room = rooms.find(r => r.id === selectedRoomId) ?? rooms[0];
  const report = room ? buildRoomTimetableReport(room, attendance, days, times) : null;

  /** 엑셀 내보내기. 화면의 표를 긁지 않고 자료에서 바로 만듭니다. */
  const exportExcel = () => {
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
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize landscape={true} />
      <ReportHeader
        num="11-3"
        title="고사실 시험시간표"
        actions={
          <ReportActions
            disabled={!stages.stage5}
            onExcel={exportExcel}
            pdfFilename={'고사실 시험시간표.pdf'}
            pdfAllFilename={'고사실 시험시간표 전체.pdf'}
            prepareAll={() => { setPrintingAll(true); return () => setPrintingAll(false); }}
            onPrint={() => printAsImage()}
            onPrintAll={printAll}
          />
        }
      >
        <select
          value={selectedRoomId}
          onChange={e => setSelectedRoomId(e.target.value)}
          className="report-select"
        >
          {rooms.map(r => (
            <option key={r.id} value={r.id}>
              {r.roomName || r.banName || '(별도실)'} {r.banName && r.banName !== r.roomName ? `(${r.banName})` : ''}
            </option>
          ))}
        </select>
      </ReportHeader>

      {!report || !stages.stage5 ? (
        <ReportGate what="고사실 시험시간표" />
      ) : (
        <div className="print-pages flex flex-col gap-8">
        {(printingAll ? rooms.filter(r => r.roomName && r.roomName !== '0') : [room]).map(rm => {
        const rep = rm.id === room.id ? report : buildRoomTimetableReport(rm, attendance, days, times);
        if (!rep) return null;
        return (
        <div key={rm.id} className="print-page page-landscape page-fill bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none">
          <ReportSheetHeader
            title={`고사실 시험시간표 (${rm.roomName})`}
            emphasize={[0, 2]}
            info={[
              ['고사실', rm.roomName],
              ['소속반', rm.banName || '-'],
              ['시험 일수', `${rep.activeDays.length}일`],
              ['하루 교시', `${rep.activePeriods.length}교시`],
            ]}
          />

          <table className="fill-rest w-full text-[16px] text-center border-collapse border-2 border-[#005691]">
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
                    <td className="py-2 bg-[#f8fafc] font-bold text-[13.5px] text-slate-500 border-t-2 border-[#005691] border-b border-[#e8eef5] border-r border-[#e2e8f0]">과목</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-2.5 font-black text-[18px] text-gray-900 break-keep leading-tight border-t-2 border-[#005691] border-b border-[#e8eef5] border-r border-[#e2e8f0] last:border-r-0">
                        {rep.grid[p][d.day]?.subject || '-'}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2 bg-[#f8fafc] font-bold text-[13.5px] text-slate-500 border-b border-[#e8eef5] border-r border-[#e2e8f0]">응시자수</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-2 font-black text-[18px] text-[#b91c1c] border-b border-[#e8eef5] border-r border-[#e2e8f0] last:border-r-0">
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
                    <td className="py-1.5 bg-[#f8fafc] text-[12.5px] text-slate-400 font-bold border-r border-[#e2e8f0]">시험시간</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-1.5 text-[13.5px] text-slate-500 font-semibold border-r border-[#e2e8f0] last:border-r-0">
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
