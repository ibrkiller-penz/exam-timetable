import React from 'react';
import { useAppStore } from '../store/appStore';
import { X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useAppStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-150 border border-gray-100">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h3 className="text-lg font-bold text-[#005691]">환경 설정</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4 text-[15px]">
          <div>
            <label className="block font-normal text-gray-700 mb-1">
              슬롯당 최대 과목 수
            </label>
            <input
              type="number"
              min={1}
              max={6}
              value={settings.maxSubjectsPerSlot}
              onChange={e => updateSettings({ maxSubjectsPerSlot: Number(e.target.value) || 4 })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-normal text-gray-700 mb-1">
              분반 이름 표기
            </label>
            <div className="flex items-center gap-2">
              {([['ko', '가 나 다'], ['en', 'A B C'], ['none', '표시 안 함']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSettings({ banLabelStyle: value })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition ${
                    (settings.banLabelStyle ?? 'ko') === value
                      ? 'bg-[#005691] text-white border-[#005691]'
                      : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              7. 고사장 배치에서 교시마다 따로 지정할 수도 있습니다.
            </p>
          </div>

          <div>
            <label className="block font-normal text-gray-700 mb-1">
              좌석배치도 기본 열 수
            </label>
            <input
              type="number"
              min={3}
              max={8}
              value={settings.seatColumns}
              onChange={e => updateSettings({ seatColumns: Number(e.target.value) || 5 })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="font-normal text-gray-700">학생별 시간표에 좌석번호 표시</span>
            <input
              type="checkbox"
              checked={settings.showSeatOnStudentTable}
              onChange={e => updateSettings({ showSeatOnStudentTable: e.target.checked })}
              className="w-4 h-4 text-[#005691] rounded"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#005691] hover:bg-[#004270] text-white rounded-lg text-[15px] font-normal"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
