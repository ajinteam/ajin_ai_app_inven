/**
 * Utility to parse raw copied text from e-commerce order details (Naver SmartStore, Coupang, etc.)
 * Supports multi-line addresses (joined with space), dual contacts (A / B format),
 * table tabs, newline sequences, colon-separated key-values, and loose pasted text.
 */

export interface ParsedOrderInfo {
  name: string;        // 수취인명 우선, 구매자명 대체
  userId: string;      // 구매자 ID
  phone: string;       // 연락처 (2개일 경우 "A / B" 형식)
  address: string;     // 배송지 주소 (2줄 이상일 경우 한 칸 띄움 후 연결)
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

const KNOWN_LABEL_REGEX = /^(?:주문\s*상세정보|배송\s*정보|배송지\s*정보|상품주문번호|상품명|상품주문상태|클레임|수량클레임여부|구매확정연장상태|구매자명|구매자\s*ID|구매자ID|옵션|주문수량|초기주문수량|최종\s*상품금액|최초\s*상품금액|상품별\s*할인액|발송지연사유|당일발송여부|발송기한|예약구매여부|발송처리일|발주확인일|최초\s*집화처리일시|최종\s*집화처리일시|배송방법|배송완료일|출하일시|배송속성|택배사|배송상세상태|구매확정일|송장번호|오류송장등록사유|오류송장\s*등록일|개인통관고유부호|수취인명|수취인|받는분|받는사람|연락처1|연락처\s*1|연락처2|연락처\s*2|전화번호1|전화번호\s*1|전화번호2|전화번호\s*2|기타연락처|추가연락처|휴대폰|배송지|배송지\s*주소|배송주소|배송메모|배송\s*메모|요청사항|배송상세)$/i;

function isKnownLabel(str: string): boolean {
  if (!str) return false;
  return KNOWN_LABEL_REGEX.test(str.trim());
}

function isFieldBoundary(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return true;
  if (isKnownLabel(trimmed)) return true;
  // If line starts with a known label followed by colon or whitespace or tab
  const firstWord = trimmed.split(/[\s:\t]/)[0]?.trim();
  if (firstWord && isKnownLabel(firstWord)) return true;
  return false;
}

/**
 * Standardize Korean phone number into standard hyphenated format (e.g. 010-1234-5678, 042-123-4567, 02-1234-5678)
 */
export function formatPhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits || digits.length < 7) return trimmed;

  // Mobile: 010, 011, 016, 017, 018, 019
  if (digits.startsWith('01')) {
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  // Seoul landline: 02
  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
  }

  // Regional landline (031, 032, 033, 041, 042, 043, 044, 051, 052, 053, 054, 055, 061, 062, 063, 064) or VoIP (070)
  if (/^0[3-7]\d/.test(digits)) {
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
  }

  // 8-digit representative numbers (1588-XXXX, 1544-XXXX, etc.)
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  // If already hyphenated, keep it; otherwise return digits
  if (trimmed.includes('-')) return trimmed;
  return digits;
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
  let phone1 = '';
  let phone2 = '';
  let addressParts: string[] = [];
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
          if (!phone1) phone1 = nextP;
        } else if (/^(?:연락처2|연락처\s*2|전화번호2|기타연락처|추가연락처)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (!phone2) phone2 = nextP;
        } else if (/^(?:배송지|배송지\s*주소|배송주소)$/i.test(p) && nextP && !isKnownLabel(nextP)) {
          if (addressParts.length === 0) {
            // Check if cell itself had internal linebreaks
            const subLines = nextP.split('\n').map(s => s.trim()).filter(Boolean);
            addressParts.push(...subLines);

            // Also check subsequent lines for multi-line detail address
            for (let k = i + 1; k < lines.length; k++) {
              const candidate = lines[k].trim();
              if (!candidate || isFieldBoundary(candidate)) break;
              addressParts.push(candidate);
            }
          }
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
      if (!phone1 && !isKnownLabel(nextLine)) {
        phone1 = nextLine;
      }
    }
    if (/^(?:연락처2|연락처\s*2|기타연락처|추가연락처|전화번호2)[:\s]*$/i.test(line) && nextLine) {
      if (!phone2 && !isKnownLabel(nextLine)) {
        phone2 = nextLine;
      }
    }

    // Vertical Address collection (supports 1, 2, or more lines)
    if (/^(?:배송지|배송지\s*주소|배송주소)[:\s]*$/i.test(line)) {
      if (addressParts.length === 0) {
        // Collect all non-boundary lines under 배송지
        for (let k = i + 1; k < lines.length; k++) {
          const candidate = lines[k].trim();
          if (!candidate) continue;
          if (isFieldBoundary(candidate)) break;
          addressParts.push(candidate);
        }
      }
    }

    // Inline address (e.g. "배송지: 서울특별시 강남구 ...")
    const inlineAddrMatch = line.match(/^(?:배송지|배송지\s*주소|배송주소)[\s:]+(.+)$/i);
    if (inlineAddrMatch && addressParts.length === 0) {
      const firstAddr = inlineAddrMatch[1].trim();
      if (firstAddr && !isKnownLabel(firstAddr)) {
        addressParts.push(firstAddr);
        // Collect subsequent lines if they are continuation of address (e.g. line 2 building name)
        for (let k = i + 1; k < lines.length; k++) {
          const candidate = lines[k].trim();
          if (!candidate) continue;
          if (isFieldBoundary(candidate)) break;
          addressParts.push(candidate);
        }
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

  // 2. Fallback regex patterns across full text
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
  if (!phone1) {
    const m = text.match(/(?:연락처1|연락처\s*1|수취인\s*연락처|휴대폰|전화번호1?)[\s:\t]+([0-9\-]{9,14})/i);
    if (m && m[1]) phone1 = m[1].trim();
  }
  if (!phone2) {
    const m = text.match(/(?:연락처2|연락처\s*2|기타연락처|추가연락처|전화번호2?)[\s:\t]+([0-9\-]{9,14})/i);
    if (m && m[1]) phone2 = m[1].trim();
  }

  // Generic mobile & landline phone search across text
  const phonePattern = /(?:01[016789]|02|0[3-6][1-5]|070)-?\d{3,4}-?\d{4}/g;
  const matchedPhones = (text.match(phonePattern) || []).map(p => formatPhoneNumber(p));
  const uniquePhones = Array.from(new Set(matchedPhones.filter(Boolean)));

  if (!phone1 && uniquePhones.length > 0) {
    phone1 = uniquePhones[0];
  }
  if (!phone2 && uniquePhones.length > 0) {
    const secondPhone = uniquePhones.find(p => p !== formatPhoneNumber(phone1));
    if (secondPhone) {
      phone2 = secondPhone;
    }
  }

  if (!orderNumber) {
    const m = text.match(/(?:상품주문번호|주문번호)[\s:\t]+([0-9]{10,25})/i);
    if (m && m[1]) orderNumber = m[1].trim();
  }

  // 3. Format phone numbers: If 2 contacts exist, format as "A / B"
  const formatted1 = formatPhoneNumber(phone1);
  const formatted2 = formatPhoneNumber(phone2);
  let finalPhone = '';

  if (formatted1 && formatted2 && formatted1 !== formatted2) {
    finalPhone = `${formatted1} / ${formatted2}`;
  } else {
    finalPhone = formatted1 || formatted2 || '';
  }

  // 4. Construct multi-line address: join all parts with a single space
  let finalAddress = '';
  if (addressParts.length > 0) {
    // If the first part is only a 5-digit zip code (e.g. "34917" or "(34917)"), format nicely
    if (/^[\(\[]?\d{5}[\)\]]?$/.test(addressParts[0])) {
      const code = addressParts[0].replace(/[\(\)\[\]]/g, '');
      if (addressParts.length > 1) {
        addressParts[0] = `(${code})`;
      }
    }
    // Join all lines with space, clean multiple spaces
    finalAddress = addressParts.join(' ').replace(/\s+/g, ' ').trim();
    // Clean trailing memo or status tags if accidentally captured
    finalAddress = finalAddress.replace(/(?:배송메모|배송상세|요청사항).*$/i, '').trim();
  } else {
    // Fallback single-line address regex
    const m = text.match(/(?:배송지|배송지\s*주소|배송주소)[\s:\t]+([^\r\n\t]+)/i);
    if (m && m[1] && !isKnownLabel(m[1].trim())) {
      finalAddress = m[1].trim();
    }
  }

  // 5. Determine final recipient name
  const finalName = (recipientName || buyerName || '').trim();

  return {
    name: finalName,
    userId: (buyerId || '').trim(),
    phone: finalPhone,
    address: finalAddress,
    orderNumber: orderNumber || undefined,
    productName: productName || undefined,
    quantity: quantity || undefined,
    memo: memo || undefined,
    rawMatched: {
      nameLabel: recipientName ? '수취인명' : (buyerName ? '구매자명' : undefined),
      hasId: Boolean(buyerId),
      hasPhone: Boolean(finalPhone),
      hasAddress: Boolean(finalAddress)
    }
  };
}
