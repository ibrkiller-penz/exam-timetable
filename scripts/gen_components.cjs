const fs = require('fs');
const path = require('path');

function write(relPath, content) {
  const fullPath = path.join(__dirname, '..', relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log('Wrote ' + relPath);
}

// 1. ConfirmModal.tsx
write('src/components/ConfirmModal.tsx', `
import React from 'react';
import { HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = '확인',
  message,
  confirmText = '예',
  cancelText = '아니오',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-150 border border-gray-100">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-full shrink-0 mt-0.5">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <div className="mt-2 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
              {message}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
`);

// 2. AlertModal.tsx
write('src/components/AlertModal.tsx', `
import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  isError?: boolean;
  onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  title = '알림',
  message,
  isError = false,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-150 border border-gray-100">
        <div className="flex items-start gap-3">
          <div
            className={\`p-2 rounded-full shrink-0 mt-0.5 \${
              isError ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
            }\`}
          >
            {isError ? <AlertCircle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <div className="mt-2 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
              {message}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
`);

// 3. StageHeader.tsx
write('src/components/StageHeader.tsx', `
import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface StageHeaderProps {
  stageNumber: number;
  stageTitle: string;
  isConfirmed: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  guideMessage?: string;
  isError?: boolean;
  actions?: React.ReactNode;
}

export const StageHeader: React.FC<StageHeaderProps> = ({
  stageNumber,
  stageTitle,
  isConfirmed,
  confirmLabel = '확정',
  cancelLabel = '확정 취소',
  onConfirm,
  onCancel,
  guideMessage,
  isError = false,
  actions,
}) => {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm shadow-sm">
            {stageNumber}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{stageTitle}</h2>
              <span
                className={\`text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1 \${
                  isConfirmed
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }\`}
              >
                {isConfirmed ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" /> 확정됨
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" /> 미확정
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {actions}
          {onConfirm && !isConfirmed && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition active:scale-95"
            >
              {confirmLabel}
            </button>
          )}
          {onCancel && isConfirmed && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-semibold rounded-lg shadow-sm transition active:scale-95"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>

      {guideMessage && (
        <div
          className={\`mt-3 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 font-medium \${
            isError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : isConfirmed
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }\`}
        >
          <span>{guideMessage}</span>
        </div>
      )}
    </div>
  );
};
`);

// 4. utils/excelExport.ts
write('src/utils/excelExport.ts', `
import * as XLSX from 'xlsx';
import { AttendanceRow, LabelRow } from '../domain/types';

export function exportAttendanceToExcel(attendance: AttendanceRow[], filename = '응시현황.xlsx') {
  const headers = [
    'Key1', 'Key2', 'Key3', '일차', '교시', '고사실', '과목', '학년', '반', '번호', '성명', '강의실', '학번순', '좌석번호'
  ];

  const data = attendance.map(r => [
    r.key1, r.key2, r.key3, r.day, r.period, r.examRoom, r.subject, r.grade, r.ban, r.num, r.name, r.classRoom, r.seq, r.seat
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '응시현황');
  XLSX.writeFile(wb, filename);
}

export function exportLabelsToExcel(labels: LabelRow[], filename = '문제지라벨.xlsx') {
  const headers = ['연번', '일차', '교시', '날짜', '시간', '과목', '고사실', '응시분반', '응시인원'];
  const data = labels.map(l => [
    l.seq, l.day, l.period, l.date, l.time, l.subject, l.examRoom, l.classRoom, l.stuCount
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '라벨데이터');
  XLSX.writeFile(wb, filename);
}
`);

// 5. utils/download.ts
write('src/utils/download.ts', `
export function downloadJson(data: any, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
`);

console.log('Component files written.');
