
import React, { useState, useMemo, useEffect } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, ArrowUpIcon, ArrowDownIcon, EditIcon, CheckIcon, BoxIcon, TrashIcon, DownloadIcon, PlusIcon, SyncIcon, SearchIcon } from './icons';

interface ItemDetailModalProps {
  item: Item;
  authRole: 'admin' | 'product_only';
  allUsedSerials: string[];
  existingCodes: string[];
  onAddTransaction: (itemId: string, transaction: Omit<Transaction, 'id'>) => void;
  onAddTransactions?: (itemId: string, transactions: Omit<Transaction, 'id'>[]) => void;
  onUpdateTransaction: (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => void;
  onDeleteTransaction: (itemId: string, transactionId: string) => void;
  onUpdateItem: (itemId: string, updatedData: Partial<Item>) => void;
  onClose: () => void;
}

const ADMIN_PASSWORD = '5200';
const PRODUCT_ONLY_PASSWORD = '2611';

const suggestNextSerial = (usedSerials: string[]): string => {
  if (usedSerials.length === 0) return 'AJP00001';
  const regex = /^([a-zA-Z]+)(\d+)$/;
  let maxNum = 0;
  let currentPrefix = 'AJP';
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
  if (endNum - startNum >= 1000) throw new Error('범위는 최대 1000개까지 가능합니다.');
  const results: string[] = [];
  const padLength = startNumStr.length;
  for (let i = startNum; i <= endNum; i++) {
    const paddedNum = i.toString().padStart(padLength, '0');
    results.push(`${prefix}${paddedNum}`);
  }
  return results;
};

const toLocalDatetimeString = (dateStr: string | number | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ 
  item, authRole, allUsedSerials, existingCodes, onAddTransaction, onAddTransactions, onUpdateTransaction, onDeleteTransaction, onUpdateItem, onClose 
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
  const [showPasswordInput, setShowPasswordInput] = useState<{ type: 'item' | 'trans_save' | 'trans_delete' | 'batch_delete'; targetId?: string; } | null>(null);
  const [password, setPassword] = useState('');
  const [editFormData, setEditFormData] = useState<Partial<Item>>({});
  const [selectedTransIds, setSelectedTransIds] = useState<string[]>([]);
  
  const [showReturnModal, setShowReturnModal] = useState<{ itemId: string, transactionId?: string, transactionIds?: string[] } | null>(null);
  const [returnReason, setReturnReason] = useState('도장불량');
  const [returnRemarks, setReturnRemarks] = useState('');

  // Restore State
  const [showRestorePrompt, setShowRestorePrompt] = useState<{ itemId: string, transactionId: string, originalRemarks: string } | null>(null);
  const [restoreActionText, setRestoreActionText] = useState<'수리' | '교환' | '직접입력'>('수리');
  const [restoreDetailText, setRestoreDetailText] = useState('');

  // History Search State
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  useEffect(() => {
    if (item.type === 'product' && !serialNumber) setSerialNumber(suggestNextSerial(allUsedSerials));
  }, [item, allUsedSerials]);

  useEffect(() => {
    setEditFormData({
      name: item.name, code: item.code, modelName: item.modelName, application: item.application,
      drawingNumber: item.drawingNumber, spec: item.spec || '', remarks: item.remarks, registrationDate: item.registrationDate,
      category: item.category
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

  const currentStock = useMemo(() => item.transactions.reduce((acc, t) => {
    if (t.isDiscarded) return acc;
    return t.type === 'purchase' ? acc + t.quantity : acc - t.quantity;
  }, 0), [item.transactions]);

  const purchaseSum = useMemo(() => {
    return item.transactions
      .filter(t => t.type === 'purchase' && !t.isDiscarded)
      .reduce((acc, t) => acc + t.quantity, 0);
  }, [item.transactions]);

  const releaseSum = useMemo(() => {
    return item.transactions
      .filter(t => t.type === 'release' && !t.isDiscarded)
      .reduce((acc, t) => acc + t.quantity, 0);
  }, [item.transactions]);

  const saleSum = useMemo(() => {
    return item.transactions
      .filter(t => t.type === 'release' && !t.isDiscarded && (!t.customerName || (t.customerName.trim() !== '대천' && t.customerName.trim() !== '대천공장')))
      .reduce((acc, t) => acc + t.quantity, 0);
  }, [item.transactions]);

  const returnASSum = useMemo(() => {
    return item.transactions
      .filter(t => t.type === 'release' && t.isReturned && !t.isDiscarded)
      .reduce((acc, t) => acc + t.quantity, 0);
  }, [item.transactions]);

  const daecheonWasteSum = useMemo(() => {
    return item.transactions
      .filter(t => t.type === 'purchase' && !t.isDiscarded && t.customerName && t.customerName.trim() === '대천폐기')
      .reduce((acc, t) => acc + t.quantity, 0);
  }, [item.transactions]);

  const daecheonASSum = useMemo(() => {
    const releaseS = item.transactions
      .filter(t => t.type === 'release' && !t.isDiscarded && t.customerName && (t.customerName.trim() === '대천' || t.customerName.trim() === '대천공장'))
      .reduce((acc, t) => acc + t.quantity, 0);
    const purchaseS = item.transactions
      .filter(t => t.type === 'purchase' && !t.isDiscarded && t.customerName && t.customerName.trim() === '대천공장')
      .reduce((acc, t) => acc + t.quantity, 0);
    const wasteS = item.transactions
      .filter(t => t.type === 'purchase' && !t.isDiscarded && t.customerName && t.customerName.trim() === '대천폐기')
      .reduce((acc, t) => acc + t.quantity, 0);
    return Math.max(0, releaseS - purchaseS - wasteS);
  }, [item.transactions]);

  const isSerialDuplicate = useMemo(() => (!serialNumber.trim() || serialNumber.includes('~')) ? false : allUsedSerials.includes(serialNumber.toUpperCase()), [serialNumber, allUsedSerials]);
  const isCodeDuplicate = useMemo(() => (!editFormData.code || editFormData.code === item.code) ? false : existingCodes.some(c => c.toUpperCase() === editFormData.code?.toUpperCase()), [editFormData.code, existingCodes, item.code]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    const term = historySearchTerm.toLowerCase().trim();
    const sortedTrans = [...item.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (!term) return sortedTrans;
    
    // Exact serial match priority
    const exactMatches = sortedTrans.filter(t => 
      t.serialNumber?.toLowerCase() === term || 
      t.originalSerialNumber?.toLowerCase() === term
    );
    
    if (exactMatches.length > 0) return exactMatches;
    
    return sortedTrans.filter(t => {
      const serialMatch = t.serialNumber?.toLowerCase() === term || t.originalSerialNumber?.toLowerCase() === term;
      const otherMatch = t.customerName?.toLowerCase().includes(term) || 
                         t.remarks?.toLowerCase().includes(term) ||
                         t.userId?.toLowerCase().includes(term);
      
      return serialMatch || otherMatch;
    });
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
      const baseTime = Date.now();
      if (onAddTransactions) {
        const batch: Omit<Transaction, 'id'>[] = targetSerials.map((s, index) => ({
          type: transactionType, quantity: 1, 
          date: new Date(baseTime + index).toISOString(), 
          remarks: transRemarks, modelName: transModelName, userId: transUserId, 
          serialNumber: s, customerName, address, phoneNumber 
        }));
        onAddTransactions(item.id, batch);
      } else {
        targetSerials.forEach((s, index) => onAddTransaction(item.id, { 
          type: transactionType, quantity: 1, 
          date: new Date(baseTime + index).toISOString(), 
          remarks: transRemarks, modelName: transModelName, userId: transUserId, 
          serialNumber: s, customerName, address, phoneNumber 
        }));
      }
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
    const requiredPass = authRole === 'admin' ? '5200' : '2611' ;
    if (password !== requiredPass) { alert('비밀번호 오류.'); return; }
    const currentAction = showPasswordInput; setPassword(''); setShowPasswordInput(null);
    if (currentAction?.type === 'item') onUpdateItem(item.id, editFormData), setIsEditing(false);
    else if (currentAction?.type === 'trans_save' && currentAction.targetId) onUpdateTransaction(item.id, currentAction.targetId, transEditData), setEditingTransactionId(null);
    else if (currentAction?.type === 'trans_delete' && currentAction.targetId) onDeleteTransaction(item.id, currentAction.targetId);
    else if (currentAction?.type === 'batch_delete') {
      selectedTransIds.forEach(id => {
        onDeleteTransaction(item.id, id);
      });
      setSelectedTransIds([]);
      alert(`${selectedTransIds.length}건의 품목들이 일괄 삭제되었습니다.`);
    }
  };

  const handleToggleSelectTrans = (transId: string) => {
    setSelectedTransIds(prev => 
      prev.includes(transId) ? prev.filter(id => id !== transId) : [...prev, transId]
    );
  };

  const handleBatchDelete = () => {
    if (selectedTransIds.length === 0) {
      alert('삭제할 품목을 선택해주세요.');
      return;
    }
    if (confirm(`선택한 ${selectedTransIds.length}개 내역을 일괄 삭제하시겠습니까?`)) {
      setShowPasswordInput({ type: 'batch_delete' });
    }
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
    const processedValue = (name === 'quantity') ? (parseInt(value, 10) || 0) : 
                           (name === 'date') ? (value ? new Date(value).toISOString() : new Date().toISOString()) :
                           (['code', 'name', 'serialNumber'].includes(name) ? value.toUpperCase() : value);
    setTransEditData(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransactionId(t.id);
    setTransEditData(t);
  };

  const handleSaveTransEdit = (id: string) => {
    const originalTrans = item.transactions.find(t => t.id === id);
    const updatedData = { ...transEditData };
    
    // If serial number changed, store the original one
    if (originalTrans && transEditData.serialNumber && transEditData.serialNumber !== originalTrans.serialNumber) {
      updatedData.originalSerialNumber = originalTrans.serialNumber;
    }
    
    setShowPasswordInput({ type: 'trans_save', targetId: id });
    setTransEditData(updatedData); // Update with potential originalSerialNumber
  };

  const handleReturnSubmit = () => {
    if (showReturnModal) {
      const reason = returnReason === '기타' ? `기타: ${returnRemarks}` : returnReason;
      
      if (showReturnModal.transactionIds && showReturnModal.transactionIds.length > 0) {
        showReturnModal.transactionIds.forEach(tId => {
          const currentTrans = item.transactions.find(t => t.id === tId);
          if (currentTrans) {
            const newRemarks = currentTrans.remarks ? `${currentTrans.remarks} / 반품: ${reason}` : `반품: ${reason}`;
            onUpdateTransaction(showReturnModal.itemId, tId, {
              isReturned: true,
              returnReason: reason,
              remarks: newRemarks
            });
          }
        });
        setSelectedTransIds([]);
        alert(`${showReturnModal.transactionIds.length}건이 일괄 반품 보관함으로 이동되었습니다.`);
      } else if (showReturnModal.transactionId) {
        const currentTrans = item.transactions.find(t => t.id === showReturnModal.transactionId);
        const newRemarks = currentTrans?.remarks ? `${currentTrans.remarks} / 반품: ${reason}` : `반품: ${reason}`;
        
        onUpdateTransaction(showReturnModal.itemId, showReturnModal.transactionId, {
          isReturned: true,
          returnReason: reason,
          remarks: newRemarks
        });
        alert('반품 보관함으로 이동되었습니다.');
      }
      setShowReturnModal(null);
      setReturnRemarks('');
    }
  };

  const handleRestoreSubmit = () => {
    if (!showRestorePrompt) return;
    const { itemId, transactionId, originalRemarks } = showRestorePrompt;

    let actionLabel = '';
    if (restoreActionText === '수리') {
      actionLabel = '수리';
    } else if (restoreActionText === '교환') {
      actionLabel = '교환';
    } else {
      actionLabel = restoreDetailText.trim();
    }

    if (!actionLabel) {
      alert('처리에 관한 내용(또는 직접 입력 내용)을 입력하세요.');
      return;
    }

    const finalRemarks = originalRemarks 
      ? `${originalRemarks} / 복원: ${actionLabel}` 
      : `복원: ${actionLabel}`;

    onUpdateTransaction(itemId, transactionId, {
      isReturned: false,
      returnReason: '',
      remarks: finalRemarks
    });

    setShowRestorePrompt(null);
    setRestoreActionText('수리');
    setRestoreDetailText('');
    alert('원래 출고 상태로 복원되었습니다.');
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-[3rem] shadow-2xl w-full max-w-[95vw] sm:max-w-[90vw] flex flex-col h-full max-h-[98vh] sm:max-h-[95vh] overflow-hidden animate-fade-in-up">
        {showPasswordInput && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-8 sm:p-12 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                    <h4 className="text-xl sm:text-2xl font-black text-slate-800 mb-4 tracking-tight uppercase">권한 인증</h4>
                    <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleActionConfirm()} placeholder="PASSWORD" className="w-full px-4 sm:px-6 py-4 sm:py-5 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-indigo-500 outline-none mb-6 text-center text-2xl sm:text-3xl font-black tracking-widest" />
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { setShowPasswordInput(null); setPassword(''); }} className="py-3 sm:py-4 bg-slate-100 text-slate-600 rounded-lg sm:rounded-xl font-black uppercase text-xs sm:text-sm tracking-widest">취소</button>
                        <button onClick={handleActionConfirm} className="py-3 sm:py-4 bg-indigo-600 text-white rounded-lg sm:rounded-xl font-black uppercase text-xs sm:text-sm tracking-widest shadow-lg shadow-indigo-100">확인</button>
                    </div>
                </div>
            </div>
        )}
        <div className="p-4 sm:p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 w-full md:w-auto">
            <div><h2 className="text-xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase whitespace-nowrap">재고 상세 관리</h2></div>
            
            {/* 수량 요약 박스 그룹 */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex flex-col items-center">
                <span className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-0.5 uppercase">입고</span>
                <div className="border border-rose-500 bg-white px-3 py-1 rounded-md text-slate-800 font-extrabold text-xs sm:text-sm min-w-[50px] sm:min-w-[65px] text-center shadow-sm">{purchaseSum}</div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-0.5 uppercase">출고</span>
                <div className="border border-rose-500 bg-white px-3 py-1 rounded-md text-slate-800 font-extrabold text-xs sm:text-sm min-w-[50px] sm:min-w-[65px] text-center shadow-sm">{releaseSum}</div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-0.5 uppercase">판매</span>
                <div className="border border-rose-500 bg-white px-3 py-1 rounded-md text-slate-800 font-extrabold text-xs sm:text-sm min-w-[50px] sm:min-w-[65px] text-center shadow-sm">{saleSum}</div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-0.5 uppercase">반품AS</span>
                <div className="border border-rose-500 bg-white px-3 py-1 rounded-md text-slate-800 font-extrabold text-xs sm:text-sm min-w-[50px] sm:min-w-[65px] text-center shadow-sm">{returnASSum}</div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-0.5 uppercase">대천AS</span>
                <div className="border border-rose-500 bg-white px-3 py-1 rounded-md text-slate-800 font-extrabold text-xs sm:text-sm min-w-[50px] sm:min-w-[65px] text-center shadow-sm">{daecheonASSum}</div>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-rose-600 text-[10px] sm:text-xs font-black tracking-widest mb-0.5 uppercase">대천폐기</span>
                <div className="border border-rose-500 bg-white px-3 py-1 rounded-md text-slate-800 font-extrabold text-xs sm:text-sm min-w-[50px] sm:min-w-[65px] text-center shadow-sm">{daecheonWasteSum}</div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-4 w-full md:w-auto justify-end">
              <button id="detail_edit_btn" onClick={handleToggleEdit} className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl text-[10px] sm:text-base font-black transition-all shadow-sm ${isEditing ? 'bg-emerald-500 text-white' : 'bg-white text-indigo-600 border-2 border-indigo-50'}`}>
                {isEditing ? <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5" /> : <EditIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
                <span className="hidden xs:inline">{isEditing ? '저장' : '정보 수정'}</span>
              </button>
              {isEditing && <button id="detail_cancel_btn" onClick={() => setIsEditing(false)} className="px-3 sm:px-6 py-2 sm:py-3 bg-slate-100 text-slate-600 rounded-xl sm:rounded-2xl text-[10px] sm:text-base font-black uppercase">취소</button>}
              <button id="detail_close_btn" onClick={onClose} className="p-1 sm:p-3 text-slate-400 hover:text-slate-800 transition-colors ml-1 sm:ml-4"><CloseIcon className="w-8 h-8 sm:w-10 sm:h-10" /></button>
          </div>
        </div>
        <div className="flex-grow overflow-hidden p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          {!historySearchTerm && (
            <div className="lg:col-span-1 space-y-4 sm:space-y-6 overflow-y-auto pr-2 custom-scrollbar animate-fade-in">
              <div className="bg-slate-50/80 p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-slate-100">
              {isEditing ? (
                <div className="space-y-4 sm:space-y-6">
                    <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">품명</label>
                    <input name="name" value={editFormData.name || ''} onChange={(e) => setEditFormData({...editFormData, name: e.target.value.toUpperCase()})} className="w-full px-4 py-2 sm:py-3 border-2 border-indigo-100 bg-white rounded-xl text-base sm:text-lg font-black outline-none" /></div>
                    {item.type === 'product' && (
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">카테고리</label>
                        <select 
                          value={editFormData.category || 'GiL'} 
                          onChange={(e) => setEditFormData({...editFormData, category: e.target.value as any})}
                          className="w-full px-4 py-2 sm:py-3 border-2 border-indigo-100 bg-white rounded-xl text-base sm:text-lg font-black outline-none"
                        >
                          <option value="GiL">GiL</option>
                          <option value="KATO">KATO</option>
                          <option value="TOMIX">TOMIX</option>
                        </select>
                      </div>
                    )}
                    <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">코드</label>
                    <input name="code" value={editFormData.code || ''} onChange={(e) => setEditFormData({...editFormData, code: e.target.value.toUpperCase()})} className={`w-full px-4 py-2 sm:py-3 border-2 rounded-xl text-base sm:text-lg font-mono font-black outline-none ${isCodeDuplicate ? 'border-rose-400 bg-rose-50' : 'border-indigo-100'}`} /></div>
                    {item.type === 'part' && (
                      <>
                        <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">도번</label>
                        <input name="drawingNumber" value={editFormData.drawingNumber || ''} onChange={(e) => setEditFormData({...editFormData, drawingNumber: e.target.value})} className="w-full px-4 py-2 sm:py-3 border-2 border-indigo-100 rounded-xl text-base sm:text-lg font-mono font-bold" /></div>
                        <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">규격</label>
                        <input name="spec" value={editFormData.spec || ''} onChange={(e) => setEditFormData({...editFormData, spec: e.target.value})} className="w-full px-4 py-2 sm:py-3 border-2 border-indigo-100 rounded-xl text-base sm:text-lg font-bold" /></div>
                      </>
                    )}
                    <div><label className="block text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">비고</label>
                    <textarea name="remarks" value={editFormData.remarks || ''} onChange={(e) => setEditFormData({...editFormData, remarks: e.target.value})} rows={2} className="w-full px-4 py-2 sm:py-3 border-2 border-indigo-100 rounded-xl text-base sm:text-lg font-bold" /></div>
                </div>
              ) : (
                <>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-800 mb-4 sm:mb-6 break-all leading-tight uppercase tracking-tight">{item.name}</h3>
                  <div className="space-y-3 sm:space-y-4 text-sm sm:text-lg">
                    {item.type === 'product' && (
                      <div className="flex justify-between border-b-2 border-slate-100 pb-2"><span className="text-slate-400 font-black uppercase text-[10px]">Category</span><span className="font-black text-indigo-600 uppercase">{item.category}</span></div>
                    )}
                    <div className="flex justify-between border-b-2 border-slate-100 pb-2"><span className="text-slate-400 font-black uppercase text-[10px]">Code</span><span className="font-mono font-black text-indigo-600">{item.code}</span></div>
                    {item.type === 'part' && (
                      <>
                        <div className="flex justify-between border-b-2 border-slate-100 pb-2"><span className="text-slate-400 font-black uppercase text-[10px]">Drawing</span><span className="font-mono font-bold text-slate-500">{item.drawingNumber || '-'}</span></div>
                        <div className="flex justify-between border-b-2 border-slate-100 pb-2"><span className="text-slate-400 font-black uppercase text-[10px]">Spec</span><span className="font-bold text-slate-500 text-right">{item.spec || '-'}</span></div>
                      </>
                    )}
                    <div className="flex justify-between pb-2"><span className="text-slate-400 font-black uppercase text-[10px]">Reg Date</span><span className="font-bold text-slate-500">{item.registrationDate}</span></div>
                    {item.remarks && (<div className="mt-4 p-4 bg-white rounded-xl border border-slate-100 text-slate-600 font-bold leading-relaxed italic text-sm whitespace-pre-wrap break-all">"{item.remarks}"</div>)}
                  </div>
                </>
              )}
              <div className="mt-6 sm:mt-10 pt-6 sm:pt-8 border-t-2 border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-3 text-center sm:text-left">Total Stock</p>
                <p className="text-5xl sm:text-7xl font-black text-slate-900 leading-none text-center sm:text-left">{currentStock.toLocaleString()} <span className="text-xl sm:text-2xl text-slate-300 font-black uppercase">EA</span></p>
              </div>
            </div>
            {!isEditing && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] border border-slate-100 shadow-xl space-y-4 sm:space-y-5">
                  <h3 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><PlusIcon className="w-4 h-4 sm:w-5 sm:h-5"/> 입출고 기록</h3>
                  <form onSubmit={handleAddTransaction} className="space-y-4 sm:space-y-5">
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                          <button type="button" onClick={() => setTransactionType('purchase')} className={`flex-1 py-2 sm:py-3 text-[10px] sm:text-sm font-black rounded-lg transition-all ${transactionType === 'purchase' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>입고</button>
                          <button type="button" onClick={() => setTransactionType('release')} className={`flex-1 py-2 sm:py-3 text-[10px] sm:text-sm font-black rounded-lg transition-all ${transactionType === 'release' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>출고</button>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        {item.type === 'product' ? (
                          <>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-1.5">
                                  <label className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest">일련번호 (범위: SN001~010)</label>
                                  <button type="button" onClick={() => setSerialNumber(suggestNextSerial(allUsedSerials))} className="text-[8px] sm:text-[10px] font-black text-indigo-600 underline">제안</button>
                                </div>
                                <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value.toUpperCase())} placeholder="예: AJP00001~00005" className={`w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 rounded-xl font-black outline-none ${isSerialDuplicate ? 'border-rose-400 bg-rose-50' : 'border-slate-100'}`} />
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                <div className="relative">
                                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="수량 *" min="1" required disabled={serialNumber.includes('~')} className={`w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 rounded-xl font-black outline-none ${serialNumber.includes('~') ? 'bg-slate-100 text-slate-400 border-slate-200' : 'border-slate-100 focus:border-indigo-400'}`} />
                                </div>
                                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="대상자/고객명" className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                            </div>
                            <input type="text" value={transUserId} onChange={(e) => setTransUserId(e.target.value)} placeholder="아이디" className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                            <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="연락처" className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="배송 주소" className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                          </>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="수량 *" min="1" required className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-black outline-none focus:border-indigo-400" />
                            <input type="text" value={transModelName} onChange={(e) => setTransModelName(e.target.value)} placeholder="기종" className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                          </div>
                        )}
                        <input type="text" value={transRemarks} onChange={(e) => setTransRemarks(e.target.value)} placeholder="사유 / 비고" className="w-full px-4 py-2.5 sm:py-3 text-base sm:text-lg border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400" />
                      </div>
                      <button type="submit" className={`w-full py-4 text-white text-base sm:text-lg font-black rounded-xl sm:rounded-2xl shadow-lg transition-all ${transactionType === 'purchase' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'} uppercase tracking-widest`}>
                        {serialNumber.includes('~') ? '일괄 저장' : '데이터 저장' }
                      </button>
                  </form>
              </div>
            )}
            </div>
          )}
          <div className={`${historySearchTerm ? 'lg:col-span-4' : 'lg:col-span-3'} flex flex-col overflow-hidden transition-all duration-300`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-6 w-full">
                <h3 className="text-sm sm:text-lg font-black text-slate-800 uppercase tracking-widest">수불 히스토리</h3>
                <div className="relative w-full sm:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="text-slate-400 w-4 h-4" /></span>
                    <input
                        type="text" value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)}
                        placeholder="번호, 대상자, 아이디 검색..."
                        className="w-full pl-9 pr-4 py-2 border-2 border-slate-100 rounded-lg sm:rounded-xl focus:outline-none focus:border-indigo-300 bg-white text-xs sm:text-sm font-bold"
                    />
                </div>
              </div>
              <button onClick={exportHistoryToExcel} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-xl text-xs font-black hover:bg-emerald-600 hover:text-white transition-all uppercase shadow-sm">
                <DownloadIcon className="w-4 h-4" /><span>내역 내보내기</span></button>
            </div>
            <div className="flex-grow border-2 border-slate-100 rounded-2xl sm:rounded-[2rem] overflow-hidden bg-slate-50/50 flex flex-col h-full relative">
                {selectedTransIds.length > 0 && (
                  <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-3 flex items-center justify-between text-xs sm:text-sm animate-fade-in z-20">
                    <span className="font-black text-indigo-800">
                      선택됨: <span className="text-sm sm:text-base text-indigo-600 font-extrabold">{selectedTransIds.length}</span>개 품목
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const releaseTransIds = selectedTransIds.filter(id => {
                            const found = item.transactions.find(trans => trans.id === id);
                            return found && found.type === 'release' && !found.isReturned;
                          });
                          if (releaseTransIds.length === 0) {
                            alert('반품이 가능한 출고(출고 상태이고 반품되지 않은) 내역이 선택되지 않았습니다.');
                            return;
                          }
                          setShowReturnModal({ itemId: item.id, transactionIds: releaseTransIds });
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[10px] sm:text-xs transition-colors shadow-sm cursor-pointer"
                      >
                        일괄 반품
                      </button>
                      <button
                        onClick={handleBatchDelete}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-black text-[10px] sm:text-xs transition-colors shadow-sm cursor-pointer"
                      >
                        일괄 삭제
                      </button>
                      <button
                        onClick={() => setSelectedTransIds([])}
                        className="px-2.5 py-1.5 bg-white text-slate-500 border border-slate-200 hover:bg-slate-100 rounded-lg font-black text-[10px] sm:text-xs transition-colors cursor-pointer"
                      >
                        선택 해제
                      </button>
                    </div>
                  </div>
                )}
                <div className="h-full overflow-y-auto custom-scrollbar">
                    {filteredHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-10 opacity-20">
                        <BoxIcon className="w-16 h-16 sm:w-24 sm:h-24 mb-4" />
                        <p className="text-sm sm:text-xl font-black uppercase tracking-widest text-center">
                          기록된 내역이 없습니다
                        </p>
                      </div>
                    ) : (
                        <div className="overflow-x-auto scrollbar-hide">
                          <table className="w-full text-left min-w-[800px]">
                            <thead className="bg-white border-b-2 border-slate-100 text-[10px] sm:text-sm font-black uppercase text-slate-400 sticky top-0 z-10">
                              <tr>
                                <th className="px-2 sm:px-4 py-3 sm:py-4">날짜 / 구분</th>
                                <th className="px-2 sm:px-4 py-3 sm:py-4">수량</th>
                                {item.type === 'part' && <th className="px-2 sm:px-4 py-3 sm:py-4">기종</th>}
                                {item.type === 'product' && (
                                  <>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4">일련번호</th>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4">대상자/ID</th>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4">주소</th>
                                  </>
                                )}
                                <th className="px-2 sm:px-4 py-3 sm:py-4">비고</th>
                                <th className="px-2 sm:px-4 py-3 sm:py-4 text-center sticky right-0 bg-white z-10 border-l-2 border-slate-100 shadow-[-4px_0_8px_rgba(0,0,0,0.02)]">작업</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-white">
                                {filteredHistory.map(t => (
                                    <tr key={t.id} className={`hover:bg-white transition-all group ${editingTransactionId === t.id ? 'bg-indigo-50/50' : ''} ${t.isDiscarded ? 'bg-rose-50/30' : ''} ${t.isReturned ? 'bg-amber-50/30' : ''}`}>
                                        <td className="px-2 sm:px-4 py-3 sm:py-4">
                                          <div className="flex items-center gap-2 sm:gap-3">
                                            <div 
                                              onClick={() => handleToggleSelectTrans(t.id)}
                                              className={`p-1.5 sm:p-2 rounded-lg cursor-pointer transition-all duration-200 transform active:scale-95 hover:scale-105 select-none ${
                                                selectedTransIds.includes(t.id)
                                                  ? (t.type === 'purchase' ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300' : 'bg-rose-600 text-white shadow-md ring-2 ring-rose-300')
                                                  : (t.type === 'purchase' ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-rose-100 text-rose-600 hover:bg-rose-200')
                                              }`}
                                              title="선택하려면 클릭하세요"
                                            >
                                              {t.type === 'purchase' ? <ArrowUpIcon className="w-3 h-3 sm:w-4 sm:h-4"/> : <ArrowDownIcon className="w-3 h-3 sm:w-4 sm:h-4"/>}
                                            </div>
                                            {editingTransactionId === t.id && authRole === 'admin' ? (
                                              <input
                                                type="datetime-local"
                                                name="date"
                                                value={toLocalDatetimeString(transEditData.date)}
                                                onChange={handleTransEditChange}
                                                className="px-2 py-1 border-2 rounded-lg bg-white font-bold text-[10px] sm:text-xs"
                                              />
                                            ) : (
                                              <div className={t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}>
                                                <p className="font-black text-slate-700 text-[10px] sm:text-sm">{new Date(t.date).toLocaleDateString()}</p>
                                                <p className="text-[8px] text-slate-400 font-bold">{new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-3 sm:py-4">
                                          {editingTransactionId === t.id ? (
                                            <input name="quantity" type="number" value={transEditData.quantity} onChange={handleTransEditChange} className="w-16 sm:w-20 px-2 py-1 border-2 rounded-lg bg-white font-black text-xs sm:text-base" />
                                          ) : (
                                            <span className={`font-black text-sm sm:text-lg ${t.type === 'purchase' ? 'text-emerald-600' : 'text-rose-600'} ${t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}`}>
                                              {t.type === 'purchase' ? '+' : '-'}{t.quantity.toLocaleString()}
                                            </span>
                                          )}
                                        </td>
                                        {item.type === 'part' && (
                                          <td className="px-2 sm:px-4 py-3 sm:py-4">
                                            {editingTransactionId === t.id ? (
                                              <input name="modelName" value={transEditData.modelName || ''} onChange={handleTransEditChange} className="w-20 sm:w-24 px-2 py-1 border-2 rounded-lg bg-white text-xs" />
                                            ) : (
                                              <span className={`font-black text-slate-600 text-[10px] sm:text-xs ${t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}`}>{t.modelName || '-'}</span>
                                            )}
                                          </td>
                                        )}
                                        {item.type === 'product' && (
                                          <>
                                            <td className="px-2 sm:px-4 py-3 sm:py-4">
                                              {editingTransactionId === t.id ? (
                                                <input name="serialNumber" value={transEditData.serialNumber || ''} onChange={handleTransEditChange} className="w-20 sm:w-24 px-2 py-1 border-2 rounded-lg bg-white font-black uppercase text-[10px]" />
                                              ) : (
                                                <div className="flex flex-col">
                                                  {t.originalSerialNumber && (
                                                    <span className="text-[8px] text-rose-500 line-through font-mono font-bold decoration-rose-500 decoration-1">{t.originalSerialNumber}</span>
                                                  )}
                                                  <span className={`font-mono font-black text-indigo-600 text-[10px] sm:text-sm ${t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}`}>{t.serialNumber || '-'}</span>
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 sm:py-4">
                                              {editingTransactionId === t.id ? (
                                                <div className="space-y-1">
                                                  <input name="customerName" value={transEditData.customerName || ''} onChange={handleTransEditChange} placeholder="이름" className="w-full px-2 py-1 border-2 rounded-lg text-[10px]" />
                                                  <input name="userId" value={transEditData.userId || ''} onChange={handleTransEditChange} placeholder="ID" className="w-full px-2 py-1 border-2 rounded-lg text-[10px]" />
                                                  <input name="phoneNumber" value={transEditData.phoneNumber || ''} onChange={handleTransEditChange} placeholder="번호" className="w-full px-2 py-1 border-2 rounded-lg text-[10px]" />
                                                </div>
                                              ) : (
                                                <div className={t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}>
                                                  <div className="flex items-center gap-1">
                                                    <p className="font-black text-slate-800 text-[10px] sm:text-sm">{t.customerName || '-'}</p>
                                                    {t.userId && <span className="bg-slate-100 text-slate-500 text-[6px] sm:text-[8px] font-black px-1 py-0.5 rounded uppercase">{t.userId}</span>}
                                                  </div>
                                                  <p className="text-slate-400 font-bold text-[8px] sm:text-[10px]">{t.phoneNumber || '-'}</p>
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 sm:py-4">
                                              {editingTransactionId === t.id ? (
                                                <input name="address" value={transEditData.address || ''} onChange={handleTransEditChange} placeholder="주소" className="w-full px-2 py-1 border-2 rounded-lg text-[10px]" />
                                              ) : (
                                                <p className={`text-slate-500 font-bold text-[8px] sm:text-[10px] truncate max-w-[80px] sm:max-w-[120px] ${t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}`} title={t.address}>{t.address || '-'}</p>
                                              )}
                                            </td>
                                          </>
                                        )}
                                          <td className="px-2 sm:px-4 py-3 sm:py-4">
                                            {editingTransactionId === t.id ? (
                                              <input name="remarks" value={transEditData.remarks || ''} onChange={handleTransEditChange} placeholder="비고" className="w-full px-2 py-1 border-2 rounded-lg text-[10px]" />
                                            ) : (
                                              <div className="flex flex-col">
                                                {t.isDiscarded && <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest mb-0.5">폐기</span>}
                                                <p className={`text-[8px] sm:text-[10px] text-slate-400 font-black whitespace-pre-wrap break-all ${t.isDiscarded ? 'line-through text-rose-300 decoration-rose-500 decoration-2' : ''}`}>{t.remarks || '-'}</p>
                                              </div>
                                            )}
                                          </td>
                                        <td className="px-2 sm:px-4 py-3 sm:py-4 text-center sticky right-0 bg-inherit group-hover:bg-white z-10 border-l-2 border-slate-100 shadow-[-4px_0_8px_rgba(0,0,0,0.02)]">
                                          <div className="flex items-center justify-center gap-1 sm:gap-2 transition-opacity">
                                            {editingTransactionId === t.id ? (
                                              <>
                                                <button onClick={() => handleSaveTransEdit(t.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><CheckIcon className="w-5 h-5" /></button>
                                                <button onClick={() => setEditingTransactionId(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><CloseIcon className="w-5 h-5" /></button>
                                              </>
                                            ) : (
                                              <>
                                                {t.isDiscarded ? (
                                                  <button 
                                                    onClick={() => onUpdateTransaction(item.id, t.id, { isDiscarded: false })}
                                                    className="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[10px] font-black hover:bg-emerald-600 hover:text-white transition-all"
                                                  >
                                                    복구
                                                  </button>
                                                ) : (
                                                  <>
                                                    {t.type === 'release' && !t.isReturned && (
                                                      <button 
                                                        onClick={() => setShowReturnModal({ itemId: item.id, transactionId: t.id })}
                                                        className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[10px] font-black hover:bg-amber-600 hover:text-white transition-all"
                                                      >
                                                        반품
                                                      </button>
                                                    )}
                                                    {t.type === 'release' && t.isReturned && (
                                                      <button 
                                                        id={`detail_return_cancel_btn_${t.id}`}
                                                        onClick={() => {
                                                          setShowRestorePrompt({
                                                            itemId: item.id,
                                                            transactionId: t.id,
                                                            originalRemarks: t.remarks || ''
                                                          });
                                                        }}
                                                        className="px-2 py-1 bg-sky-50 text-sky-600 border border-sky-100 rounded text-[10px] font-black hover:bg-sky-600 hover:text-white transition-all whitespace-nowrap"
                                                      >
                                                        반품취소
                                                      </button>
                                                    )}
                                                  </>
                                                )}
                                                <button onClick={() => handleEditTransaction(t)} className="p-2 text-indigo-400 hover:text-indigo-600 rounded-lg"><EditIcon className="w-4 h-4 sm:w-6 sm:h-6" /></button>
                                                {/* Only Admin can delete transactions */}
                                                {authRole === 'admin' && (
                                                  <button onClick={() => handleDeleteTrans(t.id)} className="p-2 text-rose-400 hover:text-rose-600 rounded-lg"><TrashIcon className="w-4 h-4 sm:w-6 sm:h-6" /></button>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                          </table>
                      </div>
                    )}
                </div>
            </div>
          </div>
        </div>
      </div>
      {showRestorePrompt && (
                                        <div id="restore_action_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
                                          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                                            <h4 className="text-2xl font-black text-slate-800 mb-6 tracking-tight uppercase">반품취소 / 원복 조치 선택</h4>
                                            <div className="space-y-4">
                                              <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">처리 결과 선택</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                  {(['수리', '교환', '직접입력'] as const).map(action => (
                                                    <button
                                                      key={action}
                                                      type="button"
                                                      id={`restore_action_btn_${action}`}
                                                      onClick={() => setRestoreActionText(action)}
                                                      className={`py-3 rounded-xl font-black text-xs transition-all border ${
                                                        restoreActionText === action
                                                          ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-100'
                                                          : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                                                      }`}
                                                    >
                                                      {action}
                                                    </button>
                                                  ))}
                                                </div>
                                              </div>
                                              
                                              {restoreActionText === '직접입력' ? (
                                                <div>
                                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">원하는 조치 내용 직접 입력</label>
                                                  <input 
                                                    type="text"
                                                    id="restore_action_custom_input"
                                                    value={restoreDetailText} 
                                                    onChange={(e) => setRestoreDetailText(e.target.value)}
                                                    placeholder="조치 내용을 자유롭게 입력하세요..."
                                                    className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400"
                                                  />
                                                </div>
                                              ) : (
                                                <div>
                                                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">상세 메모 (선택사항)</label>
                                                  <input 
                                                    type="text"
                                                    id="restore_action_detail_input"
                                                    value={restoreDetailText} 
                                                    onChange={(e) => setRestoreDetailText(e.target.value)}
                                                    placeholder="추가 설명이 필요하면 적어주세요..."
                                                    className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400"
                                                  />
                                                </div>
                                              )}

                                              <div className="grid grid-cols-2 gap-4 mt-6">
                                                <button 
                                                  id="restore_action_cancel_btn"
                                                  onClick={() => {
                                                    setShowRestorePrompt(null);
                                                    setRestoreActionText('수리');
                                                    setRestoreDetailText('');
                                                  }} 
                                                  className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm tracking-widest"
                                                >
                                                  취소
                                                </button>
                                                <button 
                                                  id="restore_action_confirm_btn"
                                                  onClick={handleRestoreSubmit} 
                                                  className="py-4 bg-sky-500 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-lg shadow-sky-100"
                                                >
                                                  출고 복원
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}

      {showReturnModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
            <h4 className="text-2xl font-black text-slate-800 mb-6 tracking-tight uppercase">반품 사유 선택</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">사유 목록</label>
                <select 
                  value={returnReason} 
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400"
                >
                  {['도장불량', '부품파손', '소비자과실', '부품누락', '인쇄불량', '사출불량', '페인트까짐', '표면얼룩', '기타'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">상세 내용 (선택)</label>
                <textarea 
                  value={returnRemarks} 
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  placeholder="추가적인 설명을 입력하세요..."
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <button onClick={() => setShowReturnModal(null)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm tracking-widest">취소</button>
                <button onClick={handleReturnSubmit} className="py-4 bg-amber-500 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-lg shadow-amber-100">반품 처리</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemDetailModal;
