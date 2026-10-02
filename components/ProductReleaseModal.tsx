import React, { useState, useMemo, useEffect } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, PlusIcon, TrashIcon, ArrowDownIcon } from './icons';
import { calculateStock } from '../utils/stockUtils';

interface ProductReleaseModalProps {
  items: Item[];
  allUsedSerials: string[];
  onBatchRelease: (releases: { itemId: string, transaction: Omit<Transaction, 'id'> }[]) => void;
  onClose: () => void;
  showPrice?: boolean;
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
  if (endNum - startNum >= 1000) return [input.trim()];
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

const ProductReleaseModal: React.FC<ProductReleaseModalProps> = ({ items, allUsedSerials, onBatchRelease, onClose, showPrice = false }) => {
  // Master Customer Info
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    userId: '',
    phone: '',
    address: '',
    remarks: ''
  });

  const [releaseDate, setReleaseDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Current Selection
  const [brand, setBrand] = useState<'GiL' | 'KATO' | 'TOMIX'>('GiL');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [serial, setSerial] = useState('');
  const [itemRemarks, setItemRemarks] = useState('');

  // Pending List
  const [releaseList, setReleaseList] = useState<{ itemId: string, name: string, brand: string, quantity: number, serial: string, remarks: string, priceType?: 'general' | 'agency', unitPrice?: number }[]>([]);
  const [priceType, setPriceType] = useState<'general' | 'agency'>('general');

  // Point 1: Filter out items with stock <= 0 (out of stock items are hidden)
  const filteredProducts = useMemo(() => {
    return items
      .filter(i => i.type === 'product' && i.category === brand && calculateStock(i) > 0)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
  }, [items, brand]);

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
        // Silent catch
      }
    } else {
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

  const selectedProduct = useMemo(() => items.find(i => i.id === selectedProductId), [items, selectedProductId]);

  useEffect(() => {
    setPriceType('general');
  }, [selectedProductId]);

  const handleAddToList = () => {
    if (!selectedProductId) { alert('제품을 선택하세요.'); return; }
    
    const product = selectedProduct;
    if (!product) return;

    const trimmedSerial = serial.trim().toUpperCase();
    let targetSerials: string[] = [trimmedSerial];
    let isRange = false;
    
    if (trimmedSerial.includes('~')) {
      const parsedRange = parseSerialRange(trimmedSerial);
      if (parsedRange.length > 1) {
        targetSerials = parsedRange;
        isRange = true;
      }
    }

    const qty = isRange ? targetSerials.length : (parseInt(quantity, 10) || 0);
    if (qty <= 0) { alert('수량을 확인하세요.'); return; }

    // Check dupes in pending list and DB for serial numbers
    const usedSerialsInPending = releaseList.map(r => r.serial.toUpperCase());
    const duplicates = targetSerials.filter(s => !!s && (allUsedSerials.includes(s.toUpperCase()) || usedSerialsInPending.includes(s.toUpperCase())));
    if (duplicates.length > 0) { 
      alert(`중복된 일련번호가 존재합니다: ${duplicates.slice(0, 3).join(', ')}...`); 
      return; 
    }

    const currentPrice = priceType === 'general' ? (product.unitPrice || 0) : (product.agencyPrice || 0);

    if (isRange) {
      const newEntries = targetSerials.map(s => ({
        itemId: selectedProductId,
        name: product.name,
        brand: brand,
        quantity: 1,
        serial: s,
        remarks: itemRemarks,
        priceType: priceType,
        unitPrice: currentPrice
      }));
      setReleaseList(prev => [...prev, ...newEntries]);
    } else if (!trimmedSerial) {
      // Point 4: 일련번호 없는 동일 품목 추가 시 수량 자동 합산
      setReleaseList(prev => {
        const existingIndex = prev.findIndex(r => r.itemId === selectedProductId && r.priceType === priceType && !r.serial.trim());
        if (existingIndex >= 0) {
          return prev.map((r, idx) => {
            if (idx === existingIndex) {
              const mergedRemarks = [r.remarks, itemRemarks].filter(Boolean).join(' / ');
              return {
                ...r,
                quantity: r.quantity + qty,
                remarks: mergedRemarks
              };
            }
            return r;
          });
        } else {
          return [...prev, {
            itemId: selectedProductId,
            name: product.name,
            brand: brand,
            quantity: qty,
            serial: '',
            remarks: itemRemarks,
            priceType: priceType,
            unitPrice: currentPrice
          }];
        }
      });
    } else {
      setReleaseList(prev => [...prev, {
        itemId: selectedProductId,
        name: product.name,
        brand: brand,
        quantity: qty,
        serial: trimmedSerial,
        remarks: itemRemarks,
        priceType: priceType,
        unitPrice: currentPrice
      }]);
    }

    // Point 2: 추가 후 제품 선택창 자동 초기화 (빈 상태로 리셋)
    setSelectedProductId('');
    setSerial('');
    setQuantity('1');
    setItemRemarks('');
    setPriceType('general');
  };

  const handleRemoveFromList = (index: number) => {
    setReleaseList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (releaseList.length === 0) { alert('출고할 품목이 없습니다.'); return; }
    if (!customerInfo.name) { alert('대상자 이름을 입력하세요.'); return; }

    if (!confirm('출고 처리를 완료하시겠습니까?')) {
      return;
    }

    const getReleaseDateWithCurrentTime = () => {
      const d = new Date();
      const [yr, mo, dy] = releaseDate.split('-').map(Number);
      const dateObj = new Date(yr, mo - 1, dy, d.getHours(), d.getMinutes(), d.getSeconds());
      return dateObj.toISOString();
    };

    const payload = releaseList.map(r => {
      const prefix = customerInfo.remarks ? `[${customerInfo.remarks}] ` : "";
      const finalRemarks = `${prefix}${r.remarks}`.trim();

      return {
        itemId: r.itemId,
        transaction: {
          type: 'release' as const,
          quantity: r.quantity,
          date: getReleaseDateWithCurrentTime(),
          remarks: finalRemarks,
          serialNumber: r.serial,
          customerName: customerInfo.name,
          userId: customerInfo.userId,
          phoneNumber: customerInfo.phone,
          address: customerInfo.address,
          priceType: r.priceType,
          unitPrice: r.unitPrice
        }
      };
    });

    onBatchRelease(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl animate-fade-in-up flex flex-col my-auto max-h-[95vh] overflow-hidden">
        <div className="p-5 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight uppercase">제품 출고 (BETA)</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer">
            <CloseIcon className="w-8 h-8" />
          </button>
        </div>

        {/* Scrollable Container with adequate bottom padding */}
        <div className="flex-grow p-5 sm:p-8 overflow-y-auto space-y-8 pb-10">
          {/* Customer Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">제품출고 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-indigo-650 uppercase">출고 일자 *</label>
                <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} dir="ltr" className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-left text-start" required />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">대상자 *</label>
                <input value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} dir="ltr" className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" placeholder="대상자 이름" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">아이디</label>
                <input value={customerInfo.userId} onChange={e => setCustomerInfo({...customerInfo, userId: e.target.value})} dir="ltr" className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" placeholder="아이디" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">연락처</label>
                <input value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} dir="ltr" className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">주소</label>
                <input value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} dir="ltr" className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center md:col-span-2">
                <label className="sm:w-24 text-xs font-black text-slate-400 uppercase">비고</label>
                <input value={customerInfo.remarks} onChange={e => setCustomerInfo({...customerInfo, remarks: e.target.value})} dir="ltr" className="flex-grow px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Item Selector Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-l-4 border-emerald-600 pl-3">품목 추가</h3>
            <div className="bg-slate-50 p-5 sm:p-6 rounded-[1.5rem] border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <label className="w-24 text-xs font-black text-slate-400 uppercase">브랜드</label>
                <div className="flex gap-2 w-full">
                  {['GiL', 'KATO', 'TOMIX'].map(b => (
                    <button 
                      key={b} 
                      type="button" 
                      onClick={() => { setBrand(b as any); setSelectedProductId(''); }} 
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all cursor-pointer ${brand === b ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <label className="w-24 text-xs font-black text-slate-400 uppercase">제품품목</label>
                <select 
                  value={selectedProductId} 
                  onChange={e => setSelectedProductId(e.target.value)} 
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-slate-800 cursor-pointer"
                >
                  <option value="">제품을 선택하세요</option>
                  {filteredProducts.length === 0 ? (
                    <option disabled value="">(선택 가능한 재고 보유 품목이 없습니다)</option>
                  ) : (
                    filteredProducts.map(p => {
                      const stock = calculateStock(p);
                      return (
                        <option key={p.id} value={p.id}>[{p.code}] {p.name} (재고: {stock}EA)</option>
                      );
                    })
                  )}
                </select>
              </div>

              {selectedProduct && (
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center animate-fade-in">
                  <label className="w-24 text-xs font-black text-slate-400 uppercase">단가 구분</label>
                  <div className="flex gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setPriceType('general')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all cursor-pointer ${
                        priceType === 'general'
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                          : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      일반{showPrice ? `: ${(selectedProduct.unitPrice || 0).toLocaleString()}원` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceType('agency')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all cursor-pointer ${
                        priceType === 'agency'
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                          : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      대리점용{showPrice ? `: ${(selectedProduct.agencyPrice || 0).toLocaleString()}원` : ''}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <label className="w-24 text-xs font-black text-slate-400 uppercase">수량</label>
                  <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="1" dir="ltr" className="flex-grow px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black outline-none focus:border-indigo-400 text-left text-start" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-24 text-xs font-black text-slate-400 uppercase">일련번호</label>
                  <input value={serial} onChange={e => setSerial(e.target.value.toUpperCase())} dir="ltr" className="flex-grow px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-mono font-black text-indigo-600 outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" placeholder="(선택사항)" />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <label className="w-24 text-xs font-black text-slate-400 uppercase">비고</label>
                <input value={itemRemarks} onChange={e => setItemRemarks(e.target.value)} dir="ltr" className="flex-grow px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400 text-left text-start placeholder:text-left" placeholder="품목별 특이사항 (선택)" />
              </div>

              {/* Point 3: Dedicated, prominent button that is never clipped */}
              <div className="pt-2 flex justify-end">
                <button 
                  type="button"
                  onClick={handleAddToList} 
                  disabled={!selectedProductId}
                  className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>출고 대기목록에 추가</span>
                </button>
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
                      <th className="px-4 py-3">{showPrice ? '단가' : '구분'}</th>
                      <th className="px-4 py-3">일련번호</th>
                      <th className="px-4 py-3">비고</th>
                      <th className="px-4 py-3 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {releaseList.map((r, i) => {
                      const productItem = items.find(it => it.id === r.itemId);
                      const productCode = productItem?.code;
                      return (
                        <tr key={i} className="bg-white hover:bg-indigo-50/20">
                          <td className="px-4 py-3 font-black text-indigo-600">{r.brand}</td>
                          <td className="px-4 py-3 font-bold text-slate-700">
                            {productCode ? `[${productCode}] ` : ''}{r.name}
                          </td>
                          <td className="px-4 py-3 font-black text-slate-900">{r.quantity} EA</td>
                          <td className="px-4 py-3 font-bold">
                            <div className="flex flex-col">
                              {showPrice ? (
                                <>
                                  <span className="text-slate-700">{(r.unitPrice || 0).toLocaleString()}원</span>
                                  <span className="text-[9px] text-slate-400">({r.priceType === 'agency' ? '대리점' : '일반'})</span>
                                </>
                              ) : (
                                <span className="text-slate-700">{r.priceType === 'agency' ? '대리점용' : '일반'}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-black text-indigo-600">{r.serial || '-'}</td>
                          <td className="px-4 py-3 text-slate-500 font-medium">{r.remarks || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleRemoveFromList(i)} className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"><TrashIcon className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 py-3.5 bg-white text-slate-400 border border-slate-200 font-black rounded-xl uppercase tracking-widest hover:bg-slate-100 transition-all cursor-pointer">닫기</button>
          <button onClick={handleSubmit} className="flex-[2] py-3.5 bg-rose-600 text-white font-black rounded-xl shadow-lg uppercase tracking-widest hover:bg-rose-700 transition-all flex items-center justify-center gap-2 cursor-pointer">
            <ArrowDownIcon className="w-5 h-5" />
            <span>출고 완료</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductReleaseModal;
