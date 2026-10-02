import type { Item } from '../types';

export const calculateStock = (item: Item): number => {
  if (!item || !Array.isArray(item.transactions)) return 0;
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
