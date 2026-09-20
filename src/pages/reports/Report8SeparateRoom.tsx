import React, { useMemo, useState } from 'react';
import { Printer, Search, UserCheck, X, Download } from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { selPlacementSlots } from '../../store/selectors';
import { displayName } from '../../domain/privacy';
import { separateRoomFor, SeparateExaminer } from '../../domain/types';
import { ReportGate } from './ReportGate';
import { ReportActions } from './ReportActions';
import { ReportHeader, HeaderDivider, HeaderLabel } from './ReportHeader';
import { PrintPageSize } from './PrintPageSize';
import { FitCell } from './FitText';
import { SheetInfo } from './SheetInfo';
import { SeparateNoticeSheet } from './SeparateNoticeSheet';
import { buildSeparateDetail, buildSeparateRosters } from '../../domain/reports/separateReport';
import { printAsImage } from './printAsImage';
import { StepHelp } from '../../components/StepHelp';

/**
 * 9. 별도 고사실 — 명단 체크와 명렬 출력.
 *
 * 틱이나 장애가 있어 따로 응시하는 학생들입니다. 담당 선생님이 하시던 방식대로,
 * 그 학생들은 원래 고사실 명단에 그대로 두고 감독 선생님께 이 명렬을 따로 드립니다.
 * 시험이 끝나면 답안지를 원고사실 것과 합칩니다.
 */
export const Report8SeparateRoom: React.FC = () => {
  const { students, settings, updateSettings, separateExaminers = {}, setSeparateExaminer,  stages,
          placement, studentPlacements = {}, rooms, syncSeparateExaminers, days, times } = useAppStore();
  // 저장된 응시현황에 별도 고사실 지정을 입혀서 씁니다.
  const attendance = useAttendance();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const placementSlots = useAppStore(selPlacementSlots);

  const [tab, setTab] = useState<'manage' | 'print'>('manage');
  // 한 학생이 어느 교시에 무슨 과목을 어디서 보는지 펼쳐 보는 창.
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyChecked, setOnlyChecked] = useState(false);

  const roomCount = Math.max(1, settings.separateRoomCount ?? 2);
  const examSlots = placementSlots.filter(ps => ps.subjects.length > 0);

  const filtered = useMemo(() => {
    const q = query.trim();
    return students.filter(st => {
      const key = `${st.ban}-${st.num}`;
      if (onlyChecked && !separateExaminers[key]) return false;
      if (!q) return true;
      return (
        st.name.includes(q) ||
        String(st.num) === q ||
        st.ban.includes(q) ||
        `${st.ban}${st.num}`.includes(q.replace(/\s/g, ''))
      );
    });
  }, [students, query, onlyChecked, separateExaminers]);

  const checkedCount = Object.keys(separateExaminers).length;

  const setScope = (key: string, scope: 'none' | 'all' | 'slots') => {
    const cur = separateExaminers[key];
    if (scope === 'none') return setSeparateExaminer(key, null);
    if (scope === 'all') return setSeparateExaminer(key, { room: cur?.room ?? 1, slots: 'all' });
    // 교시 지정으로 바꿀 때는 비워 두고 아래 칩에서 고르게 합니다.
    setSeparateExaminer(key, { room: cur?.room ?? 1, slots: Array.isArray(cur?.slots) ? cur!.slots : [] });
  };

  const toggleSlot = (key: string, slotIndex: number) => {
    const cur = separateExaminers[key];
    if (!cur || cur.slots === 'all') return;
    const has = cur.slots.includes(slotIndex);
    const next = has ? cur.slots.filter(i => i !== slotIndex) : [...cur.slots, slotIndex].sort((a, b) => a - b);
    setSeparateExaminer(key, { ...cur, slots: next });
  };

  const setRoom = (key: string, room: number) => {
    const cur = separateExaminers[key];
    if (!cur) return;
    setSeparateExaminer(key, { ...cur, room });
  };

  /**
   * 그 학생이 별도로 보는 교시를 하나하나 펼칩니다.
   * 계산은 11-8 별도 수험생과 같은 함수를 씁니다. 두 화면이 어긋나지 않게 하려는 것입니다.
   */
  const detailOf = (key: string) =>
    buildSeparateDetail(key, examSlots, separateExaminers, students, studentPlacements, placement, rooms);

  /** 별도로 보는 교시들의 소속 고사실을 간추립니다. */
  const whereText = (key: string) => {
    const detail = detailOf(key).filter(x => x.room);
    const distinct = [...new Set(detail.map(d => d.room))];
    return {
      short: distinct.length === 0 ? '' : distinct.length <= 3 ? distinct.join(', ') : `${distinct.slice(0, 3).join(', ')} 외 ${distinct.length - 3}실`,
      full: detail.map(d => `${d.title} → ${d.room}`).join('\n'),
      count: detail.length,
    };
  };

  /** 교시·별도실별 명렬. */
  const rosters = useMemo(
    () => buildSeparateRosters(attendance, examSlots, roomCount),
    [attendance, examSlots, roomCount],
  );

  /** 명렬을 엑셀로. 교시·별도실마다 시트 하나입니다. */
  const exportExcel = () => downloadWorkbook(
    rosters.map(r => ({
      name: `${r.day.replace('일차', '일')}${r.period.replace('교시', '교')} ${r.room}실`,
      title: '별도 고사실 명렬',
      subtitle: `${r.day} ${r.period} · 별도 ${r.room}실 · ${r.rows.length}명 — 시험이 끝나면 답안지를 원고사실 것과 합칩니다.`,
      headers: [['연번', '학번', '성명', '과목', '원고사실', '답안지']],
      rows: r.rows.map((x, i) => [i + 1, x.hakbun, displayName(x.name), x.subject, x.homeRoom, '']),
      widths: [7, 11, 12, 22, 11, 10],
      numericCols: [0],
    })),
    '별도 고사실 명렬.xlsx',
  );

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize />
      <ReportHeader
        num="9"
        title="별도 고사실"
        actions={
          <ReportActions
            disabled={rosters.length === 0}
            onExcel={tab === 'print' ? exportExcel : undefined}
            pdfFilename={tab === 'print' ? '별도 고사실 명렬.pdf' : undefined}
            onPrint={tab === 'print' ? () => printAsImage() : undefined}
          />
        }
      >
        <StepHelp title="9. 별도 고사실">
          <div>
            <h3>이 단계가 하는 일</h3>
            <p>틱이나 장애 등으로 <strong>제 교실이 아닌 별도 고사실에서 시험을 보는 학생</strong>을 지정하는 단계입니다. 해당하는 학생이 없으면 그냥 넘어가도 됩니다.</p>
          </div>
          <div>
            <h3>지정하면 무엇이 달라지나</h3>
            <ul>
              <li><strong>고사실 명단</strong>에는 그대로 남고, 비고에 '별도'로 표시됩니다. 소속은 원래 교실이기 때문입니다.</li>
              <li><strong>좌석배치도</strong>에서는 빠지고, 남은 학생들의 좌석번호가 1번부터 다시 매겨집니다.</li>
              <li><strong>고사실 시간표·학급 시간표·개별 수험표</strong>에는 그 교시만 '(별)'이 붙습니다.</li>
              <li><strong>봉투 라벨</strong>의 응시인원에서 별도로 나가는 인원만큼 빠집니다.</li>
            </ul>
          </div>
          <div>
            <h3>종일인지, 그 교시만인지</h3>
            <p>학생을 체크하면 <strong>전체 적용</strong>인지 <strong>이 시험만</strong>인지 물어봅니다. 대기 시간에 어디 있을지는 위의 <strong>대기 시간</strong>에서 고릅니다.</p>
          </div>
          <div>
            <h3>몇 실로 나누나</h3>
            <p>설정의 <strong>별도 고사실 운영 수</strong>(기본 2실)만큼 나눕니다. 한 교시에 지정된 학생을 학번 순으로 1실·2실… 로 번갈아 넣습니다.</p>
          </div>
          <div>
            <h3>순서</h3>
            <p><strong>8. 학생 배치</strong>를 확정해야 응시현황이 만들어지고, 그 위에 별도 지정을 입힙니다. 지정을 마치면 <strong>10. 응시현황</strong>으로 가서 좌석번호를 확정하세요. 나눠 줄 종이는 <strong>11-8 별도 수험생</strong>에서 뽑습니다.</p>
          </div>
        </StepHelp>

        <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {([['manage', '명단 체크'], ['print', '명렬 출력']] as const).map(([id, label]) => (
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
          지정된 학생 <strong className="text-[#005691]">{checkedCount}명</strong> · 별도실 {roomCount}실
        </span>

        <HeaderDivider />

        {/* 시험만 따로 보고 대기는 제 교실에서 하는 학생도, 하루 종일 별도실에
            있는 학생도 있습니다. 설정에 숨겨 두지 않고 여기서 바로 고릅니다. */}
        <HeaderLabel>대기 시간</HeaderLabel>
        <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {([[false, '대기실로'], [true, '별도실에 계속']] as const).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => updateSettings({ separateRoomAllDay: value })}
              className={`px-3 py-1.5 text-[13.5px] font-bold transition ${
                (settings.separateRoomAllDay ?? false) === value
                  ? 'bg-[#005691] text-white'
                  : 'bg-white text-slate-600 hover:bg-gray-50'
              }`}
              title={
                value
                  ? '대기 시간에도 별도 고사실에 머뭅니다. 대기실 좌석배치도에서도 빠집니다.'
                  : '시험 보는 교시에만 별도 고사실에 가고, 대기 시간에는 제 교실(대기실)로 갑니다.'
              }
            >
              {label}
            </button>
          ))}
        </span>

        {/* 지정은 누를 때마다 바로 반영됩니다.
            이 버튼은 이 기능이 생기기 전에 지정해 둔 자료를 맞출 때 씁니다. */}
        {tab === 'manage' && (
          <button
            onClick={() => {
              const n = syncSeparateExaminers();
              setSyncMsg(n > 0 ? `응시현황 ${n}줄을 다시 맞춰 놓았습니다.` : '이미 모두 맞춰져 있습니다.');
              setTimeout(() => setSyncMsg(null), 3000);
            }}
            className="report-select"
            title="지금 지정된 별도 응시자를 응시현황·명단·좌석배치도에 다시 반영합니다."
          >
            응시현황에 반영
          </button>
        )}
        {syncMsg && <span className="text-[13.5px] font-bold text-emerald-700">{syncMsg}</span>}
      </ReportHeader>

      <div className="no-print mb-4 px-4 py-3 rounded-xl bg-blue-50/70 border border-blue-100 text-[14px] text-slate-700 leading-relaxed">
        별도 고사실에서 시험을 보는 학생을 지정합니다. 지정한 학생은 <strong>고사실 명단에는 그대로 남고 비고에 '별도'</strong>로 표시되며,
        <strong> 좌석배치도에서는 빠집니다.</strong> 해당하는 학생이 없으면 이 단계는 건너뛰고 <strong>10. 응시현황</strong>으로 가시면 됩니다.
      </div>

      {/* 한 학생이 어느 교시에 무슨 과목을 어디서 보는지. 그대로 인쇄해 담임께 드릴 수 있습니다. */}
      {detailKey && (() => {
        const st = students.find(x => `${x.ban}-${x.num}` === detailKey);
        const cur = separateExaminers[detailKey];
        const rows = detailOf(detailKey);
        if (!st || !cur) return null;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6 print:static print:bg-white print:p-0" onClick={() => setDetailKey(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:rounded-none"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#005691] text-white px-5 py-3 flex items-center justify-between shrink-0 no-print">
                <span className="font-black text-[16px]">별도 응시 상세</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => printAsImage()}
                    className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-[13.5px] font-bold flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-4 h-4" /> 인쇄
                  </button>
                  <button onClick={() => setDetailKey(null)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 창이 화면보다 길면 아래가 잘립니다. flex-1 min-h-0 이라야
                  남는 높이만큼만 차지하고 그 안에서 스크롤됩니다.
                  print-page 는 안쪽 종이에 붙습니다. 스크롤 상자에 붙이면
                  min-height:297mm 때문에 상자가 줄어들지 못해 다시 잘립니다. */}
              <div className="flex-1 min-h-0 overflow-auto p-4 bg-slate-100 print:overflow-visible print:bg-white print:p-0">
                <SeparateNoticeSheet
                  sheet={{ key: detailKey, student: st, examiner: cur, rows }}
                  attendance={attendance}
                  asPage
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* 8. 학생 배치를 확정해야 응시현황이 만들어지고, 그 위에 별도 지정을 입힙니다.
          확정 전에 지정하면 어디에도 반영되지 않으므로 먼저 막습니다. */}
      {!stages.stage4 ? (
        <ReportGate what="별도 고사실 지정" until="placement" />
      ) : tab === 'manage' ? (
        <div className="no-print">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="반, 번호, 이름으로 찾기"
                className="pl-9 pr-8 py-2 w-64 border border-gray-300 rounded-lg text-[14px] focus:border-[#005691] outline-hidden"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[13.5px] font-bold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyChecked}
                onChange={e => setOnlyChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-[#005691]"
              />
              지정된 학생만
            </label>
          </div>

          <p className="text-[13px] text-slate-500 mb-3 leading-relaxed">
            별도 응시자는 <strong>원래 고사실 명단에 그대로 남고</strong> 비고에 '별도고사실 응시중'으로 적힙니다.
            좌석배치도에서는 빠집니다. 한 과목만 따로 보는 학생은 <strong>교시 지정</strong>으로 그 교시만 고르세요.
          </p>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-[14px] border-collapse">
              <thead className="bg-gray-50 text-slate-700">
                <tr className="border-b border-gray-200">
                  <th className="py-2.5 px-3 text-left font-bold w-40">학생</th>
                  <th className="py-2.5 px-3 text-center font-bold w-64">별도 응시</th>
                  <th className="py-2.5 px-3 text-center font-bold w-24">별도실</th>
                  <th className="py-2.5 px-3 text-left font-bold">교시 지정 / 응시 장소</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-400">찾는 학생이 없습니다.</td></tr>
                ) : filtered.map((st, idx) => {
                  const key = `${st.ban}-${st.num}`;
                  const cur = separateExaminers[key];
                  const scope: 'none' | 'all' | 'slots' = !cur ? 'none' : cur.slots === 'all' ? 'all' : 'slots';

                  return (
                    <tr key={key} className={`border-b border-gray-100 ${cur ? 'bg-blue-50/40' : idx % 2 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="py-2 px-3 font-bold text-slate-800 whitespace-nowrap">
                        <span className="text-[#005691]">{st.ban}</span> {st.num}번 {displayName(st.name)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                          {([['none', '해당없음'], ['all', '모든 시험'], ['slots', '교시 지정']] as const).map(([id, label]) => (
                            <button
                              key={id}
                              onClick={() => setScope(key, id)}
                              className={`px-2.5 py-1 text-[12.5px] font-bold transition ${
                                scope === id ? 'bg-[#005691] text-white' : 'bg-white text-slate-600 hover:bg-gray-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {cur && roomCount > 1 ? (
                          <select
                            value={cur.room}
                            onChange={e => setRoom(key, Number(e.target.value))}
                            className="px-2 py-1 border border-gray-300 rounded-lg text-[13px] font-bold"
                          >
                            {Array.from({ length: roomCount }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n}실</option>
                            ))}
                          </select>
                        ) : cur ? (
                          <span className="text-[13px] font-bold text-slate-600">1실</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {scope === 'slots' && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {examSlots.map(ps => {
                              const on = Boolean(separateRoomFor(key, ps.index, separateExaminers));
                              return (
                                <button
                                  key={ps.index}
                                  onClick={() => toggleSlot(key, ps.index)}
                                  title={ps.subjects.join(', ')}
                                  className={`px-2 py-0.5 rounded-md text-[12px] font-bold border transition ${
                                    on ? 'bg-[#005691] text-white border-[#005691]' : 'bg-white text-slate-500 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {ps.title.replace('일차 ', '-')}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {cur && (() => {
                          // 어디서 보는지를 바로 보여 줍니다.
                          // 별도실에서 보더라도 답안지는 소속 고사실 것과 합쳐야 합니다.
                          const w = whereText(key);
                          if (w.count === 0) {
                            return (
                              <span className="text-[13px] text-slate-400">
                                {scope === 'slots' ? '교시를 골라 주세요.' : '배치가 아직 없습니다.'}
                              </span>
                            );
                          }
                          return (
                            <div className="flex items-center gap-2 flex-wrap text-[13px] leading-relaxed">
                              <span>
                                <span className="font-black text-[#005691]">별도 {cur.room}실</span>
                                <span className="text-slate-400"> 에서 응시 </span>
                                <span className="text-slate-500">· 답안지는 </span>
                                <strong className="text-slate-800">{w.short}</strong>
                                <span className="text-slate-500"> 으로</span>
                                {w.count > 1 && <span className="text-slate-400"> ({w.count}교시)</span>}
                              </span>
                              <button
                                onClick={() => setDetailKey(key)}
                                className="px-2 py-0.5 rounded-md border border-gray-300 bg-white hover:bg-blue-50 hover:border-[#005691] text-slate-600 hover:text-[#005691] font-bold text-[12.5px] transition"
                              >
                                자세히 보기
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : rosters.length === 0 ? (
        !stages.stage4 ? (
          <ReportGate what="별도 고사실 명렬" until="placement" />
        ) : (
          <div className="p-10 border border-slate-200 rounded-2xl bg-white max-w-xl mx-auto text-center">
            <div className="w-12 h-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <UserCheck className="w-6 h-6 text-slate-400" />
            </div>
            <p className="font-black text-[17px] text-slate-800">별도 응시자로 지정된 학생이 없습니다.</p>
            <p className="text-[14px] text-slate-500 mt-1.5">
              위 <strong>명단 체크</strong>에서 학생을 지정하면 여기에 명렬이 만들어집니다.
            </p>
          </div>
        )
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

              <SheetInfo
                className="mb-5"
                emphasize={[1, 2]}
                items={[
                  ['시행', `${r.day} ${r.period}`],
                  ['별도 고사실', `${r.room}실`],
                  ['인원', `${r.rows.length}명`],
                  ['감독', ''],
                ]}
              />

              <table className="sheet-table sheet-rows-5 w-full text-center">
                <thead className="bg-gray-100">
                  <tr className="">
                    <th className="py-2 px-2 w-12">연번</th>
                    <th className="py-2 px-2 w-24">학번</th>
                    <th className="py-2 px-2 w-24">성명</th>
                    <th className="py-2 px-2">과목</th>
                    <th className="py-2 px-2 w-24">원고사실</th>
                    <th className="py-2 px-2 w-32">비고</th>
                    <th className="py-2 px-2 w-20">답안지</th>
                  </tr>
                </thead>
                <tbody className="">
                  {r.rows.map((s, i) => (
                    <tr key={s.hakbun} className=" h-9">
                      <td>{i + 1}</td>
                      <td className="font-medium">{s.hakbun}</td>
                      <td className="font-bold"><FitCell>{displayName(s.name)}</FitCell></td>
                      <td><FitCell>{s.subject}</FitCell></td>
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
