import React, { useMemo, useState } from 'react';
import { Printer, Download, UserCheck } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots } from '../../store/selectors';
import { displayName } from '../../domain/privacy';
import { downloadWorkbook } from '../../utils/excelStyled';
import { buildSeparateRosters, buildSeparateSheets } from '../../domain/reports/separateReport';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { PdfSaveButton } from './PdfSaveButton';
import { PrintPageSize } from './PrintPageSize';
import { SeparateNoticeSheet } from './SeparateNoticeSheet';
import { printAsImage } from './printAsImage';

/**
 * 11-8. 별도 수험생 — 뽑아서 나눠 주는 종이.
 *
 * 9. 별도 고사실은 '누가 별도로 보는지' 정하는 곳이고, 여기는 그 결과를
 * 종이로 내보내는 곳입니다. 두 가지가 필요합니다.
 *   · 교시별 명렬 — 별도 고사실 감독 선생님께 드립니다.
 *   · 학생별 안내 — 담임과 학생·학부모께 드립니다. 개별 수험표까지 한 장에.
 *
 * 인쇄는 화면에 보이는 장을 그대로 그림으로 떠서 A4 에 얹습니다(printAsImage).
 * PDF 저장도 같은 방식이라, 화면·인쇄·PDF 가 서로 어긋나지 않습니다.
 */
export const Report9SeparateStudents: React.FC = () => {
  const { students, settings, separateExaminers = {}, stages, placement, studentPlacements = {}, rooms, meta } =
    useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();
  const placementSlots = useAppStore(selPlacementSlots);

  const [tab, setTab] = useState<'notice' | 'roster'>('notice');

  const roomCount = Math.max(1, settings.separateRoomCount ?? 2);
  const examSlots = useMemo(() => placementSlots.filter(ps => ps.subjects.length > 0), [placementSlots]);

  const sheets = useMemo(
    () => buildSeparateSheets(students, separateExaminers, examSlots, studentPlacements, placement, rooms),
    [students, separateExaminers, examSlots, studentPlacements, placement, rooms],
  );

  const rosters = useMemo(
    () => buildSeparateRosters(attendance, examSlots, roomCount),
    [attendance, examSlots, roomCount],
  );

  const hasContent = tab === 'notice' ? sheets.length > 0 : rosters.length > 0;

  /** 학생별 안내를 엑셀로. 한 학생이 여러 줄이므로 평평하게 폅니다. */
  const exportNoticeExcel = () => {
    const rows: (string | number)[][] = [];
    for (const s of sheets) {
      const st = s.student;
      const hakbun = `${st.grade}${String(st.ban).replace('반', '').padStart(2, '0')}${String(st.num).padStart(2, '0')}`;
      if (s.rows.length === 0) {
        rows.push([hakbun, displayName(st.name), `${s.examiner.room}실`, '-', '-', '-', '']);
        continue;
      }
      s.rows.forEach((d, i) => {
        rows.push([
          i === 0 ? hakbun : '',
          i === 0 ? displayName(st.name) : '',
          i === 0 ? `${s.examiner.room}실` : '',
          d.title,
          d.subject || '-',
          d.room || '-',
          '',
        ]);
      });
    }

    downloadWorkbook(
      [
        {
          name: '별도 수험생',
          title: `${meta?.title || '고사'} 별도 수험생`,
          subtitle: `지정 ${sheets.length}명 · 별도 고사실 ${roomCount}실 — 시험이 끝나면 답안지를 원고사실 것과 합칩니다.`,
          headers: [['학번', '성명', '별도실', '교시', '과목', '원고사실', '답안지']],
          rows,
          widths: [11, 12, 9, 14, 22, 11, 10],
        },
        ...rosters.map(r => ({
          name: `${r.day.replace('일차', '일')}${r.period.replace('교시', '교')} ${r.room}실`,
          title: '별도 고사실 명렬',
          subtitle: `${r.day} ${r.period} · 별도 ${r.room}실 · ${r.rows.length}명`,
          headers: [['연번', '학번', '성명', '과목', '원고사실', '답안지']],
          rows: r.rows.map((x, i) => [i + 1, x.hakbun, displayName(x.name), x.subject, x.homeRoom, '']),
          widths: [7, 11, 12, 22, 11, 10],
          numericCols: [0],
        })),
      ],
      `${meta?.title || '고사'} 별도 수험생.xlsx`,
    );
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">11-8. 별도 수험생</h2>
          <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {([['notice', '학생별 안내'], ['roster', '교시별 명렬']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-[13px] font-bold transition ${
                  tab === id ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </span>
          <span className="text-[13px] text-slate-500">
            지정된 학생 <strong className="text-[#005691]">{sheets.length}명</strong> · 별도실 {roomCount}실
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportNoticeExcel}
            disabled={sheets.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[14px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-200 disabled:text-gray-400"
            title="학생별 안내와 교시별 명렬을 시트로 나누어 한 파일에 담습니다."
          >
            <Download className="w-4 h-4" />
            엑셀
          </button>
          <PdfSaveButton
            filename={`${meta?.title || '고사'} 별도 수험생.pdf`}
            disabled={!hasContent}
          />
          <button
            onClick={() => printAsImage()}
            disabled={!hasContent}
            className="px-3.5 py-2 bg-[#005691] hover:bg-[#00426e] text-white rounded-xl text-[14px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-200 disabled:text-gray-400"
          >
            <Printer className="w-4 h-4" />
            인쇄
          </button>
        </div>
      </div>

      <div className="no-print mb-4 px-4 py-3 rounded-xl bg-blue-50/70 border border-blue-100 text-[14px] text-slate-700 leading-relaxed">
        <strong>학생별 안내</strong>는 담임·학생에게 주는 종이입니다. 어느 교시에 어디서 보는지와 개별 수험표가 한 장에 들어 있습니다.
        <strong> 교시별 명렬</strong>은 별도 고사실 감독 선생님께 드립니다. 지정은 <strong>9. 별도 고사실</strong>에서 합니다.
      </div>

      {!stages.stage4 ? (
        <ReportGate what="별도 수험생 인쇄물" until="placement" />
      ) : !hasContent ? (
        <div className="p-10 border border-slate-200 rounded-2xl bg-white max-w-xl mx-auto text-center">
          <div className="w-12 h-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <UserCheck className="w-6 h-6 text-slate-400" />
          </div>
          <p className="font-black text-[17px] text-slate-800">별도 응시자로 지정된 학생이 없습니다.</p>
          <p className="text-[14px] text-slate-500 mt-1.5">
            <strong>9. 별도 고사실</strong>에서 학생을 지정하면 여기에 인쇄물이 만들어집니다.
          </p>
        </div>
      ) : tab === 'notice' ? (
        <div className="print-pages flex flex-col gap-8">
          {sheets.map(s => (
            <SeparateNoticeSheet key={s.key} sheet={s} attendance={attendance} asPage />
          ))}
        </div>
      ) : (
        <div className="print-pages flex flex-col gap-8">
          {rosters.map(r => (
            <div
              key={`${r.slotTitle}-${r.room}`}
              className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
            >
              <h1 className="text-center font-extrabold text-2xl mb-1 text-[#005691]">별도 고사실 명렬</h1>
              <p className="text-center text-[13px] text-slate-500 mb-6">
                아래 학생들은 소속 고사실 명단에도 올라 있습니다. 시험이 끝나면 답안지를 원고사실 것과 합쳐 주세요.
              </p>

              <div className="border border-gray-800 grid grid-cols-4 text-center text-xs mb-5">
                {[['시행', `${r.day} ${r.period}`], ['별도 고사실', `${r.room}실`], ['인원', `${r.rows.length}명`], ['감독', '']].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <div className="border-r border-gray-800 bg-gray-100 py-2 font-bold">{k}</div>
                    <div className="py-2 font-bold border-r border-gray-800 last:border-r-0">{v}</div>
                  </React.Fragment>
                ))}
              </div>

              <table className="w-full text-sm text-center border-collapse border border-gray-800">
                <thead className="bg-gray-100 border-b border-gray-800">
                  <tr className="divide-x divide-gray-800">
                    <th className="py-2 px-2 w-12">연번</th>
                    <th className="py-2 px-2 w-24">학번</th>
                    <th className="py-2 px-2 w-24">성명</th>
                    <th className="py-2 px-2">과목</th>
                    <th className="py-2 px-2 w-24">원고사실</th>
                    <th className="py-2 px-2 w-32">비고</th>
                    <th className="py-2 px-2 w-20">답안지</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {r.rows.map((s, i) => (
                    <tr key={s.hakbun} className="divide-x divide-gray-800 h-9">
                      <td>{i + 1}</td>
                      <td className="font-medium">{s.hakbun}</td>
                      <td className="font-bold">{displayName(s.name)}</td>
                      <td>{s.subject}</td>
                      <td className="font-bold text-[#005691]">{s.homeRoom}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
