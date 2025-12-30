

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
}

export interface Item {
  id: string;
  type: 'part' | 'product'; // 부품 또는 제품 구분
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

// Fix: Added missing OrderedPart interface to resolve "no exported member" errors in modal components
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