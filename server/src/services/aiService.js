const fs = require('fs');

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

    // Call Gemini API using native fetch
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AI Service Gemini Error]', response.status, errText);
      return {
        available: false,
        category: null,
        confidence: null,
        reason: `Gemini API returned HTTP ${response.status}. Falling back to manual selection.`,
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

    const parsed = JSON.parse(candidateText);

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
      : null;

    return {
      available: true,
      category: returnedCategory,
      confidence: confidence,
      explanation: parsed.explanation || 'Classified by Gemini AI model based on civic complaint description.',
      allowedCategories: CONTROLLED_CATEGORIES
    };

  } catch (err) {
    console.error('[AI Service Exception]', err.message);
    return {
      available: false,
      category: null,
      confidence: null,
      reason: `AI classification encountered an error: ${err.message}. Falling back to manual selection.`,
      allowedCategories: CONTROLLED_CATEGORIES
    };
  }
};

module.exports = {
  CONTROLLED_CATEGORIES,
  classifyIssue
};
