import { PurchaseOrder, MatchingResult, MatchingStatus } from '@/lib/types';
import { POItem, GoodsReceiptNote, Invoice, ReceiptItem, InvoiceItem } from '@prisma/client';

type EnrichedPO = PurchaseOrder & {
    items: POItem[];
    receipts: (GoodsReceiptNote & { items: ReceiptItem[] })[];
    invoices: (Invoice & { items: InvoiceItem[] })[];
};


export function performThreeWayMatch(po: EnrichedPO): MatchingResult {
  const grns = po.receipts || [];
  const invoices = po.invoices || [];

  if (grns.length === 0 || invoices.length === 0) {
    return {
      poId: po.id,
      status: 'Pending',
      quantityMatch: false,
      priceMatch: false,
      details: {
        poTotal: po.totalAmount,
        grnTotalQuantity: 0,
        invoiceTotal: 0,
        invoiceTotalQuantity: 0,
        items: [],
      },
    };
  }

  let overallQuantityMatch = true;
  let overallPriceMatch = true;

  const aggregatedGrnItems: { [key: string]: number } = {};
  grns.forEach(grn => {
    grn.items.forEach(item => {
      aggregatedGrnItems[item.poItemId] = (aggregatedGrnItems[item.poItemId] || 0) + item.quantityReceived;
    });
  });

  const aggregatedInvoiceItems: { [key: string]: { quantity: number; unitPrice: number } } = {};
  invoices.forEach(inv => {
    inv.items.forEach(item => {
        const poItem = po.items.find(p => p.name === item.name);
        if (poItem) {
            if (!aggregatedInvoiceItems[poItem.id]) {
                aggregatedInvoiceItems[poItem.id] = { quantity: 0, unitPrice: 0 };
            }
            aggregatedInvoiceItems[poItem.id].quantity += item.quantity;
            aggregatedInvoiceItems[poItem.id].unitPrice = item.unitPrice;
        }
    });
  });

  const details = po.items.map(poItem => {
    const grnQuantity = aggregatedGrnItems[poItem.id] || 0;
    const invoiceData = aggregatedInvoiceItems[poItem.id] || { quantity: 0, unitPrice: 0 };

    const quantityMatch = poItem.quantity === grnQuantity && grnQuantity === invoiceData.quantity;
    const priceMatch = poItem.unitPrice === invoiceData.unitPrice;

    if (!quantityMatch) overallQuantityMatch = false;
    if (!priceMatch) overallPriceMatch = false;

    return {
      itemId: poItem.id,
      itemName: poItem.name,
      poQuantity: poItem.quantity,
      grnQuantity,
      invoiceQuantity: invoiceData.quantity,
      poUnitPrice: poItem.unitPrice,
      invoiceUnitPrice: invoiceData.unitPrice,
      quantityMatch,
      priceMatch,
    };
  });
  
  const grnTotalQuantity = Object.values(aggregatedGrnItems).reduce((sum, q) => sum + q, 0);
  const invoiceTotalQuantity = Object.values(aggregatedInvoiceItems).reduce((sum, i) => sum + i.quantity, 0);
  const invoiceTotal = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  let status: MatchingStatus = 'Mismatched';
  if (po.status === 'Matched') {
    status = 'Matched';
  } else if (overallQuantityMatch && overallPriceMatch) {
    status = 'Matched';
  }


  return {
    poId: po.id,
    status,
    quantityMatch: overallQuantityMatch,
    priceMatch: overallPriceMatch,
    details: {
      poTotal: po.totalAmount,
      grnTotalQuantity,
      invoiceTotal,
      invoiceTotalQuantity,
      items: details,
    },
  };
}
