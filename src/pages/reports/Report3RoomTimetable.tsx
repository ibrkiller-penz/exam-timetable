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
        num="10-3"
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
        /*
         * 글자 크기 배율. 하루 3교시까지는 크게(과목 26px) 쓰고, 4·5교시면 가로 A4 한 장에
         * 들도록 교시 수에 맞춰 줄입니다. 긴 과목명은 두 줄로 씁니다.
         */
        const k = ({ 4: 0.75, 5: 0.55 } as Record<number, number>)[rep.activePeriods.length] ?? 1;
        return (
        <div key={rm.id} className="print-page page-landscape bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none">
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

          {/* 교실 앞문에 붙여 멀리서 읽는 종이입니다. 표가 남는 높이를 다 쓰므로 글씨도 크게 씁니다
              (예전 13~18px 는 뽑아 보면 작았습니다 — 최희정 선생님 의견).
              칸 폭은 고정합니다(table-fixed). 내용에 맡기면 긴 과목명이 칸을 넓히면서
              교시 칸이 밀려 좁아져 '1교시' 가 두 줄로 갈렸습니다. */}
          <table className="fill-rest w-full table-fixed text-[calc(22px*var(--k))] text-center border-collapse border-2 border-[#005691]" style={{ '--k': k } as React.CSSProperties}>
            <thead>
              <tr className="bg-[#eef4f9] text-[#00426e] border-b-2 border-[#005691]">
                <th className="py-2 px-2 w-28 text-[calc(20px*var(--k))] font-black border-r border-[#cfe0ed]">교시</th>
                <th className="py-2 px-2 w-32 text-[calc(20px*var(--k))] font-black border-r border-[#cfe0ed]">구분</th>
                {rep.activeDays.map(d => (
                  <th key={d.day} className="py-2 px-2 font-black text-[calc(24px*var(--k))] border-r border-[#cfe0ed] last:border-r-0">
                    <div>{d.label}</div>
                    <div className="text-[calc(18px*var(--k))] text-gray-700 font-bold">{d.dateText}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rep.activePeriods.map(p => (
                <React.Fragment key={p}>
                  <tr>
                    <td rowSpan={3} className="py-1 px-1 whitespace-nowrap font-black text-[calc(28px*var(--k))] bg-[#f4f7fa] align-middle border-t-2 border-[#005691] border-r border-[#e2e8f0]">
                      {/* 칸이 좁으면 '1교' / '시' 로 줄이 갈렸습니다. 한 줄로 둡니다. */}
                      {p}교시
                    </td>
                    <td className="py-1 bg-[#f8fafc] font-bold text-[calc(19px*var(--k))] text-slate-600 border-t-2 border-[#005691] border-b border-[#e8eef5] border-r border-[#e2e8f0]">과목</td>
                    {rep.activeDays.map(d => (
                      /* 긴 과목명('기후변화와 환경생태')은 한 줄에 넣느라 글자를 줄이기보다
                         낱말 단위로 두 줄에 씁니다. 뽑았을 때 그 편이 읽힙니다. */
                      <td key={d.day} className="py-1 px-1 font-black text-[calc(26px*var(--k))] text-gray-900 leading-[1.1] break-keep [overflow-wrap:anywhere] border-t-2 border-[#005691] border-b border-[#e8eef5] border-r border-[#e2e8f0] last:border-r-0">
                        {rep.grid[p][d.day]?.subject || '-'}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-1 bg-[#f8fafc] font-bold text-[calc(19px*var(--k))] text-slate-600 border-b border-[#e8eef5] border-r border-[#e2e8f0]">응시자수</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-0.5 font-black text-[calc(26px*var(--k))] text-[#b91c1c] border-b border-[#e8eef5] border-r border-[#e2e8f0] last:border-r-0">
                        {rep.grid[p][d.day]?.stuCount ? `${rep.grid[p][d.day].stuCount}명` : '-'}
                        {/* 별도 고사실로 간 학생은 이 교실에 없습니다.
                            감독 선생님이 인원을 맞출 때 그만큼이 빈 것을 알아야 합니다. */}
                        {rep.grid[p][d.day]?.separateCount > 0 && (
                          <span className="block text-[calc(17px*var(--k))] font-bold text-amber-700">
                            별도 {rep.grid[p][d.day].separateCount}명
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-1 bg-[#f8fafc] text-[calc(18px*var(--k))] text-slate-600 font-bold border-r border-[#e2e8f0]">시험시간</td>
                    {rep.activeDays.map(d => (
                      <td key={d.day} className="py-1 text-[calc(20px*var(--k))] text-slate-700 font-bold tabular-nums border-r border-[#e2e8f0] last:border-r-0">
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
