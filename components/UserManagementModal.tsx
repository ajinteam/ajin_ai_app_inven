
import React, { useState } from 'react';
import type { User } from '../types';
import { CloseIcon, PlusIcon, TrashIcon, EditIcon, CheckIcon } from './icons';

interface UserManagementModalProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  onClose: () => void;
}

const generateId = () => `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const UserManagementModal: React.FC<UserManagementModalProps> = ({ users, onUpdateUsers, onClose }) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<User, 'id'>>({
    name: '',
    password: '',
    partPermission: 'none',
    productPermission: 'none',
    showPricePermission: false
  });

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.password) {
      alert('이름과 비밀번호(로그인 번호)를 입력하세요.');
      return;
    }
    const newUser: User = { ...formData, id: generateId() };
    onUpdateUsers([...users, newUser]);
    setFormData({ name: '', password: '', partPermission: 'none', productPermission: 'none', showPricePermission: false });
  };

  const handleEditUser = (user: User) => {
    setEditingUserId(user.id);
    setFormData({
      name: user.name,
      password: user.password,
      partPermission: user.partPermission,
      productPermission: user.productPermission,
      showPricePermission: !!user.showPricePermission
    });
    // 스크롤을 폼 상단으로 이동 (편의성)
    const modalContent = document.getElementById('user-modal-content');
    if (modalContent) modalContent.scrollTop = 0;
  };

  const handleSaveEdit = () => {
    if (!editingUserId) return;
    const updatedUsers = users.map(u => u.id === editingUserId ? { ...formData, id: editingUserId } : u);
    onUpdateUsers(updatedUsers);
    setEditingUserId(null);
    setFormData({ name: '', password: '', partPermission: 'none', productPermission: 'none', showPricePermission: false });
  };

  const confirmDelete = () => {
    if (confirmDeleteId) {
      onUpdateUsers(users.filter(u => u.id !== confirmDeleteId));
      setConfirmDeleteId(null);
    }
  };

  const userToDelete = users.find(u => u.id === confirmDeleteId);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl animate-fade-in-up flex flex-col max-h-[90vh] relative">
        
        {/* 삭제 확인 전용 창 (모달 내부 오버레이) */}
        {confirmDeleteId && userToDelete && (
          <div className="absolute inset-0 z-[60] bg-white/90 backdrop-blur-sm flex items-center justify-center p-6 rounded-[2.5rem]">
            <div className="bg-white border-2 border-rose-100 p-8 sm:p-12 rounded-[2rem] shadow-2xl max-w-md w-full text-center animate-scale-in">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <TrashIcon className="w-8 h-8" />
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">사용자 삭제 확인</h3>
              <p className="text-slate-500 font-bold mb-8">
                <span className="text-rose-600 font-black">[{userToDelete.name}]</span> 사용자를 삭제하시겠습니까?<br/>
                이 작업은 되돌릴 수 없습니다.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setConfirmDeleteId(null)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">취소</button>
                <button onClick={confirmDelete} className="py-4 bg-rose-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all">삭제 확정</button>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight uppercase">사용자 계정 관리</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors">
            <CloseIcon className="w-8 h-8" />
          </button>
        </div>

        <div id="user-modal-content" className="p-6 sm:p-8 overflow-y-auto space-y-8">
          <form onSubmit={editingUserId ? (e) => e.preventDefault() : handleAddUser} className={`p-6 rounded-2xl border-2 transition-all ${editingUserId ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'} space-y-4`}>
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                {editingUserId ? '사용자 정보 및 권한 수정' : '신규 사용자 및 권한 등록'}
              </h3>
              {editingUserId && <span className="text-[10px] font-black text-amber-600 bg-white px-2 py-0.5 rounded-full border border-amber-100">수정 모드</span>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">사용자 이름</label>
                <input 
                  placeholder="이름 입력"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400 bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">로그인 번호</label>
                <input 
                  placeholder="비밀번호 설정"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-black outline-none focus:border-indigo-400 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">부품 재고 접근 권한</label>
                <div className="flex gap-2">
                  {[
                    { val: 'none', label: '권한없음' },
                    { val: 'read', label: '읽기 전용' },
                    { val: 'edit', label: '편집 권한' }
                  ].map(p => (
                    <button 
                      key={p.val} type="button" 
                      onClick={() => setFormData({...formData, partPermission: p.val as any})}
                      className={`flex-1 py-2.5 text-[10px] font-black uppercase rounded-lg border-2 transition-all ${formData.partPermission === p.val ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">제품 재고 접근 권한</label>
                <div className="flex gap-2">
                  {[
                    { val: 'none', label: '권한없음' },
                    { val: 'read', label: '읽기 전용' },
                    { val: 'edit', label: '편집 권한' }
                  ].map(p => (
                    <button 
                      key={p.val} type="button" 
                      onClick={() => setFormData({...formData, productPermission: p.val as any})}
                      className={`flex-1 py-2.5 text-[10px] font-black uppercase rounded-lg border-2 transition-all ${formData.productPermission === p.val ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-100'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">단가표시 접근 권한</label>
                <div className="flex gap-2">
                  {[
                    { val: false, label: '권한없음' },
                    { val: true, label: '단가표시' }
                  ].map(p => (
                    <button 
                      key={p.label} type="button" 
                      onClick={() => setFormData({...formData, showPricePermission: p.val})}
                      className={`flex-1 py-2.5 text-[10px] font-black uppercase rounded-lg border-2 transition-all ${formData.showPricePermission === p.val ? 'bg-sky-600 border-sky-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-sky-100'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {editingUserId ? (
                <>
                  <button onClick={handleSaveEdit} type="button" className="flex-1 py-4 bg-amber-600 text-white font-black rounded-xl uppercase tracking-widest text-xs shadow-lg hover:bg-amber-700">변경사항 저장</button>
                  <button onClick={() => {setEditingUserId(null); setFormData({name:'', password:'', partPermission:'none', productPermission:'none', showPricePermission: false})}} type="button" className="flex-1 py-4 bg-slate-300 text-slate-600 font-black rounded-xl uppercase tracking-widest text-xs">취소</button>
                </>
              ) : (
                <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg hover:bg-indigo-700 transition-all">
                  <PlusIcon className="w-4 h-4" /> 사용자 계정 추가 등록
                </button>
              )}
            </div>
          </form>

          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">등록된 사용자 명단 ({users.length})</h3>
            </div>
            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-5">이름</th>
                    <th className="px-6 py-5">로그인 번호</th>
                    <th className="px-6 py-5">부품 권한</th>
                    <th className="px-6 py-5">제품 권한</th>
                    <th className="px-6 py-5">단가 표시</th>
                    <th className="px-6 py-5 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-300 font-bold italic uppercase">등록된 사용자가 없습니다</td></tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id} className={`hover:bg-slate-50/50 transition-colors ${editingUserId === u.id ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-6 py-5 font-black text-slate-800 text-sm">{u.name}</td>
                        <td className="px-6 py-5 font-mono font-black text-slate-400">****</td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${u.partPermission === 'none' ? 'bg-slate-100 text-slate-400' : u.partPermission === 'read' ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-600 text-white'}`}>
                            {u.partPermission === 'none' ? '권한없음' : u.partPermission === 'read' ? '읽기전용' : '편집권한'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${u.productPermission === 'none' ? 'bg-slate-100 text-slate-400' : u.productPermission === 'read' ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-600 text-white'}`}>
                            {u.productPermission === 'none' ? '권한없음' : u.productPermission === 'read' ? '읽기전용' : '편집권한'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${u.showPricePermission ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                            {u.showPricePermission ? '표시함' : '권한없음'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleEditUser(u)} title="권한 수정" className="p-2 text-indigo-400 hover:bg-indigo-50 rounded-lg transition-all border border-transparent hover:border-indigo-100">
                              <EditIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirmDeleteId(u.id)} title="사용자 삭제" className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-100">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-4 bg-white text-slate-500 border-2 border-slate-200 font-black rounded-2xl uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm">
            관리자 설정 닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserManagementModal;
