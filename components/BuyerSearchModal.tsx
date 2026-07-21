
import React, { useState, useMemo, useEffect } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, SearchIcon, DownloadIcon } from './icons';

interface BuyerSearchModalProps {
  items: Item[];
  onClose: () => void;
  showPrice?: boolean;
}

const BuyerSearchModal: React.FC<BuyerSearchModalProps> = ({ items, onClose, showPrice = false }) => {
  const [nameTerm, setNameTerm] = useState('');
  const [dateTerm, setDateTerm] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped' | 'byCode'>('flat');
  const [selectedGroupDate, setSelectedGroupDate] = useState('');
  const [selectedGroupCode, setSelectedGroupCode] = useState('');

  // Reset filter when switching modes
  useEffect(() => {
    setSelectedGroupDate('');
    setSelectedGroupCode('');
  }, [viewMode]);

  // Extract all release transactions from all products
  const allReleases = useMemo(() => {
    const releases: (Transaction & { itemName: string, itemBrand: string, itemCode: string, unitPrice: number })[] = [];
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (t.type === 'release' && !t.isDiscarded && !t.isReturned) {
          const cust = (t.customerName || '').trim();
          if (cust === '대천' || cust === '대천공장' || cust === '대천AS' || cust === '대천폐기') {
            return;
          }
          releases.push({
            ...t,
            itemName: item.name,
            itemBrand: item.category || '-',
            itemCode: item.code || '',
            unitPrice: (t.unitPrice !== undefined && t.unitPrice !== 0) ? t.unitPrice : (t.priceType === 'agency' ? (item.agencyPrice || item.unitPrice || 0) : (item.unitPrice || 0))
          });
        }
      });
    });
    // Sort by date descending
    return releases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [items]);

  // Filter based on user input
  const filteredReleases = useMemo(() => {
    const nameMatch = nameTerm.toLowerCase().trim();
    const dateMatch = dateTerm.trim(); // YYYY-MM-DD

    return allReleases.filter(r => {
      const matchesName = nameMatch === '' || 
        r.customerName?.toLowerCase().includes(nameMatch) || 
        r.userId?.toLowerCase().includes(nameMatch);
      
      let matchesDate = true;
      if (dateMatch !== '') {
        const dateObj = new Date(r.date);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const localDateStr = isNaN(yyyy) ? r.date.split('T')[0] : `${yyyy}-${mm}-${dd}`;
        matchesDate = localDateStr.startsWith(dateMatch);
      }

      return matchesName && matchesDate;
    });
  }, [allReleases, nameTerm, dateTerm]);

  const totalSalesAmount = useMemo(() => {
    return filteredReleases.reduce((sum, r) => {
      return sum + (r.quantity * (r.unitPrice || 0));
    }, 0);
  }, [filteredReleases]);

  const groupedByDate = useMemo(() => {
    const groups: { [dateStr: string]: typeof filteredReleases } = {};
    filteredReleases.forEach(r => {
      const dateObj = new Date(r.date);
      let yyyy = dateObj.getFullYear();
      let mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      let dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = isNaN(yyyy) ? r.date.split('T')[0] : `${yyyy}-${mm}-${dd}`;
      
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(r);
    });
    
    return Object.entries(groups)
      .map(([date, list]) => {
        const amount = list.reduce((sum, r) => sum + (r.quantity * (r.unitPrice || 0)), 0);
        const qty = list.reduce((sum, r) => sum + r.quantity, 0);
        return { date, list, amount, qty };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredReleases]);

  const groupedByCode = useMemo(() => {
    const groups: { [codeStr: string]: typeof filteredReleases } = {};
    filteredReleases.forEach(r => {
      const codeStr = r.itemCode || 'UNKNOWN';
      if (!groups[codeStr]) {
        groups[codeStr] = [];
      }
      groups[codeStr].push(r);
    });
    
    return Object.entries(groups)
      .map(([code, list]) => {
        const amount = list.reduce((sum, r) => sum + (r.quantity * (r.unitPrice || 0)), 0);
        const qty = list.reduce((sum, r) => sum + r.quantity, 0);
        const name = list[0]?.itemName || '';
        const brand = list[0]?.itemBrand || '-';
        return { code, name, brand, list, amount, qty };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [filteredReleases]);

  const handleExport = () => {
    if (filteredReleases.length === 0) return;
    let csvContent = "\ufeff";
    const headers = ['날짜', '브랜드', '제품명', '일련번호', '수량', '대상자', '아이디', '연락처', '주소', '비고'];
    csvContent += headers.join(',') + '\r\n';
    
    filteredReleases.forEach(r => {
      const row = [
        new Date(r.date).toLocaleDateString(),
        r.itemBrand,
        r.itemName,
        r.serialNumber || '-',
        r.quantity,
        r.customerName || '-',
        r.userId || '-',
        r.phoneNumber || '-',
        r.address || '-',
        r.remarks || '-'
      ];
      csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `판매검색결과_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex justify-center items-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-[3rem] shadow-2xl w-full max-w-[95vw] lg:max-w-[90vw] xl:max-w-[1500px] animate-fade-in-up flex flex-col h-full max-h-[92vh] overflow-y-auto lg:overflow-hidden">
        <div className="p-6 sm:p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
              <SearchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
              구매자 및 매출 검색
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">이름, 아이디 또는 날짜로 모든 판매 내역을 조회합니다.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors">
            <CloseIcon className="w-8 h-8 sm:w-10 sm:h-10" />
          </button>
        </div>

        <div className="p-6 sm:p-10 bg-white border-b border-slate-100 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">구매자 이름 / 아이디 검색</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4"><SearchIcon className="w-5 h-5 text-slate-300" /></span>
                <input 
                  type="text" 
                  value={nameTerm} 
                  onChange={e => setNameTerm(e.target.value)} 
                  placeholder="예: 홍길동, AJIN01" 
                  className="w-full pl-12 pr-4 py-3 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-400 outline-none font-bold text-base sm:text-lg transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">날짜별 검색</label>
              <input 
                type="date" 
                value={dateTerm} 
                onChange={e => setDateTerm(e.target.value)} 
                className="w-full px-4 py-3 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-400 outline-none font-bold text-base sm:text-lg transition-all"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
                검색 결과: <span className="text-indigo-600">{filteredReleases.length}</span> 건
              </p>
              {showPrice && (
                <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest border-l border-slate-200 pl-4">
                  총 구매 금액: <span className="text-emerald-600 font-extrabold text-sm sm:text-base">{totalSalesAmount.toLocaleString()}원</span>
                </p>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-black">
                <button
                  type="button"
                  onClick={() => setViewMode('flat')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'flat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  전체 리스트
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grouped')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'grouped' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  날짜별 그룹화
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('byCode')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === 'byCode' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  코드별 그룹화
                </button>
              </div>
              <button 
                onClick={handleExport}
                disabled={filteredReleases.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-xl text-xs font-black hover:bg-emerald-600 hover:text-white transition-all uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DownloadIcon className="w-4 h-4" />
                결과 엑셀 저장
              </button>
            </div>
          </div>

          {viewMode !== 'flat' && (
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-fade-in bg-slate-50/50 p-4 rounded-2xl border-2 border-indigo-50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="self-start sm:self-auto px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black uppercase tracking-wider">
                  {viewMode === 'grouped' ? '날짜 필터' : '제품코드 필터'}
                </span>
                <p className="text-xs font-bold text-slate-500">
                  {viewMode === 'grouped' ? '원하는 날짜만 선택하여 빠르게 확인하세요.' : '원하는 제품코드만 선택하여 빠르게 확인하세요.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {viewMode === 'grouped' ? (
                  <select
                    value={selectedGroupDate}
                    onChange={e => setSelectedGroupDate(e.target.value)}
                    className="flex-grow sm:flex-initial w-full sm:w-[280px] px-3 py-2 text-xs bg-white border-2 border-indigo-200 focus:border-indigo-400 rounded-xl font-bold outline-none shadow-sm transition-all text-slate-700"
                  >
                    <option value="">📅 전체 날짜 ({groupedByDate.length}개 그룹)</option>
                    {groupedByDate.map(g => (
                      <option key={g.date} value={g.date}>
                        {g.date} ({g.list.length}건 / {g.qty.toLocaleString()} EA)
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedGroupCode}
                    onChange={e => setSelectedGroupCode(e.target.value)}
                    className="flex-grow sm:flex-initial w-full sm:w-[350px] px-3 py-2 text-xs bg-white border-2 border-indigo-200 focus:border-indigo-400 rounded-xl font-bold outline-none shadow-sm transition-all text-slate-700"
                  >
                    <option value="">📦 전체 제품코드 ({groupedByCode.length}개 그룹)</option>
                    {groupedByCode.map(g => (
                      <option key={g.code} value={g.code}>
                        [{g.code}] {g.name.slice(0, 25)}{g.name.length > 25 ? '...' : ''} ({g.list.length}건)
                      </option>
                    ))}
                  </select>
                )}
                {((viewMode === 'grouped' && selectedGroupDate) || (viewMode === 'byCode' && selectedGroupCode)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupDate('');
                      setSelectedGroupCode('');
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shrink-0"
                  >
                    전체보기
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-grow lg:overflow-hidden bg-slate-50/50">
          <div className="p-6 sm:p-10 scrollbar-hide lg:h-full lg:overflow-y-auto">
            {filteredReleases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 opacity-20">
                <SearchIcon className="w-20 h-20 sm:w-32 sm:h-32 mb-6" />
                <p className="text-xl sm:text-3xl font-black uppercase tracking-widest text-center">조건에 맞는 결과가 없습니다</p>
              </div>
            ) : viewMode === 'flat' ? (
              <div className="space-y-4">
                {/* Mobile Flat Card List */}
                <div className="space-y-4 lg:hidden">
                  {filteredReleases.map((r, i) => (
                    <div key={r.id || i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-md space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-wider border border-indigo-100">
                            {r.itemBrand}
                          </span>
                          <h4 className="font-black text-slate-800 text-sm mt-1.5 leading-snug">{r.itemName}</h4>
                          <p className="text-[9px] font-mono text-slate-400 font-bold mt-0.5">{r.itemCode || ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-mono font-bold text-slate-400 block">
                            {new Date(r.date).toLocaleDateString()}
                          </span>
                          {r.serialNumber && (
                            <span className="font-mono font-black text-[10px] text-indigo-600 block mt-1">
                              # {r.serialNumber}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-50 text-xs">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">구매자 (대상)</span>
                          <span className="font-black text-slate-800">
                            {r.customerName || '-'}
                            {r.userId && (
                              <span className="ml-1 bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">
                                {r.userId}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">수량</span>
                          <span className="font-black text-slate-900 text-sm">
                            {r.quantity.toLocaleString()} EA
                          </span>
                        </div>
                      </div>

                      {showPrice && (
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-50 text-xs">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">단가</span>
                            <span className="font-black text-slate-700">
                              {(r.unitPrice || 0).toLocaleString()} 원
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">총액</span>
                            <span className="font-black text-emerald-600 text-sm">
                              {(r.quantity * (r.unitPrice || 0)).toLocaleString()} 원
                            </span>
                          </div>
                        </div>
                      )}

                      {r.remarks && (
                        <div className="pt-2 border-t border-slate-50 text-[10px] text-slate-450 font-bold">
                          <span className="text-[8px] text-slate-300 block uppercase tracking-wider">비고</span>
                          <p className="mt-0.5 italic">{r.remarks}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Flat Table */}
                <div className="hidden lg:block bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-5">날짜</th>
                          <th className="px-6 py-5">브랜드</th>
                          <th className="px-6 py-5">제품명</th>
                          <th className="px-6 py-5">일련번호</th>
                          {showPrice && <th className="px-6 py-5 text-right">단가</th>}
                          {showPrice && <th className="px-6 py-5 text-right">금액</th>}
                          <th className="px-6 py-5 text-right">수량</th>
                          <th className="px-6 py-5">대상자 / 아이디</th>
                          <th className="px-6 py-5">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredReleases.map((r, i) => (
                          <tr key={r.id || i} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-6 font-bold text-slate-500">{new Date(r.date).toLocaleDateString()}</td>
                            <td className="px-6 py-6 font-black text-indigo-600 uppercase">{r.itemBrand}</td>
                            <td className="px-6 py-6 font-black text-slate-800">{r.itemName}</td>
                            <td className="px-6 py-6 font-mono font-black text-indigo-400">{r.serialNumber || '-'}</td>
                            {showPrice && (
                              <td className="px-6 py-6 text-right font-bold text-slate-500">
                                {(r.unitPrice || 0).toLocaleString()}원
                              </td>
                            )}
                            {showPrice && (
                              <td className="px-6 py-6 text-right font-extrabold text-emerald-600">
                                {(r.quantity * (r.unitPrice || 0)).toLocaleString()}원
                              </td>
                            )}
                            <td className="px-6 py-6 font-black text-lg text-right">{r.quantity} EA</td>
                            <td className="px-6 py-6">
                              <p className="font-black text-slate-900">{r.customerName || '-'}</p>
                              {r.userId && <span className="bg-slate-100 text-slate-400 text-[9px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                            </td>
                            <td className="px-6 py-6 text-[10px] text-slate-400 font-bold max-w-[200px] truncate" title={r.remarks}>{r.remarks || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : viewMode === 'grouped' ? (
              <div className="space-y-6">
                {groupedByDate
                  .filter(group => !selectedGroupDate || group.date === selectedGroupDate)
                  .map((group) => (
                  <div key={group.date} className="bg-white border border-slate-100 rounded-[1.5rem] p-5 sm:p-6 shadow-md space-y-4">
                    {/* Group Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl font-mono font-black text-xs sm:text-sm">
                          📅 {group.date}
                        </span>
                        <span className="text-slate-400 text-xs font-bold">
                          ({group.list.length}건, 총 {group.qty.toLocaleString()} EA)
                        </span>
                      </div>
                      {showPrice && (
                        <div className="text-sm font-black">
                          <span className="text-slate-400 text-xs uppercase mr-2">구매 금액:</span>
                          <span className="text-emerald-600 text-base font-extrabold">{group.amount.toLocaleString()}원</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Mobile Card List (Grouped by Date) */}
                    <div className="space-y-3 lg:hidden">
                      {group.list.map((r, idx) => (
                        <div key={r.id || idx} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase tracking-wider border border-indigo-100">
                                {r.itemBrand}
                              </span>
                              <h5 className="font-black text-slate-800 text-xs mt-1.5 leading-snug">{r.itemName}</h5>
                            </div>
                            <div className="text-right shrink-0">
                              {r.serialNumber && (
                                <span className="font-mono font-black text-[9px] text-indigo-500 block">
                                  # {r.serialNumber}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100/60 text-xs">
                            <div>
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">대상자/아이디</span>
                              <span className="font-black text-slate-700">
                                {r.customerName || '-'}
                                {r.userId && <span className="ml-1 bg-slate-100 text-slate-450 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">수량</span>
                              <span className="font-black text-slate-900">{r.quantity.toLocaleString()} EA</span>
                            </div>
                          </div>

                          {showPrice && (
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100/60 text-xs">
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">단가</span>
                                <span className="font-black text-slate-600">{(r.unitPrice || 0).toLocaleString()}원</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">금액</span>
                                <span className="font-extrabold text-emerald-600">{(r.quantity * (r.unitPrice || 0)).toLocaleString()}원</span>
                              </div>
                            </div>
                          )}

                          {r.remarks && (
                            <div className="pt-2 border-t border-slate-100/60 text-[9px] text-slate-400">
                              <span className="text-[8px] text-slate-300 block uppercase tracking-wider">비고</span>
                              <p className="italic mt-0.5">{r.remarks}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Group Table (Desktop) */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">브랜드</th>
                            <th className="px-4 py-3">제품명</th>
                            <th className="px-4 py-3">일련번호</th>
                            {showPrice && <th className="px-4 py-3 text-right">단가</th>}
                            {showPrice && <th className="px-4 py-3 text-right">금액</th>}
                            <th className="px-4 py-3 text-right">수량</th>
                            <th className="px-4 py-3">대상자 / 아이디</th>
                            <th className="px-4 py-3">비고</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.list.map((r, idx) => (
                            <tr key={r.id || idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-black text-indigo-600 uppercase">{r.itemBrand}</td>
                              <td className="px-4 py-3 font-black text-slate-800">{r.itemName}</td>
                              <td className="px-4 py-3 font-mono font-black text-indigo-400">{r.serialNumber || '-'}</td>
                              {showPrice && (
                                <td className="px-4 py-3 text-right text-slate-500 font-bold">
                                  {(r.unitPrice || 0).toLocaleString()}원
                                </td>
                              )}
                              {showPrice && (
                                <td className="px-4 py-3 text-right text-emerald-600 font-black">
                                  {(r.quantity * (r.unitPrice || 0)).toLocaleString()}원
                                </td>
                              )}
                              <td className="px-4 py-3 text-right font-black text-slate-900">{r.quantity} EA</td>
                              <td className="px-4 py-3">
                                <p className="font-black text-slate-900 text-xs">{r.customerName || '-'}</p>
                                {r.userId && <span className="bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-400 font-medium max-w-[150px] truncate" title={r.remarks}>{r.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedByCode
                  .filter(group => !selectedGroupCode || group.code === selectedGroupCode)
                  .map((group) => (
                  <div key={group.code} className="bg-white border border-slate-100 rounded-[1.5rem] p-5 sm:p-6 shadow-md space-y-4">
                    {/* Group Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl font-mono font-black text-xs sm:text-sm">
                          [{group.code}] {group.name}
                        </span>
                        <span className="text-slate-400 text-xs font-bold">
                          ({group.brand}, {group.list.length}건, 총 {group.qty.toLocaleString()} EA)
                        </span>
                      </div>
                      {showPrice && (
                        <div className="text-sm font-black">
                          <span className="text-slate-400 text-xs uppercase mr-2">매출 금액:</span>
                          <span className="text-emerald-600 text-base font-extrabold">{group.amount.toLocaleString()}원</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Mobile Card List (Grouped by Code) */}
                    <div className="space-y-3 lg:hidden">
                      {group.list.map((r, idx) => (
                        <div key={r.id || idx} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-slate-500 text-[11px]">
                              📅 {new Date(r.date).toLocaleDateString()}
                            </span>
                            <div className="text-right shrink-0">
                              {r.serialNumber && (
                                <span className="font-mono font-black text-[9px] text-indigo-500 block">
                                  # {r.serialNumber}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100/60 text-xs">
                            <div>
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">대상자/아이디</span>
                              <span className="font-black text-slate-700">
                                {r.customerName || '-'}
                                {r.userId && <span className="ml-1 bg-slate-100 text-slate-450 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">수량</span>
                              <span className="font-black text-slate-900">{r.quantity.toLocaleString()} EA</span>
                            </div>
                          </div>

                          {showPrice && (
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100/60 text-xs">
                              <div>
                                <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">단가</span>
                                <span className="font-black text-slate-600">{(r.unitPrice || 0).toLocaleString()}원</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider">금액</span>
                                <span className="font-extrabold text-emerald-600">{(r.quantity * (r.unitPrice || 0)).toLocaleString()}원</span>
                              </div>
                            </div>
                          )}

                          {r.remarks && (
                            <div className="pt-2 border-t border-slate-100/60 text-[9px] text-slate-400">
                              <span className="text-[8px] text-slate-300 block uppercase tracking-wider">비고</span>
                              <p className="italic mt-0.5">{r.remarks}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Group Table (Desktop) */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">날짜</th>
                            <th className="px-4 py-3">일련번호</th>
                            {showPrice && <th className="px-4 py-3 text-right">단가</th>}
                            {showPrice && <th className="px-4 py-3 text-right">금액</th>}
                            <th className="px-4 py-3 text-right">수량</th>
                            <th className="px-4 py-3">대상자 / 아이디</th>
                            <th className="px-4 py-3">비고</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.list.map((r, idx) => (
                            <tr key={r.id || idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-500">{new Date(r.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-mono font-black text-indigo-400">{r.serialNumber || '-'}</td>
                              {showPrice && (
                                <td className="px-4 py-3 text-right text-slate-500 font-bold">
                                  {(r.unitPrice || 0).toLocaleString()}원
                                </td>
                              )}
                              {showPrice && (
                                <td className="px-4 py-3 text-right text-emerald-600 font-black">
                                  {(r.quantity * (r.unitPrice || 0)).toLocaleString()}원
                                </td>
                              )}
                              <td className="px-4 py-3 text-right font-black text-slate-900">{r.quantity} EA</td>
                              <td className="px-4 py-3">
                                <p className="font-black text-slate-900 text-xs">{r.customerName || '-'}</p>
                                {r.userId && <span className="bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-400 font-medium max-w-[150px] truncate" title={r.remarks}>{r.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyerSearchModal;
