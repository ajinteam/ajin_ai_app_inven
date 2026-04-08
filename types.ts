
export interface Transaction {
  id: string;
  type: 'purchase' | 'release';
  quantity: number;
  date: string;
  remarks: string;
  modelName?: string; // 기종 정보
  serialNumber?: string; // 일련번호 (선택)
  customerName?: string; // 이름
  address?: string; // 주소
  phoneNumber?: string; // 전화번호
  userId?: string; // 아이디 추가
  returnReason?: string; // 반품 사유
  isReturned?: boolean; // 반품 여부
  isDiscarded?: boolean; // 폐기 여부
  originalSerialNumber?: string; // 이전 일련번호 (수정 시 보관)
}

export interface Item {
  id: string;
  type: 'part' | 'product'; // 부품 또는 제품 구분
  category?: 'GiL' | 'KATO' | 'TOMIX'; // 제품 카테고리 추가
  registrationDate: string; // 등록일
  code: string; // 품번 (코드)
  name: string; // 품명
  spec: string; // 규격 추가
  modelName: string; // 기종 (기본 정보)
  drawingNumber: string; // 도번
  application: string; // 적용
  remarks: string; // 비고
  transactions: Transaction[];
}

export interface OrderedPart {
  id: string;
  registrationDate: string;
  code: string;
  drawingNumber: string;
  name: string;
  spec: string;
  unitPrice: number;
  remarks: string;
}

export interface User {
  id: string;
  name: string;
  password: string;
  partPermission: 'read' | 'edit' | 'none';
  productPermission: 'read' | 'edit' | 'none';
}
