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
          <div className="p-2 bg-[#e6f1f8] text-[#005691] rounded-full shrink-0 mt-0.5">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#005691]">{title}</h3>
            <div className="mt-2 text-[17px] text-gray-700 whitespace-pre-line leading-relaxed">
              {message}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[17px] font-normal text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 text-[17px] font-normal text-white bg-[#005691] hover:bg-[#004270] rounded-lg shadow-sm transition"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
