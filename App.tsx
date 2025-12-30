
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Item, Transaction } from './types';
import AddItemModal from './components/AddItemModal';
import ItemDetailModal from './components/ItemDetailModal';
import { PlusIcon, BoxIcon, SearchIcon, TrashIcon, DownloadIcon, CloudIcon, ServerIcon, SyncIcon } from './components/icons';

const STORAGE_KEY = 'inventory_system_data_v2';
const ADMIN_PASSWORD = '0000';
const PRODUCT_ONLY_PASSWORD = '1111';

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const calculateStock = (item: Item): number => {
  return item.transactions.reduce((acc, t) => {
    return t.type === 'purchase' ? acc + t.quantity : acc - t.quantity;
  }, 0);
};

const App: React.FC = () => {
  const [authRole, setAuthRole] = useState<'admin' | 'product_only' | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'part' | 'product'>('part');
  
  const [items, setItems] = useState<Item[]>([]);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'inventory'} | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // Sync States
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'offline'>('loading');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'cloud' | 'local'>('local');
  const isInitialLoad = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud DB Fetch
  const fetchFromCloud = async () => {
    setSyncStatus('loading');
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) throw new Error('Server unreachable');
      
      const data = await response.json();
      if (data && Array.isArray(data.items)) {
        setItems(data.items);
        setDataSource('cloud');
        setSyncStatus('success');
        setLastSyncedAt(new Date());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.items));
        return true;
      }
    } catch (err) {
      console.warn('Cloud fetch failed, using local cache:', err);
      const savedItems = localStorage.getItem(STORAGE_KEY);
      if (savedItems) {
        setItems(JSON.parse(savedItems));
      }
      setDataSource('local');
      setSyncStatus('offline');
      return false;
    }
  };

  // Cloud DB Save
  const saveToCloud = async (data: Item[]) => {
    setSyncStatus('loading');
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: data,
          lastUpdated: new Date().toISOString()
        })
      });

      if (response.ok) {
        setSyncStatus('success');
        setLastSyncedAt(new Date());
        setDataSource('cloud');
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('Cloud Save Error:', err);
      setSyncStatus('error');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  };

  // Initial Data Load
  useEffect(() => {
    fetchFromCloud().finally(() => {
      isInitialLoad.current = false;
    });
  }, []);

  // Auto-Save Effect (Debounced)
  useEffect(() => {
    if (isInitialLoad.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    const timer = setTimeout(() => {
      saveToCloud(items);
    }, 1500);
    return () => clearTimeout(timer);
  }, [items]);

  const stats = useMemo(() => {
    return {
      partCount: items.filter(i => i.type === 'part').length,
      productCount: items.filter(i => i.type === 'product').length,
    };
  }, [items]);

  const allUsedSerials = useMemo(() => {
    const serials: string[] = [];
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (t.serialNumber) serials.push(t.serialNumber.toUpperCase());
      });
    });
    return Array.from(new Set(serials));
  }, [items]);

  // Local Import / Export Logic
  const handleLocalExport = () => {
    const dataObj = { items, exportDate: new Date().toISOString(), version: '2.0' };
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `INVENTORY_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLocalImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.items && Array.isArray(json.items)) {
          if (confirm('백업 파일을 불러오시겠습니까? 현재 클라우드와 로컬 데이터가 이 파일로 덮어씌워집니다.')) {
            setItems(json.items);
            alert('데이터 복구 완료. 클라우드 동기화가 진행됩니다.');
          }
        } else {
          alert('올바른 백업 파일 형식이 아닙니다.');
        }
      } catch (err) {
        alert('파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === ADMIN_PASSWORD) setAuthRole('admin');
    else if (loginPassword === PRODUCT_ONLY_PASSWORD) setAuthRole('product_only');
    else alert('비밀번호가 틀렸습니다.');
    setLoginPassword('');
  };

  const handleLogout = () => {
    setAuthRole(null);
    setSearchTerm('');
  };

  const handleAddItem = (itemData: Omit<Item, 'id' | 'transactions'>, initialQuantity: number) => {
    const newItem: Item = { ...itemData, id: generateId('item'), transactions: [] };
    if (initialQuantity > 0) {
      newItem.transactions.push({
        id: generateId('t'), type: 'purchase', quantity: initialQuantity,
        date: new Date().toISOString(), remarks: '초기 수량 등록',
      });
    }
    setItems(prev => [newItem, ...prev]);
  };

  const handleDeleteItemConfirm = () => {
    const currentPass = authRole === 'admin' ? ADMIN_PASSWORD : PRODUCT_ONLY_PASSWORD;
    if (deletePassword !== currentPass) {
      alert('비밀번호가 틀렸습니다.');
      return;
    }
    if (itemToDelete) {
      setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
      setItemToDelete(null);
      setDeletePassword('');
    }
  };

  const handleUpdateItem = (itemId: string, updatedData: Partial<Item>) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, ...updatedData } : item));
  };

  const handleAddTransaction = (itemId: string, transaction: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = { ...transaction, id: generateId('t') };
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: [...item.transactions, newTransaction] };
      }
      return item;
    }));
  };

  const handleUpdateTransaction = (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: item.transactions.map(t => t.id === transactionId ? { ...t, ...updatedData } : t) };
      }
      return item;
    }));
  };

  const handleDeleteTransaction = (itemId: string, transactionId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: item.transactions.filter(t => t.id !== transactionId) };
      }
      return item;
    }));
  };

  const selectedItem = useMemo(() => items.find(i => i.id === selectedItemId), [items, selectedItemId]);

  const filteredInventory = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return items.filter(item => {
        const matchesTab = (activeTab === 'part' && item.type === 'part') || (activeTab === 'product' && item.type === 'product');
        if (!matchesTab) return false;
        const basicMatch = item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term);
        if (basicMatch) return true;
        if (activeTab === 'product') return item.transactions.some(t => t.serialNumber?.toLowerCase().includes(term));
        return false;
    });
  }, [items, searchTerm, activeTab]);

  const exportToExcel = () => {
    let csvContent = "\ufeff";
    const headers = activeTab === 'part' ? ['코드', '품명', '도번', '현재재고'] : ['코드', '제품명', '현재재고'];
    csvContent += headers.join(',') + '\r\n';
    filteredInventory.forEach(item => {
      const row = activeTab === 'part' 
        ? [item.code, item.name, item.drawingNumber, calculateStock(item)]
        : [item.code, item.name, calculateStock(item)];
      csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeTab === 'part' ? '부품' : '제품'}_재고_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!authRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 sm:p-12 animate-fade-in-up border border-slate-100">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg mb-6">
              <BoxIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase text-center">재고 관리 시스템</h1>
            <p className="text-[10px] text-slate-400 font-black mt-2 tracking-widest uppercase">Vercel KV Cloud Infrastructure</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="password" autoFocus value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="PASSWORD"
              className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none text-center text-3xl font-black tracking-[0.5em] transition-all"
            />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-xl hover:bg-indigo-700 transition-all text-lg uppercase tracking-widest">시스템 로그인</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6">
            <div className="flex justify-between items-center py-4">
                <div className="flex items-center space-x-4">
                    <BoxIcon className="h-8 w-8 text-indigo-600" />
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">재고 관리 시스템</h1>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${dataSource === 'cloud' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                          {dataSource === 'cloud' ? <ServerIcon className="w-2.5 h-2.5" /> : <BoxIcon className="w-2.5 h-2.5" />}
                          {dataSource === 'cloud' ? 'Cloud Connected' : 'Local Backup Mode'}
                        </span>
                        {syncStatus === 'loading' && <SyncIcon className="w-3 h-3 text-indigo-400 animate-spin" />}
                        {syncStatus === 'error' && <span className="text-[9px] text-rose-500 font-black uppercase">Sync Failed</span>}
                        {lastSyncedAt && <span className="text-[9px] text-slate-400 font-bold ml-1">{lastSyncedAt.toLocaleTimeString()}</span>}
                      </div>
                    </div>
                </div>
                
                <div className="flex flex-col items-end space-y-2">
                  <div className="flex items-center space-x-2">
                    <button onClick={handleLocalExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all text-[10px] font-black uppercase tracking-widest shadow-sm">
                        <DownloadIcon className="w-3 h-3" />
                        <span>백업 저장</span>
                    </button>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all text-[10px] font-black uppercase tracking-widest shadow-sm cursor-pointer">
                        <CloudIcon className="w-3 h-3" />
                        <span>백업 불러오기</span>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleLocalImport} />
                    </label>
                    <button onClick={fetchFromCloud} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                        <SyncIcon className={`w-3 h-3 ${syncStatus === 'loading' ? 'animate-spin' : ''}`} />
                        <span>새로고침</span>
                    </button>
                    <button onClick={handleLogout} className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-colors font-black text-[10px] uppercase border border-slate-200">Logout</button>
                  </div>
                </div>
            </div>
            
            <div className="flex space-x-12 -mb-px">
                {authRole === 'admin' && (
                  <button onClick={() => setActiveTab('part')} className={`pb-4 px-2 text-lg font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === 'part' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    부품 재고 ({stats.partCount})
                  </button>
                )}
                <button onClick={() => setActiveTab('product')} className={`pb-4 px-2 text-lg font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === 'product' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  제품 재고 ({stats.productCount})
                </button>
            </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-8">
        <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-6 mb-10">
          <div className="relative flex-grow max-w-3xl">
              <span className="absolute inset-y-0 left-0 flex items-center pl-5"><SearchIcon className="text-slate-400 w-6 h-6" /></span>
              <input
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  placeholder="품명, 코드, 일련번호 검색..."
                  className="w-full pl-14 pr-6 py-4 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-indigo-400 bg-white shadow-sm font-bold text-lg transition-all"
              />
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={exportToExcel} className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white font-black rounded-xl shadow-lg hover:bg-emerald-700 transition-all text-base uppercase tracking-widest">
                <ServerIcon className="w-5 h-5" />
                <span>엑셀 파일 저장</span>
            </button>
            <button onClick={() => setShowAddItemModal(true)} className="flex items-center gap-2 px-10 py-4 bg-indigo-600 text-white font-black rounded-xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all text-base uppercase tracking-widest">
                <PlusIcon className="w-6 h-6" />
                <span>신규 등록</span>
            </button>
          </div>
        </div>

        <div className="bg-white shadow-2xl border border-slate-100 rounded-[2.5rem] overflow-hidden relative">
          {syncStatus === 'loading' && isInitialLoad.current && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <SyncIcon className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                <p className="font-black text-slate-600 uppercase tracking-widest">데이터 동기화 중...</p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-black tracking-[0.2em]">
                <tr>
                  <th className="px-10 py-7">품목 코드</th>
                  <th className="px-10 py-7">품명 / 제품명</th>
                  {activeTab === 'part' && <th className="px-10 py-7">도번</th>}
                  <th className="px-10 py-7 text-right">현재 재고수량</th>
                  <th className="px-10 py-7 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredInventory.length === 0 ? (
                  <tr><td colSpan={activeTab === 'part' ? 5 : 4} className="px-10 py-24 text-center text-slate-300 font-black uppercase tracking-widest italic text-2xl">기록된 데이터가 없습니다</td></tr>
                ) : (
                  filteredInventory.map(item => {
                    const stock = calculateStock(item);
                    return (
                      <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-10 py-7 font-mono text-indigo-600 font-black text-xl">{item.code}</td>
                        <td className="px-10 py-7 font-black text-slate-800 text-xl">{item.name}</td>
                        {activeTab === 'part' && <td className="px-10 py-7 text-slate-400 font-mono text-sm uppercase font-bold">{item.drawingNumber || '-'}</td>}
                        <td className="px-10 py-7 text-right">
                            <span className={`text-4xl font-black ${stock > 0 ? 'text-slate-900' : 'text-rose-500 animate-pulse'}`}>
                                {stock.toLocaleString()} <span className="text-xs uppercase text-slate-400 ml-1">EA</span>
                            </span>
                        </td>
                        <td className="px-10 py-7">
                          <div className="flex justify-center gap-4">
                            <button onClick={() => setSelectedItemId(item.id)} className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black text-sm uppercase tracking-wider hover:bg-indigo-600 hover:text-white transition-all shadow-sm">상세내역</button>
                            <button onClick={() => setItemToDelete({id: item.id, type: 'inventory'})} className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"><TrashIcon className="w-7 h-7" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                <div className="flex flex-col items-center mb-8">
                    <div className="p-5 bg-rose-50 rounded-[1.5rem] mb-6"><TrashIcon className="w-12 h-12 text-rose-500" /></div>
                    <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">삭제 비밀번호</h4>
                    <p className="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest text-center">삭제된 데이터는 서버와 로컬에서<br/>영구히 삭제됩니다.</p>
                </div>
                <input type="password" autoFocus value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDeleteItemConfirm()} placeholder="PASSWORD" className="w-full px-6 py-5 border-2 border-slate-100 rounded-2xl focus:border-rose-500 outline-none mb-8 text-center text-3xl font-black tracking-widest" />
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setItemToDelete(null)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm tracking-widest">취소</button>
                    <button onClick={handleDeleteItemConfirm} className="py-4 bg-rose-600 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-lg shadow-rose-100">삭제 확정</button>
                </div>
            </div>
        </div>
      )}

      {showAddItemModal && (
        <AddItemModal onAddItem={handleAddItem} onClose={() => setShowAddItemModal(false)} existingCodes={items.map(i => i.code)} defaultType={activeTab === 'product' ? 'product' : 'part'} />
      )}
      {selectedItemId && selectedItem && (
        <ItemDetailModal 
          item={selectedItem} 
          authRole={authRole as any} 
          allUsedSerials={allUsedSerials} 
          existingCodes={items.map(i => i.code)}
          onAddTransaction={handleAddTransaction} 
          onUpdateTransaction={handleUpdateTransaction} 
          onDeleteTransaction={handleDeleteTransaction} 
          onUpdateItem={handleUpdateItem} 
          onClose={() => setSelectedItemId(null)} 
        />
      )}
    </div>
  );
};

export default App;
