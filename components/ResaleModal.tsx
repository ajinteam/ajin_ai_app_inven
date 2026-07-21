import React, { useState } from 'react';
import type { Item, Transaction } from '../types';
import { CloseIcon } from './icons';

interface ResaleModalProps {
  item: Item;
  transaction: Transaction;
  allUsedSerials: string[];
  onConfirm: (itemId: string, transactionId: string, updatedData: Partial<Transaction>) => void;
  onClose: () => void;
}

export default function ResaleModal({
  item,
  transaction,
  allUsedSerials,
  onConfirm,
  onClose,
}: ResaleModalProps) {
  const [newSerialNumber, setNewSerialNumber] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [newAddress, setNewAddress] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const serialTrimmed = newSerialNumber.trim().toUpperCase();
    const customerTrimmed = newCustomerName.trim();

    if (!serialTrimmed) {
      alert('신규 일련번호를 입력하세요.');
      return;
    }
    if (!customerTrimmed) {
      alert('신규 고객명을 입력하세요.');
      return;
    }

    if (allUsedSerials.includes(serialTrimmed) && serialTrimmed !== transaction.serialNumber?.toUpperCase()) {
      alert('이미 사용 중인 일련번호입니다. 다른 일련번호를 입력해주세요.');
      return;
    }

    onConfirm(item.id, transaction.id, {
      originalSerialNumber: transaction.serialNumber, // 이전 일련번호 보관
      originalCustomerName: transaction.customerName, // 이전 고객명 보관
      serialNumber: serialTrimmed,
      customerName: customerTrimmed,
      userId: newUserId.trim() || undefined,
      phoneNumber: newPhoneNumber.trim() || undefined,
      address: newAddress.trim() || undefined,
      isReturned: false, // 반품 보관에서 원위치로 복구
      isResold: true, // 재판매 표시
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] p-8 max-w-lg w-full shadow-2xl border border-slate-100 animate-fade-in-up">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h4 className="text-2xl font-black text-slate-800 tracking-tight uppercase">제품 재판매 처리</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Minor Defect Resale Process</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-all">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 text-xs text-indigo-800 space-y-1 mb-2">
            <p className="font-bold">📦 대상 제품: <span className="font-black text-indigo-600">[{item.code}] {item.name}</span></p>
            <p className="font-bold">🏷️ 이전 일련번호: <span className="font-mono font-black line-through text-rose-500">{transaction.serialNumber}</span></p>
            <p className="font-bold">👤 이전 고객명: <span className="font-black line-through text-rose-500">{transaction.customerName || '-'}</span></p>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">신규 일련번호 (필수)</label>
            <input
              type="text"
              required
              value={newSerialNumber}
              onChange={(e) => setNewSerialNumber(e.target.value.toUpperCase())}
              placeholder="예: AJP03223"
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400 bg-slate-50 focus:bg-white uppercase font-mono transition-all text-sm animate-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">신규 고객명 (필수)</label>
              <input
                type="text"
                required
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="고객 이름"
                className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400 bg-slate-50 focus:bg-white transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">신규 아이디 (선택)</label>
              <input
                type="text"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="고객 ID"
                className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400 bg-slate-50 focus:bg-white transition-all text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">신규 연락처 (선택)</label>
            <input
              type="text"
              value={newPhoneNumber}
              onChange={(e) => setNewPhoneNumber(e.target.value)}
              placeholder="010-XXXX-XXXX"
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400 bg-slate-50 focus:bg-white transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">신규 배송 주소 (선택)</label>
            <input
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="배송 주소 입력"
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-400 bg-slate-50 focus:bg-white transition-all text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black uppercase text-xs tracking-widest transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="py-4 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-sky-100 cursor-pointer"
            >
              출고 처리 (재판매)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
