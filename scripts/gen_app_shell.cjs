const fs = require('fs');

// SettingsModal.tsx
fs.writeFileSync('src/components/SettingsModal.tsx', `import React from 'react';
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
          <h3 className="text-lg font-bold text-gray-900">환경 설정</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">
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
            <label className="block font-semibold text-gray-700 mb-1">
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
            <span className="font-semibold text-gray-700">학생별 시간표에 좌석번호 표시</span>
            <input
              type="checkbox"
              checked={settings.showSeatOnStudentTable}
              onChange={e => updateSettings({ showSeatOnStudentTable: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
`, 'utf8');

// AppShell.tsx
fs.writeFileSync('src/components/AppShell.tsx', `import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { ConfirmModal } from './ConfirmModal';
import { SettingsModal } from './SettingsModal';
import { downloadJson } from '../utils/download';
import {
  FileSpreadsheet,
  Settings,
  Calendar,
  Layers,
  CheckSquare,
  Users,
  Clock,
  Grid,
  ClipboardList,
  Printer,
  Download,
  Upload,
  RotateCcw,
  Sparkles
} from 'lucide-react';

interface AppShellProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentTab, onTabChange, children }) => {
  const store = useAppStore();
  const { meta, stages, setTitle, resetAll, loadSavedState } = store;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(meta.title);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSaveJson = () => {
    downloadJson(store, \`\${meta.title || '시험시간표'}.exam.json\`);
  };

  const handleLoadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        loadSavedState(parsed);
      } catch (err) {
        alert('올바른 .exam.json 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  };

  const steps = [
    { id: 'step1', num: 1, label: '1. 편성현황', icon: FileSpreadsheet, done: stages.stage1 },
    { id: 'step2', num: 2, label: '2. 기초정보', icon: Calendar, done: stages.stage1 },
    { id: 'step3', num: 3, label: '3. 과목현황', icon: Layers, done: stages.stage1 },
    { id: 'step4', num: 4, label: '4. 평가과목', icon: CheckSquare, done: stages.stage2 },
    { id: 'step5', num: 5, label: '5. 학생과목', icon: Users, done: stages.stage2 },
    { id: 'step6', num: 6, label: '6. 시간표작성', icon: Clock, done: stages.stage3 },
    { id: 'step7', num: 7, label: '7. 학생배치', icon: Grid, done: stages.stage4 },
    { id: 'step8', num: 8, label: '8. 응시현황', icon: ClipboardList, done: stages.stage5 },
  ];

  const reports = [
    { id: 'r1', label: '9-1 전체 시간표' },
    { id: 'r2', label: '9-2 고사실 명단' },
    { id: 'r3', label: '9-3 고사실 시간표' },
    { id: 'r4', label: '9-4 좌석배치도' },
    { id: 'r5', label: '9-5 학급 시간표' },
    { id: 'r6', label: '9-6 학생별 시간표' },
    { id: 'r7', label: '9-7 봉투 라벨' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0 no-print">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-lg tracking-tight text-white">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <span>시험시간표 웹앱</span>
          </div>
          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">v1.0</span>
        </div>

        {/* Steps List */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-slate-400 tracking-wider">작성 단계</div>
          {steps.map(s => {
            const Icon = s.icon;
            const active = currentTab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onTabChange(s.id)}
                className={\`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition \${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }\`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 opacity-80" />
                  <span>{s.label}</span>
                </div>
                {s.done && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs" title="확정됨" />
                )}
              </button>
            );
          })}

          <div className="pt-3 px-3 py-1 text-[11px] font-bold text-slate-400 tracking-wider">인쇄 및 출력물</div>
          {reports.map(r => {
            const active = currentTab === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onTabChange(r.id)}
                className={\`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition \${
                  active
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }\`}
              >
                <Printer className="w-3.5 h-3.5 opacity-70" />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-800 space-y-1.5 bg-slate-950/40 text-xs">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleSaveJson}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center gap-1 font-medium transition"
            >
              <Download className="w-3.5 h-3.5" /> 저장
            </button>
            <label className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center justify-center gap-1 font-medium transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> 불러오기
              <input type="file" accept=".json" onChange={handleLoadJson} className="hidden" />
            </label>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setShowSettings(true)}
              className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] py-1"
            >
              <Settings className="w-3.5 h-3.5" /> 설정
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              className="text-rose-400 hover:text-rose-300 flex items-center gap-1 text-[11px] py-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 새로시작
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0 no-print shadow-xs">
          <div className="flex items-center gap-3">
            {isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                autoFocus
                onBlur={() => {
                  setTitle(titleInput);
                  setIsEditingTitle(false);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setTitle(titleInput);
                    setIsEditingTitle(false);
                  }
                }}
                onChange={e => setTitleInput(e.target.value)}
                className="font-bold text-base px-2 py-1 border border-blue-400 rounded focus:outline-none ring-2 ring-blue-500"
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className="font-extrabold text-base text-gray-900 hover:text-blue-600 cursor-pointer flex items-center gap-2 group"
                title="클릭하여 시험 제목 수정"
              >
                <span>{meta.title}</span>
                <span className="text-xs font-normal text-gray-400 group-hover:text-blue-500">✎ 수정</span>
              </h1>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
            <span>자동 저장 활성화됨</span>
          </div>
        </header>

        {/* Dynamic Page Component */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>

      {confirmReset && (
        <ConfirmModal
          isOpen={true}
          title="새로 시작"
          message="모든 작업 데이터를 삭제하고 처음 상태로 되돌릴까요?"
          onConfirm={() => {
            resetAll();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};
`, 'utf8');

// App.tsx
fs.writeFileSync('src/App.tsx', `import React, { useState, useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { AppShell } from './components/AppShell';

import { Step1Neis } from './pages/Step1Neis';
import { Step2BaseInfo } from './pages/Step2BaseInfo';
import { Step3Subjects } from './pages/Step3Subjects';
import { Step4EvalSubjects } from './pages/Step4EvalSubjects';
import { Step5StudentSubjects } from './pages/Step5StudentSubjects';
import { Step6Timetable } from './pages/Step6Timetable';
import { Step7Placement } from './pages/Step7Placement';
import { Step8Attendance } from './pages/Step8Attendance';

import { Report1GradeTable } from './pages/reports/Report1GradeTable';
import { Report2ExamRoom } from './pages/reports/Report2ExamRoom';
import { Report3RoomTimetable } from './pages/reports/Report3RoomTimetable';
import { Report4SeatMap } from './pages/reports/Report4SeatMap';
import { Report5ClassTable } from './pages/reports/Report5ClassTable';
import { Report6StudentTable } from './pages/reports/Report6StudentTable';
import { Report7Labels } from './pages/reports/Report7Labels';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('step1');
  const initStore = useAppStore(state => state.initStore);

  useEffect(() => {
    initStore();
  }, [initStore]);

  const renderContent = () => {
    switch (currentTab) {
      case 'step1': return <Step1Neis />;
      case 'step2': return <Step2BaseInfo />;
      case 'step3': return <Step3Subjects />;
      case 'step4': return <Step4EvalSubjects />;
      case 'step5': return <Step5StudentSubjects />;
      case 'step6': return <Step6Timetable />;
      case 'step7': return <Step7Placement />;
      case 'step8': return <Step8Attendance />;
      case 'r1': return <Report1GradeTable />;
      case 'r2': return <Report2ExamRoom />;
      case 'r3': return <Report3RoomTimetable />;
      case 'r4': return <Report4SeatMap />;
      case 'r5': return <Report5ClassTable />;
      case 'r6': return <Report6StudentTable />;
      case 'r7': return <Report7Labels />;
      default: return <Step1Neis />;
    }
  };

  return (
    <AppShell currentTab={currentTab} onTabChange={setCurrentTab}>
      {renderContent()}
    </AppShell>
  );
};
export default App;
`, 'utf8');

// main.tsx
fs.writeFileSync('src/main.tsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`, 'utf8');

console.log('AppShell, App.tsx, main.tsx written.');
