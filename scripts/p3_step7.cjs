const fs = require('fs');
const content = `import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { MSG } from '../domain/messages';
import { selPlacementSlots, selSubjectBanEntries } from '../store/selectors';
import { slotSummary, cellDerived, panelItems } from '../domain/placement';
import { autoPlaceSlot, autoPlaceAll } from '../domain/autoPlace';
import { Sparkles, Trash2 } from 'lucide-react';

export const Step7Placement: React.FC = () => {
  const {
    placement,
    rooms,
    students,
    stages,
    ui,
    setPlacementCell,
    clearPlacementSlot,
    clearAllPlacement,
    setPlacementGrid,
    setSelectedPlacementCell,
    confirmStage4,
    cancelStage4,
  } = useAppStore();

  const placementSlots = useAppStore(selPlacementSlots);
  const entries = useAppStore(selSubjectBanEntries);

  const selectedCell = ui.selectedPlacementCell;

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [roomInfoModal, setRoomInfoModal] = useState<{ title: string; list: string[] } | null>(null);

  const handleCellClick = (slot: number, roomId: string) => {
    setSelectedPlacementCell({ slot, roomId });
  };

  const handleCellDoubleClick = (slot: number, roomId: string) => {
    if (stages.stage4) {
      const room = rooms.find(r => r.id === roomId);
      const cellVal = placement[slot]?.[roomId] ?? '';
      setRoomInfoModal({
        title: \`【\${room?.roomName}】 \${cellVal}\`,
        list: [\`고사실: \${room?.roomName}\`, \`배치 항목: \${cellVal}\`],
      });
    }
  };

  const handleAutoPlaceSlot = (slot: number) => {
    if (stages.stage4) return;
    const ps = placementSlots.find(s => s.index === slot);
    if (!ps) return;

    const extraRooms = rooms.filter(r => (r.maxClassSize === null || r.maxClassSize === 0) && r.capacity > 0);
    if (ps.banCountTotal <= extraRooms.length) {
      setConfirmModal({
        isOpen: true,
        message: MSG.S7_AUTO_EXTRA(ps.title, ps.subjects.join(','), ps.banCountTotal, extraRooms.length),
        onConfirm: () => {
          const next = autoPlaceSlot(slot, rooms[0]?.id ?? '', placement, placementSlots, rooms, entries, students, true);
          setPlacementGrid(next);
          setConfirmModal(null);
        },
      });
    } else {
      const next = autoPlaceSlot(slot, rooms[0]?.id ?? '', placement, placementSlots, rooms, entries, students, false);
      setPlacementGrid(next);
    }
  };

  const handleAutoPlaceAll = () => {
    if (stages.stage4) return;
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_AUTO_ALL,
      onConfirm: () => {
        const next = autoPlaceAll(placement, placementSlots, rooms, entries, students);
        setPlacementGrid(next);
        setConfirmModal(null);
      },
    });
  };

  const handleDeleteCurrentCell = () => {
    if (!selectedCell || stages.stage4) return;
    setPlacementCell(selectedCell.slot, selectedCell.roomId, '');
  };

  const handleDeleteSlot = () => {
    if (!selectedCell || stages.stage4) return;
    const ps = placementSlots.find(s => s.index === selectedCell.slot);
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_DEL_SLOT2(ps?.title ?? ''),
      onConfirm: () => {
        clearPlacementSlot(selectedCell.slot);
        setConfirmModal(null);
      },
    });
  };

  const handleDeleteAll = () => {
    if (stages.stage4) return;
    setConfirmModal({
      isOpen: true,
      message: MSG.S7_DEL_ALL,
      onConfirm: () => {
        clearAllPlacement();
        setConfirmModal(null);
      },
    });
  };

  const handleConfirm = () => {
    try {
      const notices = confirmStage4();
      if (notices.length > 0) {
        setAlertModal({ isOpen: true, message: notices.join('\\n') });
      }
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: stages.stage5 ? MSG.S7_CANCEL_SEAT : MSG.S7_CANCEL_SIMPLE,
      onConfirm: () => {
        cancelStage4();
        setConfirmModal(null);
      },
    });
  };

  const curSlot = selectedCell ? placementSlots.find(s => s.index === selectedCell.slot) : null;
  const curRoom = selectedCell ? rooms.find(r => r.id === selectedCell.roomId) : null;
  const pItems = selectedCell ? panelItems(selectedCell.slot, selectedCell.roomId, placement, placementSlots, rooms, entries, students) : [];

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <StageHeader
        stageNumber={7}
        stageTitle="학생 및 고사실 배치"
        isConfirmed={stages.stage4}
        confirmLabel="배치 확정"
        cancelLabel="배치 확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoPlaceAll}
              disabled={stages.stage4}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition disabled:opacity-40"
            >
              <Sparkles className="w-4 h-4" /> 자동 배치 (전체)
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={stages.stage4}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> 전체 삭제
            </button>
          </div>
        }
      />

      <div className="p-4 flex-1 flex gap-4 overflow-hidden">
        <div className="flex-1 flex flex-col border border-gray-300 rounded-xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-xs text-left border-collapse min-w-[900px]">
            <thead className="bg-gray-100 text-gray-800 sticky top-0 z-20 border-b border-gray-300 shadow-xs">
              <tr className="divide-x divide-gray-300">
                <th colSpan={5} className="py-2 px-3 text-center bg-gray-200 font-bold">
                  슬롯 및 요약 현황
                </th>
                {rooms.map(r => (
                  <th key={r.id} className="py-1 px-2 text-center min-w-[110px]">
                    <div className="font-bold text-gray-900">{r.roomName || '(미배정)'}</div>
                    <div className="text-[10px] text-gray-500 font-normal">
                      {r.banName || '별도실'} ({r.capacity}석)
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-300">
              {placementSlots.map(ps => {
                const sum = slotSummary(ps.index, placement, placementSlots, entries);
                const hasError = sum.errorKey !== 'OK';

                return (
                  <React.Fragment key={ps.index}>
                    <tr className="divide-x divide-gray-200 bg-white">
                      <td rowSpan={3} className="py-2 px-2.5 font-bold text-center bg-gray-50 w-24">
                        <div className="text-gray-900 font-extrabold">{ps.title}</div>
                        <div className="text-[10px] text-blue-700 mt-1">{ps.subjects.join(', ')}</div>
                        {!stages.stage4 && (
                          <button
                            onClick={() => handleAutoPlaceSlot(ps.index)}
                            className="mt-2 text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold hover:bg-blue-100"
                          >
                            자동배치
                          </button>
                        )}
                      </td>
                      <td className="py-1 px-1.5 text-center bg-gray-50 text-gray-600 font-medium w-12">계</td>
                      <td className="py-1 px-1.5 text-center font-bold text-blue-700 w-12">{sum.total.ban}</td>
                      <td className="py-1 px-1.5 text-center font-semibold w-12">{sum.total.takers}</td>
                      <td className="py-1 px-1.5 text-center font-semibold text-amber-700 w-12">{sum.total.nonTakers}</td>

                      {rooms.map(r => {
                        const cellVal = placement[ps.index]?.[r.id] ?? '';
                        const isSelected = selectedCell?.slot === ps.index && selectedCell?.roomId === r.id;
                        const isWait = cellVal.startsWith('대기 -');
                        const isUsable = r.roomName !== '' && r.roomName !== '0';

                        return (
                          <td
                            key={r.id}
                            rowSpan={3}
                            onClick={() => isUsable && handleCellClick(ps.index, r.id)}
                            onDoubleClick={() => handleCellDoubleClick(ps.index, r.id)}
                            className={\`py-1.5 px-2 align-middle text-center cursor-pointer transition divide-x divide-gray-200 \${
                              !isUsable ? 'bg-gray-100/80 cursor-not-allowed' :
                              isSelected ? 'bg-blue-100 ring-2 ring-blue-600 ring-inset font-bold z-10' :
                              isWait ? 'bg-amber-50/70 hover:bg-amber-100/60' :
                              cellVal ? 'bg-blue-50/70 hover:bg-blue-100/60' :
                              'hover:bg-gray-50'
                            }\`}
                          >
                            {cellVal ? (
                              <div className="space-y-0.5">
                                <div className={\`text-xs font-bold \${isWait ? 'text-amber-900' : 'text-blue-900'}\`}>
                                  {cellVal}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  {cellDerived(cellVal, entries).stuCount}명
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    <tr className="divide-x divide-gray-200 bg-white">
                      <td className="py-1 px-1.5 text-center bg-gray-50 text-gray-600 font-medium">배치</td>
                      <td className="py-1 px-1.5 text-center font-bold">{sum.placed.ban}</td>
                      <td className="py-1 px-1.5 text-center">{sum.placed.takers}</td>
                      <td className="py-1 px-1.5 text-center text-amber-700">{sum.placed.nonTakers}</td>
                    </tr>

                    <tr className={\`divide-x divide-gray-200 border-b-2 border-gray-300 \${hasError ? 'bg-rose-50/50' : 'bg-gray-50/30'}\`}>
                      <td className="py-1 px-1.5 text-center bg-gray-50 text-gray-600 font-medium">미배치</td>
                      <td className={\`py-1 px-1.5 text-center font-bold \${sum.remaining.ban !== 0 ? 'text-rose-600' : 'text-gray-400'}\`}>{sum.remaining.ban}</td>
                      <td className={\`py-1 px-1.5 text-center font-bold \${sum.remaining.takers !== 0 ? 'text-rose-600' : 'text-gray-400'}\`}>{sum.remaining.takers}</td>
                      <td className={\`py-1 px-1.5 text-center font-bold \${sum.remaining.nonTakers !== 0 ? 'text-rose-600' : 'text-gray-400'}\`}>{sum.remaining.nonTakers}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="w-80 flex flex-col border border-gray-300 rounded-xl bg-white shadow-sm overflow-hidden shrink-0">
          <div className="bg-gray-100 p-3 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">배치 패널</h3>
            {curSlot && curRoom && (
              <div className="text-xs text-blue-700 font-semibold mt-1">
                {curSlot.title} : {curRoom.roomName} ({curRoom.banName || '별도실'})
              </div>
            )}
          </div>

          <div className="p-3 flex-1 flex flex-col overflow-hidden">
            {selectedCell ? (
              <>
                <div className="text-xs text-gray-500 mb-2">항목을 클릭하여 현재 셀에 배치:</div>
                <div className="flex-1 overflow-auto border border-gray-200 rounded-lg p-1.5 space-y-1">
                  {pItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">
                      배치 가능한 과목/대기 항목이 없습니다.
                    </div>
                  ) : (
                    pItems.map((it, idx) => (
                      <button
                        key={idx}
                        disabled={stages.stage4}
                        onClick={() => setPlacementCell(selectedCell.slot, selectedCell.roomId, it.key)}
                        className={\`w-full text-left p-2 rounded-md text-xs border transition flex items-center justify-between \${
                          it.type === 'wait'
                            ? 'bg-amber-50/80 hover:bg-amber-100 border-amber-200 text-amber-900'
                            : 'bg-blue-50/80 hover:bg-blue-100 border-blue-200 text-blue-900 font-semibold'
                        }\`}
                      >
                        <span>{it.key}</span>
                        <span className="text-[11px] text-gray-500">{it.count || it.room}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteCurrentCell}
                      disabled={stages.stage4}
                      className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded"
                    >
                      현재 셀 삭제
                    </button>
                    <button
                      onClick={handleDeleteSlot}
                      disabled={stages.stage4}
                      className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded"
                    >
                      교시 전체 삭제
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-6 text-center">
                배치 격자에서 셀을 선택하면 배치 가능한 항목 목록이 여기에 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {roomInfoModal && (
        <AlertModal
          isOpen={true}
          title={roomInfoModal.title}
          message={roomInfoModal.list.join('\\n')}
          onClose={() => setRoomInfoModal(null)}
        />
      )}

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
`;
fs.writeFileSync('src/pages/Step7Placement.tsx', content, 'utf8');
console.log('Step7 written');
