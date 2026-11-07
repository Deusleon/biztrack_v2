const PATTERNS = [
 { tools:['getCustomerDebts'], re:/debt|debtor|owe|outstanding|credit customer|madeni|anadaiwa|wanadaiwa|deni/i },
 { tools:['getExpenseAnalysis'], re:/expense|expenses|spending|cost category|matumizi|gharama za uendeshaji/i },
 { tools:['getLowStockProducts','getInventoryStatus'], re:/low stock|out of stock|reorder|stock.*isha|karibia kuisha|imeisha|minimum stock/i },
 { tools:['getInventoryStatus'], re:/inventory|stock status|stock value|hali ya stock|thamani ya stock/i },
 { tools:['getSalesComparison'], re:/compare sales|sales comparison|this week|last week|wiki hii|wiki iliyopita|linganisha.*mauzo/i },
 { tools:['getProfitAnalysis','getSalesSummary'], re:/profit|faida|margin|cogs|gross/i },
 { tools:['getTopProducts'], re:/top product|best seller|bidhaa.*ongoza|bidhaa.*uzwa zaidi/i },
 { tools:['getSalesSummary'], re:/sales|revenue|mauzo|mapato|miamala/i },
];
const FOLLOW_UP=/^(why|how|explain|more|which|what about|kwa nini|vipi|eleza|ongeza|zipi|gani|na je)\b/i;
function classifyIntent(message,conversation){
 const selected=[]; for(const p of PATTERNS) if(p.re.test(message)) selected.push(...p.tools);
 if(!selected.length && FOLLOW_UP.test(message) && conversation.lastTools?.length) return {tools:conversation.lastTools,followUp:true};
 if(!selected.length) return {tools:['getSalesSummary','getProfitAnalysis','getTopProducts'],followUp:false,broad:true};
 return {tools:[...new Set(selected)],followUp:false,broad:false};
}
export { classifyIntent };

