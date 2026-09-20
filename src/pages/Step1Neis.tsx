import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { StepHelp } from '../components/StepHelp';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { parseNeisFile } from '../domain/neisImport';
import { MSG } from '../domain/messages';
import { Upload, UserX, UserCheck, Trash2, Search, Info, FileSpreadsheet } from 'lucide-react';

export const Step1Neis: React.FC = () => {
  const {
    neis, meta, stages, setNeisData, moveToConvenience, deleteStudent, resetAll, confirmStage1, cancelStage1,
    activeGrade, switchGrade, importCombinedNeis, loadGradeSample, loadBothGradeSamples
  } = useAppStore();

  const [selectedStudent, setSelectedStudent] = useState<{ ban: string; num: number; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ rows: any[]; fileName: string; removedCount: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (stages.stage1) {
      setAlertModal({ isOpen: true, message: MSG.S1_LOCKED, isError: true });
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const res = await parseNeisFile(buffer);

      // 2학년과 3학년 데이터가 모두 들어있는지 분석
      const g2Rows = res.rows.filter(r => String(r.grade || '').trim() === '2' || String(r.track || '').includes('2학년') || String(r.room || '').includes('2학년') || /^[2][0-9]{3}/.test(String(r.ban)));
      const g3Rows = res.rows.filter(r => String(r.grade || '').trim() === '3' || String(r.track || '').includes('3학년') || String(r.room || '').includes('3학년') || /^[3][0-9]{3}/.test(String(r.ban)));

      if (g2Rows.length > 0 && g3Rows.length > 0) {
        // 2, 3학년 통합 파일인 경우 -> 각 학년으로 자동 분리 적재
        importCombinedNeis(res.rows, file.name);
        setAlertModal({
          isOpen: true,
          message: `✨ 2학년(${g2Rows.length.toLocaleString()}건)과 3학년(${g3Rows.length.toLocaleString()}건) 데이터가 모두 감지되었습니다!\n\n각 학년 작업 공간에 자동으로 분리 저장되었습니다. 상단의 [2학년] / [3학년] 탭을 눌러 각 학년의 과목현황 및 시간표를 확인하세요.`
        });
        return;
      }

      // 만약 3학년 자료만 들어있는데 현재 2학년이 선택되어 있다면 3학년으로 자동 전환
      if (g3Rows.length > 0 && g2Rows.length === 0 && (activeGrade || '2') !== '3') {
        switchGrade('3');
      } else if (g2Rows.length > 0 && g3Rows.length === 0 && (activeGrade || '2') !== '2') {
        switchGrade('2');
      }

      if (neis && neis.length > 0) {
        setPendingUpload({ rows: res.rows, fileName: file.name, removedCount: res.removedCount });
      } else {
        setNeisData(res.rows, file.name, false);
        if (res.removedCount > 0) {
          setAlertModal({ isOpen: true, message: MSG.NEIS_REMOVED });
        }
      }
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || MSG.NEIS_NOT_FILE_1, isError: true });
    }
  };

  const handleLoadSample = (grade: 2 | 3) => {
    if (stages.stage1) {
      setAlertModal({ isOpen: true, message: MSG.S1_LOCKED, isError: true });
      return;
    }
    loadGradeSample(String(grade) as '2' | '3');
    setAlertModal({
      isOpen: true,
      message: `✨ ${grade}학년 샘플 데이터가 성공적으로 적재되었습니다!\n\n${grade === 3 ? '3학년(붉은색 테마)' : '2학년(파란색 테마)'} 작업 화면으로 자동 전환되었습니다.`
    });
  };

  const handleLoadBothSamples = () => {
    if (stages.stage1) {
      setAlertModal({ isOpen: true, message: MSG.S1_LOCKED, isError: true });
      return;
    }
    loadBothGradeSamples();
    setAlertModal({
      isOpen: true,
      message: '✨ 2학년 및 3학년 샘플이 각각 독립적으로 동시 적재되었습니다!\n\n상단 탭을 통해 2학년(파란색)과 3학년(붉은색)을 자유롭게 전환해보세요.'
    });
  };

  const handleMoveConvenience = () => {
    if (!selectedStudent) {
      setAlertModal({ isOpen: true, message: MSG.S1_MOVE_SELECT, isError: true });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S1_MOVE_CONFIRM(selectedStudent.ban, selectedStudent.num, selectedStudent.name),
      onConfirm: () => {
        try {
          moveToConvenience(selectedStudent.ban, selectedStudent.num);
          setConfirmModal(null);
        } catch (err: any) {
          setAlertModal({ isOpen: true, message: err.message, isError: true });
        }
      },
    });
  };

  const handleDeleteStudent = () => {
    if (!selectedStudent) {
      setAlertModal({ isOpen: true, message: MSG.S1_DEL_SELECT, isError: true });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S1_DEL_CONFIRM(selectedStudent.ban, selectedStudent.num, selectedStudent.name),
      onConfirm: () => {
        try {
          deleteStudent(selectedStudent.ban, selectedStudent.num);
          setSelectedStudent(null);
          setConfirmModal(null);
        } catch (err: any) {
          setAlertModal({ isOpen: true, message: err.message, isError: true });
        }
      },
    });
  };

  const handleDeleteAll = () => {
    if (neis.length === 0) {
      setAlertModal({ isOpen: true, message: MSG.S1_DELALL_NONE });
      return;
    }
    setConfirmModal({
      isOpen: true,
      message: MSG.S1_DELALL_CONFIRM,
      onConfirm: () => {
        resetAll();
        setSelectedStudent(null);
        setConfirmModal(null);
      },
    });
  };

  const handleConfirm = () => {
    try {
      confirmStage1();
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message, isError: true });
    }
  };

  const handleCancel = () => {
    setConfirmModal({
      isOpen: true,
      message: MSG.S1_CANCEL_CONFIRM,
      onConfirm: () => {
        cancelStage1();
        setConfirmModal(null);
      },
    });
  };

  const filteredNeis = useMemo(() => {
    if (!searchTerm) return neis;
    const term = searchTerm.toLowerCase();
    return neis.filter(
      r =>
        r.name.toLowerCase().includes(term) ||
        r.ban.toLowerCase().includes(term) ||
        r.subject.toLowerCase().includes(term)
    );
  }, [neis, searchTerm]);

  const guideMsg = stages.stage1
    ? MSG.S1_GUIDE_DONE
    : neis.length > 0
    ? MSG.S1_GUIDE_NEXT
    : '';

  return (
    <div className="flex flex-col h-full bg-white">
      <StageHeader
        stageNumber={1}
        stageTitle="학생편성현황"
        help={
          <StepHelp title="1. 학생편성현황">
            <p>나이스에서 받은 <strong>학생편성현황 엑셀</strong>을 읽어들이는 단계입니다. 이 자료 하나가 뒤의 모든 단계의 바탕이 됩니다.</p>
            <h3>무엇을 읽나요</h3>
            <ul>
              <li>학년·반·번호·성명</li>
              <li>과목과 <strong>강의실(분반)</strong> — 이동수업이면 'G1', '학교지정-F'처럼 적혀 있습니다. 나중에 같은 분반 학생을 한 고사실에 모아 앉히는 근거가 됩니다.</li>
            </ul>
            <h3>자동으로 걸러내는 것</h3>
            <ul>
              <li>성명이 <strong>(미재학)</strong>으로 시작하는 학생은 지웁니다.</li>
              <li>표 위쪽의 제목·빈 줄은 건너뛰고 머리글 줄을 찾아 읽습니다.</li>
            </ul>
            <p>편의반으로 옮기거나 특정 학생을 지울 수 있습니다. 다 정리한 뒤 확정하세요. 확정을 취소하면 뒤 단계의 배치가 모두 지워집니다.</p>
          </StepHelp>
        }
        isConfirmed={!!(stages.step1 ?? stages.stage1)}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleMoveConvenience}
              disabled={stages.stage1 || !selectedStudent}
              className="px-3.5 py-2 bg-[#e6f1f8] hover:bg-[#e6f1f8] text-amber-900 border border-gray-200 rounded-xl text-[15.5px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
            >
              <UserCheck className="w-4.5 h-4.5 text-amber-700" /> 편의반 이동
            </button>
            <button
              onClick={handleDeleteStudent}
              disabled={stages.stage1 || !selectedStudent}
              className="px-3.5 py-2 bg-[#e6f1f8] hover:bg-[#e6f1f8] text-rose-900 border border-gray-200 rounded-xl text-[15.5px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
            >
              <UserX className="w-4.5 h-4.5 text-rose-700" /> 학생 삭제
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={stages.stage1 || neis.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 text-[#0f172a] border border-gray-200 rounded-xl text-[15.5px] font-black flex items-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed transition shadow-2xs"
            >
              <Trash2 className="w-4.5 h-4.5 text-[#0f172a]" /> 모두 삭제
            </button>
          </div>
        }
      />

      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
        <div className="bg-[#e6f1f8]/70 border border-gray-200/90 rounded-2xl p-5 mb-4 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
            <div className="flex flex-wrap items-center gap-3.5">
              {/* 현재 학년 배지 */}
              <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-gray-200 shadow-2xs font-black text-[15px]">
                <span className="text-slate-600 font-bold">작업 대상:</span>
                <span className={`px-2.5 py-0.5 rounded-lg text-white font-black text-sm ${
                  (activeGrade || '2') === '3' ? 'bg-[#9b1c1c]' : 'bg-[#005691]'
                }`}>
                  {activeGrade || '2'}학년
                </span>
              </div>

              <label className={`shrink-0 whitespace-nowrap cursor-pointer px-5 py-3 rounded-xl text-[16px] font-black flex items-center gap-2 shadow-sm transition ${
                stages.stage1
                  ? 'bg-gray-50 text-[#0f172a] cursor-not-allowed'
                  : 'bg-[#005691] hover:bg-[#005691] text-white active:scale-95'
              }`}>
                <Upload className="w-5 h-5" /> 나이스 엑셀 파일 선택 (2·3학년 통합 지원)
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={stages.stage1}
                  className="hidden"
                />
              </label>

              <div className="flex items-center gap-2 border-l border-gray-200/80 pl-3.5">
                <span className="text-[15px] text-[#0f172a] font-bold mr-1">예시 샘플:</span>
                <button
                  type="button"
                  onClick={() => handleLoadSample(2)}
                  disabled={stages.stage1}
                  className="shrink-0 whitespace-nowrap px-3.5 py-2 bg-white hover:bg-[#e6f1f8] text-[#005691] border border-blue-200 rounded-xl text-[14.5px] font-black flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs"
                  title="2학년 샘플 데이터 불러오기"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> 2학년 샘플
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample(3)}
                  disabled={stages.stage1}
                  className="shrink-0 whitespace-nowrap px-3.5 py-2 bg-white hover:bg-[#fee2e2] text-[#9b1c1c] border border-red-200 rounded-xl text-[14.5px] font-black flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs"
                  title="3학년 샘플 데이터 불러오기"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span> 3학년 샘플
                </button>
                <button
                  type="button"
                  onClick={handleLoadBothSamples}
                  disabled={stages.stage1}
                  className="shrink-0 whitespace-nowrap px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-[14.5px] font-black flex items-center gap-1.5 transition disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed shadow-2xs"
                  title="2학년 및 3학년 샘플을 각각 한번에 채우기"
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> 2·3학년 동시 적재
                </button>
              </div>

              {meta.sourceFileName && (
                <span className="text-[15px] font-bold text-[#0f172a] bg-white px-3.5 py-2 rounded-xl border border-gray-200 shadow-2xs">
                  파일명: <strong className="text-[#005691] font-black">{meta.sourceFileName}</strong> ({neis.length.toLocaleString()}건)
                </span>
              )}
            </div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-[15px] text-[#005691] hover:text-[#005691] flex items-center gap-1.5 font-bold bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-2xs transition"
            >
              <Info className="w-4 h-4 text-red-500" /> 나이스 다운로드 방법 안내
            </button>
          </div>

          {showGuide && (
            <div className="mt-3.5 p-3.5 bg-white rounded-xl border border-gray-200 text-[15px] text-gray-800 leading-relaxed space-y-1.5 shadow-2xs">
              <p><strong>[나이스 경로]</strong> 교육과정 ▷ 편제 및 과목개설관리 ▷ 수강생편성 ▷ 학기·학년 설정 후 [조회] ▷ [학생편성현황] ▷ [엑셀출력]</p>
              <p>• <strong>편의반:</strong> 일부 학생이 편의제공대상자에 해당하여 별도 고사실에서 응시할 경우 사용합니다.</p>
              <p>• <strong>학생 삭제:</strong> 전출 등으로 시험을 치르지 않는 학생은 삭제할 수 있습니다.</p>
              <p>• <strong>개인정보 보호:</strong> 성명(이름) 열이 비어있거나 삭제된 엑셀 파일도 완벽하게 지원합니다.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-[16.5px] font-bold text-[#0f172a]">
            {selectedStudent ? (
              <span className="inline-flex items-center gap-2 bg-[#fee2e2]/80 text-[#005691] px-3.5 py-1.5 rounded-xl font-black border border-gray-200 shadow-2xs">
                선택 학생: {selectedStudent.ban} {selectedStudent.num}번 {selectedStudent.name || ''}
              </span>
            ) : (
              <span className="text-[#0f172a] text-[15.5px] font-normal">행을 클릭하면 학생이 선택됩니다.</span>
            )}
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
          <table className="w-full text-[16px] text-left border-collapse text-[#0f172a]">
            <thead className="bg-gray-50 text-gray-900 tracking-wide font-black sticky top-0 z-10 shadow-xs">
              <tr className="divide-x divide-gray-200 border-b border-gray-200">
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">학년도</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">학기</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">학년</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">편제명</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">개설과목(단위수)</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">개설강의실</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">계열/학과</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">반</th>
                <th className="py-3 px-3.5 text-center font-black text-gray-900 tracking-wide">번호</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">성명</th>
                <th className="py-3 px-3.5 font-black text-gray-900 tracking-wide">강의실2(원본)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-normal">
              {filteredNeis.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-[#0f172a] font-normal">
                    데이터가 없습니다. 나이스 엑셀 파일을 업로드해 주세요.
                  </td>
                </tr>
              ) : (
                filteredNeis.map((r, idx) => {
                  const isSelected =
                    selectedStudent?.ban === r.ban && selectedStudent?.num === r.num;
                  const isConvenience = r.room === '편의반';

                  return (
                    <tr
                      key={idx}
                      onClick={() =>
                        setSelectedStudent({ ban: r.ban, num: r.num, name: r.name })
                      }
                      className={`cursor-pointer transition divide-x divide-gray-200 ${
                        isSelected
                          ? 'bg-[#fee2e2]/90 font-bold text-[#005691]'
                          : 'hover:bg-white'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-normal">{r.year}</td>
                      <td className="py-2.5 px-3.5 font-normal">{r.semester}</td>
                      <td className="py-2.5 px-3.5 font-normal">{r.grade}</td>
                      <td className="py-2.5 px-3.5 font-normal">{r.curriculum}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900 tracking-wide">{r.subject}</td>
                      <td
                        className={`py-2.5 px-3.5 font-normal ${
                          isConvenience ? 'bg-[#fee2e2] text-amber-950 font-black' : 'text-[#0f172a]'
                        }`}
                      >
                        {r.room}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#0f172a]">{r.track}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900 tracking-wide">{r.ban}</td>
                      <td className="py-2.5 px-3.5 text-center font-normal">{r.num}</td>
                      <td className="py-2.5 px-3.5 font-normal text-gray-900 tracking-wide">{r.name}</td>
                      <td className="py-2.5 px-3.5 text-[#0f172a]">{r.room2}</td>
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
      {pendingUpload && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-[#005691] tracking-wide mb-2">데이터 추가 / 덮어쓰기</h3>
            <p className="text-[#0f172a] text-[17px] mb-6">
              이미 등록된 데이터가 있습니다. 새로 불러온 <strong>{pendingUpload.fileName}</strong> 파일의 데이터를 기존 데이터에 추가하시겠습니까, 아니면 모두 지우고 새로 덮어쓰시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingUpload(null)}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-800 rounded-lg text-[17px] font-bold transition"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setNeisData(pendingUpload.rows, pendingUpload.fileName, false);
                  if (pendingUpload.removedCount > 0) setAlertModal({ isOpen: true, message: MSG.NEIS_REMOVED });
                  setPendingUpload(null);
                }}
                className="px-4 py-2 bg-[#005691] hover:bg-[#005691] text-white rounded-lg text-[17px] font-bold transition"
              >
                기존 삭제 후 덮어쓰기
              </button>
              <button
                onClick={() => {
                  setNeisData(pendingUpload.rows, pendingUpload.fileName, true);
                  if (pendingUpload.removedCount > 0) setAlertModal({ isOpen: true, message: MSG.NEIS_REMOVED });
                  setPendingUpload(null);
                }}
                className="px-4 py-2 bg-[#005691] hover:bg-indigo-700 text-white rounded-lg text-[17px] font-bold transition shadow-md"
              >
                기존 데이터에 추가하기
              </button>
            </div>
          </div>
        </div>
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
