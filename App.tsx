
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Item, Transaction, User } from './types';
import AddItemModal from './components/AddItemModal';
import ItemDetailModal from './components/ItemDetailModal';
import ProductReleaseModal from './components/ProductReleaseModal';
import BuyerSearchModal from './components/BuyerSearchModal';
import UserManagementModal from './components/UserManagementModal';
import DateSalesSearchModal from './components/DateSalesSearchModal';
import ResaleModal from './components/ResaleModal';
import { PlusIcon, BoxIcon, SearchIcon, TrashIcon, DownloadIcon, CloudIcon, ServerIcon, SyncIcon, ArrowDownIcon } from './components/icons';

const detectDateInSearch = (text: string): string | null => {
  const clean = text.trim();
  // 1. YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  // 2. YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
  }
  // 3. YYYY.MM.DD
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(clean)) {
    return clean.replace(/\./g, '-');
  }
  // 4. YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(clean)) {
    return clean.replace(/\//g, '-');
  }
  // 5. YY-MM-DD
  if (/^\d{2}-\d{2}-\d{2}$/.test(clean)) {
    return `20${clean}`;
  }
  // 6. YYMMDD
  if (/^\d{6}$/.test(clean)) {
    return `20${clean.substring(0, 2)}-${clean.substring(2, 4)}-${clean.substring(4, 6)}`;
  }
  // 7. YY.MM.DD
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(clean)) {
    return `20${clean.replace(/\./g, '-')}`;
  }
  // 8. YY/MM/DD
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(clean)) {
    return `20${clean.replace(/\//g, '-')}`;
  }
  return null;
};

const STORAGE_KEY = 'inventory_system_data_v2';
const USERS_STORAGE_KEY = 'inventory_system_users_v2';
const ADMIN_PASSWORD = 'aj5200';
const PRODUCT_ONLY_PASSWORD = '2611';

let idCounter = 0;
const generateId = (prefix: string) => {
  idCounter++;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}-${idCounter}`;
};

const calculateStock = (item: Item): number => {
  return item.transactions.reduce((acc, t) => {
    if (t.isDiscarded) return acc;
    if (t.type === 'release') {
      if (t.customerName && t.customerName.trim() === '대천폐기') {
        return acc;
      }
      return acc - t.quantity;
    } else {
      return acc + t.quantity;
    }
  }, 0);
};

const App: React.FC = () => {
  const [authRole, setAuthRole] = useState<'admin' | 'product_only' | 'custom' | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'part' | 'product' | 'return'>('part');
  const [activeProductSubCategory, setActiveProductSubCategory] = useState<'ALL' | 'GiL' | 'KATO' | 'TOMIX'>('ALL');
  
  const [items, setItems] = useState<Item[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showProductReleaseModal, setShowProductReleaseModal] = useState(false);
  const [showBuyerSearchModal, setShowBuyerSearchModal] = useState(false);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDateSalesModal, setShowDateSalesModal] = useState(false);
  const [salesSearchDate, setSalesSearchDate] = useState('');

  const detectedDate = useMemo(() => {
    return detectDateInSearch(searchTerm);
  }, [searchTerm]);
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'inventory'} | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // Restore States
  const [selectedReturnIds, setSelectedReturnIds] = useState<string[]>([]);
  const [showRestorePrompt, setShowRestorePrompt] = useState<{ 
    itemId?: string; 
    transactionId?: string; 
    originalRemarks?: string; 
    transactionIds?: { itemId: string; transactionId: string; originalRemarks: string }[];
  } | null>(null);
  const [restoreActionText, setRestoreActionText] = useState<'수리' | '교환' | '직접입력'>('수리');
  const [restoreDetailText, setRestoreDetailText] = useState('');

  // Resale States
  const [showResalePrompt, setShowResalePrompt] = useState<{
    item: Item;
    transaction: Transaction;
  } | null>(null);

  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'offline'>('loading');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'cloud' | 'local'>('local');
  const [encryptionEnabled, setEncryptionEnabled] = useState<boolean>(false);
  const isInitialLoad = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isHandlingPopstate = useRef(false);
  const initialFetchPromiseRef = useRef<Promise<{ success: boolean; items: Item[]; users: User[] }> | null>(null);

  const fetchFromCloud = async (): Promise<{ success: boolean; items: Item[]; users: User[] }> => {
    setSyncStatus('loading');
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) throw new Error('Server unreachable');
      
      const data = await response.json();
      if (data && Array.isArray(data.items)) {
        // item.id 및 transaction.id 기준 중복 제거 로직 추가
        const uniqueItemsMap = new Map<string, Item>();
        
        data.items.forEach((item: Item) => {
          if (!uniqueItemsMap.has(item.id)) {
            // 트랜잭션 중복 제거
            const uniqueTransactionsMap = new Map<string, Transaction>();
            item.transactions.forEach((t: Transaction) => {
              if (!uniqueTransactionsMap.has(t.id)) {
                uniqueTransactionsMap.set(t.id, t);
              }
            });
            item.transactions = Array.from(uniqueTransactionsMap.values());
            uniqueItemsMap.set(item.id, item);
          }
        });

        const dedupedItems = Array.from(uniqueItemsMap.values());
        setItems(dedupedItems);
        
        const fetchedUsers = data.users || [];
        if (data.users) setUsers(fetchedUsers);
        if (data.encryptionActive !== undefined) {
          setEncryptionEnabled(data.encryptionActive);
        }
        setDataSource('cloud');
        setSyncStatus('success');
        setLastSyncedAt(new Date());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupedItems));
        if (data.users) localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(fetchedUsers));
        return { success: true, items: dedupedItems, users: fetchedUsers };
      }
    } catch (err) {
      console.warn('Cloud fetch failed, using local cache:', err);
      const savedItems = localStorage.getItem(STORAGE_KEY);
      const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);
      const loadedItems = savedItems ? JSON.parse(savedItems) : [];
      const loadedUsers = savedUsers ? JSON.parse(savedUsers) : [];
      if (savedItems) setItems(loadedItems);
      if (savedUsers) setUsers(loadedUsers);
      setDataSource('local');
      setSyncStatus('offline');
      return { success: false, items: loadedItems, users: loadedUsers };
    }
    return { success: false, items: [], users: [] };
  };

  const saveToCloud = async (data: Item[], userData: User[]) => {
    setSyncStatus('loading');
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: data,
          users: userData,
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
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(userData));
    }
  };

  useEffect(() => {
    initialFetchPromiseRef.current = fetchFromCloud();
    initialFetchPromiseRef.current.finally(() => {
      isInitialLoad.current = false;
    });
  }, []);

  const computeHash = (
    tab: string,
    detailId: string | null,
    addItem: boolean,
    release: boolean,
    buyer: boolean,
    userMgmt: boolean
  ) => {
    if (!authRole) return '';
    let h = `tab=${tab}`;
    if (addItem) h += `&modal=addItem`;
    else if (release) h += `&modal=release`;
    else if (buyer) h += `&modal=buyerSearch`;
    else if (userMgmt) h += `&modal=userManagement`;
    else if (detailId) h += `&modal=detail&id=${detailId}`;
    return h;
  };

  useEffect(() => {
    if (!authRole) {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }

    if (isHandlingPopstate.current) return;

    const expectedHash = '#' + computeHash(
      activeTab,
      selectedItemId,
      showAddItemModal,
      showProductReleaseModal,
      showBuyerSearchModal,
      showUserManagementModal
    );

    if (window.location.hash !== expectedHash) {
      const currentHash = window.location.hash;
      if (!currentHash || currentHash === '#') {
        window.history.replaceState({ activeTab, selectedItemId }, '', expectedHash);
      } else {
        window.history.pushState({ activeTab, selectedItemId }, '', expectedHash);
      }
    }
  }, [
    authRole,
    activeTab,
    selectedItemId,
    showAddItemModal,
    showProductReleaseModal,
    showBuyerSearchModal,
    showUserManagementModal
  ]);

  useEffect(() => {
    const handlePopState = () => {
      if (!authRole) return;

      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        handleLogout();
        return;
      }

      isHandlingPopstate.current = true;

      const params = new URLSearchParams(hash);
      const tab = params.get('tab') as 'part' | 'product' | 'return' | null;
      const modal = params.get('modal');
      const id = params.get('id');

      if (tab && (tab === 'part' || tab === 'product' || tab === 'return')) {
        setActiveTab(tab);
      }

      setShowAddItemModal(modal === 'addItem');
      setShowProductReleaseModal(modal === 'release');
      setShowBuyerSearchModal(modal === 'buyerSearch');
      setShowUserManagementModal(modal === 'userManagement');
      setSelectedItemId(modal === 'detail' ? id : null);

      setTimeout(() => {
        isHandlingPopstate.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [authRole]);

 useEffect(() => {
  // 초기 로드 중에는 클라우드에 빈 값을 저장하지 않음
  if (isInitialLoad.current) return;

  // 로컬 저장
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

  const timer = setTimeout(() => {
    // [중요] 데이터가 유실되지 않도록 최소한의 방어막 구축
    // 불러온 데이터가 아예 없을 때(items.length === 0) 
    // 실수로 빈 배열을 Upstash에 보내는 것을 방지
    if (items.length > 0) {
      saveToCloud(items, users);
    }
  }, 2000); 

  return () => clearTimeout(timer);
}, [items, users]);

  const returnCount = useMemo(() => {
    const seenIds = new Set<string>();
    let count = 0;
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (t.isReturned && !t.isDiscarded && !seenIds.has(t.id)) {
          count++;
          seenIds.add(t.id);
        }
      });
    });
    return count;
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

  const handleLocalExport = () => {
    const dataObj = { items, users, exportDate: new Date().toISOString(), version: '2.1' };
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
            if (json.users) setUsers(json.users);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const checkCredentials = (password: string, userList: User[]) => {
      if (password === ADMIN_PASSWORD) {
        setAuthRole('admin');
        setCurrentUser({ id: 'admin', name: 'ADMINISTRATOR', password: ADMIN_PASSWORD, partPermission: 'edit', productPermission: 'edit', showPricePermission: true });
        setActiveTab('part');
        return true;
      } else if (password === PRODUCT_ONLY_PASSWORD) {
        setAuthRole('product_only');
        setCurrentUser({ id: 'product_only', name: 'PRODUCT MANAGER', password: PRODUCT_ONLY_PASSWORD, partPermission: 'none', productPermission: 'edit' });
        setActiveTab('product');
        return true;
      } else {
        const foundUser = userList.find(u => u.password === password);
        if (foundUser) {
          setAuthRole('custom');
          setCurrentUser(foundUser);
          if (foundUser.partPermission !== 'none') setActiveTab('part');
          else if (foundUser.productPermission !== 'none') setActiveTab('product');
          return true;
        }
      }
      return false;
    };

    // 1. First, check with the current user state (which contains local cached users from localStorage)
    if (checkCredentials(loginPassword, users)) {
      setLoginPassword('');
      return;
    }

    // 2. If not matched, check if the initial cloud fetch is still running
    if (isInitialLoad.current && initialFetchPromiseRef.current) {
      try {
        // Wait for the cloud fetch to finish
        const result = await initialFetchPromiseRef.current;
        // Check again with the freshly fetched list of users
        if (result && checkCredentials(loginPassword, result.users)) {
          setLoginPassword('');
          return;
        }
      } catch (err) {
        console.error('Error waiting for initial fetch during login:', err);
      }
    }

    // 3. Still not matching
    alert('비밀번호가 틀렸습니다.');
    setLoginPassword('');
  };

  const handleLogout = () => {
    setAuthRole(null);
    setCurrentUser(null);
    setSearchTerm('');
  };

  const hasPermission = (tab: 'part' | 'product', action: 'read' | 'edit') => {
    if (!currentUser) return false;
    const perm = tab === 'part' ? currentUser.partPermission : currentUser.productPermission;
    if (action === 'read') return perm !== 'none';
    if (action === 'edit') return perm === 'edit';
    return false;
  };

  const handleAddItem = (itemData: Omit<Item, 'id' | 'transactions'>, initialQuantity: number) => {
    const newItem: Item = { ...itemData, id: generateId('item'), transactions: [] };
    if (initialQuantity > 0) {
      newItem.transactions.push({
        id: generateId('t'), type: 'purchase', quantity: initialQuantity,
        date: new Date().toISOString(), remarks: '초기 수량 등록',
      });
    }
    setItems(prev => {
      const newItems = [...prev, newItem];
      return newItems.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
    });
  };

  const handleDeleteItemConfirm = () => {
    const isPassValid = 
      (authRole === 'admin' && deletePassword === ADMIN_PASSWORD) ||
      (deletePassword === ADMIN_PASSWORD) ||
      (deletePassword === currentUser?.password);
    if (!isPassValid) {
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

  const handleBatchAddTransactions = (itemId: string, transactionsData: Omit<Transaction, 'id'>[]) => {
    const newTransactions = transactionsData.map(t => ({ ...t, id: generateId('t') }));
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: [...item.transactions, ...newTransactions] };
      }
      return item;
    }));
  };

  const handleUpdateTransaction = (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => {
    setItems(prev => {
      // Find the target item and transaction
      const targetItem = prev.find(item => item.id === itemId);
      const targetTrans = targetItem?.transactions.find(t => t.id === transactionId);

      const specialNames = ['대천AS', '대천폐기', '대천', '대천공장'];
      const origCust = (targetTrans?.customerName || '').trim();
      const origUser = (targetTrans?.userId || '').trim();
      const isSpecial = specialNames.includes(origCust);

      const isCustomerInfoChanged = !!targetTrans && !isSpecial && (origCust !== '' || origUser !== '') && (
        (updatedData.customerName !== undefined && updatedData.customerName !== targetTrans.customerName) ||
        (updatedData.userId !== undefined && updatedData.userId !== targetTrans.userId) ||
        (updatedData.phoneNumber !== undefined && updatedData.phoneNumber !== targetTrans.phoneNumber) ||
        (updatedData.address !== undefined && updatedData.address !== targetTrans.address) ||
        (updatedData.priceType !== undefined && updatedData.priceType !== targetTrans.priceType)
      );

      const todayStr = new Date().toISOString().split('T')[0];

      if (isCustomerInfoChanged) {
        const customerSyncData: Partial<Transaction> = {
          customerUpdatedDate: todayStr,
        };
        if (updatedData.customerName !== undefined) customerSyncData.customerName = updatedData.customerName;
        if (updatedData.userId !== undefined) customerSyncData.userId = updatedData.userId;
        if (updatedData.phoneNumber !== undefined) customerSyncData.phoneNumber = updatedData.phoneNumber;
        if (updatedData.address !== undefined) customerSyncData.address = updatedData.address;
        if (updatedData.priceType !== undefined) customerSyncData.priceType = updatedData.priceType;

        return prev.map(item => ({
          ...item,
          transactions: item.transactions.map(t => {
            if (t.id === transactionId && item.id === itemId) {
              const currentUnitPrice = updatedData.unitPrice !== undefined 
                ? updatedData.unitPrice 
                : (updatedData.priceType === 'agency' ? (item.agencyPrice || item.unitPrice || 0) : (item.unitPrice || 0));
              return { ...t, ...updatedData, unitPrice: currentUnitPrice, customerUpdatedDate: todayStr };
            }
            // Same buyer release transactions across all items
            const tCust = (t.customerName || '').trim();
            const tUser = (t.userId || '').trim();
            const isSameBuyer = t.type === 'release' && !specialNames.includes(tCust) && (
              (origCust !== '' && tCust === origCust) ||
              (origUser !== '' && tUser === origUser)
            );
            if (isSameBuyer) {
              const updatedBuyerTrans: Partial<Transaction> = { ...customerSyncData };
              if (updatedData.priceType !== undefined) {
                updatedBuyerTrans.priceType = updatedData.priceType;
                updatedBuyerTrans.unitPrice = updatedData.priceType === 'agency' 
                  ? (item.agencyPrice || item.unitPrice || 0) 
                  : (item.unitPrice || 0);
              }
              return { ...t, ...updatedBuyerTrans };
            }
            return t;
          })
        }));
      }

      return prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            transactions: item.transactions.map(t => t.id === transactionId ? { ...t, ...updatedData } : t)
          };
        }
        return item;
      });
    });
  };

  const handleRestoreSubmit = () => {
    if (!showRestorePrompt) return;

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

    if (showRestorePrompt.transactionIds && showRestorePrompt.transactionIds.length > 0) {
      setItems(prev => prev.map(item => {
        const itemRestores = showRestorePrompt.transactionIds!.filter(r => r.itemId === item.id);
        if (itemRestores.length > 0) {
          return {
            ...item,
            transactions: item.transactions.map(t => {
              const r = itemRestores.find(x => x.transactionId === t.id);
              if (r) {
                const finalRemarks = r.originalRemarks 
                  ? `${r.originalRemarks} / 복원: ${actionLabel}` 
                  : `복원: ${actionLabel}`;
                return {
                  ...t,
                  isReturned: false,
                  returnReason: undefined,
                  remarks: finalRemarks
                };
              }
              return t;
            })
          };
        }
        return item;
      }));
      setSelectedReturnIds([]);
      alert(`${showRestorePrompt.transactionIds.length}건이 일괄 원래 출고 상태로 복원되었습니다.`);
    } else if (showRestorePrompt.itemId && showRestorePrompt.transactionId) {
      const { itemId, transactionId, originalRemarks } = showRestorePrompt;
      const finalRemarks = originalRemarks 
        ? `${originalRemarks} / 복원: ${actionLabel}` 
        : `복원: ${actionLabel}`;

      handleUpdateTransaction(itemId, transactionId, {
        isReturned: false,
        returnReason: undefined,
        remarks: finalRemarks
      });
      alert('원래 출고 상태로 복원되었습니다.');
    }

    setShowRestorePrompt(null);
    setRestoreActionText('수리');
    setRestoreDetailText('');
  };

  const handleBatchReturnRestore = () => {
    if (selectedReturnIds.length === 0) {
      alert('원복할 품목을 선택해주세요.');
      return;
    }
    
    const restoreList: { itemId: string; transactionId: string; originalRemarks: string }[] = [];
    items.forEach(item => {
      item.transactions.forEach(t => {
        if (selectedReturnIds.includes(t.id)) {
          restoreList.push({
            itemId: item.id,
            transactionId: t.id,
            originalRemarks: t.remarks || ''
          });
        }
      });
    });

    if (restoreList.length === 0) return;

    setShowRestorePrompt({
      transactionIds: restoreList
    });
  };

  const handleBatchReturnDiscard = () => {
    if (selectedReturnIds.length === 0) {
      alert('폐기할 품목을 선택해주세요.');
      return;
    }
    if (confirm(`선택한 ${selectedReturnIds.length}개 반품 품목을 일괄 폐기하시겠습니까?`)) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      setItems(prev => prev.map(item => {
        const hasSelected = item.transactions.some(t => selectedReturnIds.includes(t.id));
        if (hasSelected) {
          return {
            ...item,
            transactions: item.transactions.map(t => {
              if (selectedReturnIds.includes(t.id)) {
                const newRemarks = t.remarks ? `${t.remarks} / 폐기(${dateStr})` : `폐기(${dateStr})`;
                return {
                  ...t,
                  isDiscarded: true,
                  remarks: newRemarks
                };
              }
              return t;
            })
          };
        }
        return item;
      }));
      setSelectedReturnIds([]);
      alert('선택한 품목들이 일괄 폐기되었습니다.');
    }
  };

  const handleDeleteTransaction = (itemId: string, transactionId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, transactions: item.transactions.filter(t => t.id !== transactionId) };
      }
      return item;
    }));
  };

  const handleBatchRelease = (releases: { itemId: string, transaction: Omit<Transaction, 'id'> }[]) => {
    setItems(prev => prev.map(item => {
      const itemReleases = releases.filter(r => r.itemId === item.id);
      if (itemReleases.length > 0) {
        const newTransactions = itemReleases.map(r => ({ ...r.transaction, id: generateId('t') }));
        return { ...item, transactions: [...item.transactions, ...newTransactions] };
      }
      return item;
    }));
    setShowProductReleaseModal(false);
    alert('출고 처리가 완료되었습니다.');
  };

  const selectedItem = useMemo(() => items.find(i => i.id === selectedItemId), [items, selectedItemId]);

  const showPrice = useMemo(() => {
    if (authRole === 'admin') return true;
    if (authRole === 'custom' && currentUser?.showPricePermission) return true;
    return false;
  }, [authRole, currentUser]);

  const filteredInventory = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    
    if (activeTab === 'return') {
      const allReturns: { item: Item, transaction: Transaction }[] = [];
      const seenTransactionIds = new Set<string>();

      items.forEach(item => {
        item.transactions.forEach(t => {
          if (t.isReturned && !t.isDiscarded) {
            if (!seenTransactionIds.has(t.id)) {
              allReturns.push({ item, transaction: t });
              seenTransactionIds.add(t.id);
            }
          }
        });
      });
      
      return allReturns.filter(({ item, transaction }) => {
        return item.name.toLowerCase().includes(term) || 
               item.code.toLowerCase().includes(term) ||
               transaction.serialNumber?.toLowerCase().includes(term) ||
               transaction.originalSerialNumber?.toLowerCase().includes(term) ||
               transaction.customerName?.toLowerCase().includes(term) ||
               transaction.userId?.toLowerCase().includes(term) ||
               transaction.returnReason?.toLowerCase().includes(term);
      });
    }

    return items.filter(item => {
        const matchesTab = (activeTab === 'part' && item.type === 'part') || (activeTab === 'product' && item.type === 'product');
        if (!matchesTab) return false;
        if (activeTab === 'product' && activeProductSubCategory !== 'ALL' && item.category !== activeProductSubCategory) return false;

        const basicMatch = item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term);
        if (basicMatch) return true;
        
        if (activeTab === 'product') return item.transactions.some(t => 
          !t.isReturned && (
            t.serialNumber?.toLowerCase().includes(term) ||
            t.originalSerialNumber?.toLowerCase().includes(term) ||
            t.customerName?.toLowerCase().includes(term) ||
            t.userId?.toLowerCase().includes(term)
          )
        );
        return false;
    });
  }, [items, searchTerm, activeTab, activeProductSubCategory]);

  const exportToExcel = () => {
    let csvContent = "\ufeff";
    let headers: string[] = [];
    let filename = "";

    if (activeTab === 'return') {
      headers = ['제품명', '품번', '일련번호', '반품사유', '고객명', '아이디', '비고'];
      filename = `반품_보관_${new Date().toISOString().split('T')[0]}.csv`;
      csvContent += headers.join(',') + '\r\n';
      (filteredInventory as any[]).forEach(({ item, transaction }) => {
        const row = [
          item.name,
          item.code,
          transaction.serialNumber || '-',
          transaction.returnReason || '-',
          transaction.customerName || '-',
          transaction.userId || '-',
          transaction.remarks || '-'
        ];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
      });
    } else {
      headers = activeTab === 'part' ? ['코드', '품명', '도번', '현재재고'] : ['카테고리', '코드', '제품명', '현재재고'];
      filename = `${activeTab === 'part' ? '부품' : '제품'}_재고_${new Date().toISOString().split('T')[0]}.csv`;
      csvContent += headers.join(',') + '\r\n';
      (filteredInventory as Item[]).forEach(item => {
        const row = activeTab === 'part' 
          ? [item.code, item.name, item.drawingNumber, calculateStock(item)]
          : [item.category || '-', item.code, item.name, calculateStock(item)];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n';
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!authRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 sm:p-12 animate-fade-in-up border border-slate-100">
          <div className="flex flex-col items-center mb-8 sm:mb-10">
            <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg mb-6">
              <BoxIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight uppercase text-center">Ajin 재고 관리 시스템</h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-black mt-2 tracking-widest uppercase text-center">Cloud Storage Infrastructure</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <input 
              type="password" autoFocus value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="PASSWORD"
              className="w-full px-4 sm:px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none text-center text-2xl sm:text-3xl font-black tracking-[0.3em] sm:tracking-[0.5em] transition-all"
            />
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-xl hover:bg-indigo-700 transition-all text-base sm:text-lg uppercase tracking-widest">시스템 로그인</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col lg:flex-row justify-between lg:items-center py-4 gap-4">
                <div className="flex items-center space-x-3 sm:space-x-4">
                    <BoxIcon className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" />
                    <div>
                      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight uppercase">Ajin 재고 관리</h1>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] sm:text-xs font-black text-slate-600 uppercase tracking-widest">
                          Welcome, <span className="text-indigo-600 font-black">{currentUser?.name}</span>
                        </span>
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${dataSource === 'cloud' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                          {dataSource === 'cloud' ? <ServerIcon className="w-2 h-2 sm:w-2.5 sm:h-2.5" /> : <BoxIcon className="w-2 h-2 sm:w-2.5 sm:h-2.5" />}
                          <span className="hidden sm:inline">{dataSource === 'cloud' ? 'Cloud Connected' : 'Local Mode'}</span>
                          <span className="sm:hidden">{dataSource === 'cloud' ? 'Cloud' : 'Local'}</span>
                        </span>
                        {dataSource === 'cloud' && (
                          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${encryptionEnabled ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                            <span>{encryptionEnabled ? '🔒 암호화 적용됨' : '🔓 암호화 미적용 (설정필요)'}</span>
                          </span>
                        )}
                        {syncStatus === 'loading' && <SyncIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-400 animate-spin" />}
                      </div>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end lg:space-y-1">
                    {authRole === 'admin' && (
                      <button onClick={() => setShowUserManagementModal(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-[9px] font-black uppercase tracking-widest shadow-sm">
                        사용자 및 권한 관리
                      </button>
                    )}
                    <button onClick={handleLocalExport} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 text-[9px] font-black uppercase tracking-widest shadow-sm">
                        <DownloadIcon className="w-3 h-3" />
                        <span className="hidden sm:inline">백업 저장</span>
                    </button>
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 text-[9px] font-black uppercase tracking-widest shadow-sm cursor-pointer">
                        <CloudIcon className="w-3 h-3" />
                        <span className="hidden sm:inline">백업 불러오기</span>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleLocalImport} />
                    </label>
                    <button onClick={fetchFromCloud} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                        <SyncIcon className={`w-3 h-3 ${syncStatus === 'loading' ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">새로고침</span>
                    </button>
                    <button onClick={handleLogout} className="px-2.5 py-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-rose-50 hover:text-rose-600 font-black text-[9px] uppercase border border-slate-200">Logout</button>
                </div>
            </div>
            
            <div className="flex space-x-6 sm:space-x-12 -mb-px overflow-x-auto no-scrollbar">
                {hasPermission('part', 'read') && (
                  <button onClick={() => setActiveTab('part')} className={`pb-3 sm:pb-4 px-1 text-sm sm:text-lg font-black uppercase tracking-widest transition-all border-b-4 whitespace-nowrap ${activeTab === 'part' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    부품 재고 ({stats.partCount})
                  </button>
                )}
                {hasPermission('product', 'read') && (
                  <button onClick={() => setActiveTab('product')} className={`pb-3 sm:pb-4 px-1 text-sm sm:text-lg font-black uppercase tracking-widest transition-all border-b-4 whitespace-nowrap ${activeTab === 'product' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    제품 재고 ({stats.productCount})
                  </button>
                )}
                {hasPermission('product', 'read') && (
                  <button onClick={() => setActiveTab('return')} className={`pb-3 sm:pb-4 px-1 text-sm sm:text-lg font-black uppercase tracking-widest transition-all border-b-4 whitespace-nowrap ${activeTab === 'return' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    반품 보관 ({returnCount})
                  </button>
                )}
            </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-8">
        {activeTab === 'product' && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
            {['ALL', 'GiL', 'KATO', 'TOMIX'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveProductSubCategory(cat as any)}
                className={`px-6 py-2 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest border-2 transition-all shadow-sm ${
                  activeProductSubCategory === cat 
                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                  : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'
                }`}
              >
                {cat === 'ALL' ? '전체 제품' : cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-4 sm:gap-6 mb-6 sm:mb-10">
          <div className="relative flex-grow max-w-3xl w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 sm:pl-5"><SearchIcon className="text-slate-400 w-5 h-5 sm:w-6 sm:h-6" /></span>
              <input
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                  placeholder="품명, 코드, 일련번호, 대상자, 아이디 검색..."
                  className="w-full pl-11 sm:pl-14 pr-4 sm:pr-6 py-3 sm:py-4 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:outline-none focus:border-indigo-400 bg-white shadow-sm font-bold text-base sm:text-lg transition-all"
              />
              {detectedDate && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3 shadow-lg z-30 flex items-center justify-between animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black text-indigo-800">
                      📅 입력하신 날짜 <span className="text-indigo-600 font-extrabold underline">{detectedDate}</span>의 판매(출고) 내역을 새창으로 조회하시겠습니까?
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSalesSearchDate(detectedDate);
                      setShowDateSalesModal(true);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black text-xs sm:text-sm transition-all"
                  >
                    새창으로 보기
                  </button>
                </div>
              )}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button onClick={exportToExcel} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-emerald-600 text-white font-black rounded-lg sm:rounded-xl shadow-lg hover:bg-emerald-700 text-xs sm:text-sm uppercase tracking-widest">
                <ServerIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">엑셀 파일 저장</span>
                <span className="sm:hidden">엑셀 저장</span>
            </button>
            {activeTab === 'product' && (
              <>
                <button
                  onClick={() => {
                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    const todayStr = `${yyyy}-${mm}-${dd}`;
                    setSalesSearchDate(detectedDate || todayStr);
                    setShowDateSalesModal(true);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-sky-600 text-white font-black rounded-lg sm:rounded-xl shadow-xl hover:bg-sky-700 text-xs sm:text-sm uppercase tracking-widest transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <span>날짜별 판매 조회</span>
                </button>
                <button onClick={() => setShowBuyerSearchModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-violet-600 text-white font-black rounded-lg sm:rounded-xl shadow-xl hover:bg-violet-700 text-xs sm:text-sm uppercase tracking-widest">
                  <SearchIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>구매자 검색</span>
                </button>
                {hasPermission('product', 'edit') && (
                  <button onClick={() => setShowProductReleaseModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-rose-600 text-white font-black rounded-lg sm:rounded-xl shadow-xl hover:bg-rose-700 text-xs sm:text-sm uppercase tracking-widest">
                    <ArrowDownIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>제품 출고</span>
                  </button>
                )}
              </>
            )}
            {hasPermission(activeTab, 'edit') && (
              <button onClick={() => setShowAddItemModal(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-indigo-600 text-white font-black rounded-lg sm:rounded-xl shadow-xl hover:bg-indigo-700 text-xs sm:text-sm uppercase tracking-widest">
                  <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">신규 등록</span>
                  <span className="sm:hidden">신규 등록</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white shadow-xl sm:shadow-2xl border border-slate-100 rounded-2xl sm:rounded-[2.5rem] overflow-hidden relative">
          {activeTab === 'return' && selectedReturnIds.length > 0 && (
            <div className="bg-indigo-50 border-b border-indigo-100 px-4 sm:px-10 py-4 sm:py-5 flex items-center justify-between text-sm sm:text-base animate-fade-in z-20">
              <span className="font-black text-indigo-800">
                선택됨: <span className="text-base sm:text-xl text-indigo-600 font-extrabold">{selectedReturnIds.length}</span>개 반품 품목
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleBatchReturnRestore}
                  className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs sm:text-sm transition-colors shadow-sm cursor-pointer"
                >
                  일괄 원복
                </button>
                <button
                  onClick={handleBatchReturnDiscard}
                  className="px-3 sm:px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs sm:text-sm transition-colors shadow-sm cursor-pointer"
                >
                  일괄 폐기
                </button>
                <button
                  onClick={() => setSelectedReturnIds([])}
                  className="px-2.5 py-2 bg-white text-slate-500 border border-slate-200 hover:bg-slate-100 rounded-xl font-black text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  선택 해제
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto scrollbar-hide">
            {activeTab === 'return' ? (
              <table className="w-full text-left min-w-[800px]">
                <thead className="text-[10px] sm:text-sm text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-black tracking-widest sm:tracking-[0.2em]">
                  <tr>
                    <th className="px-4 sm:px-10 py-4 sm:py-7 w-12 text-center select-none">
                      <input 
                        type="checkbox"
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        checked={(filteredInventory as any[]).length > 0 && selectedReturnIds.length === (filteredInventory as any[]).length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedReturnIds((filteredInventory as any[]).map(({ transaction }) => transaction.id));
                          } else {
                            setSelectedReturnIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 sm:px-10 py-4 sm:py-7">제품 정보</th>
                    <th className="px-4 sm:px-10 py-4 sm:py-7">일련번호</th>
                    <th className="px-4 sm:px-10 py-4 sm:py-7">반품 사유</th>
                    <th className="px-4 sm:px-10 py-4 sm:py-7">고객 / ID</th>
                    <th className="px-4 sm:px-10 py-4 sm:py-7 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(filteredInventory as any[]).length === 0 ? (
                    <tr><td colSpan={6} className="px-10 py-16 sm:py-24 text-center text-slate-300 font-black uppercase tracking-widest italic text-xl sm:text-2xl">반품된 내역이 없습니다</td></tr>
                  ) : (
                    (filteredInventory as any[]).map(({ item, transaction }) => (
                      <tr key={transaction.id} className={`hover:bg-indigo-50/30 transition-colors group ${transaction.isDiscarded ? 'bg-rose-50/30' : ''}`}>
                        <td className="px-4 sm:px-10 py-4 sm:py-7 text-center select-none">
                          <input 
                            type="checkbox"
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={selectedReturnIds.includes(transaction.id)}
                            onChange={() => {
                              setSelectedReturnIds(prev => 
                                prev.includes(transaction.id)
                                  ? prev.filter(id => id !== transaction.id)
                                  : [...prev, transaction.id]
                              );
                            }}
                          />
                        </td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7">
                          <p className={`font-black text-slate-800 text-sm sm:text-lg ${transaction.isDiscarded ? 'line-through text-rose-400 decoration-rose-500 decoration-2' : ''}`}>{item.name}</p>
                          <p className="text-[10px] font-mono text-indigo-600 font-bold">{item.code}</p>
                        </td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7 font-mono font-black text-indigo-600 text-sm sm:text-lg">
                          <span className={transaction.isDiscarded ? 'line-through text-rose-400 decoration-rose-500 decoration-2' : ''}>{transaction.serialNumber}</span>
                        </td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7">
                          <span className={`px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-100 ${transaction.isDiscarded ? 'opacity-50' : ''}`}>{transaction.returnReason}</span>
                          {transaction.remarks && <p className="text-[10px] text-slate-400 mt-1 font-bold whitespace-pre-wrap break-all">{transaction.remarks}</p>}
                        </td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7">
                          <p className={`font-black text-slate-700 text-sm ${transaction.isDiscarded ? 'line-through text-rose-300' : ''}`}>{transaction.customerName || '-'}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{transaction.userId || '-'}</p>
                        </td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7">
                          <div className="flex justify-center gap-2">
                            {transaction.isDiscarded ? (
                              <button 
                                onClick={() => handleUpdateTransaction(item.id, transaction.id, { isDiscarded: false })}
                                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-black text-[10px] uppercase border border-emerald-100 hover:bg-emerald-600 hover:text-white"
                              >
                                복구
                              </button>
                            ) : (
                              <>
                                <button 
                                  onClick={() => {
                                    const now = new Date();
                                    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                    const newRemarks = transaction.remarks ? `${transaction.remarks} / 폐기(${dateStr})` : `폐기(${dateStr})`;
                                    handleUpdateTransaction(item.id, transaction.id, { isDiscarded: true, remarks: newRemarks });
                                  }}
                                  className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg font-black text-[10px] uppercase border border-rose-100 hover:bg-rose-600 hover:text-white"
                                >
                                  폐기
                                </button>
                                <button 
                                  id={`return_restore_btn_${transaction.id}`}
                                  onClick={() => {
                                    setShowRestorePrompt({
                                      itemId: item.id,
                                      transactionId: transaction.id,
                                      originalRemarks: transaction.remarks || ''
                                    });
                                  }}
                                  className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-black text-[10px] uppercase border border-indigo-100 hover:bg-indigo-600 hover:text-white"
                                >
                                  원복
                                </button>
                                <button 
                                  id={`return_resale_btn_${transaction.id}`}
                                  onClick={() => {
                                    setShowResalePrompt({
                                      item,
                                      transaction
                                    });
                                  }}
                                  className="px-3 py-1.5 bg-sky-50 text-sky-600 rounded-lg font-black text-[10px] uppercase border border-sky-100 hover:bg-sky-600 hover:text-white"
                                >
                                  재판매
                                </button>
                              </>
                            )}
                            <button 
                              onClick={() => {
                                if (confirm('반품 내역을 삭제하시겠습니까? 삭제 시 해당 출고 내역이 완전히 제거되어 재고 수량이 복구됩니다.')) {
                                  handleDeleteTransaction(item.id, transaction.id);
                                }
                              }}
                              className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left min-w-[600px] lg:min-w-0">
              <thead className="text-[10px] sm:text-sm text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-black tracking-widest sm:tracking-[0.2em]">
                <tr>
                  <th className="px-4 sm:px-10 py-4 sm:py-7">품목 코드</th>
                  <th className="px-4 sm:px-10 py-4 sm:py-7">품명 / 제품명</th>
                  {activeTab === 'part' ? (
                    <th className="px-4 sm:px-10 py-4 sm:py-7">도번</th>
                  ) : (
                    <th className="px-4 sm:px-10 py-4 sm:py-7">브랜드</th>
                  )}
                  <th className="px-4 sm:px-10 py-4 sm:py-7 text-right">재고수량</th>
                  <th className="px-4 sm:px-10 py-4 sm:py-7 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredInventory.length === 0 ? (
                  <tr><td colSpan={5} className="px-10 py-16 sm:py-24 text-center text-slate-300 font-black uppercase tracking-widest italic text-xl sm:text-2xl">기록된 데이터가 없습니다</td></tr>
                ) : (
                  filteredInventory.map(item => {
                    const stock = calculateStock(item);
                    return (
                      <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-4 sm:px-10 py-4 sm:py-7 font-mono text-indigo-600 font-black text-base sm:text-xl">{item.code}</td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7 font-black text-slate-800 text-sm sm:text-lg">{item.name}</td>
                        {activeTab === 'part' ? (
                          <td className="px-4 sm:px-10 py-4 sm:py-7 text-slate-400 font-mono text-[10px] sm:text-sm uppercase font-bold">{item.drawingNumber || '-'}</td>
                        ) : (
                          <td className="px-4 sm:px-10 py-4 sm:py-7">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-wider">{item.category || '-'}</span>
                          </td>
                        )}
                        <td className="px-4 sm:px-10 py-4 sm:py-7 text-right">
                            <span className={`text-xl sm:text-4xl font-black ${stock > 0 ? 'text-slate-900' : 'text-rose-500 animate-pulse'}`}>
                                {stock.toLocaleString()} <span className="text-[10px] sm:text-xs uppercase text-slate-400 ml-1">EA</span>
                            </span>
                        </td>
                        <td className="px-4 sm:px-10 py-4 sm:py-7">
                          <div className="flex justify-center gap-2 sm:gap-4">
                            <button onClick={() => setSelectedItemId(item.id)} className="px-3 sm:px-6 py-2 sm:py-3 bg-indigo-50 text-indigo-600 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-sm uppercase tracking-wider hover:bg-indigo-600 hover:text-white shadow-sm">상세</button>
                            {authRole === 'admin' && (
                              <button onClick={() => setItemToDelete({id: item.id, type: 'inventory'})} className="p-2 sm:p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg sm:rounded-2xl transition-all"><TrashIcon className="w-5 h-5 sm:w-7 sm:h-7" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </main>

      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-10 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
                <div className="flex flex-col items-center mb-6 sm:mb-8">
                    <div className="p-4 sm:p-5 bg-rose-50 rounded-2xl sm:rounded-[1.5rem] mb-4 sm:mb-6"><TrashIcon className="w-10 h-10 sm:w-12 sm:h-12 text-rose-500" /></div>
                    <h4 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tight">삭제 비밀번호</h4>
                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest text-center">영구적으로 삭제되며 복구할 수 없습니다.</p>
                </div>
                <input type="password" autoFocus value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDeleteItemConfirm()} placeholder="PASSWORD" className="w-full px-4 sm:px-6 py-4 sm:py-5 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-rose-500 outline-none mb-6 sm:mb-8 text-center text-2xl sm:text-3xl font-black tracking-widest" />
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setItemToDelete(null)} className="py-3 sm:py-4 bg-slate-100 text-slate-600 rounded-lg sm:rounded-xl font-black uppercase text-xs sm:text-sm tracking-widest">취소</button>
                    <button onClick={handleDeleteItemConfirm} className="py-3 sm:py-4 bg-rose-600 text-white rounded-lg sm:rounded-xl font-black uppercase text-xs sm:text-sm tracking-widest shadow-lg shadow-rose-100">삭제 확정</button>
                </div>
            </div>
        </div>
      )}

      {showRestorePrompt && (
        <div id="app_restore_action_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 animate-fade-in-up">
            <h4 className="text-2xl font-black text-slate-800 mb-6 tracking-tight uppercase">반품 복원 조치 선택</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">처리 결과 선택</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['수리', '교환', '직접입력'] as const).map(action => (
                    <button
                      key={action}
                      type="button"
                      id={`app_restore_action_btn_${action}`}
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
                    id="app_restore_action_custom_input"
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
                    id="app_restore_action_detail_input"
                    value={restoreDetailText} 
                    onChange={(e) => setRestoreDetailText(e.target.value)}
                    placeholder="추가 설명이 필요하면 적어주세요..."
                    className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mt-6">
                <button 
                  id="app_restore_action_cancel_btn"
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
                  id="app_restore_action_confirm_btn"
                  onClick={handleRestoreSubmit} 
                  className="py-4 bg-sky-500 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-lg shadow-sky-100"
                >
                  원복 확정
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddItemModal && (
        <AddItemModal onAddItem={handleAddItem} onClose={() => setShowAddItemModal(false)} existingCodes={items.map(i => i.code)} defaultType={activeTab === 'product' ? 'product' : 'part'} />
      )}
      {showProductReleaseModal && (
        <ProductReleaseModal 
          items={items.filter(i => i.type === 'product')} 
          allUsedSerials={allUsedSerials} 
          onBatchRelease={handleBatchRelease} 
          onClose={() => setShowProductReleaseModal(false)} 
          showPrice={showPrice}
        />
      )}
      {showBuyerSearchModal && (
        <BuyerSearchModal 
          items={items.filter(i => i.type === 'product')} 
          onClose={() => setShowBuyerSearchModal(false)} 
          showPrice={showPrice}
        />
      )}
      {showUserManagementModal && (
        <UserManagementModal
          users={users}
          onUpdateUsers={(updatedUsers) => setUsers(updatedUsers)}
          onClose={() => setShowUserManagementModal(false)}
        />
      )}
      {showDateSalesModal && (
        <DateSalesSearchModal
          isOpen={showDateSalesModal}
          onClose={() => setShowDateSalesModal(false)}
          initialDate={salesSearchDate}
          items={items}
          showPrice={showPrice}
        />
      )}
      {selectedItemId && selectedItem && (
        <ItemDetailModal 
          item={selectedItem} 
          authRole={authRole as any} 
          currentUser={currentUser}
          allUsedSerials={allUsedSerials} 
          existingCodes={items.map(i => i.code)}
          onAddTransaction={handleAddTransaction} 
          onAddTransactions={handleBatchAddTransactions}
          onUpdateTransaction={handleUpdateTransaction} 
          onDeleteTransaction={handleDeleteTransaction} 
          onUpdateItem={handleUpdateItem} 
          onClose={() => setSelectedItemId(null)} 
          showPrice={showPrice}
        />
      )}
      {showResalePrompt && (
        <ResaleModal
          item={showResalePrompt.item}
          transaction={showResalePrompt.transaction}
          allUsedSerials={allUsedSerials}
          onConfirm={(itemId, transactionId, updatedData) => {
            handleUpdateTransaction(itemId, transactionId, updatedData);
            setShowResalePrompt(null);
            alert('재판매 처리가 완료되었습니다. 반품 보관에서 복구되었습니다.');
          }}
          onClose={() => setShowResalePrompt(null)}
        />
      )}
    </div>
  );
};

export default App;
