
import React, { useState, useMemo } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon, SearchIcon, DownloadIcon } from './icons';

interface BuyerSearchModalProps {
  items: Item[];
  onClose: () => void;
}

const BuyerSearchModal: React.FC<BuyerSearchModalProps> = ({ items, onClose }) => {
  const [nameTerm, setNameTerm] = useState('');
  const [dateTerm, setDateTerm] = useState('');

  // Extract all release transactions from all products
  const allReleases = useMemo(() => {
    const releases: (Transaction & { itemName: string, itemBrand: string })[] = [];
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (t.type === 'release') {
          releases.push({
            ...t,
            itemName: item.name,
            itemBrand: item.category || '-'
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
      
      const matchesDate = dateMatch === '' || 
        r.date.startsWith(dateMatch);

      return matchesName && matchesDate;
    });
  }, [allReleases, nameTerm, dateTerm]);

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
      <div className="bg-white rounded-2xl sm:rounded-[3rem] shadow-2xl w-full max-w-6xl animate-fade-in-up flex flex-col h-full max-h-[90vh] overflow-hidden">
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
          <div className="flex justify-between items-center">
            <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">
              검색 결과: <span className="text-indigo-600">{filteredReleases.length}</span> 건
            </p>
            <button 
              onClick={handleExport}
              disabled={filteredReleases.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 border-2 border-emerald-100 rounded-xl text-xs font-black hover:bg-emerald-600 hover:text-white transition-all uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-4 h-4" />
              결과 엑셀 저장
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-hidden bg-slate-50/50">
          <div className="h-full overflow-y-auto p-6 sm:p-10 scrollbar-hide">
            {filteredReleases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 opacity-20">
                <SearchIcon className="w-20 h-20 sm:w-32 sm:h-32 mb-6" />
                <p className="text-xl sm:text-3xl font-black uppercase tracking-widest text-center">조건에 맞는 결과가 없습니다</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-5">날짜</th>
                        <th className="px-6 py-5">브랜드</th>
                        <th className="px-6 py-5">제품명</th>
                        <th className="px-6 py-5">일련번호</th>
                        <th className="px-6 py-5">수량</th>
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
                          <td className="px-6 py-6 font-black text-lg">{r.quantity} EA</td>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyerSearchModal;
