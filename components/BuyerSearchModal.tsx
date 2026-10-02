import React, { useState, useMemo, useEffect, useDeferredValue, useRef } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, SearchIcon, DownloadIcon } from './icons';
import { extractRemarksAndHistory } from '../utils/historyUtils';

interface BuyerSearchModalProps {
  items: Item[];
  onClose: () => void;
  showPrice?: boolean;
  authRole?: 'admin' | 'product_only' | 'custom' | null;
}

const BuyerSearchModal: React.FC<BuyerSearchModalProps> = ({ items, onClose, showPrice = false, authRole = null }) => {
  const [nameInput, setNameInput] = useState('');
  const [dateTerm, setDateTerm] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped' | 'byCode' | 'ranking'>('flat');
  const [selectedGroupDate, setSelectedGroupDate] = useState('');
  const [selectedGroupCode, setSelectedGroupCode] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use deferred value for smooth 0ms instant typing and backspacing without freezing
  const deferredNameInput = useDeferredValue(nameInput);

  // Ranking filters
  const [rankingPeriod, setRankingPeriod] = useState<'all' | 'year' | 'month'>('all');
  const [selectedRankingYear, setSelectedRankingYear] = useState<string>('');
  const [selectedRankingMonth, setSelectedRankingMonth] = useState<string>('');
  const [rankingCriteria, setRankingCriteria] = useState<'amount' | 'quantity'>('amount');

  // Reset filter when switching modes
  useEffect(() => {
    setSelectedGroupDate('');
    setSelectedGroupCode('');
  }, [viewMode]);

  // If user is not admin and was on ranking view, revert to flat view
  useEffect(() => {
    if (authRole !== 'admin' && viewMode === 'ranking') {
      setViewMode('flat');
    }
  }, [authRole, viewMode]);

  // Extract all release transactions from all products
  const allReleases = useMemo(() => {
    const releases: (Transaction & { itemId: string, itemName: string, itemBrand: string, itemCode: string, unitPrice: number })[] = [];
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (t.type === 'release' && !t.isDiscarded && !t.isReturned) {
          const cust = (t.customerName || '').trim();
          if (cust === '대천' || cust === '대천공장' || cust === '대천AS' || cust === '대천폐기') {
            return;
          }
          const { userRemarks } = extractRemarksAndHistory(t);
          releases.push({
            ...t,
            itemId: item.id,
            remarks: userRemarks || (t.historyRemarks ? '' : t.remarks),
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

  // Extract available years & months from releases for ranking filter
  const { availableYears, availableMonths } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    allReleases.forEach(r => {
      const d = new Date(r.date);
      if (!isNaN(d.getTime())) {
        const y = String(d.getFullYear());
        const m = `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        years.add(y);
        months.add(m);
      }
    });
    const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
    const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a));
    return {
      availableYears: sortedYears,
      availableMonths: sortedMonths
    };
  }, [allReleases]);

  // Set default year/month if not set
  useEffect(() => {
    if (!selectedRankingYear && availableYears.length > 0) {
      setSelectedRankingYear(availableYears[0]);
    }
    if (!selectedRankingMonth && availableMonths.length > 0) {
      setSelectedRankingMonth(availableMonths[0]);
    }
  }, [availableYears, availableMonths, selectedRankingYear, selectedRankingMonth]);

  // Smart & Strict Match Filter
  const filteredReleases = useMemo(() => {
    const query = deferredNameInput.toLowerCase().trim();
    const dateMatch = dateTerm.trim(); // YYYY-MM-DD or YYYY or YYYY-MM

    if (!query && !dateMatch) {
      return allReleases;
    }

    const queryDigits = query.replace(/\D/g, '');
    const isOnlyDigits = /^\d+$/.test(query);
    const isSerialPrefixQuery = /^AJ[PD]/i.test(query);

    return allReleases.filter(r => {
      let matchesQuery = true;
      if (query !== '') {
        const cust = (r.customerName || '').toLowerCase().trim();
        const uid = (r.userId || '').toLowerCase().trim();
        const serial = (r.serialNumber || '').toLowerCase().trim();
        const serialDigits = serial.replace(/\D/g, '');
        const phoneRaw = r.phoneNumber || '';
        const phoneDigits = phoneRaw.replace(/\D/g, '');

        if (isSerialPrefixQuery) {
          // Explicit serial query (e.g. AJP03489, AJD00105) -> ONLY match serial number
          matchesQuery = serial.includes(query);
        } else if (isOnlyDigits) {
          // Pure number query (e.g. 5200, 3489, 03489, 105, 01012345678)
          // 1) Match phone number (ends with or contains the digits)
          const phoneParts = phoneRaw.split(/[\/,]/);
          const phoneMatch = phoneParts.some(p => p.replace(/\D/g, '').endsWith(queryDigits)) || (queryDigits.length >= 4 && phoneDigits.includes(queryDigits));
          
          // 2) Match serial number without prefix (e.g. 3489 -> matches AJP03489 or AJD03489)
          const serialNum = parseInt(serialDigits, 10);
          const qNum = parseInt(queryDigits, 10);
          const serialMatch = serialDigits.includes(queryDigits) || (!isNaN(serialNum) && !isNaN(qNum) && serialNum === qNum) || serial.includes(query);

          // 3) Match user ID or Customer Name if containing the digits
          const uidMatch = uid.includes(query);
          const custMatch = cust.includes(query);

          matchesQuery = phoneMatch || serialMatch || uidMatch || custMatch;
        } else {
          // Customer Name, User ID or Serial Number text query (e.g. '박지성', '김준식', 'MULTY_AX')
          // STRICT MATCH: ONLY matches current customerName, userId, or serialNumber
          matchesQuery = cust.includes(query) || uid.includes(query) || serial.includes(query);
        }
      }
      
      let matchesDate = true;
      if (dateMatch !== '') {
        const dateObj = new Date(r.date);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const localDateStr = isNaN(yyyy) ? r.date.split('T')[0] : `${yyyy}-${mm}-${dd}`;
        matchesDate = localDateStr.startsWith(dateMatch);
      }

      return matchesQuery && matchesDate;
    });
  }, [allReleases, deferredNameInput, dateTerm]);

  // Box A: Searched Buyer Profile Card
  const searchedBuyerProfile = useMemo(() => {
    const query = deferredNameInput.trim().toLowerCase();
    if (!query) return null;

    const queryDigits = query.replace(/\D/g, '');
    const isOnlyDigits = /^\d+$/.test(query);
    const isSerialPrefixQuery = /^AJ[PD]/i.test(query);

    // Strict matching with current buyer only
    const matching = allReleases.filter(r => {
      const cust = (r.customerName || '').toLowerCase().trim();
      const uid = (r.userId || '').toLowerCase().trim();
      const serial = (r.serialNumber || '').toLowerCase().trim();
      const serialDigits = serial.replace(/\D/g, '');
      const phoneRaw = r.phoneNumber || '';
      const phoneDigits = phoneRaw.replace(/\D/g, '');

      if (isSerialPrefixQuery) {
        return serial.includes(query);
      } else if (isOnlyDigits) {
        const phoneParts = phoneRaw.split(/[\/,]/);
        const phoneMatch = phoneParts.some(p => p.replace(/\D/g, '').endsWith(queryDigits)) || (queryDigits.length >= 4 && phoneDigits.includes(queryDigits));
        const serialNum = parseInt(serialDigits, 10);
        const qNum = parseInt(queryDigits, 10);
        const serialMatch = serialDigits.includes(queryDigits) || (!isNaN(serialNum) && !isNaN(qNum) && serialNum === qNum) || serial.includes(query);
        const uidMatch = uid.includes(query);
        const custMatch = cust.includes(query);
        return phoneMatch || serialMatch || uidMatch || custMatch;
      } else {
        return cust.includes(query) || uid.includes(query) || serial.includes(query);
      }
    });

    if (matching.length === 0) return null;

    // Find latest non-empty phone and address for this buyer
    const withPhone = matching.find(r => !!r.phoneNumber?.trim());
    const withAddress = matching.find(r => !!r.address?.trim());
    const latest = matching[0];

    const totalAmount = matching.reduce((sum, r) => sum + (r.quantity * (r.unitPrice || 0)), 0);
    const totalQty = matching.reduce((sum, r) => sum + r.quantity, 0);

    return {
      customerName: latest.customerName || (latest.userId ? `아이디: ${latest.userId}` : '미지정'),
      userId: latest.userId,
      phoneNumber: withPhone?.phoneNumber?.trim() || '미등록',
      address: withAddress?.address?.trim() || '미등록',
      totalPurchases: matching.length,
      totalQty,
      totalAmount,
      lastPurchaseDate: latest.date ? new Date(latest.date).toLocaleDateString() : '-',
      customerUpdatedDate: latest.customerUpdatedDate
    };
  }, [deferredNameInput, allReleases]);

  // Unified Buyer Rankings by Customer Name
  const buyerRankings = useMemo(() => {
    if (viewMode !== 'ranking' || authRole !== 'admin') return [];

    const periodFiltered = allReleases.filter(r => {
      if (rankingPeriod === 'all') return true;
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return false;
      const y = String(d.getFullYear());
      const m = `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (rankingPeriod === 'year') {
        return y === selectedRankingYear;
      }
      if (rankingPeriod === 'month') {
        return m === selectedRankingMonth;
      }
      return true;
    });

    const buyerMap = new Map<string, {
      key: string;
      customerName: string;
      userId?: string;
      phoneNumber?: string;
      address?: string;
      totalAmount: number;
      totalQty: number;
      purchaseCount: number;
      lastPurchaseDate: string;
      products: { name: string; brand: string; qty: number }[];
    }>();

    periodFiltered.forEach(r => {
      const cName = (r.customerName || '').trim();
      const uId = (r.userId || '').trim();
      const key = cName || (uId ? `ID_${uId}` : 'UNKNOWN');
      if (key === 'UNKNOWN') return;

      let buyer = buyerMap.get(key);
      if (!buyer) {
        buyer = {
          key,
          customerName: cName || (uId ? `아이디: ${uId}` : '미지정'),
          userId: uId || undefined,
          phoneNumber: r.phoneNumber?.trim() || undefined,
          address: r.address?.trim() || undefined,
          totalAmount: 0,
          totalQty: 0,
          purchaseCount: 0,
          lastPurchaseDate: r.date,
          products: []
        };
        buyerMap.set(key, buyer);
      }

      if (!buyer.userId && uId) {
        buyer.userId = uId;
      }
      if (!buyer.phoneNumber && r.phoneNumber?.trim()) {
        buyer.phoneNumber = r.phoneNumber.trim();
      }
      if (!buyer.address && r.address?.trim()) {
        buyer.address = r.address.trim();
      }
      buyer.totalAmount += r.quantity * (r.unitPrice || 0);
      buyer.totalQty += r.quantity;
      buyer.purchaseCount += 1;

      // Track top products
      const prod = buyer.products.find(p => p.name === r.itemName);
      if (prod) {
        prod.qty += r.quantity;
      } else {
        buyer.products.push({ name: r.itemName, brand: r.itemBrand, qty: r.quantity });
      }
    });

    const list = Array.from(buyerMap.values());
    if (rankingCriteria === 'amount') {
      list.sort((a, b) => b.totalAmount - a.totalAmount || b.totalQty - a.totalQty);
    } else {
      list.sort((a, b) => b.totalQty - a.totalQty || b.totalAmount - a.totalAmount);
    }

    return list;
  }, [viewMode, authRole, allReleases, rankingPeriod, selectedRankingYear, selectedRankingMonth, rankingCriteria]);

  const totalSalesAmount = useMemo(() => {
    return filteredReleases.reduce((sum, r) => {
      return sum + (r.quantity * (r.unitPrice || 0));
    }, 0);
  }, [filteredReleases]);

  const groupedByDate = useMemo(() => {
    if (viewMode !== 'grouped') return [];
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
  }, [viewMode, filteredReleases]);

  const groupedByCode = useMemo(() => {
    if (viewMode !== 'byCode') return [];
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
  }, [viewMode, filteredReleases]);

  // Helper to navigate from ranking to flat list with exact period and name synced
  const handleViewBuyerDetailsFromRanking = (buyerName: string) => {
    setNameInput(buyerName);
    if (rankingPeriod === 'year') {
      setDateTerm(selectedRankingYear);
    } else if (rankingPeriod === 'month') {
      setDateTerm(selectedRankingMonth);
    } else {
      setDateTerm('');
    }
    setViewMode('flat');
  };

  const handleExport = () => {
    let csvContent = "\ufeff";
    let filename = "";

    if (viewMode === 'ranking') {
      if (buyerRankings.length === 0) return;
      const headers = ['순위', '구매자명', '아이디', '연락처', '주소', '총 구매금액', '총 구매수량(EA)', '구매건수', '최근 구매일'];
      csvContent += headers.join(',') + '\r\n';
      buyerRankings.forEach((b, idx) => {
        const row = [
          `${idx + 1}위`,
          b.customerName,
          b.userId || '-',
          b.phoneNumber || '-',
          b.address || '-',
          b.totalAmount,
          b.totalQty,
          b.purchaseCount,
          new Date(b.lastPurchaseDate).toLocaleDateString()
        ];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
      });
      const periodLabel = rankingPeriod === 'all' ? '전체기간' : rankingPeriod === 'year' ? `${selectedRankingYear}년` : `${selectedRankingMonth}월`;
      const critLabel = rankingCriteria === 'amount' ? '금액순' : '수량순';
      filename = `구매자_순위_${periodLabel}_${critLabel}_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      if (filteredReleases.length === 0) return;
      const headers = ['날짜', '브랜드', '제품명', '일련번호', '수량', '단가', '총금액', '대상자', '아이디', '연락처', '주소', '비고'];
      csvContent += headers.join(',') + '\r\n';
      
      filteredReleases.forEach(r => {
        const row = [
          new Date(r.date).toLocaleDateString(),
          r.itemBrand,
          r.itemName,
          r.serialNumber || '-',
          r.quantity,
          r.unitPrice || 0,
          r.quantity * (r.unitPrice || 0),
          r.customerName || '-',
          r.userId || '-',
          r.phoneNumber || '-',
          r.address || '-',
          r.remarks || '-'
        ];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
      });
      filename = `판매검색결과_${new Date().toISOString().split('T')[0]}.csv`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex justify-center items-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-[3rem] shadow-2xl w-full max-w-[95vw] lg:max-w-[90vw] xl:max-w-[1500px] animate-fade-in-up flex flex-col h-full max-h-[92vh] overflow-y-auto lg:overflow-hidden">
        {/* Modal Header: Preserved User Modified Titles */}
        <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
              <SearchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
              구매자 검색
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">이름, 아이디, 연락처(뒷자리 포함)를 조회합니다.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer">
            <CloseIcon className="w-8 h-8 sm:w-10 sm:h-10" />
          </button>
        </div>

        <div className="p-5 sm:p-7 bg-white border-b border-slate-100 space-y-4 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">구매자 이름 / 아이디 / 전화번호(뒷자리) 검색</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4"><SearchIcon className="w-5 h-5 text-slate-300" /></span>
                <input 
                  ref={searchInputRef}
                  type="text" 
                  value={nameInput} 
                  onChange={e => setNameInput(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setNameInput('');
                    }
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="예: 홍길동, AJP/AJD*****, 0000(전화번호 뒷자리)" 
                  className="w-full pl-12 pr-10 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-400 outline-none font-bold text-base transition-all"
                />
                {nameInput && (
                  <button 
                    type="button"
                    onClick={() => {
                      setNameInput('');
                      searchInputRef.current?.focus();
                    }} 
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer transition-colors"
                    title="검색어 지우기"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">날짜별 검색</label>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={dateTerm} 
                  onChange={e => setDateTerm(e.target.value)} 
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-400 outline-none font-bold text-base transition-all"
                />
                {dateTerm && (
                  <button
                    onClick={() => setDateTerm('')}
                    className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
                  >
                    날짜 해제
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
                검색 결과: <span className="text-indigo-600 font-extrabold text-sm sm:text-base">{filteredReleases.length}</span> 건
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
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'flat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  전체 리스트
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grouped')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grouped' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  날짜별 그룹화
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('byCode')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'byCode' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  코드별 그룹화
                </button>
                {/* Master Admin Only: Ranking View */}
                {authRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ranking')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${viewMode === 'ranking' ? 'bg-indigo-600 text-white shadow-sm' : 'text-amber-600 hover:text-amber-700'}`}
                  >
                    <span>🏆 구매자 순위</span>
                  </button>
                )}
              </div>
              <button 
                onClick={handleExport}
                disabled={viewMode === 'ranking' ? buyerRankings.length === 0 : filteredReleases.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-xl text-xs font-black hover:bg-emerald-600 hover:text-white transition-all uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <DownloadIcon className="w-4 h-4" />
                결과 엑셀 저장
              </button>
            </div>
          </div>

          {/* RED BOX A: Searched Buyer Profile Card (Phone Number & Address) */}
          {searchedBuyerProfile && (
            <div className="bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-slate-50 border-2 border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-sm animate-fade-in">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                    👤
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base sm:text-lg font-black text-slate-900">
                        {searchedBuyerProfile.customerName}
                      </span>
                      {searchedBuyerProfile.userId && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-black uppercase rounded-lg border border-indigo-200">
                          {searchedBuyerProfile.userId}
                        </span>
                      )}
                      {searchedBuyerProfile.customerUpdatedDate && (
                        <span className="px-2 py-0.5 bg-white text-indigo-600 text-[10px] font-bold rounded-md border border-indigo-100 shadow-2xs">
                          수정일: {searchedBuyerProfile.customerUpdatedDate}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 mt-1.5 text-xs text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-400">📞 연락처:</span>
                        <span className={`font-bold ${searchedBuyerProfile.phoneNumber !== '미등록' ? 'text-indigo-700 font-mono font-black' : 'text-slate-400'}`}>
                          {searchedBuyerProfile.phoneNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-400">🏠 배송지 주소:</span>
                        <span className={`font-bold ${searchedBuyerProfile.address !== '미등록' ? 'text-slate-900 font-extrabold' : 'text-slate-400'}`}>
                          {searchedBuyerProfile.address}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-indigo-100">
                  <div className="bg-white px-3.5 py-2 rounded-xl border border-indigo-100 shadow-2xs text-right">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">총 구매 내역</span>
                    <span className="text-xs sm:text-sm font-black text-slate-800">
                      {searchedBuyerProfile.totalPurchases}건 ({searchedBuyerProfile.totalQty.toLocaleString()} EA)
                    </span>
                  </div>
                  {showPrice && (
                    <div className="bg-white px-3.5 py-2 rounded-xl border border-emerald-100 shadow-2xs text-right">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">누적 구매 금액</span>
                      <span className="text-xs sm:text-sm font-black text-emerald-600">
                        {searchedBuyerProfile.totalAmount.toLocaleString()}원
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BLUE BOX B: Ranking Control Bar (Master Admin Only) */}
          {viewMode === 'ranking' && authRole === 'admin' && (
            <div className="pt-2 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 animate-fade-in bg-gradient-to-r from-amber-50/80 to-indigo-50/80 p-4 sm:p-5 rounded-2xl border-2 border-amber-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-black uppercase tracking-wider shadow-sm">
                    🏆 최고 구매자 순위
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    기간과 정렬 기준을 선택하세요
                  </span>
                </div>

                {/* Period Mode Selector */}
                <div className="flex items-center p-1 bg-white rounded-xl border border-amber-200 text-xs font-black shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setRankingPeriod('all')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${rankingPeriod === 'all' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    전체 기간
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingPeriod('year')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${rankingPeriod === 'year' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    년도별
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingPeriod('month')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${rankingPeriod === 'month' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    월별
                  </button>
                </div>

                {/* Year Dropdown */}
                {rankingPeriod === 'year' && (
                  <select
                    value={selectedRankingYear}
                    onChange={e => setSelectedRankingYear(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border-2 border-amber-300 focus:border-amber-500 rounded-xl font-black outline-none shadow-sm text-slate-800 cursor-pointer"
                  >
                    {availableYears.map(y => (
                      <option key={y} value={y}>📅 {y}년</option>
                    ))}
                  </select>
                )}

                {/* Month Dropdown */}
                {rankingPeriod === 'month' && (
                  <select
                    value={selectedRankingMonth}
                    onChange={e => setSelectedRankingMonth(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border-2 border-amber-300 focus:border-amber-500 rounded-xl font-black outline-none shadow-sm text-slate-800 cursor-pointer"
                  >
                    {availableMonths.map(m => (
                      <option key={m} value={m}>📅 {m.replace('-', '년 ')}월</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 2 Ranking Criteria: Amount vs Quantity */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-500">순위 기준:</span>
                <div className="flex p-1 bg-white rounded-xl border border-indigo-200 text-xs font-black shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setRankingCriteria('amount')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${rankingCriteria === 'amount' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <span>💰 총 구매 금액 기준</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingCriteria('quantity')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${rankingCriteria === 'quantity' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <span>📦 구매 품목/수량 기준</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'grouped' && (
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-fade-in bg-slate-50/50 p-4 rounded-2xl border-2 border-indigo-50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="self-start sm:self-auto px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black uppercase tracking-wider">
                  날짜 필터
                </span>
                <p className="text-xs font-bold text-slate-500">
                  원하는 날짜만 선택하여 빠르게 확인하세요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedGroupDate}
                  onChange={e => setSelectedGroupDate(e.target.value)}
                  className="flex-grow sm:flex-initial w-full sm:w-[280px] px-3 py-2 text-xs bg-white border-2 border-indigo-200 focus:border-indigo-400 rounded-xl font-bold outline-none shadow-sm transition-all text-slate-700 cursor-pointer"
                >
                  <option value="">📅 전체 날짜 ({groupedByDate.length}개 그룹)</option>
                  {groupedByDate.map(g => (
                    <option key={g.date} value={g.date}>
                      {g.date} ({g.list.length}건 / {g.qty.toLocaleString()} EA)
                    </option>
                  ))}
                </select>
                {selectedGroupDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedGroupDate('')}
                    className="px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shrink-0 cursor-pointer"
                  >
                    전체보기
                  </button>
                )}
              </div>
            </div>
          )}

          {viewMode === 'byCode' && (
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-fade-in bg-slate-50/50 p-4 rounded-2xl border-2 border-indigo-50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="self-start sm:self-auto px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-black uppercase tracking-wider">
                  제품코드 필터
                </span>
                <p className="text-xs font-bold text-slate-500">
                  원하는 제품코드만 선택하여 빠르게 확인하세요.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedGroupCode}
                  onChange={e => setSelectedGroupCode(e.target.value)}
                  className="flex-grow sm:flex-initial w-full sm:w-[350px] px-3 py-2 text-xs bg-white border-2 border-indigo-200 focus:border-indigo-400 rounded-xl font-bold outline-none shadow-sm transition-all text-slate-700 cursor-pointer"
                >
                  <option value="">📦 전체 제품코드 ({groupedByCode.length}개 그룹)</option>
                  {groupedByCode.map(g => (
                    <option key={g.code} value={g.code}>
                      [{g.code}] {g.name.slice(0, 25)}{g.name.length > 25 ? '...' : ''} ({g.list.length}건)
                    </option>
                  ))}
                </select>
                {selectedGroupCode && (
                  <button
                    type="button"
                    onClick={() => setSelectedGroupCode('')}
                    className="px-3 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shrink-0 cursor-pointer"
                  >
                    전체보기
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-grow lg:overflow-hidden bg-slate-50/50">
          <div className="p-5 sm:p-7 scrollbar-hide lg:h-full lg:overflow-y-auto">
            {viewMode === 'ranking' && authRole === 'admin' ? (
              buyerRankings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-20 opacity-30">
                  <span className="text-6xl mb-4">🏆</span>
                  <p className="text-xl sm:text-2xl font-black uppercase tracking-widest text-center text-slate-700">해당 기간의 구매자 랭킹 데이터가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Mobile Ranking Cards */}
                  <div className="space-y-4 lg:hidden">
                    {buyerRankings.map((b, idx) => {
                      const rankBadge = idx === 0 ? '🥇 1위' : idx === 1 ? '🥈 2위' : idx === 2 ? '🥉 3위' : `${idx + 1}위`;
                      const badgeColor = idx === 0 ? 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold text-sm' : idx === 1 ? 'bg-slate-200 text-slate-800 border-slate-300' : idx === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200';
                      return (
                        <div key={`ranking_${b.key}_${idx}`} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-md space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-xl border text-xs font-black ${badgeColor}`}>
                                {rankBadge}
                              </span>
                              <div>
                                <h4 className="font-black text-slate-900 text-base">{b.customerName}</h4>
                                {b.userId && <span className="text-[10px] text-slate-400 font-bold uppercase">ID: {b.userId}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleViewBuyerDetailsFromRanking(b.customerName)}
                              className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                            >
                              내역 조회
                            </button>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400 font-bold">연락처</span>
                              <span className="font-bold text-slate-700">{b.phoneNumber || '미등록'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-slate-400 font-bold shrink-0">주소</span>
                              <span className="font-bold text-slate-700 text-right break-all">{b.address || '미등록'}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 block uppercase">총 구매 수량</span>
                              <span className="font-black text-slate-900 text-sm">{b.totalQty.toLocaleString()} EA ({b.purchaseCount}건)</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-slate-400 block uppercase">총 구매 금액</span>
                              <span className="font-black text-emerald-600 text-sm">{b.totalAmount.toLocaleString()}원</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Ranking Table */}
                  <div className="hidden lg:block bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-xl">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-5 text-center w-24">순위</th>
                          <th className="px-6 py-5">구매자 정보</th>
                          <th className="px-6 py-5">연락처 / 주소</th>
                          <th className="px-6 py-5 text-right">총 구매 수량</th>
                          {showPrice && <th className="px-6 py-5 text-right">총 구매 금액</th>}
                          <th className="px-6 py-5">주요 구매 품목</th>
                          <th className="px-6 py-5 text-center">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {buyerRankings.map((b, idx) => {
                          const rankBadge = idx === 0 ? '🥇 1위' : idx === 1 ? '🥈 2위' : idx === 2 ? '🥉 3위' : `${idx + 1}위`;
                          const badgeColor = idx === 0 ? 'bg-amber-100 text-amber-900 border-amber-300 font-black text-sm shadow-xs' : idx === 1 ? 'bg-slate-200 text-slate-800 border-slate-300 font-black' : idx === 2 ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold' : 'bg-slate-100 text-slate-600 border-slate-200';
                          return (
                            <tr key={`ranking_row_${b.key}_${idx}`} className="hover:bg-indigo-50/30 transition-colors">
                              <td className="px-6 py-5 text-center">
                                <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl border ${badgeColor}`}>
                                  {rankBadge}
                                </span>
                              </td>
                              <td className="px-6 py-5">
                                <div className="flex flex-col">
                                  <span className="font-black text-slate-900 text-sm sm:text-base">{b.customerName}</span>
                                  {b.userId && (
                                    <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">ID: {b.userId}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-5 max-w-xs">
                                <div className="flex flex-col gap-1 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 font-bold">📞</span>
                                    <span className={`font-mono font-bold ${b.phoneNumber ? 'text-indigo-700' : 'text-slate-400'}`}>
                                      {b.phoneNumber || '미등록'}
                                    </span>
                                  </div>
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-slate-400 font-bold shrink-0">🏠</span>
                                    <span className={`line-clamp-2 ${b.address ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                                      {b.address || '미등록'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-right">
                                <span className="font-black text-base sm:text-lg text-slate-900">
                                  {b.totalQty.toLocaleString()} <span className="text-xs font-bold text-slate-400">EA</span>
                                </span>
                                <span className="block text-[10px] text-slate-400 font-bold">
                                  총 {b.purchaseCount}회 출고
                                </span>
                              </td>
                              {showPrice && (
                                <td className="px-6 py-5 text-right font-extrabold text-emerald-600 text-base sm:text-lg">
                                  {b.totalAmount.toLocaleString()}원
                                </td>
                              )}
                              <td className="px-6 py-5 max-w-sm">
                                <div className="flex flex-wrap gap-1">
                                  {b.products.slice(0, 3).map((p, pIdx) => (
                                    <span key={pIdx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold">
                                      {p.name} ({p.qty}EA)
                                    </span>
                                  ))}
                                  {b.products.length > 3 && (
                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold">
                                      +{b.products.length - 3}건
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-5 text-center">
                                <button
                                  onClick={() => handleViewBuyerDetailsFromRanking(b.customerName)}
                                  className="px-3.5 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                >
                                  내역 보기
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : filteredReleases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 opacity-20">
                <SearchIcon className="w-20 h-20 sm:w-32 sm:h-32 mb-6" />
                <p className="text-xl sm:text-3xl font-black uppercase tracking-widest text-center">조건에 맞는 결과가 없습니다</p>
              </div>
            ) : viewMode === 'flat' ? (
              <div className="space-y-4">
                {/* Mobile Flat Card List */}
                <div className="space-y-4 lg:hidden">
                  {filteredReleases.map((r, i) => (
                    <div key={`card_${r.itemId || ''}_${r.id || ''}_${r.serialNumber || ''}_${i}`} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-md space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-wider border border-indigo-100">
                            {r.itemBrand}
                          </span>
                          <div className="flex flex-col mt-1.5">
                            {r.itemCode && (
                              <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded w-fit mb-1 border border-indigo-100">
                                [{r.itemCode}]
                              </span>
                            )}
                            <h4 className="font-black text-slate-800 text-sm leading-snug">{r.itemName}</h4>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-mono font-bold text-slate-400 block">
                            {new Date(r.date).toLocaleDateString()}
                          </span>
                          {r.originalSerialNumber && (
                            <span className="text-[8px] text-rose-500 line-through font-mono font-bold decoration-rose-500 decoration-1 block">
                              # {r.originalSerialNumber}
                            </span>
                          )}
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
                            <div className="flex flex-col">
                              <span>
                                {r.customerName || '-'}
                                {r.userId && (
                                  <span className="ml-1 bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">
                                    {r.userId}
                                  </span>
                                )}
                                {r.customerUpdatedDate && (
                                  <span className="ml-1 bg-indigo-50 text-indigo-600 text-[8px] px-1 py-0.2 rounded font-bold border border-indigo-100/60" title={`구매자 정보 수정일: ${r.customerUpdatedDate}`}>
                                    수정: {r.customerUpdatedDate}
                                  </span>
                                )}
                              </span>
                            </div>
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

                      {(r.phoneNumber || r.address) && (
                        <div className="pt-2 border-t border-slate-50 text-[11px] text-slate-600 space-y-0.5">
                          {r.phoneNumber && <div><span className="text-slate-400">📞 연락처:</span> {r.phoneNumber}</div>}
                          {r.address && <div><span className="text-slate-400">🏠 주소:</span> {r.address}</div>}
                        </div>
                      )}

                      {r.remarks && (
                        <div className="pt-2.5 border-t border-slate-100 text-xs">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider mb-1">비고</span>
                          <div className="font-medium text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100/80 whitespace-pre-wrap break-words text-xs leading-relaxed">
                            {r.remarks}
                          </div>
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
                          <th className="px-6 py-5">연락처 / 주소</th>
                          <th className="px-6 py-5">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredReleases.map((r, i) => (
                          <tr key={`row_${r.itemId || ''}_${r.id || ''}_${r.serialNumber || ''}_${i}`} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-6 font-bold text-slate-500">{new Date(r.date).toLocaleDateString()}</td>
                            <td className="px-6 py-6 font-black text-indigo-600 uppercase">{r.itemBrand}</td>
                            <td className="px-6 py-6">
                              <div className="flex flex-col">
                                {r.itemCode && (
                                  <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded w-fit mb-1 border border-indigo-100">
                                    [{r.itemCode}]
                                  </span>
                                )}
                                <span className="font-black text-slate-800 text-xs sm:text-sm">{r.itemName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-6 font-mono font-black text-indigo-400">
                              {r.originalSerialNumber && (
                                <span className="text-[10px] text-rose-500 line-through font-mono font-bold decoration-rose-500 decoration-1 block mb-0.5">{r.originalSerialNumber}</span>
                              )}
                              <span>{r.serialNumber || '-'}</span>
                            </td>
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
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <p className="font-black text-slate-900">{r.customerName || '-'}</p>
                                  {r.userId && <span className="bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                                  {r.customerUpdatedDate && (
                                    <span className="bg-indigo-50 text-indigo-600 text-[8px] px-1.5 py-0.5 rounded font-bold border border-indigo-100/60" title={`구매자 정보 수정일: ${r.customerUpdatedDate}`}>
                                      수정: {r.customerUpdatedDate}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-6 text-xs text-slate-600 max-w-xs">
                              <div className="flex flex-col gap-0.5">
                                {r.phoneNumber && (
                                  <span className="font-mono font-bold text-indigo-700">📞 {r.phoneNumber}</span>
                                )}
                                {r.address && (
                                  <span className="text-slate-700 line-clamp-2">🏠 {r.address}</span>
                                )}
                                {!r.phoneNumber && !r.address && (
                                  <span className="text-slate-300">-</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-6 text-xs text-slate-700 font-medium min-w-[180px] max-w-[350px]">
                              {r.remarks ? (
                                <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap break-words leading-relaxed text-xs text-slate-700 font-medium">
                                  {r.remarks}
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
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
                  <div key={`group_date_${group.date}`} className="bg-white border border-slate-100 rounded-[1.5rem] p-5 sm:p-6 shadow-md space-y-4">
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
                        <div key={`group_m_card_${r.itemId || ''}_${r.id || ''}_${r.serialNumber || ''}_${idx}`} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase tracking-wider border border-indigo-100">
                                {r.itemBrand}
                              </span>
                              <div className="flex flex-col mt-1.5">
                                {r.itemCode && (
                                  <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded w-fit mb-0.5 border border-indigo-100">
                                    [{r.itemCode}]
                                  </span>
                                )}
                                <h5 className="font-black text-slate-800 text-xs leading-snug">{r.itemName}</h5>
                              </div>
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
                            <div className="pt-2 border-t border-slate-100/60 text-xs">
                              <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-wider mb-1">비고</span>
                              <div className="font-medium text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 whitespace-pre-wrap break-words text-xs leading-relaxed">
                                {r.remarks}
                              </div>
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
                            <tr key={`group_row_${r.itemId || ''}_${r.id || ''}_${r.serialNumber || ''}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-black text-indigo-600 uppercase">{r.itemBrand}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  {r.itemCode && (
                                    <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded w-fit mb-0.5 border border-indigo-100">
                                      [{r.itemCode}]
                                    </span>
                                  )}
                                  <span className="font-black text-slate-800 text-xs sm:text-sm">{r.itemName}</span>
                                </div>
                              </td>
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
                                <div className="flex items-center gap-1 flex-wrap">
                                  <p className="font-black text-slate-900 text-xs">{r.customerName || '-'}</p>
                                  {r.userId && <span className="bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                                  {r.customerUpdatedDate && (
                                    <span className="bg-indigo-50 text-indigo-600 text-[8px] px-1 py-0.2 rounded font-bold border border-indigo-100/60" title={`수정일: ${r.customerUpdatedDate}`}>
                                      수정: {r.customerUpdatedDate}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700 font-medium min-w-[180px] max-w-[350px]">
                                {r.remarks ? (
                                  <div className="bg-slate-50/90 p-2.5 rounded-lg border border-slate-100 whitespace-pre-wrap break-words leading-relaxed text-xs text-slate-700 font-medium">
                                    {r.remarks}
                                  </div>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
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
                  <div key={`group_code_${group.code}`} className="bg-white border border-slate-100 rounded-[1.5rem] p-5 sm:p-6 shadow-md space-y-4">
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
                        <div key={`group_code_card_${r.itemId || ''}_${r.id || ''}_${r.serialNumber || ''}_${idx}`} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-2.5">
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
                                {r.customerUpdatedDate && (
                                  <span className="ml-1 bg-indigo-50 text-indigo-600 text-[8px] px-1 py-0.2 rounded font-bold border border-indigo-100/60" title={`수정일: ${r.customerUpdatedDate}`}>
                                    수정: {r.customerUpdatedDate}
                                  </span>
                                )}
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
                            <div className="pt-2 border-t border-slate-100/60 text-xs">
                              <span className="text-[8px] text-slate-400 font-bold block uppercase tracking-wider mb-1">비고</span>
                              <div className="font-medium text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 whitespace-pre-wrap break-words text-xs leading-relaxed">
                                {r.remarks}
                              </div>
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
                            <tr key={`group_code_row_${r.itemId || ''}_${r.id || ''}_${r.serialNumber || ''}_${idx}`} className="hover:bg-slate-50/50 transition-colors">
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
                                <div className="flex items-center gap-1 flex-wrap">
                                  <p className="font-black text-slate-900 text-xs">{r.customerName || '-'}</p>
                                  {r.userId && <span className="bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">{r.userId}</span>}
                                  {r.customerUpdatedDate && (
                                    <span className="bg-indigo-50 text-indigo-600 text-[8px] px-1 py-0.2 rounded font-bold border border-indigo-100/60" title={`수정일: ${r.customerUpdatedDate}`}>
                                      수정: {r.customerUpdatedDate}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700 font-medium min-w-[180px] max-w-[350px]">
                                {r.remarks ? (
                                  <div className="bg-slate-50/90 p-2.5 rounded-lg border border-slate-100 whitespace-pre-wrap break-words leading-relaxed text-xs text-slate-700 font-medium">
                                    {r.remarks}
                                  </div>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
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
