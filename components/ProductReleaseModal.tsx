
import React, { useState, useMemo, useEffect } from 'react';
import type { Item, Transaction } from '../types';
// Added missing ArrowDownIcon to imports
import { CloseIcon, PlusIcon, TrashIcon, BoxIcon, ArrowDownIcon } from './icons';

interface ProductReleaseModalProps {
  items: Item[];
  allUsedSerials: string[];
  onBatchRelease: (releases: { itemId: string, transaction: Omit<Transaction, 'id'> }[]) => void;
  onClose: () => void;
}

const suggestNextSerial = (usedSerials: string[], prefix: string = 'AJP'): string => {
  const filteredSerials = usedSerials.filter(s => s.toUpperCase().startsWith(prefix.toUpperCase()));
  if (filteredSerials.length === 0) return `${prefix}00001`;
  
  const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');
  let maxNum = 0;
  filteredSerials.forEach(s => {
    const match = s.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextNum = maxNum + 1;
  const padLength = Math.max(5, nextNum.toString().length);
  return `${prefix}${nextNum.toString().padStart(padLength, '0')}`;
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
  if (endNum - startNum >= 1000) return [input.trim()]; // 범위 제한
  const results: string[] = [];
  const padLength = startNumStr.length;
  for (let i = startNum; i <= endNum; i++) {
    const paddedNum = i.toString().padStart(padLength, '0');
    results.push(`${prefix}${paddedNum}`);
  }
  return results;
};

const generateSerialRange = (currentSerial: string, qty: number): string => {
  if (qty <= 0) return currentSerial;
  const base = currentSerial.includes('~') ? currentSerial.split('~')[0].trim() : currentSerial.trim();
  const match = base.match(/^(AJP|AJD)(\d+)$/i);
  if (!match) return currentSerial;

  const prefix = match[1].toUpperCase();
  const numStr = match[2];
  const startNum = parseInt(numStr, 10);
  if (isNaN(startNum)) return currentSerial;

  if (qty === 1) {
    return `${prefix}${numStr}`;
  }

  const endNum = startNum + qty - 1;
  const padLength = numStr.length;
  const endNumStr = endNum.toString().padStart(padLength, '0');

  return `${prefix}${numStr}~${prefix}${endNumStr}`;
};

const ProductReleaseModal: React.FC<ProductReleaseModalProps> = ({ items, allUsedSerials, onBatchRelease, onClose }) => {
  // Master Customer Info
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    userId: '',
    phone: '',
    address: '',
    remarks: ''
  });

  // Current Selection
  const [brand, setBrand] = useState<'GiL' | 'KATO' | 'TOMIX'>('GiL');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [serial, setSerial] = useState('');
  const [itemRemarks, setItemRemarks] = useState('');

  // Pending List
  const [releaseList, setReleaseList] = useState<{ itemId: string, name: string, brand: string, quantity: number, serial: string, remarks: string }[]>([]);

  const filteredProducts = useMemo(() => items.filter(i => i.category === brand), [items, brand]);

  // Serial Number Logic for Selected Product & Brand
  useEffect(() => {
    const pendingSerials = releaseList.map(r => r.serial.toUpperCase());
    const product = items.find(i => i.id === selectedProductId);

    if (brand === 'GiL' && product) {
      const code = product.code?.toUpperCase() || '';
      if (code.startsWith('P')) {
        setSerial(suggestNextSerial([...allUsedSerials, ...pendingSerials], 'AJP'));
      } else if (code.startsWith('D')) {
        setSerial(suggestNextSerial([...allUsedSerials, ...pendingSerials], 'AJD'));
      } else {
        setSerial('');
      }
    } else {
      setSerial('');
    }
  }, [brand, selectedProductId, releaseList, allUsedSerials, items]);

  // Handle two-way sync between Serial Range and Quantity
  useEffect(() => {
    const trimmedSerial = serial.trim();
    if (trimmedSerial.includes('~')) {
      try {
        const range = parseSerialRange(trimmedSerial.toUpperCase());
        if (range.length > 1) {
          const expectedQtyStr = range.length.toString();
          if (quantity !== expectedQtyStr) {
            setQuantity(expectedQtyStr);
          }
        }
      } catch (e) {
        // Silent catch for invalid ranges
      }
    } else {
      // If it doesn't contain '~' but matches AJP/AJD format, and current quantity > 1, auto-expand it!
      const match = trimmedSerial.match(/^(AJP|AJD)(\d+)$/i);
      if (match) {
        const qty = parseInt(quantity, 10);
        if (!isNaN(qty) && qty > 1) {
          const expectedSerial = generateSerialRange(trimmedSerial, qty);
          if (serial !== expectedSerial) {
            setSerial(expectedSerial);
          }
        }
      }
    }
  }, [serial]);

  useEffect(() => {
    const qty = parseInt(quantity, 10);
    if (!isNaN(qty) && qty > 0) {
      const expectedSerial = generateSerialRange(serial, qty);
      if (serial !== expectedSerial) {
        setSerial(expectedSerial);
      }
    }
  }, [quantity]);

  const handleAddToList = () => {
    if (!selectedProductId) { alert('제품을 선택하세요.'); return; }
    
    const product = items.find(i => i.id === selectedProductId);
    if (!product) return;

    let targetSerials: string[] = [serial.toUpperCase().trim()];
    let isRange = false;
    
    if (serial.includes('~')) {
      const parsedRange = parseSerialRange(serial.toUpperCase());
      if (parsedRange.length > 1) {
        targetSerials = parsedRange;
        isRange = true;
      }
    }

    const qty = isRange ? targetSerials.length : (parseInt(quantity, 10) || 0);
    if (qty <= 0) { alert('수량을 확인하세요.'); return; }

    // Check dupes in pending list and DB
    const usedSerialsInPending = releaseList.map(r => r.serial.toUpperCase());
    const duplicates = targetSerials.filter(s => !!s && (allUsedSerials.includes(s.toUpperCase()) || usedSerialsInPending.includes(s.toUpperCase())));
    if (duplicates.length > 0) { 
      alert(`중복된 번호가 존재합니다: ${duplicates.slice(0, 3).join(', ')}...`); 
      return; 
    }

    if (isRange) {
      const newEntries = targetSerials.map(s => ({
        itemId: selectedProductId,
        name: product.name,
        brand: brand,
        quantity: 1,
        serial: s,
        remarks: itemRemarks
      }));
      setReleaseList(prev => [...prev, ...newEntries]);
    } else {
      setReleaseList(prev => [...prev, {
        itemId: selectedProductId,
        name: product.name,
        brand: brand,
        quantity: qty,
        serial: serial.toUpperCase(),
        remarks: itemRemarks
      }]);
    }

    // Reset selection part
    setQuantity('1');
    setItemRemarks('');
  };

  const handleRemoveFromList = (index: number) => {
    setReleaseList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (releaseList.length === 0) { alert('출고할 품목이 없습니다.'); return; }
    if (!customerInfo.name) { alert('대상자 이름을 입력하세요.'); return; }

    const payload = releaseList.map(r => {
      // Construct remarks: only add brackets if customerInfo.remarks exists
      const prefix = customerInfo.remarks ? `[${customerInfo.remarks}] ` : "";
      const finalRemarks = `${prefix}${r.remarks}`.trim();

      return {
        itemId: r.itemId,
        transaction: {
          type: 'release' as const,
          quantity: r.quantity,
          date: new Date().toISOString(),
          remarks: finalRemarks,
          serialNumber: r.serial,
          customerName: customerInfo.name,
          userId: customerInfo.userId, // Allow lowercase as is
          phoneNumber: customerInfo.phone,
          address: customerInfo.address
        }
      };
    });

    onBatchRelease(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl animate-fade-in-up flex flex-col my-auto max-h-[95vh]">
        <div className="p-4 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight uppercase">제품 출고 (BETA)</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors">
            <CloseIcon className="w-8 h-8" />
          </button>
        </div>

        <div className="flex-grow p-4 sm:p-8 overflow-y-auto space-y-8">
          {/* Customer Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">제품출고 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">대상자</label>
                <input value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">아이디</label>
                <input value={customerInfo.userId} onChange={e => setCustomerInfo({...customerInfo, userId: e.target.value})} className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black outline-none focus:border-indigo-400" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">연락처</label>
                <input value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">주소</label>
                <input value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">비고</label>
                <input value={customerInfo.remarks} onChange={e => setCustomerInfo({...customerInfo, remarks: e.target.value})} className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Item Selector Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-l-4 border-emerald-600 pl-3">품목 추가</h3>
            <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <label className="w-24 text-xs font-black text-slate-400 uppercase">브랜드</label>
                <div className="flex gap-2 w-full">
                  {['GiL', 'KATO', 'TOMIX'].map(b => (
                    <button key={b} type="button" onClick={() => { setBrand(b as any); setSelectedProductId(''); }} className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${brand === b ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>{b}</button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <label className="w-24 text-xs font-black text-slate-400 uppercase">제품품목</label>
                <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400">
                  <option value="">제품을 선택하세요</option>
                  {filteredProducts.map(p => (
                    <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <label className="w-24 text-xs font-black text-slate-400 uppercase">수량</label>
                  <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="1" className="flex-grow px-4 py-2 bg-white border border-slate-200 rounded-xl font-black outline-none focus:border-indigo-400" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-24 text-xs font-black text-slate-400 uppercase">일련번호</label>
                  <input value={serial} onChange={e => setSerial(e.target.value.toUpperCase())} className="flex-grow px-4 py-2 bg-white border border-slate-200 rounded-xl font-mono font-black text-indigo-600 outline-none focus:border-indigo-400" />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <label className="w-24 text-xs font-black text-slate-400 uppercase">비고</label>
                <div className="flex gap-2 w-full">
                  <input value={itemRemarks} onChange={e => setItemRemarks(e.target.value)} className="flex-grow px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
                  <button onClick={handleAddToList} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">
                    <PlusIcon className="w-4 h-4" />추가
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pending List Table */}
          {releaseList.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest border-l-4 border-slate-300 pl-3">출고 대기 목록 ({releaseList.length})</h3>
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase">
                    <tr>
                      <th className="px-4 py-3">브랜드</th>
                      <th className="px-4 py-3">제품명</th>
                      <th className="px-4 py-3">수량</th>
                      <th className="px-4 py-3">일련번호</th>
                      <th className="px-4 py-3">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {releaseList.map((r, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-4 py-3 font-black text-indigo-600">{r.brand}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{r.name}</td>
                        <td className="px-4 py-3 font-black">{r.quantity} EA</td>
                        <td className="px-4 py-3 font-mono font-black text-indigo-600">{r.serial || '-'}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleRemoveFromList(i)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg"><TrashIcon className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 bg-white text-slate-400 border border-slate-200 font-black rounded-2xl uppercase tracking-widest hover:bg-slate-100 transition-all">닫기</button>
          <button onClick={handleSubmit} className="flex-[2] py-4 bg-rose-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest hover:bg-rose-700 transition-all flex items-center justify-center gap-3">
            <ArrowDownIcon className="w-5 h-5" />
            출고 완료
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductReleaseModal;
