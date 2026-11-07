import pool from '../../../config/db.js';
const MAX_CONTEXT_MESSAGES = Math.max(Number(process.env.AI_CONTEXT_MESSAGE_LIMIT) || 12, 4);

function makeTitle(message) {
  const clean = String(message || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length > 70 ? `${clean.slice(0, 67)}...` : clean;
}

async function getConversation({ storeId, userId, conversationId, firstMessage }) {
  if (conversationId) {
    const { rows } = await pool.query(
      `SELECT id, title, last_tools, created_at, updated_at
       FROM ai_conversations
       WHERE id = $1 AND store_id = $2 AND user_id = $3`,
      [conversationId, storeId, userId],
    );
    if (!rows[0]) {
      const error = new Error('Conversation not found');
      error.statusCode = 404;
      throw error;
    }
    const messages = await getContextMessages(rows[0].id);
    return { ...rows[0], messages, lastTools: rows[0].last_tools || [] };
  }

  const { rows } = await pool.query(
    `INSERT INTO ai_conversations (store_id, user_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, title, last_tools, created_at, updated_at`,
    [storeId, userId, makeTitle(firstMessage)],
  );
  return { ...rows[0], messages: [], lastTools: [] };
}

async function getContextMessages(conversationId) {
  const { rows } = await pool.query(
    `SELECT role, content AS text
     FROM (
       SELECT role, content, created_at
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) recent
     ORDER BY created_at ASC`,
    [conversationId, MAX_CONTEXT_MESSAGES],
  );
  return rows;
}

async function saveTurn({ conversation, userMessage, answer, toolsUsed, provider, model, confidence, source, metadata }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO ai_messages (conversation_id, role, content)
       VALUES ($1, 'user', $2)`,
      [conversation.id, userMessage],
    );
    await client.query(
      `INSERT INTO ai_messages
       (conversation_id, role, content, tools_used, provider, model, confidence, source, metadata)
       VALUES ($1, 'assistant', $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb)`,
      [
        conversation.id,
        answer,
        JSON.stringify(toolsUsed || []),
        provider || null,
        model || null,
        confidence || null,
        source || null,
        JSON.stringify(metadata || {}),
      ],
    );
    await client.query(
      `UPDATE ai_conversations
       SET last_tools = $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(toolsUsed || []), conversation.id],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listConversations({ storeId, userId, limit = 50 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.last_tools AS "lastTools", c.created_at AS "createdAt",
            c.updated_at AS "updatedAt",
            (SELECT content FROM ai_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview
     FROM ai_conversations c
     WHERE c.store_id = $1 AND c.user_id = $2
     ORDER BY c.updated_at DESC
     LIMIT $3`,
    [storeId, userId, safeLimit],
  );
  return rows;
}

async function getConversationMessages({ storeId, userId, conversationId }) {
  const { rows: ownerRows } = await pool.query(
    `SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ai_conversations WHERE id = $1 AND store_id = $2 AND user_id = $3`,
    [conversationId, storeId, userId],
  );
  if (!ownerRows[0]) return null;
  const { rows: messages } = await pool.query(
    `SELECT id, role, content AS text, tools_used AS "toolsUsed", provider, model,
            confidence, source, metadata,
            metadata->'toolsDenied' AS "toolsDenied",
            metadata->'toolErrors' AS "toolErrors",
            metadata->'toolsRequestedByAI' AS "toolsRequestedByAI",
            metadata->>'toolSelectionStrategy' AS "toolSelectionStrategy",
            NULLIF(metadata->>'toolRounds', '')::int AS "toolRounds",
            created_at AS "createdAt"
     FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId],
  );
  return { ...ownerRows[0], messages };
}

async function deleteConversation({ storeId, userId, conversationId }) {
  const { rowCount } = await pool.query(
    `DELETE FROM ai_conversations WHERE id = $1 AND store_id = $2 AND user_id = $3`,
    [conversationId, storeId, userId],
  );
  return rowCount > 0;
}

export { getConversation, saveTurn, listConversations, getConversationMessages, deleteConversation };

