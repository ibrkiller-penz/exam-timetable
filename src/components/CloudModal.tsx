import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  loadLatestStateFromCloud,
  saveSnapshotToCloud,
  listCloudSnapshots,
  loadSnapshotFromCloud,
  deleteCloudSnapshot,
  CloudSnapshotMeta
} from '../domain/firebase';
import { Cloud, Download, Trash2, Plus, RefreshCw, X, Check, Clock, Save } from 'lucide-react';

interface CloudModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudModal: React.FC<CloudModalProps> = ({ isOpen, onClose }) => {
  const store = useAppStore();
  const { loadSavedState, meta } = store;

  const [snapshots, setSnapshots] = useState<CloudSnapshotMeta[]>([]);
  const [latestInfo, setLatestInfo] = useState<{ title: string; updatedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchCloudData = async () => {
    setLoading(true);
    try {
      const latest = await loadLatestStateFromCloud();
      if (latest) {
        setLatestInfo({ title: latest.title, updatedAt: latest.updatedAt });
      } else {
        setLatestInfo(null);
      }
      const list = await listCloudSnapshots();
      setSnapshots(list);
    } catch (err) {
      console.error('Error fetching cloud data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCloudData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoadLatest = async () => {
    if (!window.confirm('서버에 가장 최근 저장된 작업 내용으로 현재 상태를 덮어쓰시겠습니까?')) return;
    setLoading(true);
    try {
      const latest = await loadLatestStateFromCloud();
      if (latest && latest.state) {
        await loadSavedState(latest.state);
        setStatusMsg('서버의 최신 상태를 불러왔습니다.');
        setTimeout(() => setStatusMsg(null), 3000);
        onClose();
      } else {
        alert('서버에 저장된 데이터가 없습니다.');
      }
    } catch (err) {
      alert('서버 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    const titleToSave = snapshotTitle.trim() || `${meta.title || '시험시간표'}_${new Date().toLocaleString('ko-KR')}`;
    setLoading(true);
    try {
      await saveSnapshotToCloud(store, titleToSave);
      setSnapshotTitle('');
      setStatusMsg('새로운 서버 스냅샷이 저장되었습니다.');
      setTimeout(() => setStatusMsg(null), 3000);
      await fetchCloudData();
    } catch (err) {
      alert('스냅샷 저장 실패: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSnapshot = async (id: string, title: string) => {
    if (!window.confirm(`'${title}' 스냅샷을 불러오시겠습니까? 현재 변경사항이 교체됩니다.`)) return;
    setLoading(true);
    try {
      const state = await loadSnapshotFromCloud(id);
      if (state) {
        await loadSavedState(state);
        setStatusMsg(`'${title}' 스냅샷을 불러왔습니다.`);
        setTimeout(() => setStatusMsg(null), 3000);
        onClose();
      }
    } catch (err) {
      alert('스냅샷 불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSnapshot = async (id: string, title: string) => {
    if (!window.confirm(`'${title}' 스냅샷을 삭제하시겠습니까?`)) return;
    setLoading(true);
    try {
      await deleteCloudSnapshot(id);
      await fetchCloudData();
    } catch (err) {
      alert('삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-[#005691] text-white flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 text-white rounded-xl border border-indigo-500/30">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">클라우드 서버 동기화 & 스냅샷 관리</h2>
              <p className="text-[15px] text-gray-800">어디서나 연속해서 작업할 수 있도록 중간 과정을 서버에 저장합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#0f172a] hover:text-[#0f172a] p-1.5 rounded-lg hover:bg-slate-700/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {statusMsg && (
            <div className="p-3 bg-[#e6f1f8] border border-gray-200 text-[#005691] rounded-xl text-[17px] font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-[#00A651] shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Latest Auto-Save Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-gray-900 font-extrabold text-[17px]">
                <Clock className="w-4 h-4 text-red-500" />
                <span>서버 최근 자동 저장본</span>
              </div>
              {latestInfo ? (
                <div className="mt-1 text-[15px] text-[#0f172a] space-y-0.5">
                  <div className="font-normal text-[#0f172a]">제목: {latestInfo.title}</div>
                  <div className="text-[#0f172a]">
                    최종 동기화: {new Date(latestInfo.updatedAt).toLocaleString('ko-KR')}
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-[15px] text-[#0f172a]">서버에 저장된 자동 저장 데이터가 없습니다.</div>
              )}
            </div>
            <button
              onClick={handleLoadLatest}
              disabled={loading || !latestInfo}
              className="px-3.5 py-2 bg-[#005691] hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed text-white rounded-xl font-bold text-[15px] flex items-center gap-1.5 transition shadow-xs shrink-0"
            >
              <Download className="w-4 h-4" />
              최신 저장 불러오기
            </button>
          </div>

          {/* Create New Snapshot */}
          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <h3 className="text-[15px] font-black text-[#0f172a] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5 text-red-500" />
              <span>현재 작업 상태를 별도 스냅샷으로 백업</span>
            </h3>
            <form onSubmit={handleCreateSnapshot} className="flex gap-2">
              <input
                type="text"
                placeholder="스냅샷 이름 입력 (예: 1차 검토 완료본, Step4 수정 전)"
                value={snapshotTitle}
                onChange={e => setSnapshotTitle(e.target.value)}
                className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-[17px] focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-white hover:bg-gray-100 text-white font-extrabold text-[15px] rounded-xl flex items-center gap-1.5 transition shrink-0"
              >
                <Plus className="w-4 h-4 text-[#005691]" />
                스냅샷 저장
              </button>
            </form>
          </div>

          {/* Snapshots List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[15px] font-black text-[#0f172a] uppercase tracking-wider">
                저장된 스냅샷 목록 ({snapshots.length}개)
              </h3>
              <button
                onClick={fetchCloudData}
                disabled={loading}
                className="text-[15px] text-[#0f172a] hover:text-[#0f172a] flex items-center gap-1 font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </button>
            </div>

            {snapshots.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-200 text-[#0f172a] text-[15px] font-bold">
                저장된 스냅샷이 없습니다. 위의 입력창에서 현재 작업을 백업해보세요!
              </div>
            ) : (
              <div className="space-y-2">
                {snapshots.map(snap => (
                  <div
                    key={snap.id}
                    className="p-3 bg-white border border-gray-200 hover:border-gray-200 rounded-xl flex items-center justify-between transition shadow-2xs"
                  >
                    <div>
                      <div className="font-extrabold text-[17px] text-[#0f172a]">{snap.title}</div>
                      <div className="text-[15px] text-[#0f172a] mt-0.5">
                        저장 일시: {new Date(snap.updatedAt).toLocaleString('ko-KR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleLoadSnapshot(snap.id, snap.title)}
                        disabled={loading}
                        className="px-3 py-1.5 bg-white hover:bg-gray-50 text-[#0f172a] rounded-lg text-[15px] font-bold flex items-center gap-1 transition"
                      >
                        <Download className="w-3.5 h-3.5 text-red-500" /> 불러오기
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(snap.id, snap.title)}
                        disabled={loading}
                        className="p-1.5 text-[#0f172a] hover:text-red-500 hover:bg-[#e6f1f8] rounded-lg transition"
                        title="스냅샷 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-50 hover:bg-slate-300 text-[#0f172a] text-[15px] font-extrabold rounded-xl transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
