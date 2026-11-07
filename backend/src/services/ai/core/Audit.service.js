import pool from '../../../config/db.js';
async function writeAudit(entry) {
  try {
    await pool.query(`INSERT INTO ai_audit_logs
      (store_id,user_id,conversation_id,request_type,question,tools_requested,tools_executed,tools_denied,
       provider,model,source,confidence,status,latency_ms,input_tokens,output_tokens,error_message,metadata)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)`, [
      entry.storeId, entry.userId, entry.conversationId || null, entry.requestType || 'chat', entry.question || null,
      JSON.stringify(entry.toolsRequested || []), JSON.stringify(entry.toolsExecuted || []), JSON.stringify(entry.toolsDenied || []),
      entry.provider || null, entry.model || null, entry.source || null, entry.confidence || null, entry.status || 'success',
      entry.latencyMs || null, entry.inputTokens || null, entry.outputTokens || null, entry.errorMessage || null,
      JSON.stringify(entry.metadata || {})
    ]);
  } catch (error) { console.error('AI audit write failed:', error.message); }
}
async function listAuditLogs({ storeId, limit=50 }) {
 const safe=Math.min(Math.max(Number(limit)||50,1),200);
 const {rows}=await pool.query(`SELECT id,user_id AS "userId",conversation_id AS "conversationId",request_type AS "requestType",
 question,tools_requested AS "toolsRequested",tools_executed AS "toolsExecuted",tools_denied AS "toolsDenied",
 provider,model,source,confidence,status,latency_ms AS "latencyMs",error_message AS "errorMessage",created_at AS "createdAt"
 FROM ai_audit_logs WHERE store_id=$1 ORDER BY created_at DESC LIMIT $2`,[storeId,safe]);
 return rows;
}
export { writeAudit, listAuditLogs };

