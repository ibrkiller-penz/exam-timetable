import React, { Component, ErrorInfo, ReactNode } from 'react';
import { clearStateIdb } from '../store/persistence';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = async () => {
    if (window.confirm('로컬 캐시를 초기화하고 새로고침하시겠습니까? (서버에 저장된 데이터는 안전하게 유지됩니다)')) {
      await clearStateIdb();
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-[#cce3f0] p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-[#e6f1f8] text-red-500 rounded-full flex items-center justify-center mx-auto text-3xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-[#0f172a]">화면을 불러오는 중 오류가 발생했습니다</h2>
            <p className="text-[17px] text-[#0f172a]">
              일시적인 데이터 충돌 또는 브라우저 캐시 문제일 수 있습니다. 아래 버튼을 통해 다시 시도해 주세요.
            </p>
            {this.state.error && (
              <div className="p-3 bg-[#e6f1f8]/50 rounded-lg text-[15px] font-mono text-[#005691] text-left overflow-auto max-h-32 border border-[#cce3f0]">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-[#005691] hover:bg-indigo-700 text-white font-normal rounded-xl text-[17px] transition-colors shadow-sm cursor-pointer"
              >
                🔄 페이지 새로고침
              </button>
              <button
                onClick={this.handleResetAndReload}
                className="w-full py-2 px-4 bg-white hover:bg-gray-50 text-gray-800 font-normal rounded-xl text-[17px] transition-colors cursor-pointer"
              >
                🗑️ 로컬 캐시 초기화 후 재접속
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
