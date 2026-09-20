import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { StepHelp } from '../components/StepHelp';
import { saveCloudImmediately } from '../domain/firebase';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { MSG } from '../domain/messages';
import { displayName } from '../domain/privacy';
import { downloadWorkbook } from '../utils/excelStyled';
import { Shuffle, ArrowDown10, Download, Search } from 'lucide-react';

export const Step8Attendance: React.FC = () => {
  const {
    attendance,
    stages,
    updateAttendanceSeat,
    setAttendanceBySeq,
    setAttendanceRandom,
    confirmStage5,
    cancelStage5,
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);

  const handleSeatSeq = () => {
    if (stages.stage5) {
      setAlertModal({ isOpen: true, message: MSG.S8_LOCKED, isError: true });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S8_SEAT_SEQ,
      onConfirm: () => {
        setAttendanceBySeq();
        setConfirmModal(null);
      },
    });
  };

  const handleSeatRandom = () => {
    if (stages.stage5) {
      setAlertModal({ isOpen: true, message: MSG.S8_LOCKED, isError: true });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S8_SEAT_RAND,
      onConfirm: () => {
        setAttendanceRandom();
        setConfirmModal(null);
      },
    });
  };

  const handleConfirm = () => {
    try {
      confirmStage5();
      saveCloudImmediately(useAppStore.getState()).catch(console.error);
      setAlertModal({ isOpen: true, message: MSG.S8_DONE });
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: MSG.S8_CANCEL,
      onConfirm: () => {
        cancelStage5();
        setConfirmModal(null);
      },
    });
  };

  const uniqueRooms = useMemo(() => Array.from(new Set(attendance.map(r => r.examRoom))), [attendance]);
  const uniqueDays = useMemo(() => Array.from(new Set(attendance.map(r => r.day))), [attendance]);
  const uniquePeriods = useMemo(() => Array.from(new Set(attendance.map(r => r.period))).sort(), [attendance]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter(r => {
      if (filterRoom && r.examRoom !== filterRoom) return false;
      if (filterDay && r.day !== filterDay) return false;
      if (filterPeriod && r.period !== filterPeriod) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        return r.name.toLowerCase().includes(t) || r.ban.toLowerCase().includes(t) || r.subject.toLowerCase().includes(t);
      }
      return true;
    });
  }, [attendance, filterRoom, filterDay, filterPeriod, searchTerm]);

  const unassignedSeats = attendance.filter(r => r.seat === null || r.seat <= 0).length;

  const guideMsg = stages.stage5
    ? MSG.S8_GUIDE_DONE
    : unassignedSeats > 0
    ? MSG.S8_GUIDE_ENTER_SEAT
    : MSG.S8_GUIDE_READY;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={10}
        stageTitle="응시현황 및 좌석번호 부여"
        help={
          <StepHelp title="10. 응시현황">
            <p>8·9단계까지 정한 배치를 바탕으로 <strong>학생마다 한 줄씩</strong> 응시현황을 만들고, 좌석번호를 부여하는 단계입니다. 11번 인쇄물은 모두 이 자료에서 나옵니다.</p>
            <h3>좌석번호 부여</h3>
            <ul>
              <li><strong>학번순</strong> — 명단 순서대로 1번부터 붙입니다.</li>
              <li><strong>랜덤</strong> — 고사실·과목 안에서 섞습니다. 대기실은 섞지 않습니다.</li>
            </ul>
            <p>좌석번호는 자리의 <strong>순서</strong>일 뿐이고, 실제 앉는 위치는 11-4 좌석배치도의 열·행과 배치순서로 그려집니다.</p>
            <h3>확정하면</h3>
            <p>11번 인쇄물이 모두 열립니다. 별도 고사실 응시자는 좌석을 받지 않으므로, 좌석이 비어 있어도 오류가 아닙니다.</p>
          </StepHelp>
        }
        /* 9번은 9번 확정만 봅니다. step8 까지 대신 읽는 바람에
           8번을 확정하면 9번도 확정된 것처럼 보였습니다. */
        isConfirmed={!!(stages.step9 ?? stages.stage5)}
        confirmLabel="10. 응시현황 확정"
        cancelLabel="응시현황 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSeatSeq}
              disabled={stages.stage5 || attendance.length === 0}
              className="px-3.5 py-2 bg-[#e6f1f8] hover:bg-[#fee2e2] text-[#005691] border border-gray-200 rounded-xl text-[15.5px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
            >
              <ArrowDown10 className="w-4.5 h-4.5 text-[#005691]" /> 좌석 학번순
            </button>
            <button
              onClick={handleSeatRandom}
              disabled={stages.stage5 || attendance.length === 0}
              className="px-3.5 py-2 bg-[#e6f1f8] hover:bg-[#fee2e2] text-[#005691] border border-gray-200 rounded-xl text-[15.5px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
            >
              <Shuffle className="w-4.5 h-4.5 text-[#005691]" /> 좌석 랜덤 (대기실 제외)
            </button>
            <button
              onClick={() => downloadWorkbook([{
                name: '응시현황',
                title: '응시현황 및 좌석번호',
                subtitle: '모든 교시·모든 학생의 배치 결과입니다. 별도 고사실 응시자는 좌석이 비어 있습니다.',
                headers: [['일차', '교시', '고사실', '과목', '학년', '반', '번호', '성명', '강의실', '연번', '좌석번호', '비고']],
                rows: attendance.map(r => [
                  r.day, r.period, r.examRoom, r.subject, r.grade, r.ban, r.num,
                  displayName(r.name), r.classRoom, r.seq, r.seat ?? '',
                  r.separateRoom ? (r.separateRoom > 1 ? `별도 ${r.separateRoom}실` : '별도') : '',
                ]),
                widths: [8, 8, 10, 20, 7, 7, 7, 12, 12, 8, 10, 11],
                numericCols: [6, 9, 10],
                landscape: true,
              }], '응시현황.xlsx')}
              disabled={attendance.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 text-[#0f172a] border border-gray-200 rounded-xl text-[15.5px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
            >
              <Download className="w-4.5 h-4.5 text-[#0f172a]" /> 엑셀 내보내기
            </button>
          </div>
        }
      />

      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3.5 mb-4">
          <div className="flex items-center gap-3">
            <select
              value={filterDay}
              onChange={e => setFilterDay(e.target.value)}
              className="px-3.5 py-2 text-[15.5px] bg-white border border-gray-200 rounded-xl focus:outline-none font-bold text-[#0f172a] shadow-2xs"
            >
              <option value="">모든 일차</option>
              {uniqueDays.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={filterPeriod}
              onChange={e => setFilterPeriod(e.target.value)}
              className="px-3.5 py-2 text-[15.5px] bg-white border border-gray-200 rounded-xl focus:outline-none font-bold text-[#0f172a] shadow-2xs"
            >
              <option value="">모든 교시</option>
              {uniquePeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={filterRoom}
              onChange={e => setFilterRoom(e.target.value)}
              className="px-3.5 py-2 text-[15.5px] bg-white border border-gray-200 rounded-xl focus:outline-none font-bold text-[#0f172a] shadow-2xs"
            >
              <option value="">모든 고사실</option>
              {uniqueRooms.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <span className="text-[15.5px] text-[#0f172a] font-bold bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-2xs">
              총 <strong className="text-[#005691] font-black">{filteredAttendance.length.toLocaleString()}건</strong>
            </span>
          </div>

          <div className="relative w-72">
            <Search className="w-4.5 h-4.5 absolute left-3 top-2.5 text-[#0f172a]" />
            <input
              type="text"
              placeholder="성명, 반, 과목 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-[15.5px] bg-white border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A651] font-normal shadow-2xs"
            />
          </div>
        </div>

        <div className="flex-1 border border-gray-200 rounded-2xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-[15.5px] text-left border-collapse">
            <thead className="bg-gray-50 text-gray-900 sticky top-0 font-black border-b border-gray-200 z-10 shadow-xs">
              <tr className="divide-x divide-gray-200">
                <th className="py-3 px-3.5">일차</th>
                <th className="py-3 px-3.5">교시</th>
                <th className="py-3 px-3.5">고사실</th>
                <th className="py-3 px-3.5">과목명</th>
                <th className="py-3 px-3.5">학년</th>
                <th className="py-3 px-3.5">반</th>
                <th className="py-3 px-3.5 text-center">번호</th>
                <th className="py-3 px-3.5">성명</th>
                <th className="py-3 px-3.5">분반(강의실)</th>
                <th className="py-3 px-3.5 text-center">학번순</th>
                <th className="py-3 px-3.5 text-center w-28">좌석번호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-normal">
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#0f172a] font-normal">
                    배치를 확정하면 응시현황 및 좌석번호가 생성됩니다.
                  </td>
                </tr>
              ) : (
                filteredAttendance.map(r => {
                  const isWait = r.subject === '미응시';
                  return (
                    <tr key={r.key1} className="divide-x divide-gray-200 hover:bg-white transition">
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{r.day}</td>
                      <td className="py-2.5 px-3.5 font-normal text-[#0f172a]">{r.period}</td>
                      <td className="py-2.5 px-3.5 font-normal text-[#005691]">{r.examRoom}</td>
                      <td className={`py-2.5 px-3.5 font-black ${isWait ? 'text-amber-900' : 'text-gray-900'}`}>
                        {r.subject}
                      </td>
                      <td className="py-2.5 px-3.5 font-normal">{r.grade}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{r.ban}</td>
                      <td className="py-2.5 px-3.5 text-center font-normal">{r.num}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{displayName(r.name)}</td>
                      <td className="py-2.5 px-3.5 text-[#0f172a] font-normal">{r.classRoom || '-'}</td>
                      <td className="py-2.5 px-3.5 text-center text-[#0f172a] font-normal">{r.seq}</td>
                      <td className="py-1.5 px-2.5 text-center">
                        <input
                          type="number"
                          disabled={stages.stage5}
                          value={r.seat ?? ''}
                          onChange={e => updateAttendanceSeat(r.key1, Number(e.target.value) || null)}
                          className="w-18 px-2 py-1 border border-gray-200 rounded-lg text-center font-black text-[#005691] text-[15.5px] disabled:bg-white"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {alertModal && (
        <AlertModal
          isOpen={alertModal.isOpen}
          message={alertModal.message}
          isError={alertModal.isError}
          onClose={() => setAlertModal(null)}
        />
      )}
    </div>
  );
};
