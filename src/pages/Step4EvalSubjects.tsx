import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { StepHelp } from '../components/StepHelp';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { MSG } from '../domain/messages';
import { CheckSquare, Square, MinusSquare, ArrowUpDown, ArrowUp, ArrowDown, CheckCheck, RefreshCw, Layers, Save, CheckCircle2, RotateCcw } from 'lucide-react';
import { SubjectSummary } from '../domain/types';
import { buildSubjectTables } from '../domain/baseData';
import { buildTakers, findCompatGroups } from '../domain/subjects';
import { saveBaseInfoDefaults, saveEvalTargetsPreset, loadEvalTargetsPreset, EvalTargetsPreset } from '../store/persistence';

type CompatSortKey = 'stuCount' | 'banCount' | 'nonTakers' | 'subjectCount';
type Table1SortKey = 'stuCount' | 'banCount' | 'subject';

export const Step4EvalSubjects: React.FC = () => {
  const {
    days,
    times,
    rooms,
    settings,
    neis,
    subjectSummary,
    evalTargets,
    compat,
    compatOverflow,
    stages,
    toggleEvalTarget,
    setAllEvalTargets,
    setMultipleEvalTargets,
    invertEvalTargets,
    invertMultipleEvalTargets,
    selectOnlySubjects,
    confirmStage2,
    cancelStage2,
  } = useAppStore();

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [sortKey, setSortKey] = useState<CompatSortKey>('stuCount');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [table1SortKey, setTable1SortKey] = useState<Table1SortKey>('stuCount');
  const [table1SortOrder, setTable1SortOrder] = useState<'desc' | 'asc'>('desc');
  const [sizeFilter, setSizeFilter] = useState<'all' | 4 | 3 | 2>('all');
  const [showSaveToast, setShowSaveToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string }>({
    title: '평가 대상 과목이 저장되었습니다',
    desc: '새로고침이나 파일 갱신 시에도 설정이 유지됩니다.',
  });
  const [savedPreset, setSavedPreset] = useState<EvalTargetsPreset | null>(() => loadEvalTargetsPreset());
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  const availableGrades = useMemo(() => {
    const grades = new Set<string>();
    (subjectSummary || []).forEach(s => {
      const match = s.subject.match(/^\[(\d)학년\]/);
      if (match) grades.add(match[1]);
    });
    return Array.from(grades).sort();
  }, [subjectSummary]);

  const triggerToast = (title: string, desc: string) => {
    setToastMessage({ title, desc });
    setShowSaveToast(true);
    setTimeout(() => {
      setShowSaveToast(false);
    }, 3500);
  };

  const handleSaveCheckPreset = () => {
    const preset = saveEvalTargetsPreset(evalTargets);
    setSavedPreset(preset);
    saveBaseInfoDefaults({
      days,
      times,
      rooms,
      settings,
      evalTargets,
    });
    triggerToast(
      `선택된 ${preset.totalSaved}개 과목 체크가 저장되었습니다`,
      `언제든지 [기존 체크] 버튼을 누르면 이 설정을 복원할 수 있습니다.`
    );
  };

  const handleLoadCheckPreset = () => {
    const preset = savedPreset || loadEvalTargetsPreset();
    if (!preset || preset.selectedSubjects.length === 0) {
      setAlertModal({
        isOpen: true,
        message: '저장된 과목 체크 내역이 없습니다. 먼저 원하는 과목을 선택하고 [체크 저장]을 눌러주세요.',
        isError: false,
      });
      return;
    }
    selectOnlySubjects(preset.selectedSubjects);
    triggerToast(
      `저장된 ${preset.selectedSubjects.length}개 과목 체크를 불러왔습니다`,
      `저장 일시: ${new Date(preset.savedAt).toLocaleString('ko-KR')}`
    );
  };

  const displaySummary = useMemo(() => {
    let list: SubjectSummary[] = [];
    if (subjectSummary && subjectSummary.length > 0) list = [...subjectSummary];
    else if (neis && neis.length > 0) {
      list = [...buildSubjectTables(neis, 1).subjectSummary];
    }
    if (gradeFilter !== 'all') {
      list = list.filter(s => s.subject.startsWith(`[${gradeFilter}학년]`));
    }
    // Sort by selected key, default: 학생수 많은 순 (내림차순)
    return list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (table1SortKey === 'stuCount') {
        valA = a.stuCount;
        valB = b.stuCount;
      } else if (table1SortKey === 'banCount') {
        valA = a.banCount;
        valB = b.banCount;
      } else if (table1SortKey === 'subject') {
        return table1SortOrder === 'asc'
          ? a.subject.localeCompare(b.subject, 'ko')
          : b.subject.localeCompare(a.subject, 'ko');
      }
      if (valA === valB) {
        return b.stuCount - a.stuCount;
      }
      return table1SortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [subjectSummary, neis, table1SortKey, table1SortOrder]);

  const uniqueStudentCount = useMemo(() => {
    if (!neis || neis.length === 0) return 0;
    return new Set(neis.map(r => `${r.ban}${r.num}`)).size;
  }, [neis]);

  const displayCompat = useMemo(() => {
    if (compat && compat.length > 0) return { compat, overflow: compatOverflow };
    if (neis && neis.length > 0 && displaySummary.length > 0) {
      const activeTargets = displaySummary.filter(s => evalTargets[s.subject] !== false);
      const takers = buildTakers(neis, activeTargets);
      const res = findCompatGroups(activeTargets, takers, uniqueStudentCount);
      return { compat: res.groups, overflow: res.overflow };
    }
    return { compat: [], overflow: false };
  }, [compat, compatOverflow, neis, displaySummary, evalTargets, uniqueStudentCount]);

  const sortedCompat = useMemo(() => {
    const list = [...displayCompat.compat];
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortKey === 'stuCount') {
        valA = a.stuCount;
        valB = b.stuCount;
      } else if (sortKey === 'banCount') {
        valA = a.banCount;
        valB = b.banCount;
      } else if (sortKey === 'nonTakers') {
        valA = a.nonTakers;
        valB = b.nonTakers;
      } else if (sortKey === 'subjectCount') {
        valA = a.subjects.length;
        valB = b.subjects.length;
      }
      if (valA === valB) {
        return b.stuCount - a.stuCount;
      }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
    return list;
  }, [displayCompat.compat, sortKey, sortOrder]);

  const filteredCompat = useMemo(() => {
    if (sizeFilter === 'all') return sortedCompat;
    return sortedCompat.filter(g => g.subjects.length === sizeFilter);
  }, [sortedCompat, sizeFilter]);

  const count4 = useMemo(() => sortedCompat.filter(g => g.subjects.length === 4).length, [sortedCompat]);
  const count3 = useMemo(() => sortedCompat.filter(g => g.subjects.length === 3).length, [sortedCompat]);
  const count2 = useMemo(() => sortedCompat.filter(g => g.subjects.length === 2).length, [sortedCompat]);

  const handleHeaderSort = (key: CompatSortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'nonTakers' ? 'asc' : 'desc');
    }
  };

  const handleTable1HeaderSort = (key: Table1SortKey) => {
    if (table1SortKey === key) {
      setTable1SortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setTable1SortKey(key);
      setTable1SortOrder(key === 'subject' ? 'asc' : 'desc');
    }
  };

  const selectedCount = Object.values(evalTargets).filter(Boolean).length;

  const handleConfirm = () => {
    if (!stages.stage1) {
      setAlertModal({ isOpen: true, message: MSG.S4_NEED_S1, isError: true });
      return;
    }
    if (selectedCount === 0) {
      setAlertModal({ isOpen: true, message: MSG.S4_NEED_O, isError: true });
      return;
    }

    setConfirmModal({
      isOpen: true,
      message: MSG.S4_CONFIRM_N(selectedCount),
      onConfirm: () => {
        try {
          confirmStage2();
          setConfirmModal(null);
        } catch (err: any) {
          setAlertModal({ isOpen: true, message: err.message, isError: true });
        }
      },
    });
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: stages.stage3 ? MSG.S4_CANCEL_TT : MSG.S1_CANCEL_CONFIRM,
      onConfirm: () => {
        cancelStage2();
        setConfirmModal(null);
      },
    });
  };

  const handleSave = () => {
    handleSaveCheckPreset();
  };

  const guideMsg = stages.stage2
    ? MSG.S4_GUIDE_DONE
    : selectedCount === 0
    ? MSG.S4_GUIDE_ENTER_O
    : MSG.S4_GUIDE_CLICK;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      <StageHeader
        stageNumber={4}
        stageTitle="평가 대상 과목 지정"
        help={
          <StepHelp title="4. 평가과목">
            <p>전체 과목 중 <strong>이번 고사에서 시험을 치는 과목</strong>만 고르는 단계입니다.</p>
            <h3>동시 시험 가능 과목이란</h3>
            <p>두 과목을 <strong>같이 듣는 학생이 한 명도 없으면</strong> 같은 교시에 나란히 놓을 수 있습니다. 이 프로그램은 체크한 과목들을 훑어 그런 묶음을 미리 찾아 둡니다.</p>
            <p>6단계 시간표는 이 묶음을 이용해 한 교시에 여러 과목을 배치합니다. 그래야 고사 일수가 줄어듭니다.</p>
            <p>여기서 확정을 취소하면 이미 짠 시간표가 지워집니다.</p>
          </StepHelp>
        }
        isConfirmed={!!(stages.step4 ?? stages.stage2)}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        actions={
          <div className="flex items-center gap-2.5">
            {!stages.stage2 && (
              <>
                <button
                  onClick={() => {
    const subjects = displaySummary.map(s => s.subject);
    setMultipleEvalTargets(subjects, true);
  }}
                  className="px-3.5 py-2 bg-white hover:bg-gray-50 text-[#0f172a] border border-gray-200 rounded-xl text-[15.5px] font-black transition shadow-2xs"
                >
                  전체 선택
                </button>
                <button
                  onClick={() => {
    const subjects = displaySummary.map(s => s.subject);
    setMultipleEvalTargets(subjects, false);
  }}
                  className="px-3.5 py-2 bg-white hover:bg-gray-50 text-[#0f172a] border border-gray-200 rounded-xl text-[15.5px] font-black transition shadow-2xs"
                >
                  전체 해제
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="px-3.5 py-2 bg-[#005691] hover:bg-[#005691] text-white rounded-xl text-[15.5px] font-black flex items-center gap-1.5 shadow-sm transition active:scale-95"
              title="현재 평가 대상 과목 지정 저장"
            >
              <Save className="w-4 h-4" /> 저장하기
            </button>
          </div>
        }
      />

      {/* Save Toast Notification */}
      {showSaveToast && (
        <div className="fixed top-20 right-8 z-50 bg-white/95 text-indigo-700 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-indigo-500/50 backdrop-blur-sm animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-[#005691] shrink-0" />
          <div>
            <p className="text-[17px] font-black text-[#005691]">{toastMessage.title}</p>
            <p className="text-[15px] text-gray-800 mt-0.5">{toastMessage.desc}</p>
          </div>
        </div>
      )}

      <div className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden bg-white">
        <div className="lg:col-span-5 flex flex-col border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="bg-white px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-black text-[#005691] flex items-center gap-2">
                <span>1. 평가 대상 과목 선택</span>
                {availableGrades.length > 1 && (
                  <select
                    value={gradeFilter}
                    onChange={e => setGradeFilter(e.target.value)}
                    className="px-2 py-0.5 ml-1 bg-white border border-gray-200 rounded text-[14.5px] font-bold focus:outline-none focus:border-indigo-500 text-gray-800"
                  >
                    <option value="all">전체 학년</option>
                    {availableGrades.map(g => (
                      <option key={g} value={g}>{g}학년</option>
                    ))}
                  </select>
                )}
              </h3>
              <span className="text-[14px] font-black text-[#005691] bg-[#fee2e2] px-2.5 py-0.5 rounded-full border border-gray-200">
                {displaySummary.filter(s => evalTargets[s.subject]).length}/{displaySummary.length}개 선택됨
              </span>
            </div>
            {!stages.stage2 && (
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  onClick={() => {
    const subjects = displaySummary.map(s => s.subject);
    setMultipleEvalTargets(subjects, true);
  }}
                  className="px-2.5 py-1 bg-[#e6f1f8] hover:bg-[#fee2e2] text-[#005691] border border-gray-200 rounded-lg text-[14.5px] font-black flex items-center gap-1 transition"
                  title="전체 과목 일괄 선택"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> 전체
                </button>
                <button
                  onClick={() => {
    const subjects = displaySummary.map(s => s.subject);
    setMultipleEvalTargets(subjects, false);
  }}
                  className="px-2.5 py-1 bg-white hover:bg-white text-gray-800 border border-gray-200 rounded-lg text-[14.5px] font-bold flex items-center gap-1 transition"
                  title="전체 과목 일괄 해제"
                >
                  <Square className="w-3.5 h-3.5" /> 해제
                </button>
                <button
                  onClick={() => {
    const subjects = displaySummary.map(s => s.subject);
    invertMultipleEvalTargets(subjects);
  }}
                  className="px-2.5 py-1 bg-white hover:bg-white text-gray-800 border border-gray-200 rounded-lg text-[14.5px] font-bold flex items-center gap-1 transition"
                  title="선택 상태 반전"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 반전
                </button>
                <button
                  onClick={() => {
                    const common = displaySummary.filter(s => s.banCount >= 3).map(s => s.subject);
                    selectOnlySubjects(common);
                  }}
                  className="px-2.5 py-1 bg-[#e6f1f8] hover:bg-[#fee2e2] text-[#005691] border border-gray-200 rounded-lg text-[14.5px] font-black flex items-center gap-1 transition"
                  title="3반 이상 공통과목만 일괄 선택"
                >
                  <Layers className="w-3.5 h-3.5" /> 3반↑
                </button>
                <div className="h-4 w-[1px] bg-slate-300 mx-0.5 hidden sm:block" />
                <button
                  type="button"
                  onClick={handleSaveCheckPreset}
                  className="px-2.5 py-1 bg-[#e6f1f8] hover:bg-[#fee2e2] text-[#005691] border border-gray-200 rounded-lg text-[14.5px] font-black flex items-center gap-1 transition shadow-2xs active:scale-95"
                  title="현재 체크된 과목들을 브라우저에 저장"
                >
                  <Save className="w-3.5 h-3.5 text-[#005691]" /> 체크 저장
                </button>
                <button
                  type="button"
                  onClick={handleLoadCheckPreset}
                  disabled={!savedPreset || savedPreset.totalSaved === 0}
                  className={`px-2.5 py-1 rounded-lg text-[14.5px] font-black flex items-center gap-1 transition shadow-2xs active:scale-95 ${
                    savedPreset && savedPreset.totalSaved > 0
                      ? 'bg-[#e6f1f8] hover:bg-[#e6f1f8] text-amber-900 border border-gray-200 cursor-pointer'
                      : 'bg-white text-[#0f172a] border border-gray-200 cursor-not-allowed opacity-60'
                  }`}
                  title={
                    savedPreset && savedPreset.totalSaved > 0
                      ? `저장된 ${savedPreset.totalSaved}개 과목 체크 불러오기 (${new Date(savedPreset.savedAt).toLocaleDateString()})`
                      : '저장된 체크 내역이 없습니다.'
                  }
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> 기존 체크{savedPreset && savedPreset.totalSaved > 0 ? ` (${savedPreset.totalSaved})` : ''}
                </button>
              </div>
            )}
          </div>

          {selectedCount === 0 && savedPreset && savedPreset.totalSaved > 0 && !stages.stage2 && (
            <div className="bg-[#e6f1f8]/90 border-b border-gray-200 px-4 py-2 flex items-center justify-between text-[15px] text-amber-950 animate-fadeIn">
              <span className="flex items-center gap-1.5 font-bold">
                <RotateCcw className="w-4 h-4 text-amber-700 shrink-0" />
                이전에 저장된 <strong>{savedPreset.totalSaved}개 과목</strong> 체크 설정이 있습니다.
              </span>
              <button
                type="button"
                onClick={handleLoadCheckPreset}
                className="px-3 py-1 bg-[#005691] hover:bg-indigo-700 text-white rounded-lg font-black text-[15px] transition shadow-2xs active:scale-95 cursor-pointer"
              >
                불러오기
              </button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[15.5px] text-left border-collapse">
              <thead className="bg-gray-50 text-gray-900 sticky top-0 font-black border-b border-gray-200 select-none">
                <tr className="divide-x divide-gray-200">
                  <th
                    onClick={() => {
                      if (stages.stage2) return;
                      const all = displaySummary.length > 0 && displaySummary.every(s => !!evalTargets[s.subject]);
                      setAllEvalTargets(!all);
                    }}
                    className="py-3 px-3 text-center w-12 cursor-pointer hover:bg-gray-50 transition"
                    title="전체 일괄 선택 / 해제 토글"
                  >
                    <button disabled={stages.stage2} className="text-[#005691] focus:outline-none">
                      {displaySummary.length > 0 && displaySummary.every(s => !!evalTargets[s.subject]) ? (
                        <CheckSquare className="w-4.5 h-4.5 text-[#005691]" />
                      ) : displaySummary.some(s => !!evalTargets[s.subject]) ? (
                        <MinusSquare className="w-4.5 h-4.5 text-[#005691]" />
                      ) : (
                        <Square className="w-4.5 h-4.5 text-[#0f172a]" />
                      )}
                    </button>
                  </th>
                  <th
                    onClick={() => handleTable1HeaderSort('subject')}
                    className="py-3 px-3.5 cursor-pointer hover:bg-white transition select-none"
                    title="과목명 기준 정렬"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>과목명</span>
                      {table1SortKey === 'subject' && (
                        table1SortOrder === 'desc' ? <ArrowDown className="w-4 h-4 text-[#005691]" /> : <ArrowUp className="w-4 h-4 text-[#005691]" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTable1HeaderSort('banCount')}
                    className="py-3 px-3 text-center cursor-pointer hover:bg-white transition select-none"
                    title="반수 기준 정렬"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>반수</span>
                      {table1SortKey === 'banCount' && (
                        table1SortOrder === 'desc' ? <ArrowDown className="w-4 h-4 text-[#005691]" /> : <ArrowUp className="w-4 h-4 text-[#005691]" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleTable1HeaderSort('stuCount')}
                    className="py-3 px-3 text-center cursor-pointer hover:bg-white transition select-none"
                    title="학생수 기준 정렬 (기본: 많은 순)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-black text-gray-900">학생수</span>
                      {table1SortKey === 'stuCount' ? (
                        table1SortOrder === 'desc' ? <ArrowDown className="w-4 h-4 text-[#005691]" /> : <ArrowUp className="w-4 h-4 text-[#005691]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-[#0f172a]" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-normal">
                {displaySummary.map(s => {
                  const isChecked = !!evalTargets[s.subject];
                  return (
                    <tr
                      key={s.subject}
                      onClick={() => !stages.stage2 && toggleEvalTarget(s.subject)}
                      className={`divide-x divide-gray-200 cursor-pointer transition ${
                        isChecked ? 'bg-[#e6f1f8]/80 font-normal' : 'hover:bg-white'
                      } ${stages.stage2 ? 'cursor-not-allowed opacity-90' : ''}`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <button
                          disabled={stages.stage2}
                          className="text-[#005691] focus:outline-none"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4.5 h-4.5 text-[#005691]" />
                          ) : (
                            <Square className="w-4.5 h-4.5 text-[#0f172a]" />
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{s.subject}</td>
                      <td className="py-2.5 px-3 text-center text-[#005691] font-normal">{s.banCount}</td>
                      <td className="py-2.5 px-3 text-center text-gray-800 font-normal">{s.stuCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="bg-white px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-black text-[#005691]">2. 동시 시험 가능 과목 조합 (자동 산출)</h3>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-gray-200 text-[14.5px] font-bold">
                <button
                  onClick={() => setSizeFilter('all')}
                  className={`px-2.5 py-0.5 rounded-lg transition ${
                    sizeFilter === 'all' ? 'bg-indigo-700 text-white shadow-2xs font-black' : 'text-[#0f172a] hover:bg-white'
                  }`}
                >
                  전체 ({sortedCompat.length})
                </button>
                <button
                  onClick={() => setSizeFilter(4)}
                  className={`px-2.5 py-0.5 rounded-lg transition ${
                    sizeFilter === 4 ? 'bg-indigo-700 text-white shadow-2xs font-black' : 'text-[#0f172a] hover:bg-white'
                  }`}
                >
                  4과목 ({count4})
                </button>
                <button
                  onClick={() => setSizeFilter(3)}
                  className={`px-2.5 py-0.5 rounded-lg transition ${
                    sizeFilter === 3 ? 'bg-indigo-700 text-white shadow-2xs font-black' : 'text-[#0f172a] hover:bg-white'
                  }`}
                >
                  3과목 ({count3})
                </button>
                <button
                  onClick={() => setSizeFilter(2)}
                  className={`px-2.5 py-0.5 rounded-lg transition ${
                    sizeFilter === 2 ? 'bg-indigo-700 text-white shadow-2xs font-black' : 'text-[#0f172a] hover:bg-white'
                  }`}
                >
                  2과목 ({count2})
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[15px]">
              <span className="text-[#0f172a] text-[14.5px] font-bold mr-1">정렬:</span>
              <button
                onClick={() => { setSortKey('stuCount'); setSortOrder('desc'); }}
                className={`px-2.5 py-1 rounded-lg text-[14.5px] font-black transition ${
                  sortKey === 'stuCount'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'bg-white text-gray-800 hover:bg-white border border-gray-200'
                }`}
              >
                🔥 응시 많은 순
              </button>
              <button
                onClick={() => { setSortKey('banCount'); setSortOrder('desc'); }}
                className={`px-2.5 py-1 rounded-lg text-[14.5px] font-black transition ${
                  sortKey === 'banCount'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'bg-white text-gray-800 hover:bg-white border border-gray-200'
                }`}
              >
                반수 많은 순
              </button>
              <button
                onClick={() => { setSortKey('nonTakers'); setSortOrder('asc'); }}
                className={`px-2.5 py-1 rounded-lg text-[14.5px] font-black transition ${
                  sortKey === 'nonTakers'
                    ? 'bg-indigo-700 text-white shadow-2xs'
                    : 'bg-white text-gray-800 hover:bg-white border border-gray-200'
                }`}
              >
                미응시 적은 순
              </button>
            </div>
          </div>

          {displayCompat.overflow && (
            <div className="bg-[#e6f1f8] text-rose-800 px-4 py-2.5 text-[14.5px] font-bold border-b border-gray-200">
              {MSG.S4_TOO_MANY}
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[15.5px] text-left border-collapse">
              <thead className="bg-gray-50 text-gray-900 sticky top-0 font-black border-b border-gray-200 select-none">
                <tr className="divide-x divide-gray-200">
                  <th className="py-3 px-3.5">과목1</th>
                  <th className="py-3 px-3.5">과목2</th>
                  <th className="py-3 px-3.5">과목3</th>
                  <th className="py-3 px-3.5">과목4</th>
                  <th
                    onClick={() => handleHeaderSort('banCount')}
                    className="py-3 px-2.5 text-center cursor-pointer hover:bg-gray-50 transition"
                    title="반수 순으로 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      반수
                      {sortKey === 'banCount' ? (
                        sortOrder === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-[#005691]" /> : <ArrowUp className="w-3.5 h-3.5 text-[#005691]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-[#0f172a]" />
                      )}
                    </span>
                  </th>
                  <th
                    onClick={() => handleHeaderSort('stuCount')}
                    className="py-3 px-2.5 text-center cursor-pointer hover:bg-[#fee2e2]/60 bg-[#e6f1f8]/50 text-[#005691] transition"
                    title="동시 응시자수 순으로 정렬"
                  >
                    <span className="inline-flex items-center gap-1 font-black">
                      응시
                      {sortKey === 'stuCount' ? (
                        sortOrder === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-[#005691]" /> : <ArrowUp className="w-3.5 h-3.5 text-[#005691]" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-red-500" />
                      )}
                    </span>
                  </th>
                  <th
                    onClick={() => handleHeaderSort('nonTakers')}
                    className="py-3 px-2.5 text-center cursor-pointer hover:bg-gray-50 transition"
                    title="미응시자수 순으로 정렬"
                  >
                    <span className="inline-flex items-center gap-1">
                      미응시
                      {sortKey === 'nonTakers' ? (
                        sortOrder === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-amber-700" /> : <ArrowUp className="w-3.5 h-3.5 text-amber-700" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-[#0f172a]" />
                      )}
                    </span>
                  </th>
                  {!stages.stage2 && <th className="py-3 px-2.5 text-center w-24">일괄 선택</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-normal">
                {sortedCompat.length === 0 ? (
                  <tr>
                    <td colSpan={stages.stage2 ? 7 : 8} className="py-12 text-center text-[#0f172a] font-normal">
                      평가 대상을 확정하면 동시 시험 가능 과목 조합이 여기에 표시됩니다.
                    </td>
                  </tr>
                ) : (
                  sortedCompat.map((c, idx) => (
                    <tr key={idx} className="divide-x divide-gray-200 hover:bg-white transition">
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{c.subjects[0] || '-'}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{c.subjects[1] || '-'}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{c.subjects[2] || '-'}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900">{c.subjects[3] || '-'}</td>
                      <td className="py-2.5 px-2.5 text-center font-normal text-[#005691]">{c.banCount}</td>
                      <td className="py-2.5 px-2.5 text-center font-normal text-[#005691] bg-[#e6f1f8]/40">{c.stuCount}</td>
                      <td className="py-2.5 px-2.5 text-center text-amber-900 font-normal">{c.nonTakers}</td>
                      {!stages.stage2 && (
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => {
                              selectOnlySubjects(c.subjects);
                              setAlertModal({
                                isOpen: true,
                                message: `✅ [${c.subjects.join(', ')}] 과목만 평가 대상으로 일괄 선택되었습니다.`,
                              });
                            }}
                            className="px-2.5 py-1 bg-[#e6f1f8] hover:bg-indigo-700 hover:text-[#0f172a] text-[#005691] border border-gray-200 rounded-lg text-[14.5px] font-black transition shadow-2xs active:scale-95"
                            title="이 조합의 과목들만 일괄 선택"
                          >
                            조합 선택
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
