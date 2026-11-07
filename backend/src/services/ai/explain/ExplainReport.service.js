import registry from './ReportContextRegistry.js';
import { generateText, getProviderStatus } from '../aiProvider.service.js';
import { resolvePermissionSet } from '../core/PermissionResolver.js';
import { writeAudit } from '../core/Audit.service.js';
function fallback(context, lang) {
  const s = context.summary || {};
  const pairs = Object.entries(s).filter(([,v]) => v !== null && v !== undefined).slice(0,6).map(([k,v]) => `${k}: ${v}`).join(', ');
  return lang === 'sw' ? `Muhtasari wa report hii ni: ${pairs}. AI provider haikupatikana kwa uchambuzi wa kina.` : `This report summary is: ${pairs}. The AI provider was unavailable for deeper analysis.`;
}

async function explainReport({ storeId, userId, reportType, reportKey, filters, lang }) {
  const started = Date.now();
  const adapter = registry.get(reportType);
  if (!adapter) { const e = new Error('Unsupported report type.'); e.statusCode = 400; throw e; }
  const permissions = await resolvePermissionSet(userId, storeId);
  if (!permissions.has('ai_explain_reports') || !permissions.has(adapter.requiredPermission)) { const e = new Error('Insufficient permissions.'); e.statusCode = 403; throw e; }
  const context = await adapter.build({ storeId, reportType: reportKey, filters });
  const instructions = `You are BizTrack Intelligence Engine. Explain only the verified JSON provided. Do not invent values. Focus on major totals, risks, unusual patterns, and 2-3 practical actions. Clearly state limitations. Respond in ${lang === 'sw' ? 'Swahili' : 'English'}. Keep it concise and business-friendly.`;
  const input = `REPORT: ${reportType}/${reportKey}\nFILTERS: ${JSON.stringify(filters || {})}\nVERIFIED CONTEXT: ${JSON.stringify(context)}`;
  const generated = await generateText({ instructions, input, maxOutputTokens: 750 });
  const status = getProviderStatus();
  const result = {
    explanation: generated.text || fallback(context, lang),
    source: generated.text ? 'ai' : 'fallback', provider: generated.text ? generated.provider : 'fallback',
    model: generated.model || status.model, providerError: generated.error || null,
    reportType, reportKey, filters, context, confidence: 'high', generatedAt: new Date().toISOString(),
  };
  await writeAudit({ storeId,userId,requestType:'report_explain',question:`Explain ${reportType}/${reportKey}`,toolsRequested:[`${reportType}ReportContextAdapter`],toolsExecuted:[`${reportType}ReportContextAdapter`],provider:result.provider,model:result.model,source:result.source,confidence:result.confidence,status:'success',latencyMs:Date.now()-started,metadata:{reportType,reportKey,filters} });
  return result;
}
export { explainReport };

