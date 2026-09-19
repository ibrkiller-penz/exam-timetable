import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { isExtraRoom, ExamRoom } from '../domain/types';
import { Plus, Trash2, Users, Building, ShieldCheck, AlertTriangle, ArrowRight, Layers, CheckCircle2 } from 'lucide-react';

interface Step7_1RoomPlacementProps {
  onNextStep?: () => void;
  onSelectSubTab?: (tab: '7' | '8') => void;
}

export const Step7_1RoomPlacement: React.FC<Step7_1RoomPlacementProps> = ({ onNextStep, onSelectSubTab }) => {
  const {
    rooms,
    students,
    stages,
    setRooms,
    addRegularRoom,
    addExtraRoom,
    deleteRoom,
    updateRoom,
    confirmStage4,
    cancelStage4,
    setStepConfirmed,
  } = useAppStore();

  const [batchCapacity, setBatchCapacity] = useState<number>(28);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);

  const totalStudents = students.length;
  const regularRooms = rooms.filter(r => !isExtraRoom(r));
  const extraRooms = rooms.filter(r => isExtraRoom(r));

  const totalCapacity = regularRooms.reduce((sum, r) => sum + (r.capacity && r.capacity > 0 ? r.capacity : 28), 0);
  const isCapacitySufficient = totalCapacity >= totalStudents;

  // Batch update all exam rooms capacity
  const handleApplyBatchCapacity = () => {
    if (batchCapacity <= 0) return;
    const updated = rooms.map(r => ({
      ...r,
      capacity: batchCapacity,
    }));
    setRooms(updated);
    setAlertModal({
      isOpen: true,
      message: `✅ 모든 고사실의 수용 정원이 ${batchCapacity}명으로 일괄 설정되었습니다.`,
    });
  };

  const isConfirmed = !!(stages['step7-1'] ?? stages.step7 ?? stages.stage4);

  const handleConfirm = () => {
    setStepConfirmed(71, true); // Mark 7-1 confirmed
    setAlertModal({
      isOpen: true,
      message: '🎉 [7-1. 고사장 배치] 단계가 확정되었습니다! 이제 [7-2. 학생 배정] 단계로 이동하여 학생 배정을 진행하실 수 있습니다.',
    });
    if (onNextStep) {
      onNextStep();
    }
  };

  const handleCancelConfirm = () => {
    cancelStage4();
    setStepConfirmed(71, false);
    setAlertModal({
      isOpen: true,
      message: '7-1 고사장 배치 확정이 취소되었습니다.',
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      {/* Stage Header */}
      <StageHeader
        stageNumber={7}
        stageTitle="7. 고사장 배치 (고사실 / 대기실 & 정원 설정)"
        isConfirmed={isConfirmed}
        confirmLabel="7. 고사장 배치 확정"
        cancelLabel="확정 취소"
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
        guideMessage="고사실 및 대기실을 구성하고 각 고사장의 수용 정원을 지정합니다. (7단계에서는 고사장 환경 및 정원까지만 설정합니다.)"
      />

      {/* Sub Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-7 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            className="px-5 py-2 rounded-lg font-black text-sm transition-all bg-[#005691] text-white shadow-xs"
          >
            7. 고사장 배치 (정원 설정)
          </button>
          <button
            type="button"
            onClick={() => onSelectSubTab ? onSelectSubTab('8') : onNextStep?.()}
            className="px-5 py-2 rounded-lg font-bold text-sm text-slate-600 hover:bg-white hover:shadow-2xs transition-all flex items-center gap-1.5"
          >
            <span>8. 학생 배치 (자동배정)</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {onNextStep && (
          <button
            onClick={onNextStep}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-2 text-sm"
          >
            <span>다음 단계: 8. 학생 배치</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6 flex-1">
        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#005691] flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">전체 응시 학생 수</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">{totalStudents}명</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">일반 고사실 / 정원</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">
                {regularRooms.length}개 <span className="text-sm font-bold text-indigo-600">({totalCapacity}명)</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">별도실 / 대기실</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">{extraRooms.length}개 실</div>
            </div>
          </div>

          <div className={`p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${
            isCapacitySufficient ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              isCapacitySufficient ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {isCapacitySufficient ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">정원 수용 상태</div>
              <div className="text-base font-black mt-0.5">
                {isCapacitySufficient ? '✅ 충분함 (정원 여유)' : `⚠️ 정원 부족 (${totalStudents - totalCapacity}명 초과)`}
              </div>
            </div>
          </div>
        </div>

        {/* Batch Capacity Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#005691] flex items-center justify-center font-bold text-sm">
              정원
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">고사실 수용 정원 일괄 입력</h3>
              <p className="text-xs font-semibold text-slate-500">모든 일반 고사실의 정원을 한번에 동일하게 설정합니다.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600 px-2">1실당 정원:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={batchCapacity}
                onChange={e => setBatchCapacity(Number(e.target.value))}
                className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-black text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#005691]"
              />
              <span className="text-xs font-bold text-slate-600 pr-2">명</span>
            </div>
            <button
              onClick={handleApplyBatchCapacity}
              className="px-4 py-2 bg-[#005691] hover:bg-blue-800 text-white font-bold rounded-xl shadow-xs transition text-sm"
            >
              전체 고사실 일괄 적용
            </button>
          </div>
        </div>

        {/* Exam Rooms Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-4 bg-slate-50/50">
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">고사장 목록 및 정원 관리</h3>
              <p className="text-xs font-semibold text-slate-500">각 고사실의 이름 및 수용 정원을 수정하거나 고사장을 추가/삭제하세요.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => addRegularRoom()}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border border-slate-300"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>+ 일반 고사실 추가</span>
              </button>
              <button
                onClick={() => addExtraRoom()}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border border-amber-200"
              >
                <Plus className="w-4 h-4 text-amber-600" />
                <span>+ 별도실 / 대기실 추가</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 text-xs font-black uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-6 w-16 text-center">번호</th>
                  <th className="py-3.5 px-6">고사실 명칭</th>
                  <th className="py-3.5 px-6">소속 학급/분반</th>
                  <th className="py-3.5 px-6 w-36">고사장 유형</th>
                  <th className="py-3.5 px-6 w-48 text-center">수용 정원 (인원)</th>
                  <th className="py-3.5 px-6 w-24 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-800">
                {rooms.map((room, idx) => {
                  const isExtra = isExtraRoom(room);
                  return (
                    <tr key={room.id} className={`hover:bg-slate-50/80 transition ${isExtra ? 'bg-amber-50/20' : ''}`}>
                      <td className="py-3.5 px-6 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-6 font-extrabold text-slate-900">
                        <input
                          type="text"
                          value={room.roomName}
                          onChange={e => updateRoom(room.id, { roomName: e.target.value })}
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-bold w-40 focus:outline-none focus:ring-2 focus:ring-[#005691]"
                        />
                      </td>
                      <td className="py-3.5 px-6">
                        <input
                          type="text"
                          value={room.banName}
                          onChange={e => updateRoom(room.id, { banName: e.target.value })}
                          placeholder="예: 1반"
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-medium w-36 focus:outline-none focus:ring-2 focus:ring-[#005691]"
                        />
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-black inline-flex items-center gap-1 ${
                          isExtra ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-200'
                        }`}>
                          {isExtra ? '대기실 / 별도실' : '일반 고사실'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateRoom(room.id, { capacity: Math.max(1, (room.capacity || 28) - 1) })}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center border border-slate-300"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={room.capacity || 28}
                            onChange={e => updateRoom(room.id, { capacity: Math.max(1, Number(e.target.value)) })}
                            className="w-16 py-1 px-2 border border-slate-300 rounded-lg text-center font-black text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#005691]"
                          />
                          <button
                            type="button"
                            onClick={() => updateRoom(room.id, { capacity: (room.capacity || 28) + 1 })}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center border border-slate-300"
                          >
                            +
                          </button>
                          <span className="text-xs font-bold text-slate-500">명</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              message: `[${room.roomName}] 고사장을 삭제하시겠습니까?`,
                              onConfirm: () => deleteRoom(room.id),
                            });
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                          title="고사장 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom CTA to Step 8 */}
        <div className="bg-gradient-to-r from-blue-900 to-[#005691] text-white p-6 rounded-2xl shadow-md flex items-center justify-between flex-wrap gap-4">
          <div>
            <h4 className="text-lg font-black tracking-wide">7. 고사장 배치를 완료하셨나요?</h4>
            <p className="text-xs text-blue-100 mt-1">고사실 구성 및 정원 설정이 완료되면 [8. 학생 배치]로 이동하여 과목 및 학생을 자동 배정하세요.</p>
          </div>
          <button
            onClick={handleConfirm}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl shadow-md transition transform active:scale-95 flex items-center gap-2 text-base"
          >
            <span>7. 확정 및 8. 학생 배치 이동</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modals */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          message={confirmModal.message}
          onConfirm={() => {
            confirmModal.onConfirm();
            setConfirmModal(null);
          }}
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
