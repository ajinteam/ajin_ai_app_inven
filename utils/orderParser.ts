/**
 * Utility to parse raw copied text from e-commerce order details (Naver SmartStore, Coupang, etc.)
 * Supports table tabs, newline sequences, colon-separated key-values, and loose pasted text.
 */

export interface ParsedOrderInfo {
  name: string;        // 수취인명 우선, 구매자명 대체
  userId: string;      // 구매자 ID
  phone: string;       // 연락처1 (또는 구매자 연락처)
  address: string;     // 배송지 주소
  orderNumber?: string;// 상품주문번호 (참고용)
  productName?: string;// 상품명 (참고용)
  quantity?: number;   // 주문수량 (참고용)
  memo?: string;       // 배송메모 (참고용)
  rawMatched: {
    nameLabel?: '수취인명' | '구매자명';
    hasId: boolean;
    hasPhone: boolean;
    hasAddress: boolean;
  };
}

const KNOWN_LABEL_REGEX = /^(?:주문\s*상세정보|배송\s*정보|배송지\s*정보|상품주문번호|상품명|상품주문상태|클레임|수량클레임여부|구매확정연장상태|구매자명|구매자\s*ID|구매자ID|옵션|주문수량|초기주문수량|최종\s*상품금액|상품별\s*할인액|발송지연사유|당일발송여부|발송기한|예약구매여부|발송처리일|발주확인일|최초\s*집화처리일시|최종\s*집화처리일시|배송방법|배송완료일|출하일시|배송속성|택배사|배송상세상태|구매확정일|송장번호|오류송장등록사유|오류송장\s*등록일|개인통관고유부호|수취인명|수취인|연락처1|연락처\s*1|연락처2|연락처\s*2|배송지|배송지\s*주소|배송메모|배송상세)$/i;

function isKnownLabel(str: string): boolean {
  return KNOWN_LABEL_REGEX.test(str.trim());
}

export function parseSmartOrderText(raw: string): ParsedOrderInfo {
  if (!raw || typeof raw !== 'string') {
    return { name: '', userId: '', phone: '', address: '', rawMatched: { hasId: false, hasPhone: false, hasAddress: false } };
  }

  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let recipientName = '';
  let buyerName = '';
  let buyerId = '';
  let phone = '';
  let address = '';
  let orderNumber = '';
  let productName = '';
  let quantity: number | undefined = undefined;
  let memo = '';

  // 1. Line-by-line inspection (tab-delimited and vertical label-value pairs)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle tab-delimited cells from table copy
    const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j];
        const nextP = parts[j + 1] || '';

        if (/^(?:수취인명|수취인|받는분|받는사람)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!recipientName) recipientName = nextP;
        } else if (/^(?:구매자명|구매자|주문자명|주문자)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!buyerName) buyerName = nextP;
        } else if (/^(?:구매자\s*ID|구매자ID|주문자\s*ID|주문자ID|구매자\s*아이디|아이디)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!buyerId) buyerId = nextP;
        } else if (/^(?:연락처1|연락처\s*1|수취인\s*연락처1?|전화번호1?|휴대폰)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!phone) phone = nextP;
        } else if (/^(?:배송지|배송지\s*주소|배송주소)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!address) address = nextP;
        } else if (/^(?:배송메모|배송\s*메모|요청사항)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!memo) memo = nextP;
        } else if (/^(?:상품주문번호|주문번호)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!orderNumber) orderNumber = nextP;
        } else if (/^(?:상품명)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!productName) productName = nextP;
        } else if (/^(?:주문수량|수량)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          const qVal = parseInt(nextP.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(qVal) && qVal > 0) quantity = qVal;
        }
      }
    }

    // Vertical pair: label is on current line, value is on next line
    const nextLine = lines[i + 1] || '';

    if (/^(?:수취인명|수취인|받는사람|받는분)[:\s]*$/i.test(line) && nextLine) {
      if (!recipientName && !isKnownLabel(nextLine)) {
        recipientName = nextLine;
      }
    }
    if (/^(?:구매자명|구매자|주문자명|주문자)[:\s]*$/i.test(line) && nextLine) {
      if (!buyerName && !isKnownLabel(nextLine)) {
        buyerName = nextLine;
      }
    }
    if (/^(?:구매자\s*ID|구매자ID|주문자\s*ID|주문자ID|구매자\s*아이디|아이디)[:\s]*$/i.test(line) && nextLine) {
      if (!buyerId && !isKnownLabel(nextLine)) {
        buyerId = nextLine;
      }
    }
    if (/^(?:연락처1|연락처\s*1|수취인\s*연락처|휴대폰|전화번호1?)[:\s]*$/i.test(line) && nextLine) {
      if (!phone && !isKnownLabel(nextLine)) {
        phone = nextLine;
      }
    }
    if (/^(?:배송지|배송지\s*주소|배송주소)[:\s]*$/i.test(line) && nextLine) {
      if (!address && !isKnownLabel(nextLine)) {
        let addr = nextLine;
        const lineAfterNext = lines[i + 2] || '';
        // If nextLine is postal code (e.g. "06000" or "(06000)"), combine with next line
        if (/^[\(\[]?\d{5}[\)\]]?$/.test(nextLine.trim()) && lineAfterNext && !isKnownLabel(lineAfterNext)) {
          addr = `(${nextLine.replace(/[\(\)\[\]]/g, '')}) ${lineAfterNext}`;
        }
        address = addr;
      }
    }
    if (/^(?:상품주문번호|주문번호)[:\s]*$/i.test(line) && nextLine) {
      if (!orderNumber && !isKnownLabel(nextLine)) {
        orderNumber = nextLine;
      }
    }
    if (/^(?:상품명)[:\s]*$/i.test(line) && nextLine) {
      if (!productName && !isKnownLabel(nextLine)) {
        productName = nextLine;
      }
    }
    if (/^(?:배송메모|배송\s*메모|요청사항)[:\s]*$/i.test(line) && nextLine) {
      if (!memo && !isKnownLabel(nextLine)) {
        memo = nextLine;
      }
    }
  }

  // 2. Fallback regex patterns across the full text
  if (!recipientName) {
    const m = text.match(/(?:수취인명|수취인|받는사람|받는분)[\s:\t]+([^\r\n\t]+)/i);
    if (m && m[1] && !isKnownLabel(m[1].trim())) recipientName = m[1].trim();
  }
  if (!buyerName) {
    const m = text.match(/(?:구매자명|구매자|주문자명|주문자)[\s:\t]+([^\r\n\t]+)/i);
    if (m && m[1] && !isKnownLabel(m[1].trim())) buyerName = m[1].trim();
  }
  if (!buyerId) {
    const m = text.match(/(?:구매자\s*ID|구매자ID|주문자\s*ID|주문자ID|구매자\s*아이디|아이디)[\s:\t]+([a-zA-Z0-9_\-@.]+)/i);
    if (m && m[1] && !isKnownLabel(m[1].trim())) buyerId = m[1].trim();
  }
  if (!phone) {
    const m = text.match(/(?:연락처1|연락처\s*1|수취인\s*연락처|휴대폰|전화번호1?)[\s:\t]+([0-9\-]{9,14})/i);
    if (m && m[1]) phone = m[1].trim();
  }
  // Generic mobile phone regex fallback
  if (!phone) {
    const m = text.match(/(01[016789]-?\d{3,4}-?\d{4})/);
    if (m && m[1]) phone = m[1].trim();
  }
  if (!address) {
    const m = text.match(/(?:배송지|배송지\s*주소|배송주소)[\s:\t]+([^\r\n\t]+)/i);
    if (m && m[1] && !isKnownLabel(m[1].trim())) {
      address = m[1].trim();
    }
  }
  if (!orderNumber) {
    const m = text.match(/(?:상품주문번호|주문번호)[\s:\t]+([0-9]{10,25})/i);
    if (m && m[1]) orderNumber = m[1].trim();
  }

  // Standardize phone format if needed (e.g. 01012345678 -> 010-1234-5678)
  if (phone) {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length === 11 && digits.startsWith('01')) {
      phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10 && digits.startsWith('01')) {
      phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 10 && digits.startsWith('02')) {
      phone = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
  }

  // Clean address: remove trailing tabs and known subsequent words
  if (address) {
    address = address.split('\t')[0].trim();
    address = address.replace(/(?:배송메모|배송상세|요청사항).*$/i, '').trim();
  }

  // Determine final name: Recipient name (수취인명) is preferred for shipping; buyerName is fallback
  const finalName = (recipientName || buyerName || '').trim();

  return {
    name: finalName,
    userId: (buyerId || '').trim(),
    phone: (phone || '').trim(),
    address: (address || '').trim(),
    orderNumber: orderNumber || undefined,
    productName: productName || undefined,
    quantity: quantity || undefined,
    memo: memo || undefined,
    rawMatched: {
      nameLabel: recipientName ? '수취인명' : (buyerName ? '구매자명' : undefined),
      hasId: Boolean(buyerId),
      hasPhone: Boolean(phone),
      hasAddress: Boolean(address)
    }
  };
}
