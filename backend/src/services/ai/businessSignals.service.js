function buildBusinessSignals(context) {
  const signals = [];
  const { sales, profitability, products } = context;

  if (sales.changePercent !== null) {
    if (sales.changePercent >= 10) signals.push({ type: 'REVENUE_UP', severity: 'positive', value: sales.changePercent });
    if (sales.changePercent <= -10) signals.push({ type: 'REVENUE_DOWN', severity: 'warning', value: sales.changePercent });
  }

  if (sales.netSales > 0 && profitability.grossMarginPercent < 15) {
    signals.push({ type: 'LOW_GROSS_MARGIN', severity: 'warning', value: profitability.grossMarginPercent });
  }

  if (sales.grossSales > 0 && sales.discounts / sales.grossSales >= 0.1) {
    signals.push({ type: 'HIGH_DISCOUNT_RATE', severity: 'warning', value: (sales.discounts / sales.grossSales) * 100 });
  }

  if (sales.netSales > 0 && sales.amountDue / sales.netSales >= 0.4) {
    signals.push({ type: 'HIGH_CREDIT_EXPOSURE', severity: 'warning', value: (sales.amountDue / sales.netSales) * 100 });
  }

  const topProduct = products.topProducts[0];
  if (topProduct?.contributionPercent >= 50) {
    signals.push({
      type: 'TOP_PRODUCT_DEPENDENCY',
      severity: 'info',
      product: topProduct.name,
      value: topProduct.contributionPercent,
    });
  }

  if (sales.salesCount === 0) signals.push({ type: 'NO_SALES_TODAY', severity: 'info' });
  if (profitability.estimatedOperatingProfit < 0 && sales.salesCount > 0) {
    signals.push({ type: 'OPERATING_LOSS', severity: 'warning', value: profitability.estimatedOperatingProfit });
  }

  return signals;
}

export { buildBusinessSignals };

