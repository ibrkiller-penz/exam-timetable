const fs = require('fs');
const content = `import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { StageHeader } from '../components/StageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { parseNeisFile } from '../domain/neisImport';
import { MSG } from '../domain/messages';
import { Upload, UserX, UserCheck, Trash2, Search, Info } from 'lucide-react';

export const Step1Neis: React.FC = () => {
  const { neis, meta, stages, setNeisData, moveToConvenience, deleteStudent, resetAll, confirmStage1, cancelStage1 } = useAppStore();

  const [selectedStudent, setSelectedStudent] = useState<{ ban: string; num: number; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; isError?: boolean } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (stages.stage1) {
      setAlertModal({ isOpen: true, message: MSG.S1_LOCKED, isError: true });
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const res = parseNeisFile(buffer);
      setNeisData(res.rows, file.name);

      if (res.removedCount > 0) {
        setAlertModal({ isOpen: true, message: MSG.NEIS_REMOVED });
      }
    } catch (err: any) {
      setAlertModal({ isOpen: true, message: err.message || MSG.NEIS_NOT_FILE_1, isError: true });
    }
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
        isConfirmed={stages.stage1}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        guideMessage={guideMsg}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleMoveConvenience}
              disabled={stages.stage1 || !selectedStudent}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <UserCheck className="w-4 h-4" /> 편의반 이동
            </button>
            <button
              onClick={handleDeleteStudent}
              disabled={stages.stage1 || !selectedStudent}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <UserX className="w-4 h-4" /> 학생 삭제
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={stages.stage1 || neis.length === 0}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              <Trash2 className="w-4 h-4" /> 모두 삭제
            </button>
          </div>
        }
      />

      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className={\`cursor-pointer px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition \${
                stages.stage1
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }\`}>
                <Upload className="w-4 h-4" /> 나이스 학생편성현황 엑셀 파일 선택
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={stages.stage1}
                  className="hidden"
                />
              </label>
              {meta.sourceFileName && (
                <span className="text-xs font-medium text-gray-700 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                  파일명: <strong className="text-blue-700">{meta.sourceFileName}</strong> (총 {neis.length.toLocaleString()}건)
                </span>
              )}
            </div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs text-blue-700 hover:underline flex items-center gap-1"
            >
              <Info className="w-3.5 h-3.5" /> 나이스 다운로드 방법 안내
            </button>
          </div>

          {showGuide && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-blue-100 text-xs text-gray-700 leading-relaxed space-y-1">
              <p><strong>[나이스 경로]</strong> 교육과정 ▷ 편제 및 과목개설관리 ▷ 수강생편성 ▷ 학기·학년 설정 후 [조회] ▷ [학생편성현황] ▷ [엑셀출력]</p>
              <p>• <strong>편의반:</strong> 일부 학생이 편의제공대상자에 해당하여 별도 고사실에서 응시할 경우 사용합니다.</p>
              <p>• <strong>학생 삭제:</strong> 전출 등으로 시험을 치르지 않는 학생은 삭제할 수 있습니다.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-sm font-medium text-gray-800">
            {selectedStudent ? (
              <span className="inline-flex items-center gap-2 bg-blue-100/70 text-blue-900 px-3 py-1 rounded-md font-semibold border border-blue-200">
                선택 학생: {selectedStudent.ban} {selectedStudent.num}번 {selectedStudent.name}
              </span>
            ) : (
              <span className="text-gray-500 text-xs">행을 클릭하면 학생이 선택됩니다.</span>
            )}
          </div>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="성명, 반, 과목 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 border border-gray-200 rounded-xl overflow-auto bg-white shadow-inner">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-gray-100/90 text-gray-700 font-semibold sticky top-0 z-10 shadow-sm">
              <tr className="divide-x divide-gray-200 border-b border-gray-200">
                <th className="py-2.5 px-3">학년도</th>
                <th className="py-2.5 px-3">학기</th>
                <th className="py-2.5 px-3">학년</th>
                <th className="py-2.5 px-3">편제명</th>
                <th className="py-2.5 px-3">개설과목(단위수)</th>
                <th className="py-2.5 px-3">개설강의실</th>
                <th className="py-2.5 px-3">계열/학과</th>
                <th className="py-2.5 px-3">반</th>
                <th className="py-2.5 px-3 text-center">번호</th>
                <th className="py-2.5 px-3">성명</th>
                <th className="py-2.5 px-3">강의실2(원본)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredNeis.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
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
                      className={\`cursor-pointer transition divide-x divide-gray-100 \${
                        isSelected
                          ? 'bg-blue-100/80 font-semibold text-blue-900'
                          : 'hover:bg-gray-50'
                      }\`}
                    >
                      <td className="py-2 px-3">{r.year}</td>
                      <td className="py-2 px-3">{r.semester}</td>
                      <td className="py-2 px-3">{r.grade}</td>
                      <td className="py-2 px-3">{r.curriculum}</td>
                      <td className="py-2 px-3 font-medium text-gray-900">{r.subject}</td>
                      <td
                        className={\`py-2 px-3 \${
                          isConvenience ? 'bg-amber-200 text-amber-900 font-bold' : ''
                        }\`}
                      >
                        {r.room}
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.track}</td>
                      <td className="py-2 px-3 font-semibold">{r.ban}</td>
                      <td className="py-2 px-3 text-center">{r.num}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">{r.name}</td>
                      <td className="py-2 px-3 text-gray-400">{r.room2}</td>
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
`;
fs.writeFileSync('src/pages/Step1Neis.tsx', content, 'utf8');
console.log('Step1 written');
