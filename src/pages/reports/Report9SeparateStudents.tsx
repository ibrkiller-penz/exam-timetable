import React, { useMemo, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { selPlacementSlots } from '../../store/selectors';
import { displayName } from '../../domain/privacy';
import { downloadWorkbook } from '../../utils/excelStyled';
import { buildSeparateRosters, buildSeparateSheets } from '../../domain/reports/separateReport';
import { useAttendance } from './useAttendance';
import { ReportGate } from './ReportGate';
import { ReportActions } from './ReportActions';
import { ReportHeader } from './ReportHeader';
import { PrintPageSize } from './PrintPageSize';
import { SeparateNoticeSheet } from './SeparateNoticeSheet';
import { printAsImage } from './printAsImage';
import { usePrintAll } from './usePrintAll';

/**
 * 11-8. 별도 수험생 — 뽑아서 나눠 주는 종이.
 *
 * 9. 별도 고사실은 '누가 별도로 보는지' 정하는 곳이고, 여기는 그 결과를
 * 종이로 내보내는 곳입니다. 두 가지가 필요합니다.
 *   · 학생별 안내 — 담임과 학생·학부모께. 개별 수험표까지 한 장에.
 *   · 교시별 명렬 — 별도 고사실 감독 선생님께.
 *
 * 왼쪽에 해당 학생 명렬을 두고, 고른 학생의 종이를 오른쪽에 보여 줍니다.
 * 별도 응시자는 보통 몇 명뿐이라, 한 사람씩 확인하고 뽑는 일이 많습니다.
 */
export const Report9SeparateStudents: React.FC = () => {
  const { students, settings, separateExaminers = {}, stages, placement, studentPlacements = {}, rooms, meta } =
    useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();
  const placementSlots = useAppStore(selPlacementSlots);
  const { printingAll, setPrintingAll, printAll } = usePrintAll();

  const [tab, setTab] = useState<'notice' | 'roster'>('notice');
  const [pickedKey, setPickedKey] = useState<string | null>(null);

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

  // 고른 학생이 없거나 지정이 풀렸으면 첫 사람을 보여 줍니다.
  const picked = sheets.find(s => s.key === pickedKey) ?? sheets[0];

  /** 화면에 그릴 종이. '전체'를 누른 동안에는 모두 그려 놓고 한 번에 뽑습니다. */
  const shownSheets = printingAll ? sheets : picked ? [picked] : [];

  const hasContent = tab === 'notice' ? sheets.length > 0 : rosters.length > 0;

  const hakbunOf = (st: { grade: string; ban: string; num: number }) =>
    `${st.grade}${String(st.ban).replace('반', '').padStart(2, '0')}${String(st.num).padStart(2, '0')}`;

  /** 학생별 안내와 교시별 명렬을 시트로 나누어 한 파일에 담습니다. */
  const exportExcel = () => {
    const rows: (string | number)[][] = [];
    for (const s of sheets) {
      const st = s.student;
      if (s.rows.length === 0) {
        rows.push([hakbunOf(st), displayName(st.name), `${s.examiner.room}실`, '-', '-', '-', '']);
        continue;
      }
      s.rows.forEach((d, i) => {
        rows.push([
          i === 0 ? hakbunOf(st) : '',
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

  const base = meta?.title || '고사';

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden p-6">
      <PrintPageSize />

      <ReportHeader
        num="11-8"
        title="별도 수험생"
        actions={
          <ReportActions
            disabled={!hasContent}
            onExcel={sheets.length > 0 ? exportExcel : undefined}
            pdfFilename={
              tab === 'notice'
                ? `별도 응시 안내 ${picked ? `${picked.student.ban} ${picked.student.num}번` : ''}.pdf`
                : `${base} 별도 고사실 명렬.pdf`
            }
            pdfAllFilename={tab === 'notice' ? `${base} 별도 응시 안내 전체.pdf` : undefined}
            prepareAll={tab === 'notice'
              ? () => { setPrintingAll(true); return () => setPrintingAll(false); }
              : undefined}
            onPrint={() => printAsImage()}
            onPrintAll={tab === 'notice' ? printAll : undefined}
          />
        }
      >
        <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {([['notice', '학생별 안내'], ['roster', '교시별 명렬']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-[13.5px] font-bold transition ${
                tab === id ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </span>
        <span className="text-[13.5px] text-slate-500">
          지정된 학생 <strong className="text-[#005691]">{sheets.length}명</strong> · 별도실 {roomCount}실
        </span>
      </ReportHeader>

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
        /* 왼쪽은 해당자 명렬, 오른쪽은 고른 학생의 종이. */
        <div className="flex gap-4 flex-1 min-h-0">
          <aside className="w-[230px] shrink-0 no-print border border-slate-200 rounded-xl bg-slate-50/60 overflow-auto">
            <div className="px-3 py-2 text-[12.5px] font-black text-slate-500 border-b border-slate-200 sticky top-0 bg-slate-50">
              별도 응시자 {sheets.length}명
            </div>
            {sheets.map(s => {
              const on = picked?.key === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setPickedKey(s.key)}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-200/70 transition ${
                    on ? 'bg-[#005691] text-white' : 'hover:bg-white text-slate-700'
                  }`}
                >
                  <div className="font-black text-[14.5px]">
                    {s.student.ban} {s.student.num}번 {displayName(s.student.name)}
                  </div>
                  <div className={`text-[12.5px] font-bold ${on ? 'text-blue-100' : 'text-slate-500'}`}>
                    별도 {s.examiner.room}실 · {s.examiner.slots === 'all' ? '모든 시험' : `${s.rows.length}개 교시`}
                  </div>
                </button>
              );
            })}
          </aside>

          <div className="flex-1 min-w-0 overflow-auto">
            <div className="print-pages flex flex-col gap-8">
              {shownSheets.map(s => (
                <SeparateNoticeSheet key={s.key} sheet={s} attendance={attendance} asPage />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="print-pages flex flex-col gap-8">
            {rosters.map(r => (
              <div
                key={`${r.slotTitle}-${r.room}`}
                className="print-page page-portrait bg-white border border-gray-300 p-8 rounded-xl shadow-xs mx-auto print:border-none print:shadow-none"
              >
                <h1 className="text-center font-extrabold text-[32px] mb-1 text-[#005691]">별도 고사실 명렬</h1>
                <p className="text-center text-[14px] text-slate-500 mb-6">
                  아래 학생들은 소속 고사실 명단에도 올라 있습니다. 시험이 끝나면 답안지를 원고사실 것과 합쳐 주세요.
                </p>

                <div className="border-2 border-gray-800 grid grid-cols-4 text-center text-[14px] mb-5">
                  {[['시행', `${r.day} ${r.period}`], ['별도 고사실', `${r.room}실`], ['인원', `${r.rows.length}명`], ['감독', '']].map(([k, v]) => (
                    <React.Fragment key={k}>
                      <div className="border-r border-gray-800 bg-gray-100 py-2 font-black">{k}</div>
                      <div className="py-2 font-bold border-r border-gray-800 last:border-r-0">{v}</div>
                    </React.Fragment>
                  ))}
                </div>

                <table className="sheet-table sheet-rows-5 w-full text-[16px] text-center">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-2 px-2 w-12 font-black">연번</th>
                      <th className="py-2 px-2 w-28 font-black">학번</th>
                      <th className="py-2 px-2 w-28 font-black">성명</th>
                      <th className="py-2 px-2 font-black">과목</th>
                      <th className="py-2 px-2 w-24 font-black">원고사실</th>
                      <th className="py-2 px-2 w-32 font-black">비고</th>
                      <th className="py-2 px-2 w-20 font-black">답안지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((s, i) => (
                      <tr key={s.hakbun} className="h-9">
                        <td className="text-slate-500">{i + 1}</td>
                        <td className="font-bold">{s.hakbun}</td>
                        <td className="font-black text-[18px]">{displayName(s.name)}</td>
                        <td className="font-bold">{s.subject}</td>
                        <td className="font-black text-[17px] text-[#005691]">{s.homeRoom}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
