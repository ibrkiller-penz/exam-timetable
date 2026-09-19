import React, { useMemo, useState } from 'react';
import { Printer, Search, UserCheck, X, Download } from 'lucide-react';
import { downloadWorkbook } from '../../utils/excelStyled';
import { useAppStore } from '../../store/appStore';
import { useAttendance } from './useAttendance';
import { selPlacementSlots } from '../../store/selectors';
import { displayName } from '../../domain/privacy';
import { separateRoomFor, SeparateExaminer } from '../../domain/types';
import { ReportGate } from './ReportGate';
import { PrintPageSize } from './PrintPageSize';
import { buildStudentTableReport } from '../../domain/reports/studentTable';

/**
 * 10-8. 별도 고사실 — 명단 체크와 명렬 출력.
 *
 * 틱이나 장애가 있어 따로 응시하는 학생들입니다. 담당 선생님이 하시던 방식대로,
 * 그 학생들은 원래 고사실 명단에 그대로 두고 감독 선생님께 이 명렬을 따로 드립니다.
 * 시험이 끝나면 답안지를 원고사실 것과 합칩니다.
 */
export const Report8SeparateRoom: React.FC = () => {
  const { students, settings, separateExaminers = {}, setSeparateExaminer,  stages,
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
   * 이 학생이 그 교시에 어느 고사실 소속인지.
   * 별도실에서 보더라도 답안지는 이 고사실 것과 합쳐야 하므로,
   * 담당자가 여기서 바로 확인할 수 있어야 합니다.
   */
  const homeRoomAt = (key: string, slotIndex: number): string => {
    const roomId = studentPlacements?.[slotIndex]?.[key];
    if (!roomId) return '';
    const cell = placement?.[slotIndex]?.[roomId];
    if (!cell || cell === '배치금지') return '';
    return rooms.find(r => r.id === roomId)?.roomName ?? '';
  };

  /**
   * 그 학생이 별도로 보는 교시를 하나하나 펼칩니다.
   * 과목까지 있어야 감독 선생님이 어느 시험지를 챙길지 압니다.
   */
  const detailOf = (key: string) =>
    examSlots
      .filter(ps => separateRoomFor(key, ps.index, separateExaminers))
      .map(ps => {
        const st = students.find(x => `${x.ban}-${x.num}` === key);
        const subject = ps.subjects.find(sub => st?.subjects.includes(sub)) ?? '';
        return { title: ps.title, room: homeRoomAt(key, ps.index), subject, slotIndex: ps.index };
      })
      // 대기 시간에는 별도실에 가지 않으므로, 실제로 시험을 보는 교시만 남깁니다.
      .filter(x => x.subject);

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

  /** 명렬에 실을 줄: 교시 → 별도실 → 학생. 응시현황(attendance)에서 원고사실과 과목을 가져옵니다. */
  const rosters = useMemo(() => {
    const out: Array<{
      slotTitle: string; day: string; period: string; room: number;
      rows: Array<{ hakbun: string; name: string; subject: string; homeRoom: string }>;
    }> = [];

    for (const ps of examSlots) {
      const day = `${ps.day}일차`;
      const period = `${ps.period}교시`;
      for (let room = 1; room <= roomCount; room++) {
        const rows = attendance
          .filter(r => r.day === day && r.period === period && r.separateRoom === room)
          .sort((a, b) => (a.ban === b.ban ? a.num - b.num : a.ban.localeCompare(b.ban, 'ko')))
          .map(r => ({
            hakbun: `${r.grade}${String(r.ban).replace('반', '').padStart(2, '0')}${String(r.num).padStart(2, '0')}`,
            name: r.name,
            subject: r.subject,
            homeRoom: r.examRoom,
          }));
        if (rows.length > 0) out.push({ slotTitle: ps.title, day, period, room, rows });
      }
    }
    return out;
  }, [attendance, examSlots, roomCount, separateExaminers]);

  return (
    <div className="flex flex-col h-full bg-white overflow-auto p-6">
      <PrintPageSize />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 no-print">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#005691]">10-8. 별도 고사실</h2>
          <span className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {([['manage', '명단 체크'], ['print', '명렬 출력']] as const).map(([id, label]) => (
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
            지정된 학생 <strong className="text-[#005691]">{checkedCount}명</strong> · 별도실 {roomCount}실
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
              className="px-3 py-1.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-[#005691] border border-gray-300 hover:border-[#005691] rounded-lg text-[13px] font-bold transition"
              title="지금 지정된 별도 응시자를 응시현황·명단·좌석배치도에 다시 반영합니다."
            >
              응시현황에 반영
            </button>
          )}
          {syncMsg && <span className="text-[13px] font-bold text-emerald-700">{syncMsg}</span>}
        </div>

        {tab === 'print' && (
          <div className="flex items-center gap-2">
          <button
            onClick={() => downloadWorkbook(
              rosters.map(r => ({
                name: `${r.day.replace('일차', '일')}${r.period.replace('교시', '교')} ${r.room}실`,
                title: '별도 고사실 명렬',
                subtitle: `${r.day} ${r.period} · 별도 ${r.room}실 · ${r.rows.length}명 — 시험이 끝나면 답안지를 원고사실 것과 합칩니다.`,
                headers: [['연번', '학번', '성명', '과목', '원고사실', '답안지']],
                rows: r.rows.map((x, i) => [i + 1, x.hakbun, displayName(x.name), x.subject, x.homeRoom, '']),
                widths: [7, 11, 12, 22, 11, 10],
                numericCols: [0],
              })),
              '별도 고사실 명렬.xlsx'
            )}
            disabled={rosters.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[14px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-200 disabled:text-gray-400"
          >
            <Download className="w-4 h-4" />
            엑셀
          </button>
          <button
            onClick={() => window.print()}
            disabled={rosters.length === 0}
            className="px-3.5 py-2 bg-[#005691] hover:bg-[#00426e] text-white rounded-xl text-[14px] font-bold flex items-center gap-1.5 transition disabled:bg-gray-200 disabled:text-gray-400"
          >
            <Printer className="w-4 h-4" />
            인쇄
          </button>
          </div>
        )}
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
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-[13.5px] font-bold flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-4 h-4" /> 인쇄
                  </button>
                  <button onClick={() => setDetailKey(null)} className="p-1 hover:bg-white/20 rounded-lg transition" aria-label="닫기">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-8 overflow-auto print-page page-portrait">
                <h1 className="text-center font-black text-[30px] leading-none text-[#005691] tracking-tight mb-1">
                  별도 고사실 응시 안내
                </h1>
                <p className="text-center text-[15px] font-bold text-slate-600 mb-5">
                  아래 시간에는 소속 교실이 아니라 별도 고사실에서 시험을 봅니다.
                </p>

                <div className="border-2 border-gray-800 grid grid-cols-4 text-center text-[14px] mb-5">
                  <div className="py-2 bg-gray-100 font-black border-r border-gray-800">학년·반·번호</div>
                  <div className="py-2 bg-gray-100 font-black border-r border-gray-800">성명</div>
                  <div className="py-2 bg-gray-100 font-black border-r border-gray-800">별도 고사실</div>
                  <div className="py-2 bg-gray-100 font-black">해당 교시</div>

                  <div className="py-2 border-t border-r border-gray-800 font-bold">{st.grade}학년 {st.ban} {st.num}번</div>
                  <div className="py-2 border-t border-r border-gray-800 font-black text-[16px]">{displayName(st.name)}</div>
                  <div className="py-2 border-t border-r border-gray-800 font-black text-[16px] text-[#005691]">{cur.room}실</div>
                  <div className="py-2 border-t border-gray-800 font-bold">
                    {cur.slots === 'all' ? '모든 시험' : `${rows.length}개 교시`}
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">아직 배치된 교시가 없습니다.</p>
                ) : (
                  <table className="w-full text-[15px] text-center border-collapse border-2 border-gray-800">
                    <thead className="bg-gray-100">
                      <tr className="divide-x divide-gray-800 border-b border-gray-800">
                        <th className="py-2 px-2 w-16 font-black">연번</th>
                        <th className="py-2 px-2 w-32 font-black">교시</th>
                        <th className="py-2 px-2 font-black">과목</th>
                        <th className="py-2 px-2 w-28 font-black">원고사실</th>
                        <th className="py-2 px-2 w-24 font-black">답안지</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {rows.map((d, i) => (
                        <tr key={d.slotIndex} className="divide-x divide-gray-800 h-9">
                          <td className="text-slate-500 font-bold">{i + 1}</td>
                          <td className="font-black">{d.title}</td>
                          <td className="font-bold text-slate-800">{d.subject || '-'}</td>
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

                {/* 이 학생의 개별 수험표. 따로 챙겨 줘야 하는 학생이라
                    여기서 바로 보고 뽑을 수 있어야 합니다. */}
                {(() => {
                  const ticket = buildStudentTableReport(st, attendance, days, times, rooms, placementSlots, true);
                  if (ticket.activeDays.length === 0) return null;
                  return (
                    <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-300">
                      <h2 className="text-center font-black text-[24px] text-[#005691] mb-1">개별 수험표</h2>
                      <p className="text-center text-[14px] font-bold text-slate-600 mb-4">
                        {st.grade}학년 {st.ban} {st.num}번 {displayName(st.name)} · 학번 {ticket.hakbun}
                      </p>
                      <table className="w-full text-[13.5px] text-center border-collapse border-2 border-gray-800">
                        <thead className="bg-gray-100">
                          <tr className="divide-x divide-gray-800 border-b border-gray-800">
                            <th className="py-2 px-1 w-16 font-black">교시</th>
                            {ticket.activeDays.map(d => (
                              <th key={d.day} className="py-2 px-1 font-black">{d.day}일차<br /><span className="text-[11.5px] text-slate-500">{d.dateText}</span></th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {ticket.activePeriods.map(p => (
                            <tr key={p} className="divide-x divide-gray-800">
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
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {tab === 'manage' ? (
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
          <ReportGate what="별도 고사실 명렬" />
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
