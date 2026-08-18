import React, { useState, useMemo } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, DownloadIcon } from './icons';

interface DateSalesSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate: string;
  items: Item[];
  showPrice?: boolean;
}

export default function DateSalesSearchModal({
  isOpen,
  onClose,
  initialDate,
  items,
  showPrice = false,
}: DateSalesSearchModalProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [activeBrand, setActiveBrand] = useState<'ALL' | 'GiL' | 'KATO' | 'TOMIX'>('ALL');
  const [selectedBuyerFilter, setSelectedBuyerFilter] = useState<string>('ALL');

  // Parse transaction date to local YYYY-MM-DD
  const getLocalDateString = (isoOrStr: string) => {
    if (!isoOrStr) return '';
    try {
      if (isoOrStr.includes('T')) {
        const date = new Date(isoOrStr);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      const match = isoOrStr.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
      return isoOrStr;
    } catch (e) {
      return isoOrStr;
    }
  };

  const getTransactionPrice = (t: Transaction, item: Item) => {
    if (t.unitPrice !== undefined && t.unitPrice !== 0) {
      return t.unitPrice;
    }
    if (t.priceType === 'agency') {
      return item.agencyPrice || item.unitPrice || 0;
    }
    return item.unitPrice || 0;
  };

  // Get all release (sale) transactions matching the date
  const salesOnDate = useMemo(() => {
    const list: { item: Item; transaction: Transaction }[] = [];
    if (!selectedDate) return list;

    items.forEach((item) => {
      // Must be a product
      if (item.type !== 'product') return;

      item.transactions.forEach((t) => {
        // Sold transaction: type === 'release', not discarded, and not returned
        if (t.type === 'release' && !t.isDiscarded && !t.isReturned) {
          const cust = (t.customerName || '').trim();
          if (cust === '대천' || cust === '대천공장' || cust === '대천AS' || cust === '대천폐기') {
            return;
          }
          const transDate = getLocalDateString(t.date);
          if (transDate === selectedDate) {
            list.push({ item, transaction: t });
          }
        }
      });
    });

    // Sort by transaction date/time
    return list.sort((a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime());
  }, [items, selectedDate]);

  // Filter by active brand/category and selected buyer
  const filteredSales = useMemo(() => {
    let list = salesOnDate;
    if (activeBrand !== 'ALL') {
      list = list.filter(
        (sale) => sale.item.category?.toUpperCase() === activeBrand.toUpperCase()
      );
    }
    if (selectedBuyerFilter !== 'ALL') {
      list = list.filter(
        (sale) => sale.transaction.customerName?.trim() === selectedBuyerFilter
      );
    }
    return list;
  }, [salesOnDate, activeBrand, selectedBuyerFilter]);

  // List all unique buyers for the brand under selected date (before applying buyer filter itself)
  const allBuyers = useMemo(() => {
    const baseList = activeBrand === 'ALL'
      ? salesOnDate
      : salesOnDate.filter(
          (sale) => sale.item.category?.toUpperCase() === activeBrand.toUpperCase()
        );
    const buyers = baseList
      .map((s) => s.transaction.customerName?.trim())
      .filter(Boolean) as string[];
    return Array.from(new Set(buyers)).sort();
  }, [salesOnDate, activeBrand]);

  const uniqueBuyersCount = useMemo(() => {
    const names = filteredSales
      .map((s) => s.transaction.customerName?.trim())
      .filter(Boolean);
    return new Set(names).size;
  }, [filteredSales]);

  const codeSalesData = useMemo(() => {
    const map: { [code: string]: { qty: number; amount: number } } = {};
    filteredSales.forEach(({ item, transaction }) => {
      const code = item.code || 'UNKNOWN';
      const price = getTransactionPrice(transaction, item);
      if (!map[code]) {
        map[code] = { qty: 0, amount: 0 };
      }
      map[code].qty += transaction.quantity;
      map[code].amount += transaction.quantity * price;
    });
    return Object.entries(map)
      .map(([code, data]) => ({ code, qty: data.qty, amount: data.amount }))
      .sort((a, b) => b.qty - a.qty);
  }, [filteredSales]);

  const totalSalesAmountOnDate = useMemo(() => {
    return salesOnDate.reduce((sum, s) => {
      const price = getTransactionPrice(s.transaction, s.item);
      return sum + (s.transaction.quantity * price);
    }, 0);
  }, [salesOnDate]);

  const filteredSalesAmount = useMemo(() => {
    return filteredSales.reduce((sum, s) => {
      const price = getTransactionPrice(s.transaction, s.item);
      return sum + (s.transaction.quantity * price);
    }, 0);
  }, [filteredSales]);

  const totalQuantity = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.transaction.quantity, 0);
  }, [filteredSales]);

  // Export to Excel (CSV with BOM)
  const handleExportExcel = () => {
    let csvContent = "\ufeff";
    const headers = ['날짜', '브랜드', '품번', '제품명', '일련번호', '구매자', '수량'];
    csvContent += headers.join(',') + '\r\n';

    filteredSales.forEach(({ item, transaction }) => {
      const formattedDate = getLocalDateString(transaction.date);
      const row = [
        formattedDate,
        item.category || '-',
        item.code,
        item.name,
        transaction.serialNumber || '-',
        transaction.customerName || '-',
        transaction.quantity
      ];
      csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });

    const filename = `판매내역_${selectedDate}_${activeBrand === 'ALL' ? '전체' : activeBrand}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-2 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl w-full max-w-[95vw] lg:max-w-[90vw] xl:max-w-[1500px] flex flex-col h-full max-h-[92vh] overflow-y-auto md:overflow-hidden border border-slate-100 animate-fade-in-up">
        {/* Header */}
        <div className="px-6 sm:px-10 py-5 sm:py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </span>
            <div>
              <h3 className="text-base sm:text-xl font-black text-slate-800 tracking-tight">날짜별 제품 판매 조회</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Sales Lookup by Date</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Filters and Inputs */}
        <div className="p-6 sm:p-10 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            <label className="text-xs sm:text-sm font-black text-slate-500 uppercase tracking-widest">조회 날짜 선택</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-indigo-400 font-bold text-sm bg-white shadow-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'GiL', 'KATO', 'TOMIX'].map((brand) => (
              <button
                key={brand}
                onClick={() => setActiveBrand(brand as any)}
                className={`px-4 sm:px-6 py-2 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest border-2 transition-all shadow-sm ${
                  activeBrand === brand
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'
                }`}
              >
                {brand === 'ALL' ? '전체 브랜드' : brand}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-grow md:overflow-hidden flex flex-col p-4 sm:p-10 bg-slate-50/30">
          {/* Summary */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-wrap items-center gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              <div className="pr-4">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">조회 일자</span>
                <p className="text-sm sm:text-lg font-black text-slate-700">{selectedDate || '미지정'}</p>
              </div>
              <div className="sm:pl-4 pr-4">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">브랜드 필터</span>
                <p className="text-sm sm:text-lg font-black text-slate-700">{activeBrand === 'ALL' ? '전체' : activeBrand}</p>
              </div>
              <div className="sm:pl-4 pt-2 sm:pt-0">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">총 판매 수량</span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm sm:text-lg font-black text-indigo-600 whitespace-nowrap">
                    {totalQuantity.toLocaleString()} EA ({uniqueBuyersCount}명)
                  </p>
                  {codeSalesData.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center ml-2 border-l border-slate-200 pl-3">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{showPrice ? '코드별 판매 내역:' : '코드별 수량:'}</span>
                      <div className="flex flex-wrap gap-1">
                        {codeSalesData.map(({ code, qty, amount }) => (
                          <span key={code} className="inline-flex items-center px-2 py-0.5 bg-slate-50 border border-slate-100 text-slate-700 rounded text-[9px] font-black">
                            <span className="text-indigo-600 mr-1">{code}</span>
                            <span>{qty}EA{showPrice ? ` (${amount.toLocaleString()}원)` : ''}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {showPrice && (
                <>
                  <div className="sm:pl-4 pt-2 sm:pt-0">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">날짜별 총 판매금액</span>
                    <p className="text-sm sm:text-lg font-black text-emerald-600 whitespace-nowrap">
                      {totalSalesAmountOnDate.toLocaleString()} 원
                    </p>
                  </div>
                  <div className="sm:pl-4 pt-2 sm:pt-0">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">필터/구매자 판매금액</span>
                    <p className="text-sm sm:text-lg font-black text-sky-600 whitespace-nowrap">
                      {filteredSalesAmount.toLocaleString()} 원
                    </p>
                  </div>
                </>
              )}
            </div>

            {filteredSales.length > 0 && (
              <button
                onClick={handleExportExcel}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-black rounded-xl shadow-md hover:bg-emerald-700 text-xs sm:text-sm uppercase tracking-widest transition-all shrink-0 w-full sm:w-auto"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>엑셀 파일 저장</span>
              </button>
            )}
          </div>

          {/* Active Filters Info */}
          {selectedBuyerFilter !== 'ALL' && (
            <div className="mb-4 flex items-center gap-2 bg-indigo-50 border border-indigo-100/50 px-4 py-2 rounded-xl animate-fade-in">
              <span className="text-xs font-black text-indigo-800 flex items-center gap-1.5">
                👤 {selectedBuyerFilter} 구매자의 내역만 조회 중입니다.
              </span>
              <button
                onClick={() => setSelectedBuyerFilter('ALL')}
                className="ml-auto text-[10px] font-black text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2 py-1 rounded-md transition-all shadow-sm"
              >
                필터 해제 (전체 보기)
              </button>
            </div>
          )}

          {/* Mobile List View (only on small screens) */}
          <div className="block md:hidden space-y-3 pr-1">
            {filteredSales.length === 0 ? (
              <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest italic text-sm">
                해당 조건의 판매 데이터가 존재하지 않습니다
              </div>
            ) : (
              filteredSales.map(({ item, transaction }) => (
                <div key={transaction.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-wider border border-indigo-100">
                        {item.category || '-'}
                      </span>
                      <div className="flex flex-col mt-1.5">
                        {item.code && (
                          <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded w-fit mb-1 border border-indigo-100">
                            [{item.code}]
                          </span>
                        )}
                        <p className="font-black text-slate-800 text-xs sm:text-sm leading-snug">{item.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono font-bold text-slate-400 block">
                        {getLocalDateString(transaction.date)}
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5">
                        {new Date(transaction.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2.5 border-t border-slate-50 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">일련번호</span>
                      <span className="font-mono font-black text-indigo-600">
                        {transaction.originalSerialNumber && (
                          <span className="text-[9px] text-rose-500 line-through font-mono font-bold decoration-rose-500 decoration-1 block mb-0.5">{transaction.originalSerialNumber}</span>
                        )}
                        <span>{transaction.serialNumber || '-'}</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">수량</span>
                      <span className="font-black text-slate-800 text-sm">
                        {transaction.quantity.toLocaleString()} EA
                      </span>
                    </div>
                  </div>

                  {showPrice && (
                    <div className="grid grid-cols-2 gap-4 pt-2.5 border-t border-slate-50 text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">단가</span>
                        <span className="font-black text-slate-700">
                          {getTransactionPrice(transaction, item).toLocaleString()} 원
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">금액</span>
                        <span className="font-black text-emerald-600">
                          {(transaction.quantity * getTransactionPrice(transaction, item)).toLocaleString()} 원
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2.5 border-t border-slate-50 flex items-center justify-between text-xs">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">구매자 (대상)</span>
                    {transaction.customerName ? (
                      <div className="flex flex-col items-end">
                        {transaction.originalCustomerName && (
                          <span className="text-[9px] text-rose-500 line-through font-bold decoration-rose-500 decoration-1 block mb-1" title={`이전 구매자: ${transaction.originalCustomerName}`}>(이전: {transaction.originalCustomerName})</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedBuyerFilter(transaction.customerName?.trim() || 'ALL')}
                          className="hover:text-indigo-600 hover:underline cursor-pointer transition-all flex items-center gap-1.5 group/btn bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-100 px-2 py-1 rounded-lg"
                        >
                          <span className="font-extrabold text-slate-700">{transaction.customerName}</span>
                          <span className="text-[8px] text-indigo-600 font-black bg-white px-1 py-0.5 rounded border border-slate-100/50">
                            필터 [A]
                          </span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-bold">-</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Table Container (Large Screens) */}
          <div className="hidden md:flex flex-col flex-grow border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto overflow-y-auto flex-grow scrollbar-hide">
              <table className="w-full text-left min-w-[700px] border-collapse">
                <thead className="text-[10px] sm:text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-black tracking-wider sm:tracking-[0.15em] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4">판매 날짜 / 시간</th>
                    <th className="px-6 py-4">브랜드</th>
                    <th className="px-6 py-4">품명 (제품명)</th>
                    <th className="px-6 py-4">일련번호</th>
                    <th className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span>구매자 (대상)</span>
                        <select
                          value={selectedBuyerFilter}
                          onChange={(e) => setSelectedBuyerFilter(e.target.value)}
                          className="px-2 py-1 border-2 border-slate-200/80 bg-white text-slate-700 rounded-lg text-[10px] font-black tracking-normal uppercase focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[130px] truncate shadow-sm transition-all hover:border-indigo-300"
                        >
                          <option value="ALL">👤 전체 구매자</option>
                          {allBuyers.map(buyer => (
                            <option key={buyer} value={buyer}>{buyer}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                    {showPrice && <th className="px-6 py-4 text-right">단가</th>}
                    {showPrice && <th className="px-6 py-4 text-right">금액</th>}
                    <th className="px-6 py-4 text-right">수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={showPrice ? 8 : 6} className="px-6 py-20 text-center text-slate-300 font-black uppercase tracking-widest italic text-base sm:text-xl">
                        해당 조건의 판매 데이터가 존재하지 않습니다
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map(({ item, transaction }) => (
                      <tr key={transaction.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-500 text-xs">
                          <div>{getLocalDateString(transaction.date)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(transaction.date).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-wider border border-indigo-100">
                            {item.category || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            {item.code && (
                              <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded w-fit mb-1 border border-indigo-100">
                                [{item.code}]
                              </span>
                            )}
                            <p className="font-black text-slate-800 text-xs sm:text-sm">{item.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-black text-indigo-600">
                          {transaction.originalSerialNumber && (
                            <span className="text-[10px] text-rose-500 line-through font-mono font-bold decoration-rose-500 decoration-1 block mb-0.5">{transaction.originalSerialNumber}</span>
                          )}
                          <span>{transaction.serialNumber || '-'}</span>
                        </td>
                        <td className="px-6 py-4 font-black text-slate-700 text-xs sm:text-sm">
                          <div className="flex flex-col">
                            {transaction.originalCustomerName && (
                              <span className="text-[10px] text-rose-500 line-through font-bold decoration-rose-500 decoration-1 block mb-1" title={`이전 구매자: ${transaction.originalCustomerName}`}>(이전: {transaction.originalCustomerName})</span>
                            )}
                            {transaction.customerName ? (
                              <button
                                type="button"
                                onClick={() => setSelectedBuyerFilter(transaction.customerName?.trim() || 'ALL')}
                                className="text-left hover:text-indigo-600 hover:underline cursor-pointer transition-all flex items-center gap-1.5 group/btn bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-100 px-2.5 py-1 rounded-lg w-fit"
                                title={`${transaction.customerName} 구매자만 필터링`}
                              >
                                <span className="font-extrabold">{transaction.customerName}</span>
                                <span className="text-[8px] sm:text-[9px] text-slate-400 group-hover/btn:text-indigo-600 font-bold bg-white px-1 py-0.5 rounded border border-slate-100/50">
                                  필터 [A]
                                </span>
                              </button>
                            ) : (
                              '-'
                            )}
                          </div>
                        </td>
                        {showPrice && (
                          <td className="px-6 py-4 text-right font-black text-xs sm:text-sm text-slate-600">
                            {getTransactionPrice(transaction, item).toLocaleString()}원
                          </td>
                        )}
                        {showPrice && (
                          <td className="px-6 py-4 text-right font-extrabold text-xs sm:text-sm text-emerald-600">
                            {(transaction.quantity * getTransactionPrice(transaction, item)).toLocaleString()}원
                          </td>
                        )}
                        <td className="px-6 py-4 text-right font-black text-sm sm:text-base text-slate-900">
                          {transaction.quantity.toLocaleString()}{' '}
                          <span className="text-[10px] uppercase text-slate-400 ml-0.5">EA</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
