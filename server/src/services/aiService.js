const fs = require('fs');
const path = require('path');

// Ensure environment variables are loaded from server/.env if not already present
if (!process.env.GEMINI_API_KEY) {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    require('dotenv').config();
  } catch (e) {
    // Ignore error if dotenv is missing
  }
}

const CONTROLLED_CATEGORIES = [
  'GARBAGE',
  'ILLEGAL_DUMPING',
  'POTHOLE',
  'DRAINAGE',
  'STREETLIGHT',
  'C_AND_D_WASTE',
  'WATER_LEAK',
  'OTHER'
];

/**
 * AI-Assisted Civic Issue Classification Service
 * 
 * STRICT ARCHITECTURAL PRINCIPLE:
 * - AI is ASSISTIVE ONLY.
 * - AI classifies only the civic issue type from the controlled category list.
 * - AI NEVER decides jurisdiction, authority, department, or routing.
 * - If GEMINI_API_KEY is not configured or fails, NEVER FAKE RESULTS.
 *   Return explicit 'available: false' and allow seamless manual category selection.
 */
const classifyIssue = async (description, photoPath = null) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    return {
      available: false,
      category: null,
      confidence: null,
      reason: 'AI classification service is not configured. GEMINI_API_KEY is missing in server/.env.',
      allowedCategories: CONTROLLED_CATEGORIES
    };
  }

  if (!description || description.trim() === '') {
    return {
      available: false,
      category: null,
      confidence: null,
      reason: 'Complaint description is required for AI classification.',
      allowedCategories: CONTROLLED_CATEGORIES
    };
  }

  try {
    const promptText = `
You are a civic issue classification assistant for the city of Mysuru.
Classify the following citizen complaint into EXACTLY ONE of these controlled categories:
${CONTROLLED_CATEGORIES.join(', ')}

Complaint description: "${description}"

Category definitions:
- GARBAGE: Uncollected household waste, overflowing small bins, litter on streets.
- ILLEGAL_DUMPING: Large scale unauthorized waste heaps, vacant lot dumping, commercial dumping.
- POTHOLE: Road surface depression, crater, damaged asphalt, crater causing traffic danger.
- DRAINAGE: Clogged storm drains, overflowing sewers, stagnant gutter water, open drain manholes.
- STREETLIGHT: Broken street lights, non-functional poles, dark street hazards, flickering lamps.
- C_AND_D_WASTE: Construction and demolition debris, concrete blocks, rubble, bricks on roads.
- WATER_LEAK: Broken water mains, pipeline bursts, drinking water leakage on public streets.
- OTHER: Any civic issue that does not fit into the categories above.

Respond with ONLY valid JSON in this exact structure:
{
  "category": "<ONE_OF_THE_ALLOWED_CATEGORIES>",
  "confidence": <NUMBER_BETWEEN_0.0_AND_1.0>,
  "explanation": "<BRIEF_ONE_SENTENCE_JUSTIFICATION>"
}
`;

    const contents = [];
    const parts = [{ text: promptText }];

    // If photo exists and is readable, include it for multimodal classification
    if (photoPath && fs.existsSync(photoPath)) {
      try {
        const imageBuffer = fs.readFileSync(photoPath);
        const base64Data = imageBuffer.toString('base64');
        const ext = photoPath.toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext.endsWith('.png')) mimeType = 'image/png';
        if (ext.endsWith('.webp')) mimeType = 'image/webp';

        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });
      } catch (imgErr) {
        console.warn('[AI Service] Could not read image for classification, falling back to text only:', imgErr.message);
      }
    }

    contents.push({ parts });

    // Call Gemini API using native fetch with official x-goog-api-key header (prevents key exposure in URL)
    const candidateModels = [process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-flash-latest'].filter(Boolean);
    let response = null;
    let lastErrorStatus = null;
    let lastErrorText = null;

    for (const modelName of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              response_mime_type: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (response.ok) {
          break; // Success! Proceed to parse
        }

        lastErrorStatus = response.status;
        lastErrorText = await response.text();

        // If 400 (e.g. invalid API key), stop trying further models as the key itself is invalid
        if (response.status === 400) {
          break;
        }
      } catch (reqErr) {
        lastErrorText = reqErr.message;
      }
    }

    if (!response || !response.ok) {
      const safeErr = apiKey && lastErrorText ? lastErrorText.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED_KEY]') : (lastErrorText || '');
      console.error('[AI Service Gemini Error]', lastErrorStatus || 'FAIL', safeErr);
      return {
        available: false,
        category: null,
        confidence: null,
        reason: `Gemini API returned HTTP ${lastErrorStatus || 500}. Falling back to manual selection.`,
        allowedCategories: CONTROLLED_CATEGORIES
      };
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        available: false,
        category: null,
        confidence: null,
        reason: 'AI provider returned empty response.',
        allowedCategories: CONTROLLED_CATEGORIES
      };
    }

    let cleanText = candidateText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanText);

    // Validate category strictly against controlled list
    const returnedCategory = (parsed.category || '').toUpperCase().trim();
    if (!CONTROLLED_CATEGORIES.includes(returnedCategory)) {
      console.warn(`[AI Service] Rejected invalid AI category '${returnedCategory}'. Must be one of:`, CONTROLLED_CATEGORIES);
      return {
        available: false,
        category: null,
        confidence: null,
        reason: `AI suggested category '${returnedCategory}' which is not in the controlled civic category list.`,
        allowedCategories: CONTROLLED_CATEGORIES
      };
    }

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0.0, Math.min(1.0, parseFloat(parsed.confidence.toFixed(4))))
      : 0.85;

    return {
      available: true,
      category: returnedCategory,
      confidence: confidence,
      explanation: parsed.explanation || 'Classified by Gemini AI model based on civic complaint description.',
      allowedCategories: CONTROLLED_CATEGORIES
    };

  } catch (err) {
    const safeMsg = apiKey ? err.message.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED_KEY]') : err.message;
    console.error('[AI Service Exception]', safeMsg);
    return {
      available: false,
      category: null,
      confidence: null,
      reason: `AI classification encountered an error: ${safeMsg}. Falling back to manual selection.`,
      allowedCategories: CONTROLLED_CATEGORIES
    };
  }
};

module.exports = {
  CONTROLLED_CATEGORIES,
  classifyIssue
};
