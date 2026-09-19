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
            className={`p-2 rounded-full shrink-0 mt-0.5 ${
              isError ? 'bg-[#e6f1f8] text-[#005691]' : 'bg-blue-50 text-blue-600'
            }`}
          >
            {isError ? <AlertCircle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#005691]">{title}</h3>
            <div className="mt-2 text-[17px] text-gray-700 whitespace-pre-line leading-relaxed">
              {message}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-[17px] font-normal text-white bg-[#005691] hover:bg-[#004270] rounded-lg shadow-sm transition"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
