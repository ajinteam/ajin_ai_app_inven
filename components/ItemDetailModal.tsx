
import React, { useState, useMemo, useEffect } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, ArrowUpIcon, ArrowDownIcon, EditIcon, CheckIcon, BoxIcon, TrashIcon, DownloadIcon, PlusIcon, SyncIcon, SearchIcon } from './icons';

interface ItemDetailModalProps {
  item: Item;
  authRole: 'admin' | 'product_only';
  allUsedSerials: string[];
  existingCodes: string[];
  onAddTransaction: (itemId: string, transaction: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => void;
  onDeleteTransaction: (itemId: string, transactionId: string) => void;
  onUpdateItem: (itemId: string, updatedData: Partial<Item>) => void;
  onClose: () => void;
}

const ADMIN_PASSWORD = '0000';
const PRODUCT_ONLY_PASSWORD = '1111';

const suggestNextSerial = (usedSerials: string[]): string => {
  if (usedSerials.length === 0) return 'SN00001';
  const regex = /^([a-zA-Z]+)(\d+)$/;
  let maxNum = 0;
  let currentPrefix = 'SN';
  usedSerials.forEach(s => {
    const match = s.toUpperCase().match(regex);
    if (match) {
      currentPrefix = match[1];
      const num = parseInt(match[2], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextNum = maxNum + 1;
  const padLength = Math.max(5, nextNum.toString().length);
  return `${currentPrefix}${nextNum.toString().padStart(padLength, '0')}`;
};

const parseSerialRange = (input: string): string[] => {
  const rangeMatch = input.match(/^(.+?)(\d+)\s*~\s*(.+?)?(\d+)$/);
  if (!rangeMatch) return [input.trim()];
  const prefix = rangeMatch[1];
  const startNumStr = rangeMatch[2];
  const endNumStr = rangeMatch[4];
  const startNum = parseInt(startNumStr, 10);
  const endNum = parseInt(endNumStr, 10);
  if (isNaN(startNum) || isNaN(endNum) || startNum > endNum) return [input.trim()];
  if (endNum - startNum >= 100) throw new Error('범위는 최대 100개까지 가능합니다.');
  const results: string[] = [];
  const padLength = startNumStr.length;
  for (let i = startNum; i <= endNum; i++) {
    const paddedNum = i.toString().padStart(padLength, '0');
    results.push(`${prefix}${paddedNum}`);
  }
  return results;
};

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ 
  item, authRole, allUsedSerials, existingCodes, onAddTransaction, onUpdateTransaction, onDeleteTransaction, onUpdateItem, onClose 
}) => {
  const [transactionType, setTransactionType] = useState<'purchase' | 'release'>('purchase');
  const [quantity, setQuantity] = useState('');
  const [transRemarks, setTransRemarks] = useState('');
  const [transModelName, setTransModelName] = useState('');
  const [transUserId, setTransUserId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transEditData, setTransEditData] = useState<Partial<Transaction>>({});
  const [showPasswordInput, setShowPasswordInput] = useState<{ type: 'item' | 'trans_save' | 'trans_delete'; targetId?: string; } | null>(null);
  const [password, setPassword] = useState('');
  const [editFormData, setEditFormData] = useState<Partial<Item>>({});
  
  // History Search State
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  useEffect(() => {
    if (item.type === 'product' && !serialNumber) setSerialNumber(suggestNextSerial(allUsedSerials));
  }, [item, allUsedSerials]);

  useEffect(() => {
    setEditFormData({
      name: item.name, code: item.code, modelName: item.modelName, application: item.application,
      drawingNumber: item.drawingNumber, spec: item.spec || '', remarks: item.remarks, registrationDate: item.registrationDate
    });
  }, [item]);

  // Handle Serial Range to Quantity conversion
  useEffect(() => {
    if (item.type === 'product' && serialNumber.includes('~')) {
      try {
        const range = parseSerialRange(serialNumber.toUpperCase());
        if (range.length > 1) {
          setQuantity(range.length.toString());
        }
      } catch (e) {
        // Silent catch for invalid ranges
      }
    }
  }, [serialNumber, item.type]);

  const currentStock = useMemo(() => item.transactions.reduce((acc, t) => t.type === 'purchase' ? acc + t.quantity : acc - t.quantity, 0), [item.transactions]);
  const isSerialDuplicate = useMemo(() => (!serialNumber.trim() || serialNumber.includes('~')) ? false : allUsedSerials.includes(serialNumber.toUpperCase()), [serialNumber, allUsedSerials]);
  const isCodeDuplicate = useMemo(() => (!editFormData.code || editFormData.code === item.code) ? false : existingCodes.some(c => c.toUpperCase() === editFormData.code?.toUpperCase()), [editFormData.code, existingCodes, item.code]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    const term = historySearchTerm.toLowerCase().trim();
    if (!term) return [...item.transactions].reverse();
    return [...item.transactions].reverse().filter(t => 
      t.serialNumber?.toLowerCase().includes(term) || 
      t.customerName?.toLowerCase().includes(term) ||
      t.remarks?.toLowerCase().includes(term)
    );
  }, [item.transactions, historySearchTerm]);

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    let targetSerials: string[] = [serialNumber.toUpperCase().trim()];
    let isRange = false;
    if (item.type === 'product' && serialNumber.includes('~')) {
      try { 
        targetSerials = parseSerialRange(serialNumber.toUpperCase()); 
        isRange = true; 
      } catch (err: any) { 
        alert(err.message); 
        return; 
      }
    }
    
    const duplicates = targetSerials.filter(s => !!s && allUsedSerials.includes(s));
    if (duplicates.length > 0) { alert(`중복 번호 존재: ${duplicates.slice(0, 5).join(', ')}...`); return; }
    
    const count = isRange ? targetSerials.length : (parseInt(quantity, 10) || 0);
    if (count <= 0) { alert('수량을 확인하세요.'); return; }
    if (transactionType === 'release' && count > currentStock) { alert('재고 부족!'); return; }
    
    if (isRange) {
      targetSerials.forEach(s => onAddTransaction(item.id, { 
        type: transactionType, quantity: 1, date: new Date().toISOString(), 
        remarks: transRemarks, modelName: transModelName, userId: transUserId, 
        serialNumber: s, customerName, address, phoneNumber 
      }));
      alert(`${targetSerials.length}건이 일련번호 기반으로 개별 등록되었습니다.`);
    } else {
      onAddTransaction(item.id, { 
        type: transactionType, quantity: count, date: new Date().toISOString(), 
        remarks: transRemarks, modelName: transModelName, userId: transUserId, 
        serialNumber: item.type === 'product' ? serialNumber.toUpperCase() : '', 
        customerName: item.type === 'product' ? customerName : '', 
        address: item.type === 'product' ? address : '', 
        phoneNumber: item.type === 'product' ? phoneNumber : '' 
      });
    }
    
    setQuantity(''); 
    setTransRemarks(''); 
    setTransModelName(''); 
    setTransUserId(''); 
    setSerialNumber(suggestNextSerial([...allUsedSerials, ...targetSerials])); 
    setCustomerName(''); 
    setAddress(''); 
    setPhoneNumber('');
  };
  
  const handleActionConfirm = () => {
    const requiredPass = authRole === 'admin' ? '5200' : '3281'; // Re-using passwords from App context
    if (password !== requiredPass) { alert('비밀번호 오류.'); return; }
    const currentAction = showPasswordInput; setPassword(''); setShowPasswordInput(null);
    if (currentAction?.type === 'item') onUpdateItem(item.id, editFormData), setIsEditing(false);
    else if (currentAction?.type === 'trans_save' && currentAction.targetId) onUpdateTransaction(item.id, currentAction.targetId, transEditData), setEditingTransactionId(null);
    else if (currentAction?.type === 'trans_delete' && currentAction.targetId) onDeleteTransaction(item.id, currentAction.targetId);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
        if (!editFormData.name || !editFormData.code) { alert('필수 항목 누락.'); return; }
        if (isCodeDuplicate) { alert('중복 코드.'); return; }
        setShowPasswordInput({ type: 'item' });
    } else setIsEditing(true);
  };

  const handleTransEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const processedValue = (name === 'quantity') ? (parseInt(value, 10) || 0) : (['code', 'name', 'serialNumber'].includes(name) ? value.toUpperCase() : value);
    setTransEditData(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransactionId(t.id);
    setTransEditData(t);
  };

  const handleSaveTransEdit = (id: string) => {
    setShowPasswordInput({ type: 'trans_save', targetId: id });
  };

  const handleDeleteTrans = (id: string) => {
    setShowPasswordInput({ type: 'trans_delete', targetId: id });
  };

  const exportHistoryToExcel = () => {
    if (item.transactions.length === 0) { alert('내역 없음.'); return; }
    let csvContent = "\ufeff";
    const headers = item.type === 'part' ? ['날짜', '시간', '구분', '수량', '기종', '비고'] : ['날짜', '시간', '구분', '수량', '아이디', '일련번호', '고객명', '연락처', '주소', '비고'];
    csvContent += headers.join(',') + '\r\n';
    filteredHistory.forEach(t => {
      const d = new Date(t.date);
      const row = [d.toLocaleDateString(), d.toLocaleTimeString(), t.type === 'purchase' ? '입고' : '출고', t.quantity];
      if (item.type === 'part') row.push(t.modelName || '', t.remarks || '');
      else row.push(t.userId || '', t.serialNumber || '', t.customerName || '', t.phoneNumber || '', t.address || '', t.remarks || '');
      csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${item.name}_내역_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-[90vw] flex flex-col h-full max-h-[95vh] overflow-hidden animate-fade-in-up">
        {showPasswordInput && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-[2.5rem] p-12 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                    <h4 className="text-2xl font-black text-slate-800 mb-4 tracking-tight uppercase">권한 인증</h4>
                    <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleActionConfirm()} placeholder="PASSWORD" className="w-full px-6 py-5 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none mb-6 text-center text-3xl font-black tracking-widest" />
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { setShowPasswordInput(null); setPassword(''); }} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm tracking-widest">취소</button>
                        <button onClick={handleActionConfirm} className="py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-lg shadow-indigo-100">확인</button>
                    </div>
                </div>
            </div>
        )}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">{item.type === 'part' ? '부품' : '제품'} 상세 및 수불관리</h2></div>
          <div className="flex gap-4">
              <button onClick={handleToggleEdit} className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-base font-black transition-all shadow-sm ${isEditing ? 'bg-emerald-500 text-white' : 'bg-white text-indigo-600 border-2 border-indigo-50'}`}>
                {isEditing ? <CheckIcon className="w-5 h-5" /> : <EditIcon className="w-5 h-5" />}
                <span>{isEditing ? '정보 저장' : '수정 모드'}</span>
              </button>
              {isEditing && <button onClick={() => setIsEditing(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl text-base font-black uppercase">취소</button>}
              <button onClick={onClose} className="p-3 text-slate-400 hover:text-slate-800 transition-colors ml-4"><CloseIcon className="w-10 h-10" /></button>
          </div>
        </div>
        <div className="flex-grow overflow-y-auto p-10 grid grid-cols-1 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-slate-50/80 p-8 rounded-[2rem] border border-slate-100">
              {isEditing ? (
                <div className="space-y-6">
                    <div><label className="block text-sm uppercase font-black text-slate-400 mb-2 tracking-widest">품명</label>
                    <input name="name" value={editFormData.name || ''} onChange={(e) => setEditFormData({...editFormData, name: e.target.value.toUpperCase()})} className="w-full px-4 py-3 border-2 border-indigo-100 bg-white rounded-xl text-lg font-black outline-none" /></div>
                    <div><label className="block text-sm uppercase font-black text-slate-400 mb-2 tracking-widest">코드</label>
                    <input name="code" value={editFormData.code || ''} onChange={(e) => setEditFormData({...editFormData, code: e.target.value.toUpperCase()})} className={`w-full px-4 py-3 border-2 rounded-xl text-lg font-mono font-black outline-none ${isCodeDuplicate ? 'border-rose-400 bg-rose-50' : 'border-indigo-100'}`} /></div>
                    {item.type === 'part' && (
                      <>
                        <div><label className="block text-sm uppercase font-black text-slate-400 mb-2 tracking-widest">도번</label>
                        <input name="drawingNumber" value={editFormData.drawingNumber || ''} onChange={(e) => setEditFormData({...editFormData, drawingNumber: e.target.value})} className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl text-lg font-mono font-bold" /></div>
                        <div><label className="block text-sm uppercase font-black text-slate-400 mb-2 tracking-widest">규격</label>
                        <input name="spec" value={editFormData.spec || ''} onChange={(e) => setEditFormData({...editFormData, spec: e.target.value})} className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl text-lg font-bold" /></div>
                      </>
                    )}
                    <div><label className="block text-sm uppercase font-black text-slate-400 mb-2 tracking-widest">비고</label>
                    <textarea name="remarks" value={editFormData.remarks || ''} onChange={(e) => setEditFormData({...editFormData, remarks: e.target.value})} rows={3} className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl text-lg font-bold" /></div>
                </div>
              ) : (
                <>
                  {/* Reduced font size from text-4xl to text-3xl */}
                  <h3 className="text-3xl font-black text-slate-800 mb-6 break-all leading-tight uppercase tracking-tight">{item.name}</h3>
                  <div className="space-y-4 text-lg">
                    <div className="flex justify-between border-b-2 border-slate-100 pb-3"><span className="text-slate-400 font-black uppercase text-xs">Code</span><span className="font-mono font-black text-indigo-600">{item.code}</span></div>
                    {item.type === 'part' && (
                      <>
                        <div className="flex justify-between border-b-2 border-slate-100 pb-3"><span className="text-slate-400 font-black uppercase text-xs">Drawing</span><span className="font-mono font-bold text-slate-500">{item.drawingNumber || '-'}</span></div>
                        <div className="flex justify-between border-b-2 border-slate-100 pb-3"><span className="text-slate-400 font-black uppercase text-xs">Spec</span><span className="font-bold text-slate-500">{item.spec || '-'}</span></div>
                      </>
                    )}
                    <div className="flex justify-between pb-3"><span className="text-slate-400 font-black uppercase text-xs">Reg Date</span><span className="font-bold text-slate-500">{item.registrationDate}</span></div>
                    {item.remarks && (<div className="mt-6 p-5 bg-white rounded-2xl border border-slate-100 text-slate-600 font-bold leading-relaxed italic text-base">"{item.remarks}"</div>)}
                  </div>
                </>
              )}
              <div className="mt-10 pt-8 border-t-2 border-slate-200">
                <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Total Stock</p>
                <p className="text-7xl font-black text-slate-900 leading-none">{currentStock.toLocaleString()} <span className="text-2xl text-slate-300 font-black uppercase">EA</span></p>
              </div>
            </div>
            {!isEditing && (
              <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl space-y-6">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><PlusIcon className="w-5 h-5"/> 신규 입출고 기록</h3>
                  <form onSubmit={handleAddTransaction} className="space-y-5">
                      <div className="flex p-1.5 bg-slate-100 rounded-2xl">
                          <button type="button" onClick={() => setTransactionType('purchase')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${transactionType === 'purchase' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>입고</button>
                          <button type="button" onClick={() => setTransactionType('release')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${transactionType === 'release' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>출고</button>
                      </div>
                      <div className="space-y-4">
                        {item.type === 'product' ? (
                          <>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-2">
                                  <label className="text-xs font-black uppercase text-slate-400 tracking-widest">일련번호 (범위: CT0001~0010)</label>
                                  <button type="button" onClick={() => setSerialNumber(suggestNextSerial(allUsedSerials))} className="text-[10px] font-black text-indigo-600 underline">다음번호 제안</button>
                                </div>
                                <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value.toUpperCase())} placeholder="예: AJP00001~00005" className={`w-full px-4 py-3 text-lg border-2 rounded-xl font-black outline-none focus:ring-4 ${isSerialDuplicate ? 'border-rose-400 bg-rose-50' : 'border-slate-100'}`} />
                                {serialNumber.includes('~') && (
                                  <div className="flex items-center gap-1.5 mt-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-lg animate-pulse">
                                    <SyncIcon className="w-2.5 h-2.5 text-indigo-500" />
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">자동 범위 등록 모드 활성화</p>
                                  </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="수량 *" min="1" required disabled={serialNumber.includes('~')} className={`w-full px-4 py-3 text-lg border-2 rounded-xl font-black outline-none ${serialNumber.includes('~') ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' : 'border-slate-100 focus:border-indigo-400'}`} />
                                  {serialNumber.includes('~') && <p className="absolute -bottom-4 left-0 text-[8px] font-bold text-slate-400 uppercase">범위에 의해 자동 설정됨</p>}
                                </div>
                                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="대상자/고객명" className="w-full px-4 py-3 text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                            </div>
                            <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="연락처" className="w-full px-4 py-3 text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="배송 주소" className="w-full px-4 py-3 text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                          </>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="수량 *" min="1" required className="w-full px-4 py-3 text-lg border-2 border-slate-100 rounded-xl font-black outline-none focus:border-indigo-400" />
                            <input type="text" value={transModelName} onChange={(e) => setTransModelName(e.target.value)} placeholder="기종" className="w-full px-4 py-3 text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                          </div>
                        )}
                        <input type="text" value={transRemarks} onChange={(e) => setTransRemarks(e.target.value)} placeholder="사유 / 비고" className="w-full px-4 py-3 text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                      </div>
                      <button type="submit" className={`w-full py-5 text-white text-lg font-black rounded-2xl shadow-xl transition-all active:scale-95 ${transactionType === 'purchase' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'} uppercase tracking-widest`}>
                        데이터 {serialNumber.includes('~') ? '일괄' : '' } 저장
                      </button>
                  </form>
              </div>
            )}
          </div>
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">수불 히스토리</h3>
                <div className="relative w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="text-slate-400 w-4 h-4" /></span>
                    <input
                        type="text" value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)}
                        placeholder="일련번호, 대상자 검색..."
                        className="w-full pl-9 pr-4 py-2 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-indigo-300 bg-white text-sm font-bold"
                    />
                </div>
              </div>
              <button onClick={exportHistoryToExcel} className="flex items-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-2xl text-sm font-black hover:bg-emerald-600 hover:text-white transition-all uppercase shadow-md">
                <DownloadIcon className="w-5 h-5" /><span>목록 내보내기</span></button>
            </div>
            <div className="flex-grow border-2 border-slate-100 rounded-[2rem] overflow-hidden bg-slate-50/50">
                <div className="h-full max-h-[calc(90vh-220px)] overflow-y-auto">
                    {filteredHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-20 opacity-20">
                        <BoxIcon className="w-24 h-24 mb-4" />
                        <p className="text-xl font-black uppercase tracking-widest">
                          {historySearchTerm ? '검색 결과가 없습니다' : '기록된 내역이 없습니다'}
                        </p>
                      </div>
                    ) : (
                        <div className="overflow-x-auto"><table className="w-full text-left text-base">
                            <thead className="bg-white border-b-2 border-slate-100 text-sm font-black uppercase text-slate-400 sticky top-0 z-10">
                              <tr>
                                <th className="px-6 py-5">날짜 / 구분</th>
                                <th className="px-6 py-5">수량</th>
                                {item.type === 'part' && <th className="px-6 py-5">기종</th>}
                                {item.type === 'product' && (
                                  <>
                                    <th className="px-6 py-5">일련번호</th>
                                    <th className="px-6 py-5">대상자</th>
                                    <th className="px-6 py-5">주소</th>
                                  </>
                                )}
                                <th className="px-6 py-5">비고</th>
                                <th className="px-6 py-5 text-center">작업</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-white">
                                {filteredHistory.map(t => (
                                    <tr key={t.id} className={`hover:bg-white transition-all group ${editingTransactionId === t.id ? 'bg-indigo-50/50' : ''}`}>
                                        <td className="px-6 py-6">
                                          <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-xl ${t.type === 'purchase' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                              {t.type === 'purchase' ? <ArrowUpIcon className="w-5 h-5"/> : <ArrowDownIcon className="w-5 h-5"/>}
                                            </div>
                                            <div>
                                              <p className="font-black text-slate-700 text-lg">{new Date(t.date).toLocaleDateString()}</p>
                                              <p className="text-xs text-slate-400 font-bold">{new Date(t.date).toLocaleTimeString()}</p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-6 py-6">
                                          {editingTransactionId === t.id ? (
                                            <input name="quantity" type="number" value={transEditData.quantity} onChange={handleTransEditChange} className="w-24 px-3 py-2 border-2 rounded-xl bg-white font-black text-lg" />
                                          ) : (
                                            <span className={`font-black text-2xl ${t.type === 'purchase' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                              {t.type === 'purchase' ? '+' : '-'}{t.quantity.toLocaleString()}
                                            </span>
                                          )}
                                        </td>
                                        {item.type === 'part' && (
                                          <td className="px-6 py-6">
                                            {editingTransactionId === t.id ? (
                                              <input name="modelName" value={transEditData.modelName || ''} onChange={handleTransEditChange} className="w-32 px-3 py-2 border-2 rounded-xl bg-white" />
                                            ) : (
                                              <span className="font-black text-slate-600">{t.modelName || '-'}</span>
                                            )}
                                          </td>
                                        )}
                                        {item.type === 'product' && (
                                          <>
                                            <td className="px-6 py-6">
                                              {editingTransactionId === t.id ? (
                                                <input name="serialNumber" value={transEditData.serialNumber || ''} onChange={handleTransEditChange} className="w-32 px-3 py-2 border-2 rounded-xl bg-white font-black uppercase" />
                                              ) : (
                                                <span className="font-mono font-black text-indigo-600 text-lg">{t.serialNumber || '-'}</span>
                                              )}
                                            </td>
                                            <td className="px-6 py-6">
                                              {editingTransactionId === t.id ? (
                                                <div className="space-y-2">
                                                  <input name="customerName" value={transEditData.customerName || ''} onChange={handleTransEditChange} placeholder="이름" className="w-full px-3 py-2 border-2 rounded-xl bg-white" />
                                                  <input name="phoneNumber" value={transEditData.phoneNumber || ''} onChange={handleTransEditChange} placeholder="번호" className="w-full px-3 py-2 border-2 rounded-xl bg-white" />
                                                </div>
                                              ) : (
                                                <>
                                                  <p className="font-black text-slate-800 text-lg">{t.customerName || '-'}</p>
                                                  <p className="text-slate-400 font-bold text-sm">{t.phoneNumber || '-'}</p>
                                                </>
                                              )}
                                            </td>
                                            <td className="px-6 py-6">
                                              {editingTransactionId === t.id ? (
                                                <input name="address" value={transEditData.address || ''} onChange={handleTransEditChange} placeholder="주소" className="w-full px-3 py-2 border-2 rounded-xl bg-white" />
                                              ) : (
                                                <p className="text-slate-500 font-bold truncate max-w-[200px]" title={t.address}>{t.address || '-'}</p>
                                              )}
                                            </td>
                                          </>
                                        )}
                                        <td className="px-6 py-6">
                                          {editingTransactionId === t.id ? (
                                            <input name="remarks" value={transEditData.remarks || ''} onChange={handleTransEditChange} placeholder="비고" className="w-full px-3 py-2 border-2 rounded-xl bg-white" />
                                          ) : (
                                            <p className="text-sm text-slate-400 font-black truncate max-w-[250px]">{t.remarks || '-'}</p>
                                          )}
                                        </td>
                                        <td className="px-6 py-6 text-center">
                                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {editingTransactionId === t.id ? (
                                              <>
                                                <button onClick={() => handleSaveTransEdit(t.id)} className="p-3 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><CheckIcon className="w-6 h-6" /></button>
                                                <button onClick={() => setEditingTransactionId(null)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><CloseIcon className="w-6 h-6" /></button>
                                              </>
                                            ) : (
                                              <>
                                                <button onClick={() => handleEditTransaction(t)} className="p-3 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><EditIcon className="w-6 h-6" /></button>
                                                {/* Only Admin can delete transactions */}
                                                {authRole === 'admin' && (
                                                  <button onClick={() => handleDeleteTrans(t.id)} className="p-3 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><TrashIcon className="w-6 h-6" /></button>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table></div>
                    )}
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;
