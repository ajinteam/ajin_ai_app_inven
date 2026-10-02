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

  // Filter out items with stock <= 0 (out of stock items are hidden)
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
      // 일련번호 없는 동일 품목 추가 시 수량 자동 합산
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

    // 추가 후 제품 선택창 자동 초기화 (빈 상태로 리셋)
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
      <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl w-full max-w-5xl animate-fade-in-up flex flex-col my-auto max-h-[96vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 sm:px-8 sm:py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 shrink-0">
          <div>
            <h2 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight uppercase">제품 출고 (BETA)</h2>
            <p className="text-[10px] sm:text-xs text-slate-400 font-bold">출고 정보 및 품목을 입력하고 하단 출고 완료를 클릭하세요.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer">
            <CloseIcon className="w-7 h-7 sm:w-8 sm:h-8" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-grow p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Top Section: Customer Info (Compact 3-column Grid) */}
          <div className="bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-100 space-y-3">
            <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-l-3 border-indigo-600 pl-2.5">
              1. 출고 기본 정보
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">출고 일자 *</label>
                <input 
                  type="date" 
                  value={releaseDate} 
                  onChange={e => setReleaseDate(e.target.value)} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400" 
                  required 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">대상자(고객명) *</label>
                <input 
                  value={customerInfo.name} 
                  onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="예: 홍길동" 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">아이디 (선택)</label>
                <input 
                  value={customerInfo.userId} 
                  onChange={e => setCustomerInfo({...customerInfo, userId: e.target.value})} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="예: AJIN01" 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">연락처 (선택)</label>
                <input 
                  value={customerInfo.phone} 
                  onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="예: 010-1234-5678" 
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">배송지 주소 (선택)</label>
                <input 
                  value={customerInfo.address} 
                  onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="예: 서울특별시 ..." 
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">전체 출고 비고 (선택)</label>
                <input 
                  value={customerInfo.remarks} 
                  onChange={e => setCustomerInfo({...customerInfo, remarks: e.target.value})} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="출고 전체 메모" 
                />
              </div>
            </div>
          </div>

          {/* Middle Section: Item Adding (Compact & Button fully visible at top) */}
          <div className="bg-slate-50/80 p-4 sm:p-5 rounded-2xl border-2 border-indigo-100 space-y-3 shadow-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest border-l-3 border-emerald-600 pl-2.5">
                2. 품목 추가
              </h3>
              {/* Brand Selector right in the header for space saving */}
              <div className="flex gap-1.5 p-1 bg-white rounded-xl border border-slate-200">
                {['GiL', 'KATO', 'TOMIX'].map(b => (
                  <button 
                    key={b} 
                    type="button" 
                    onClick={() => { setBrand(b as any); setSelectedProductId(''); }} 
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${brand === b ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Product Select (Span 2 columns) */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">제품 품목 선택</label>
                <select 
                  value={selectedProductId} 
                  onChange={e => setSelectedProductId(e.target.value)} 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 text-slate-800 cursor-pointer"
                >
                  <option value="">제품을 선택하세요</option>
                  {filteredProducts.length === 0 ? (
                    <option disabled value="">(재고 보유 품목 없음)</option>
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

              {/* Quantity */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">수량</label>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={e => setQuantity(e.target.value)} 
                  min="1" 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-black text-xs outline-none focus:border-indigo-400 text-slate-900" 
                />
              </div>

              {/* Serial */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">일련번호 (선택)</label>
                <input 
                  value={serial} 
                  onChange={e => setSerial(e.target.value.toUpperCase())} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-black text-xs text-indigo-600 outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="(선택)" 
                />
              </div>

              {/* Price Type (if product selected) */}
              {selectedProduct && (
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">단가 구분</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPriceType('general')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                        priceType === 'general'
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      일반{showPrice ? `: ${(selectedProduct.unitPrice || 0).toLocaleString()}원` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceType('agency')}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                        priceType === 'agency'
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      대리점용{showPrice ? `: ${(selectedProduct.agencyPrice || 0).toLocaleString()}원` : ''}
                    </button>
                  </div>
                </div>
              )}

              {/* Item Remarks */}
              <div className={selectedProduct ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-4"}>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">품목 비고</label>
                <input 
                  value={itemRemarks} 
                  onChange={e => setItemRemarks(e.target.value)} 
                  dir="ltr" 
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-400 placeholder:text-slate-300" 
                  placeholder="품목별 특이사항 (선택)" 
                />
              </div>
            </div>

            {/* Prominent Add Button - Always visible without scrolling */}
            <div className="pt-2 flex justify-end">
              <button 
                type="button"
                onClick={handleAddToList} 
                disabled={!selectedProductId}
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                <PlusIcon className="w-4 h-4" />
                <span>출고 대기목록에 추가</span>
              </button>
            </div>
          </div>

          {/* Bottom Section: Pending List Table */}
          {releaseList.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest border-l-3 border-slate-400 pl-2.5">
                  3. 출고 대기 목록 ({releaseList.length}건)
                </h3>
                <span className="text-xs font-black text-indigo-600">
                  총 수량: {releaseList.reduce((sum, r) => sum + r.quantity, 0).toLocaleString()} EA
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase">
                    <tr>
                      <th className="px-4 py-2.5">브랜드</th>
                      <th className="px-4 py-2.5">제품명</th>
                      <th className="px-4 py-2.5 text-right">수량</th>
                      <th className="px-4 py-2.5">{showPrice ? '단가' : '구분'}</th>
                      <th className="px-4 py-2.5">일련번호</th>
                      <th className="px-4 py-2.5">비고</th>
                      <th className="px-4 py-2.5 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {releaseList.map((r, i) => {
                      const productItem = items.find(it => it.id === r.itemId);
                      const productCode = productItem?.code;
                      return (
                        <tr key={i} className="bg-white hover:bg-indigo-50/20">
                          <td className="px-4 py-2.5 font-black text-indigo-600">{r.brand}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-700">
                            {productCode ? `[${productCode}] ` : ''}{r.name}
                          </td>
                          <td className="px-4 py-2.5 font-black text-slate-900 text-right">{r.quantity} EA</td>
                          <td className="px-4 py-2.5 font-bold">
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
                          <td className="px-4 py-2.5 font-mono font-black text-indigo-600">{r.serial || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-500 font-medium">{r.remarks || '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => handleRemoveFromList(i)} className="p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"><TrashIcon className="w-4 h-4" /></button>
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

        {/* Modal Footer with Action Buttons */}
        <div className="px-5 py-4 sm:px-8 sm:py-4 bg-slate-50 border-t border-slate-200 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-white text-slate-500 border border-slate-200 font-black rounded-xl uppercase tracking-widest hover:bg-slate-100 transition-all cursor-pointer text-xs sm:text-sm">닫기</button>
          <button onClick={handleSubmit} className="flex-[2] py-3 bg-rose-600 text-white font-black rounded-xl shadow-md uppercase tracking-widest hover:bg-rose-700 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm">
            <ArrowDownIcon className="w-4 h-4" />
            <span>출고 완료 ({releaseList.reduce((sum, r) => sum + r.quantity, 0)}건)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductReleaseModal;
