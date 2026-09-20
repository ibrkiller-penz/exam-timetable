import React from 'react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots } from '../../store/selectors';
import { displayName } from '../../domain/privacy';
import { buildStudentTableReport } from '../../domain/reports/studentTable';
import { SeparateStudentSheet } from '../../domain/reports/separateReport';
import { AttendanceRow } from '../../domain/types';
import { SheetInfo } from './SheetInfo';
import { FitCell } from './FitText';

/**
 * 별도 응시자 한 사람의 안내문 한 장.
 *
 * 담임과 감독 선생님께 그대로 드리는 종이입니다. 어느 교시에 어디서 보는지,
 * 답안지를 어느 고사실 것과 합쳐야 하는지가 한 장에 다 있어야 합니다.
 *
 * 9. 별도 고사실의 '자세히 보기' 창과 11-8 별도 수험생 인쇄물이 이 한 조각을
 * 같이 씁니다. 두 곳의 모양이 달라지지 않게 하려는 것입니다.
 */
export const SeparateNoticeSheet: React.FC<{
  sheet: SeparateStudentSheet;
  attendance: AttendanceRow[];
  /** 인쇄 한 장으로 볼지 (11-8), 창 안의 내용으로 볼지 (9번 자세히 보기). */
  asPage?: boolean;
}> = ({ sheet, attendance, asPage }) => {
  const { days, times, rooms } = useAppStore();
  const placementSlots = useAppStore(selPlacementSlots);

  const st = sheet.student;
  const cur = sheet.examiner;
  const rows = sheet.rows;

  const ticket = buildStudentTableReport(st, attendance, days, times, rooms, placementSlots, true);

  return (
    <div
      className={
        asPage
          ? 'print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none'
          : 'p-8'
      }
    >
      <h1 className="text-center font-black text-[30px] leading-[1.15] text-[#005691] tracking-tight mb-1">
        별도 고사실 응시 안내
      </h1>
      <p className="text-center text-[15px] font-bold text-slate-600 mb-5">
        아래 시간에는 소속 교실이 아니라 별도 고사실에서 시험을 봅니다.
      </p>

      <SheetInfo
        className="mb-5"
        emphasize={[1, 2]}
        items={[
          ['학년·반·번호', `${st.grade}학년 ${st.ban} ${st.num}번`],
          ['성명', displayName(st.name)],
          ['별도 고사실', `${cur.room}실`],
          ['해당 교시', cur.slots === 'all' ? '모든 시험' : `${rows.length}개 교시`],
        ]}
      />

      {rows.length === 0 ? (
        <p className="text-center text-slate-400 py-10">아직 배치된 교시가 없습니다.</p>
      ) : (
        <table className="sheet-table sheet-rows-5 w-full text-center">
          <thead className="bg-gray-100">
            <tr className="">
              <th className="py-2 px-2 w-16 font-black">연번</th>
              <th className="py-2 px-2 w-32 font-black">교시</th>
              <th className="py-2 px-2 font-black">과목</th>
              <th className="py-2 px-2 w-28 font-black">원고사실</th>
              <th className="py-2 px-2 w-24 font-black">답안지</th>
            </tr>
          </thead>
          <tbody className="">
            {rows.map((d, i) => (
              <tr key={d.slotIndex} className=" h-9">
                <td className="text-slate-500 font-bold">{i + 1}</td>
                <td className="font-black">{d.title}</td>
                <td className="font-bold text-slate-800"><FitCell>{d.subject || '-'}</FitCell></td>
                <td className="font-black text-[16px] text-red-700">{d.room || '-'}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-[13px] text-slate-500 mt-4 leading-relaxed">
        · 이 학생은 <strong>원고사실 명단에도 그대로 올라 있습니다.</strong> 명단 비고에 '별도'로 표시됩니다.<br />
        · 좌석배치도에는 나오지 않습니다. 그 교실에 앉지 않기 때문입니다.<br />
        · 시험이 끝나면 답안지를 원고사실 것과 합쳐 주세요.
      </p>

      {/* 이 학생의 개별 수험표. 따로 챙겨 줘야 하는 학생이라 한 장에 같이 실어 줍니다. */}
      {ticket.activeDays.length > 0 && (
        <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-300">
          <h2 className="text-center font-black text-[24px] text-[#005691] mb-1">개별 수험표</h2>
          <p className="text-center text-[14px] font-bold text-slate-600 mb-4">
            {st.grade}학년 {st.ban} {st.num}번 {displayName(st.name)} · 학번 {ticket.hakbun}
          </p>
          <table className="sheet-table w-full text-center">
            <thead className="bg-gray-100">
              <tr className="">
                <th className="py-2 px-1 w-16 font-black">교시</th>
                {ticket.activeDays.map(d => (
                  <th key={d.day} className="py-2 px-1 font-black">
                    {d.day}일차<br /><span className="text-[11.5px] text-slate-500">{d.dateText}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="">
              {ticket.activePeriods.map(p => (
                <tr key={p} className="">
                  <td className="py-2 font-black bg-gray-50">{p}교시</td>
                  {ticket.activeDays.map(d => {
                    const c = ticket.grid[p][d.day];
                    const sep = c?.examRoom?.includes('(별)');
                    return (
                      <td key={d.day} className="py-1.5 px-1 leading-tight">
                        <div className="font-bold text-slate-800 break-keep">{c?.subject || '-'}</div>
                        <div className={`font-black ${sep ? 'text-amber-700' : 'text-red-700'}`}>
                          {c?.examRoom || '-'}{c?.seat ? ` · ${c.seat}번` : ''}
                        </div>
                        {c?.timeStr && <div className="text-[11px] text-slate-400">{c.timeStr}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[12.5px] text-slate-500 mt-2">
            고사실 뒤에 <strong className="text-amber-700">(별)</strong>이 붙은 교시는 별도 고사실에서 봅니다.
          </p>
        </div>
      )}
    </div>
  );
};
