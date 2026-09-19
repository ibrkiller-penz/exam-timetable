import React from 'react';
import { useAppStore } from '../store/appStore';
import { isNameVisible, unlockNames, lockNames } from '../domain/privacy';
import { isLocal } from '../utils/electronBridge';
import { X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 이 설정이 어느 화면에 영향을 주는지 밝혀 둡니다. 설정만 보고는 알 수 없습니다. */
const Where: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[13px] font-bold text-slate-400 ml-1">({children})</span>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useAppStore();
  const [namesVisible, setNamesVisible] = React.useState(isNameVisible());
  const [codeInput, setCodeInput] = React.useState('');
  const [codeError, setCodeError] = React.useState('');

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

        {/* 번호가 붙은 설정을 단계 순서대로 놓고,
            어느 한 화면에 매이지 않는 설정(학생 이름)은 맨 아래로 내립니다. */}
        <div className="py-4 space-y-4 text-[15px]">
          <div>
            <label className="block font-normal text-gray-700 mb-1">
              슬롯당 최대 과목 수
              <Where>6. 시간표작성 관련</Where>
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
              <Where>7. 고사장 배치 관련</Where>
            </label>
            <div className="flex items-center gap-2">
              {([['neis', '편성현황'], ['ko', '가 나 다'], ['en', 'A B C'], ['none', '표시 안 함']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSettings({ banLabelStyle: value })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition ${
                    (settings.banLabelStyle ?? 'neis') === value
                      ? 'bg-[#005691] text-white border-[#005691]'
                      : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              '편성현황'은 나이스에 적힌 분반 이름(G1, F …)을 그대로 씁니다.
              7. 고사장 배치에서 교시마다 따로 지정할 수도 있습니다.
            </p>
          </div>

          <div>
            <label className="block font-normal text-gray-700 mb-1">
              좌석배치도 기본 행렬
              <Where>10-4 좌석배치도 관련</Where>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="block text-xs text-gray-500 mb-1">열 (가로 줄 수)</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.seatColumns}
                  onChange={e => updateSettings({ seatColumns: Number(e.target.value) || 5 })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
                />
              </div>
              <span className="text-gray-400 font-bold mt-5">×</span>
              <div className="flex-1">
                <span className="block text-xs text-gray-500 mb-1">행 (한 줄당 좌석 수)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.seatsPerColumn}
                  onChange={e => updateSettings({ seatsPerColumn: Number(e.target.value) || 8 })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              한 고사실에 {(settings.seatColumns || 5) * (settings.seatsPerColumn || 8)}석이 그려집니다.
              고사실마다 다르게 하려면 10-4 좌석배치도에서 바꿉니다.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="font-normal text-gray-700">
              학생별 시간표에 좌석번호 표시
              <Where>10-6 개별 수험표 관련</Where>
            </span>
            <input
              type="checkbox"
              checked={settings.showSeatOnStudentTable}
              onChange={e => updateSettings({ showSeatOnStudentTable: e.target.checked })}
              className="w-4 h-4 text-[#005691] rounded"
            />
          </div>

          {/* 틱·장애 등으로 따로 보는 학생들이 쓰는 교실입니다. 보통 2실이고 학교마다 다릅니다. */}
          <div className="pt-2">
            <span className="block font-normal text-gray-700 mb-1.5">
              별도 고사실 운영 수
              <Where>10-8 별도 고사실 관련</Where>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={9}
                value={settings.separateRoomCount ?? 2}
                onChange={e => updateSettings({ separateRoomCount: Math.max(1, Number(e.target.value) || 1) })}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg"
              />
              <span className="text-gray-500 text-sm">실</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              8. 학생 배치에서 학생을 별도 응시자로 지정할 때, 여기서 정한 수만큼 고를 수 있습니다.
              별도 응시자는 원래 고사실 명단에 남고 비고에 '별도'로 표시되며, 좌석배치도에서는 빠집니다.
            </p>
          </div>

          {/* 어느 한 화면에 매이지 않는 설정이라 맨 아래에 둡니다.
              오프라인(USB) 버전은 학생 정보가 이 컴퓨터를 떠나지 않으므로 가리지 않습니다.
              가릴 수 없는 설정을 보여 주면 눌러 보고 헷갈리기만 합니다. */}
          {!isLocal && (
            <div className="border border-gray-200 rounded-xl p-3 bg-slate-50/60">
              <label className="block font-bold text-gray-800 mb-1">
                학생 이름
                <Where>모든 화면·인쇄물</Where>
              </label>
              {namesVisible ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-600">이 기기에서 이름이 보입니다.</span>
                  <button
                    type="button"
                    onClick={() => { lockNames(); setNamesVisible(false); setCodeInput(''); setCodeError(''); }}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-gray-50 transition"
                  >
                    다시 가리기
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-2">
                    이름이 <strong>홍○○</strong> 처럼 가려져 있습니다. 비밀번호를 넣으면 이 기기에서만 보입니다.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={codeInput}
                      onChange={e => { setCodeInput(e.target.value); setCodeError(''); }}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        if (unlockNames(codeInput)) { setNamesVisible(true); setCodeInput(''); setCodeError(''); }
                        else setCodeError('비밀번호가 맞지 않습니다.');
                      }}
                      placeholder="비밀번호"
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (unlockNames(codeInput)) { setNamesVisible(true); setCodeInput(''); setCodeError(''); }
                        else setCodeError('비밀번호가 맞지 않습니다.');
                      }}
                      className="px-3 py-1.5 bg-[#005691] hover:bg-blue-800 text-white rounded-lg text-sm font-bold transition"
                    >
                      보이기
                    </button>
                  </div>
                  {codeError && <p className="text-xs text-rose-600 mt-1 font-bold">{codeError}</p>}
                </>
              )}
              <p className="text-xs text-gray-500 mt-2">
                푼 상태는 이 브라우저에만 저장됩니다. 작업 파일이나 서버에는 올라가지 않습니다.
              </p>
            </div>
          )}
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
