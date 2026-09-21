import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { ConfirmModal } from './ConfirmModal';
import { SettingsModal } from './SettingsModal';
import { CloudModal } from './CloudModal';
import { onSyncStatusChange, CloudSyncStatus, saveCloudImmediately } from '../domain/firebase';
import { downloadJson } from '../utils/download';
import { electronBridge, isElectron, isLocal } from '../utils/electronBridge';
import { watchForNewVersion } from '../utils/versionCheck';
import { AppTheme } from '../domain/types';
import {
  FileSpreadsheet, Settings, Calendar, Layers, CheckSquare, Users,
  Clock, Grid, ClipboardList, Printer, Download, Upload, RotateCcw,
  Sparkles, CheckCircle2, Cloud, FolderOpen, Save, Palette, UserCheck, X
} from 'lucide-react';

interface AppShellProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

const THEME_COLORS: Record<AppTheme, { label: string; primary: string; dot: string }> = {
  blue: { label: '파란색', primary: '#005691', dot: 'theme-dot-blue' },
  red: { label: '붉은색', primary: '#9b1c1c', dot: 'theme-dot-red' },
  green: { label: '초록색', primary: '#15643a', dot: 'theme-dot-green' },
};

export const AppShell: React.FC<AppShellProps> = ({ currentTab, onTabChange, children }) => {
  const store = useAppStore();
  const { meta, stages, settings, updateSettings, setTitle, resetAll, loadSavedState } = store;

  const theme: AppTheme = settings.theme || 'blue';
  const tc = THEME_COLORS[theme];

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(meta.title);
  const [showSettings, setShowSettings] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  /*
   * 창을 열어 둔 채로 새 버전이 올라오면 옛 화면이 그대로 돕니다.
   * 고친 것을 올렸는데 "그대로인데요" 하는 일이 생기므로, 새 버전이
   * 보이면 알려 주고 새로고침을 고르게 합니다. 저절로 새로고치지는
   * 않습니다 — 작업 중일 수 있습니다.
   */
  const [newVersion, setNewVersion] = useState(false);
  useEffect(() => watchForNewVersion(() => setNewVersion(true)), []);
  const [showFileManager, setShowFileManager] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('saved');
  const [saveFiles, setSaveFiles] = useState<string[]>([]);
  const [currentFilename, setCurrentFilename] = useState<string>('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const unsubscribe = onSyncStatusChange(status => setSyncStatus(status));
    return () => unsubscribe();
  }, []);

  // Load file list when in Electron
  const refreshFileList = useCallback(async () => {
    if (isElectron) {
      const files = await electronBridge.listFiles();
      setSaveFiles(files);
    }
  }, []);

  useEffect(() => { refreshFileList(); }, [refreshFileList]);

  // Auto-save to local file in Electron
  const autoSaveToLocal = useCallback(async () => {
    if (!isElectron) return;
    const fname = currentFilename || `${meta.title || '시험시간표'}.exam.json`;
    const data = JSON.stringify(store, null, 2);
    await electronBridge.saveFile(fname, data);
    setSaveMsg(`자동 저장됨: ${fname}`);
    setTimeout(() => setSaveMsg(''), 2000);
  }, [currentFilename, meta.title, store]);

  // Watch store and auto-save (debounced)
  useEffect(() => {
    if (!isElectron) return;
    const timer = setTimeout(autoSaveToLocal, 800);
    return () => clearTimeout(timer);
  });

  const handleSaveJson = async () => {
    if (isElectron) {
      const fname = currentFilename || `${meta.title || '시험시간표'}.exam.json`;
      const data = JSON.stringify(store, null, 2);
      await electronBridge.saveFile(fname, data);
      if (!currentFilename) setCurrentFilename(fname);
      await refreshFileList();
      setSaveMsg(`저장됨: ${fname}`);
      setTimeout(() => setSaveMsg(''), 2000);
    } else {
      downloadJson(store, `${meta.title || '시험시간표'}.exam.json`);
    }
  };

  const handleSaveAs = async () => {
    if (isElectron) {
      const fname = currentFilename || `${meta.title || '시험시간표'}.exam.json`;
      const data = JSON.stringify(store, null, 2);
      const result = await electronBridge.saveAsDialog(fname, data);
      if (result.success && result.filename) {
        setCurrentFilename(result.filename);
        await refreshFileList();
        setSaveMsg(`다른 이름으로 저장: ${result.filename}`);
        setTimeout(() => setSaveMsg(''), 2500);
      }
    }
  };

  const handleLoadJson = async (e?: React.ChangeEvent<HTMLInputElement>) => {
    if (isElectron) {
      const result = await electronBridge.openFileDialog();
      if (result.success && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          loadSavedState(parsed);
          if (result.filename) setCurrentFilename(result.filename);
        } catch {
          alert('올바른 파일이 아닙니다.');
        }
      }
    } else if (e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const parsed = JSON.parse(evt.target?.result as string);
          loadSavedState(parsed);
        } catch {
          alert('올바른 .exam.json 파일이 아닙니다.');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleLoadSaveFile = async (fname: string) => {
    const data = await electronBridge.loadFile(fname);
    if (!data) return;
    try {
      const parsed = JSON.parse(data);
      loadSavedState(parsed);
      setCurrentFilename(fname);
      setShowFileManager(false);
    } catch {
      alert('파일을 불러오지 못했습니다.');
    }
  };

  const handleForceSync = async () => {
    try {
      setSyncStatus('saving');
      const state = useAppStore.getState();
      await saveCloudImmediately(state);
    } catch (e) {
      setSyncStatus('error');
    }
  };

  // 별도 고사실에 지정된 학생 수. 9번 단계에 몇 명인지 바로 보이게 합니다.
  const separateCount = Object.keys(store.separateExaminers ?? {}).length;

  // optional: 꼭 거치지 않아도 되는 단계(별도 응시자가 없는 학교도 있습니다).
  const steps: {
    id: string; num: number; label: string;
    icon: typeof FileSpreadsheet; done: boolean;
    optional?: boolean; count?: number;
  }[] = [
    { id: 'step1', num: 1, label: '1. 학생편성현황', icon: FileSpreadsheet, done: !!(stages.step1 ?? stages.stage1) },
    { id: 'step2', num: 2, label: '2. 기초정보', icon: Calendar, done: !!stages.step2 },
    { id: 'step3', num: 3, label: '3. 과목현황', icon: Layers, done: !!stages.step3 },
    { id: 'step4', num: 4, label: '4. 평가과목', icon: CheckSquare, done: !!(stages.step4 ?? stages.stage2) },
    { id: 'step5', num: 5, label: '5. 학생과목', icon: Users, done: !!stages.step5 },
    { id: 'step6', num: 6, label: '6. 시간표작성', icon: Clock, done: !!(stages.step6 ?? stages.stage3) },
    // 고사장 배치와 학생 배치는 한 화면입니다. 방을 옮기려면 학생도 같이 옮겨야 해서,
    // 둘로 나누면 한쪽에서 막히고 다른 쪽으로 건너가야 했습니다.
    { id: 'step7', num: 7, label: '7. 고사장·학생 배치', icon: Grid, done: !!stages.stage4 },
    { id: 'sep', num: 8, label: '8. 별도 고사실', icon: UserCheck, done: false, optional: true, count: separateCount },
    { id: 'step9', num: 9, label: '9. 응시현황', icon: ClipboardList, done: !!(stages.step9 ?? stages.stage5) },
  ];

  const reports = [
    { id: 'r1', label: '10-1 전체 시간표' },
    { id: 'r2', label: '10-2 고사실 명단' },
    { id: 'r3', label: '10-3 고사실 시간표' },
    { id: 'r4', label: '10-4 좌석배치도' },
    { id: 'r5', label: '10-5 학급 시간표' },
    { id: 'r6', label: '10-6 개별 수험표 출력' },
    { id: 'r7', label: '10-7 봉투 라벨' },
    { id: 'r9', label: '10-8 별도 수험생' },
  ];

  const p = tc.primary;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {newVersion && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 no-print flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#005691] text-white shadow-2xl">
          <span className="font-bold text-[15px]">새 버전이 올라왔습니다.</span>
          <button
            onClick={() => window.location.reload()}
            className="px-3.5 py-1.5 bg-white text-[#005691] rounded-lg font-black text-[14px] hover:bg-blue-50 transition"
          >
            새로고침
          </button>
          <button
            onClick={() => setNewVersion(false)}
            className="p-1 hover:bg-white/20 rounded-lg transition"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <aside className="w-[320px] bg-white text-gray-900 flex flex-col shrink-0 no-print border-r border-gray-200 shadow-xl">
        {/* Brand Header */}
        <div className="p-5 border-b border-gray-200/80 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md text-white shrink-0" style={{ background: `linear-gradient(135deg, ${p}, ${p}cc)` }}>
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-[19px] text-gray-900 whitespace-nowrap tracking-wide leading-tight">고사시간표 시스템</div>
              <div className="text-[14.5px] font-extrabold tracking-wider uppercase mt-0.5 whitespace-nowrap" style={{ color: p }}>Smart Scheduler</div>
            </div>
          </div>
          {/* Theme button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowTheme(!showTheme)}
              className="p-1.5 rounded-xl hover:bg-gray-100 transition border border-gray-200 shadow-xs flex items-center justify-center"
              title="테마 색상 변경 (파란색 / 붉은색 / 초록색)"
            >
              <div className={`w-4 h-4 rounded-full ${tc.dot} shadow-xs`} style={{ backgroundColor: tc.primary }} />
            </button>
            {showTheme && (
              <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2 min-w-[140px]">
                {(Object.entries(THEME_COLORS) as [AppTheme, typeof THEME_COLORS[AppTheme]][]).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => { updateSettings({ theme: key }); setShowTheme(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[14px] font-bold hover:bg-gray-50 transition ${theme === key ? 'bg-gray-100' : ''}`}
                    style={{ color: val.primary }}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full ${val.dot} shrink-0 shadow-2xs`} style={{ backgroundColor: val.primary }} />
                    <span style={{ color: val.primary }} className="font-bold">{val.label}</span>
                    {theme === key && <span className="ml-auto text-xs font-black">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 학년 전환 탭 (2학년 / 3학년) */}
        <div className="p-3 bg-slate-50 border-b border-gray-200">
          <div className="text-[11.5px] font-bold text-slate-500 mb-1.5 flex items-center justify-between">
            <span>대상 학년 선택</span>
            <span className="text-[11px] text-[#005691] font-extrabold">{store.activeGrade || '2'}학년 작업 중</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => store.switchGrade('2')}
              className={`py-2 px-3 rounded-lg text-[14.5px] font-black flex items-center justify-center gap-1.5 transition-all ${
                (store.activeGrade || '2') === '2'
                  ? 'bg-[#005691] text-white shadow-md scale-102'
                  : 'text-slate-700 hover:bg-white/60'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-300"></span>
              2학년
            </button>
            <button
              type="button"
              onClick={() => store.switchGrade('3')}
              className={`py-2 px-3 rounded-lg text-[14.5px] font-black flex items-center justify-center gap-1.5 transition-all ${
                store.activeGrade === '3'
                  ? 'bg-[#9b1c1c] text-white shadow-md scale-102'
                  : 'text-slate-700 hover:bg-white/60'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-300"></span>
              3학년
            </button>
          </div>
        </div>

        {/* Steps Navigation */}
        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5">
          <div className="px-3.5 py-1 text-[13px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span>작성 단계</span>
          </div>

          {steps.map(s => {
            const Icon = s.icon;
            const active = currentTab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onTabChange(s.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-[16px] transition-all duration-150`}
                style={active ? { backgroundColor: tc.primary + '15', color: tc.primary, boxShadow: `0 0 0 1px ${tc.primary}30`, fontWeight: 800 } : { color: '#334155', fontWeight: 600 }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4.5 h-4.5" style={{ color: active ? tc.primary : '#64748b' }} />
                  <span style={{ color: active ? tc.primary : '#334155' }}>{s.label}</span>
                </div>
                {s.optional ? (
                  <span
                    className="text-[13px] font-black px-2 py-0.5 rounded-md border bg-slate-50 text-slate-500 border-slate-200"
                    title="별도 고사실은 해당하는 학생이 있을 때만 쓰는 단계입니다."
                  >
                    {s.count ? `${s.count}명` : '선택'}
                  </span>
                ) : s.done ? (
                  <span className="flex items-center gap-1 text-[15px] font-black text-[#007a3c] bg-[#e5f6ec] px-2 py-1 rounded-md border border-[#00A651]/30">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                )}
              </button>
            );
          })}

          <div className="pt-4 px-3.5 py-1 text-[13px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span>인쇄 및 출력물</span><span className="text-[13px] text-slate-400 font-bold">Reports</span>
          </div>

          {reports.map(r => {
            const active = currentTab === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onTabChange(r.id)}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[15.5px] transition-all"
                style={active ? { backgroundColor: tc.primary + '15', color: tc.primary, fontWeight: 800 } : { color: '#334155', fontWeight: 600 }}
              >
                <Printer className="w-4 h-4" style={{ color: active ? tc.primary : '#64748b' }} />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-3.5 border-t border-gray-200 bg-white space-y-2 text-[17px]">
          {/* Electron file operations */}
          {isElectron ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveJson}
                  className="px-2.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center gap-2 font-bold transition border border-gray-200 text-[15px]"
                  title="현재 파일에 저장"
                >
                  <Save className="w-3.5 h-3.5" style={{ color: p }} /> 저장
                </button>
                <button
                  onClick={handleSaveAs}
                  className="px-2.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center gap-2 font-bold transition border border-gray-200 text-[15px]"
                  title="다른 이름으로 저장"
                >
                  <Download className="w-3.5 h-3.5" style={{ color: p }} /> 다른 이름
                </button>
              </div>
              <button
                onClick={() => { setShowFileManager(true); refreshFileList(); }}
                className="w-full px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center gap-2 font-bold transition border border-gray-200 text-[15px]"
              >
                <FolderOpen className="w-3.5 h-3.5" style={{ color: p }} /> 저장 파일 목록 열기
              </button>
            </>
          ) : (
            <>
              {!isLocal && (
                <button
                  onClick={() => setShowCloud(true)}
                  className="w-full px-3 py-2.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] border border-slate-300 text-slate-700 rounded-xl flex items-center justify-center gap-2 font-black transition text-[17px] shadow-md"
                >
                  <Cloud className="w-4 h-4 text-[#0369a1] animate-pulse" /> ☁️ 서버 동기화 &amp; 스냅샷
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveJson}
                  className="px-2.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center gap-2 font-bold transition border border-gray-200 text-[15px]"
                >
                  <Download className="w-3.5 h-3.5" style={{ color: p }} /> 파일 저장
                </button>
                <label className="px-2.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center gap-2 font-bold transition cursor-pointer border border-gray-200 text-[15px]">
                  <Upload className="w-3.5 h-3.5" style={{ color: p }} /> 파일 열기
                  <input type="file" accept=".json" onChange={handleLoadJson} className="hidden" />
                </label>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setShowSettings(true)}
              className="text-gray-900 hover:text-gray-900 flex items-center gap-1.5 text-[15px] py-1 px-2 rounded-lg hover:bg-gray-100 transition font-bold"
            >
              <Settings className="w-4 h-4" /> 설정
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1 text-[15px] py-1 px-2 rounded-lg transition font-bold"
              style={{ color: p }}
            >
              <RotateCcw className="w-4 h-4" /> 초기화
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f1f5f9] text-gray-900 print:overflow-visible print:h-auto print:block print:bg-white">
        <header className="h-16 bg-white border-b border-gray-200/90 px-6 flex items-center justify-between shrink-0 no-print shadow-xs z-20">
          <div className="flex items-center gap-3.5">
            {/* 상단 학년 퀵 전환 스위처 */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-300 shadow-2xs">
              <button
                type="button"
                onClick={() => store.switchGrade('2')}
                className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                  (store.activeGrade || '2') === '2'
                    ? 'bg-[#005691] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
                title="2학년 작업 공간으로 전환 (파란색 테마)"
              >
                <span className="w-2 h-2 rounded-full bg-blue-300"></span>
                2학년
              </button>
              <button
                type="button"
                onClick={() => store.switchGrade('3')}
                className={`px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                  store.activeGrade === '3'
                    ? 'bg-[#9b1c1c] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
                title="3학년 작업 공간으로 전환 (붉은색 테마)"
              >
                <span className="w-2 h-2 rounded-full bg-red-300"></span>
                3학년
              </button>
            </div>

            {isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                autoFocus
                onBlur={() => { setTitle(titleInput); setIsEditingTitle(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { setTitle(titleInput); setIsEditingTitle(false); } }}
                onChange={e => setTitleInput(e.target.value)}
                className="font-black text-lg px-3 py-1.5 bg-white border rounded-xl focus:outline-none ring-2 shadow-xs"
                style={{ borderColor: p, outlineColor: p }}
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className="font-black text-lg text-gray-900 cursor-pointer flex items-center gap-2 group transition"
                title="클릭하여 시험 제목 수정"
              >
                <span>{meta.title}</span>
                {isElectron && currentFilename && (
                  <span className="text-[12px] font-normal text-gray-400 ml-1">[{currentFilename}]</span>
                )}
                <span className="text-[15px] font-bold text-gray-900 group-hover:text-red-500 bg-white group-hover:bg-gray-100 px-2 py-0.5 rounded-lg transition">✎ 수정</span>
              </h1>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Local disk save status indicator */}
            {isElectron && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 shadow-2xs transition select-none"
                title={`로컬 자동 저장 폴더: save/${currentFilename || `${meta.title || '시험시간표'}.exam.json`}`}
              >
                <Save className={`w-3.5 h-3.5 transition-colors ${saveMsg ? 'text-green-600 animate-pulse' : 'text-slate-400'}`} />
                <span className="text-[13px]">{saveMsg ? '저장됨' : '자동 저장'}</span>
              </div>
            )}

            {!isLocal && (
              <>
                {/* 오프라인 배포판(260MB)은 GitHub 릴리스에서 받습니다.
                    호스팅에 함께 올리면 배포할 때마다 저장 용량이 쌓여 한도를 넘깁니다
                    (실제로 넘겨서 배포가 막혔습니다). 'latest' 라서 새 릴리스를 올리면
                    자동으로 최신을 가리킵니다. */}
                <a
                  href="https://github.com/ibrkiller-penz/exam-timetable/releases/latest/download/ExamTimetable-Offline.zip"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white border border-slate-700 rounded-full text-xs font-bold shadow-sm transition"
                >
                  💾 오프라인 로컬 버전 다운로드
                </a>
                {syncStatus === 'saving' && (
                  <button onClick={() => setShowCloud(true)} className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#e6f1f8] text-gray-900 border border-gray-200 rounded-full text-[15px] font-black shadow-2xs hover:bg-[#e6f1f8] transition">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#005691] animate-ping" />☁️ 서버 저장 중...
                  </button>
                )}
                {syncStatus === 'saved' && (
                  <button onClick={handleForceSync} className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#e6f1f8] text-[#005691] border border-gray-200/80 rounded-full text-[15px] font-black shadow-2xs hover:bg-[#fee2e2] transition">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#005691] animate-pulse" />☁️ 서버 즉시 동기화
                  </button>
                )}
                {syncStatus === 'error' && (
                  <button onClick={() => setShowCloud(true)} className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[15px] font-black shadow-2xs transition">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />☁️ 저장 오류
                  </button>
                )}
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden print:overflow-visible print:h-auto print:block">{children}</div>
      </main>

      {/* Confirm Reset Modal */}
      {confirmReset && (
        <ConfirmModal
          isOpen={true}
          title="새로 시작 (초기화)"
          message="모든 작업 데이터를 삭제하고 처음 상태로 되돌릴까요? 현재 저장되지 않은 데이터는 사라집니다."
          onConfirm={() => { resetAll(); setConfirmReset(false); setCurrentFilename(''); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {/* Electron File Manager Modal */}
      {showFileManager && isElectron && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col p-6 border border-gray-100">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-lg font-bold" style={{ color: p }}>저장 파일 목록</h3>
              <button onClick={() => setShowFileManager(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="mb-3">
              <button
                onClick={async () => {
                  const result = await electronBridge.openFileDialog();
                  if (result.success && result.data) {
                    try {
                      const parsed = JSON.parse(result.data);
                      loadSavedState(parsed);
                      if (result.filename) setCurrentFilename(result.filename);
                      setShowFileManager(false);
                    } catch { alert('올바른 파일이 아닙니다.'); }
                  }
                }}
                className="w-full px-4 py-2 rounded-lg border border-dashed border-gray-300 text-[14px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2 justify-center transition"
              >
                <FolderOpen className="w-4 h-4" /> 다른 위치에서 파일 열기...
              </button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2">
              {saveFiles.length === 0 ? (
                <p className="text-center text-gray-400 py-8">저장된 파일이 없습니다</p>
              ) : (
                saveFiles.map(fname => (
                  <div key={fname} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${currentFilename === fname ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <button
                      onClick={() => handleLoadSaveFile(fname)}
                      className="flex-1 text-left text-[14px] font-medium text-gray-800 truncate"
                    >
                      {fname === currentFilename ? '▶ ' : ''}{fname}
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`"${fname}" 파일을 삭제할까요?`)) {
                          await electronBridge.deleteFile(fname);
                          await refreshFileList();
                          if (currentFilename === fname) setCurrentFilename('');
                        }
                      }}
                      className="ml-2 text-red-400 hover:text-red-600 text-[12px] px-2 py-1 rounded"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      {!isLocal && <CloudModal isOpen={showCloud} onClose={() => setShowCloud(false)} />}
    </div>
  );
};
