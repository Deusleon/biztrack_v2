import { getLang } from '../utils/getLang.js';
import { respondWithError } from '../utils/response.js';
import { buildBusinessContext } from '../services/ai/businessContext.service.js';
import { buildBusinessSignals } from '../services/ai/businessSignals.service.js';
import { generateBusinessSummary } from '../services/ai/businessSummary.service.js';
import { getProviderStatus } from '../services/ai/aiProvider.service.js';
import { askAssistant } from '../services/ai/assistant/Assistant.service.js';
import registry from '../services/ai/assistant/ToolRegistry.js';
import { resolvePermissionSet } from '../services/ai/core/PermissionResolver.js';
import { listAuditLogs } from '../services/ai/core/Audit.service.js';
import { hasPermission } from '../middlewares/checkPermission.js';
import { explainReport } from '../services/ai/explain/ExplainReport.service.js';
const cache = new Map();
const CACHE_TTL_MS = Math.max(Number(process.env.AI_SUMMARY_CACHE_MINUTES) || 20, 1) * 60 * 1000;

const _exp_getProviderStatus = async (_req, res) => {
  const provider = getProviderStatus();
  return res.json({
    success: true,
    data: {
      ...provider,
      fallbackEnabled: true,
      cacheMinutes: CACHE_TTL_MS / 60000,
    },
  });
};

export const getBusinessSummary = async (req, res) => {
  const storeId = req.user.current_store_id;
  const lang = getLang(req).toLowerCase().slice(0, 2);
  const forceRefresh = req.query.refresh === 'true';
  const providerStatus = getProviderStatus();
  const providerIdentity = `${providerStatus.requested}:${providerStatus.model || 'none'}`;
  const cacheKey = `${storeId}:${lang}:${providerIdentity}`;

  try {
    const cached = cache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return res.json({ success: true, data: { ...cached.data, cached: true } });
    }

    const context = await buildBusinessContext(storeId);
    const signals = buildBusinessSignals(context);
    const generated = await generateBusinessSummary(context, signals, lang);
    const data = {
      summary: generated.summary,
      source: generated.source,
      provider: generated.provider,
      requestedProvider: generated.requestedProvider || providerStatus.requested,
      model: generated.model || providerStatus.model,
      providerConfigured: providerStatus.configured,
      providerError: generated.providerError || providerStatus.error || null,
      focus: generated.focus,
      signals,
      metrics: context,
      generatedAt: new Date().toISOString(),
      cached: false,
    };

    cache.set(cacheKey, { data, createdAt: Date.now() });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Business summary error:', error);
    return respondWithError(req, res, 500, 'server_error');
  }
};


export const chat = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id || req.user.user_id;
  const lang = getLang(req).toLowerCase().slice(0, 2);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : undefined;

  if (!message) {
    return res.status(400).json({ success: false, message: lang === 'sw' ? 'Andika swali kwanza.' : 'Please enter a question.' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ success: false, message: lang === 'sw' ? 'Swali ni refu sana.' : 'The question is too long.' });
  }

  try {
    const data = await askAssistant({ storeId, userId, message, lang, conversationId });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('AI assistant error:', error);
    if (error.statusCode === 403) {
      return respondWithError(req, res, 403, 'insufficient_permissions');
    }
    if (error.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return respondWithError(req, res, 500, 'server_error');
  }
};

import { listConversations, getConversationMessages, deleteConversation } from '../services/ai/assistant/Conversation.service.js';
const _exp_listConversations = async (req, res) => {
  try {
    const data = await listConversations({
      storeId: req.user.current_store_id,
      userId: req.user.id || req.user.user_id,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('List AI conversations error:', error);
    return respondWithError(req, res, 500, 'server_error');
  }
};

export const getConversation = async (req, res) => {
  try {
    const data = await getConversationMessages({
      storeId: req.user.current_store_id,
      userId: req.user.id || req.user.user_id,
      conversationId: req.params.id,
    });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get AI conversation error:', error);
    return respondWithError(req, res, 500, 'server_error');
  }
};

const _exp_deleteConversation = async (req, res) => {
  try {
    const deleted = await deleteConversation({
      storeId: req.user.current_store_id,
      userId: req.user.id || req.user.user_id,
      conversationId: req.params.id,
    });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete AI conversation error:', error);
    return respondWithError(req, res, 500, 'server_error');
  }
};


export const getCapabilities = async (req, res) => {
  try {
    const storeId=req.user.current_store_id, userId=req.user.id||req.user.user_id;
    const permissions=await resolvePermissionSet(userId,storeId);
    const tools = registry.list(permissions);
    const capabilities = tools.reduce((groups, tool) => {
      const category = tool.category || 'general';
      if (!groups[category]) groups[category] = [];
      groups[category].push(tool);
      return groups;
    }, {});
    return res.json({success:true,data:{permissions:[...permissions].filter(p=>p.startsWith('ai_')),toolCount:tools.length,capabilities,tools}});
  } catch(error){ console.error('AI capabilities error:',error); return respondWithError(req,res,500,'server_error'); }
};
export const getAuditLogs = async (req,res)=>{
 try{
  const storeId=req.user.current_store_id,userId=req.user.id||req.user.user_id;
  if(!(await hasPermission(userId,storeId,'ai_view_audit'))) return respondWithError(req,res,403,'insufficient_permissions');
  return res.json({success:true,data:await listAuditLogs({storeId,limit:req.query.limit})});
 }catch(error){console.error('AI audit list error:',error);return respondWithError(req,res,500,'server_error');}
};


const _exp_explainReport = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId = req.user.id || req.user.user_id;
  const lang = getLang(req).toLowerCase().slice(0, 2);
  const reportType = String(req.body?.reportType || '').trim();
  const reportKey = String(req.body?.reportKey || '').trim();
  const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};

  if (!reportType || !reportKey) {
    return res.status(400).json({
      success: false,
      message: 'Report type and report key are required.',
    });
  }

  try {
    const data = await explainReport({
      storeId,
      userId,
      reportType,
      reportKey,
      filters,
      lang,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Explain report error:', error);
    if (error.statusCode === 403) {
      return respondWithError(req, res, 403, 'insufficient_permissions');
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return respondWithError(req, res, 500, 'server_error');
  }
};
export { _exp_getProviderStatus as getProviderStatus };
export { _exp_listConversations as listConversations };
export { _exp_deleteConversation as deleteConversation };
export { _exp_explainReport as explainReport };
