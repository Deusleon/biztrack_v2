import crypto from 'crypto';
import { generateText } from './aiProvider.service.js';
const languageName = (lang) => ({ sw: 'Swahili', en: 'English' }[lang] || 'English');
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

function choose(items) {
  if (!items.length) return null;
  return items[crypto.randomInt(0, items.length)];
}

function buildNarrativePlan(context, signals) {
  const { sales, profitability, products, expenses } = context;
  const availableFocuses = [];

  if (sales.changePercent !== null) availableFocuses.push('sales trend versus yesterday');
  if (sales.netSales > 0) availableFocuses.push('gross profit and gross margin');
  if (sales.discounts > 0) availableFocuses.push('discount impact on net sales');
  if (sales.amountDue > 0) availableFocuses.push('credit exposure and amount due');
  if (products.topProducts?.length) availableFocuses.push('product contribution and sales concentration');
  if (Number(expenses?.total || 0) > 0) availableFocuses.push('expenses and estimated operating performance');

  const primaryFocus = choose(availableFocuses) || 'overall business performance';
  const remaining = availableFocuses.filter((item) => item !== primaryFocus);
  const secondaryFocus = choose(remaining) || null;

  const openings = [
    'Start with the most decision-useful observation.',
    'Open with the strongest verified movement in the data.',
    'Begin with a concise overall performance statement.',
    'Lead with the area that deserves the owner’s attention today.',
  ];

  const structures = [
    'Use a performance-first structure, then add one supporting detail and one caution only when supported.',
    'Use a contrast structure: what performed well, followed by what needs attention.',
    'Use an executive-summary structure: result, supporting driver from the supplied metrics, then implication without inventing a cause.',
    'Use a concise narrative flow and avoid repeating the same sentence pattern as a standard dashboard template.',
  ];

  return {
    primaryFocus,
    secondaryFocus,
    openingInstruction: choose(openings),
    structureInstruction: choose(structures),
    variationToken: crypto.randomUUID(),
    signalTypes: signals.map((signal) => signal.type),
  };
}

function createFallbackSummary(context, lang, plan) {
  const { sales, profitability, products, expenses } = context;
  const change = sales.changePercent;
  const top = products.topProducts?.[0];

  if (!sales.salesCount) {
    const noSales = lang === 'sw'
      ? [
          'Leo bado hakuna mauzo yaliyorekodiwa. Muhtasari utaanza kuonyesha mwenendo mara baada ya miamala kuingizwa.',
          'Hakuna miamala ya mauzo iliyoonekana leo, hivyo bado hakuna data ya kutosha kutathmini utendaji wa biashara.',
          'Mauzo ya leo bado hayajaanza kurekodiwa. Takwimu mpya zikiongezeka, muhtasari huu utasasishwa moja kwa moja.',
        ]
      : [
          'No sales have been recorded today. The summary will begin showing performance once transactions are entered.',
          'There are no sales transactions for today yet, so there is not enough data to assess business performance.',
          'Today’s sales have not started appearing yet. This summary will update as new transactions are recorded.',
        ];
    return choose(noSales);
  }

  const swSentences = [];
  const enSentences = [];

  if (change === null) {
    swSentences.push('Mauzo halisi ya leo yamefikia ' + round(sales.netSales) + ', lakini hakuna data ya kutosha ya jana kwa ulinganisho wa mwenendo.');
    enSentences.push(`Today's net sales are ${round(sales.netSales)}, but there is not enough data from yesterday for a trend comparison.`);
  } else {
    const directionSw = change >= 0 ? 'yameongezeka' : 'yamepungua';
    const directionEn = change >= 0 ? 'increased' : 'decreased';
    swSentences.push(`Mauzo halisi ya leo ${directionSw} kwa asilimia ${Math.abs(round(change))} dhidi ya jana, na kufikia ${round(sales.netSales)}.`);
    enSentences.push(`Today's net sales ${directionEn} by ${Math.abs(round(change))}% compared with yesterday, reaching ${round(sales.netSales)}.`);
  }

  swSentences.push(`Faida ghafi ni ${round(profitability.grossProfit)}, sawa na margin ya asilimia ${round(profitability.grossMarginPercent)}.`);
  enSentences.push(`Gross profit is ${round(profitability.grossProfit)}, representing a gross margin of ${round(profitability.grossMarginPercent)}%.`);

  if (sales.discounts > 0) {
    swSentences.push(`Punguzo la jumla ni ${round(sales.discounts)}, hivyo limepunguza mauzo ghafi hadi mauzo halisi yaliyoonyeshwa.`);
    enSentences.push(`Total discounts are ${round(sales.discounts)}, reducing gross sales to the reported net-sales figure.`);
  }

  if (sales.amountDue > 0) {
    swSentences.push(`Kiasi ambacho bado hakijalipwa ni ${round(sales.amountDue)} na kinahitaji kufuatiliwa kama sehemu ya mauzo ya mkopo.`);
    enSentences.push(`The outstanding amount is ${round(sales.amountDue)} and should be monitored as part of credit sales.`);
  }

  if (top) {
    swSentences.push(`${top.name} ndiyo bidhaa inayoongoza, ikichangia asilimia ${round(top.contributionPercent)} ya mauzo halisi.`);
    enSentences.push(`${top.name} is the leading product, contributing ${round(top.contributionPercent)}% of net sales.`);
  }

  if (Number(expenses?.total || 0) > 0) {
    swSentences.push(`Gharama za uendeshaji zilizorekodiwa ni ${round(expenses.total)}, huku makadirio ya faida ya uendeshaji yakiwa ${round(profitability.estimatedOperatingProfit)}.`);
    enSentences.push(`Recorded operating expenses are ${round(expenses.total)}, with estimated operating profit at ${round(profitability.estimatedOperatingProfit)}.`);
  }

  const sentences = lang === 'sw' ? swSentences : enSentences;
  const preferredIndexes = [];
  const focus = `${plan.primaryFocus} ${plan.secondaryFocus || ''}`;

  if (focus.includes('sales trend')) preferredIndexes.push(0);
  if (focus.includes('gross profit')) preferredIndexes.push(1);
  if (focus.includes('discount') && sales.discounts > 0) preferredIndexes.push(2);
  if (focus.includes('credit') && sales.amountDue > 0) preferredIndexes.push(swSentences.findIndex((s) => s.includes('hakijalipwa')));
  if (focus.includes('product') && top) preferredIndexes.push(swSentences.findIndex((s) => s.includes(top.name)));
  if (focus.includes('expenses') && Number(expenses?.total || 0) > 0) preferredIndexes.push(sentences.length - 1);

  const validPreferred = [...new Set(preferredIndexes.filter((index) => index >= 0 && index < sentences.length))];
  const selected = [];
  for (const index of validPreferred) {
    if (selected.length < 3) selected.push(sentences[index]);
  }

  const remaining = sentences.filter((sentence) => !selected.includes(sentence));
  while (selected.length < Math.min(3, sentences.length) && remaining.length) {
    const sentence = choose(remaining);
    selected.push(sentence);
    remaining.splice(remaining.indexOf(sentence), 1);
  }

  return selected.join(' ');
}

async function generateBusinessSummary(context, signals, lang) {
  const plan = buildNarrativePlan(context, signals);
  const instructions = `You are BizTrack Business Assistant. Explain only verified business data provided by BizTrack. Do not invent causes, products, numbers, forecasts, or recommendations. Do not recalculate values. Distinguish net sales, COGS, gross profit, expenses, and amount due. Write in ${languageName(lang)}. Use 2 to 4 short natural sentences for a small-business owner. Do not use markdown headings or bullet points. Vary wording and sentence order naturally between generations while preserving the same facts. ${plan.openingInstruction} ${plan.structureInstruction} Give primary attention to ${plan.primaryFocus}${plan.secondaryFocus ? ` and briefly cover ${plan.secondaryFocus}` : ''}. Do not mention these writing instructions or the variation token.`;
  const input = JSON.stringify({
    context,
    signals,
    narrativePlan: plan,
  });

  try {
    const generated = await generateText({ instructions, input, maxOutputTokens: 450 });
    if (generated.text) {
      return {
        summary: generated.text,
        source: 'ai',
        provider: generated.provider,
        model: generated.model,
        providerError: null,
        focus: plan.primaryFocus,
      };
    }

    if (generated.error) {
      console.warn(`AI provider unavailable (${generated.provider || 'unknown'}): ${generated.error}`);
    }

    return {
      summary: createFallbackSummary(context, lang, plan),
      source: 'fallback',
      provider: 'fallback',
      requestedProvider: generated.provider || null,
      model: generated.model || null,
      providerError: generated.error || 'AI provider returned no text',
      focus: plan.primaryFocus,
    };
  } catch (error) {
    console.error('AI summary generation failed:', error.message);
    return {
      summary: createFallbackSummary(context, lang, plan),
      source: 'fallback',
      provider: 'fallback',
      requestedProvider: process.env.AI_PROVIDER || 'gemini',
      model: null,
      providerError: error.message,
      focus: plan.primaryFocus,
    };
  }
}

export { generateBusinessSummary };

