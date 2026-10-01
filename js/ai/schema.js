// Схема структурированного ответа. RESPONSE_SCHEMA — формат responseSchema Gemini (OpenAPI-подмножество).
export const FAMILIES = ['TOP', 'CHOP', 'SOP', 'DAT', 'COMP', 'MAT'];

const S = { type: 'STRING' };
const B = { type: 'BOOLEAN' };
const I = { type: 'INTEGER' };
const STR_ARR = { type: 'ARRAY', items: S };

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    observations: STR_ARR,
    summary: S,
    isLikelyTouchDesigner: B,
    techniques: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: S, why: S }, required: ['name', 'why'], propertyOrdering: ['name', 'why'] } },
    nodes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: S, type: S, family: { type: 'STRING', enum: FAMILIES },
          params: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: S, value: S, approximate: B }, required: ['name', 'value', 'approximate'], propertyOrdering: ['name', 'value', 'approximate'] } },
          purpose: S,
        },
        required: ['id', 'type', 'family', 'params', 'purpose'],
        propertyOrdering: ['id', 'type', 'family', 'params', 'purpose'],
      },
    },
    connections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { from: S, to: S, inputIndex: I, uncertain: B }, required: ['from', 'to', 'inputIndex'], propertyOrdering: ['from', 'to', 'inputIndex', 'uncertain'] } },
    steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { n: I, title: S, nodeIds: STR_ARR, details: S }, required: ['n', 'title', 'nodeIds', 'details'], propertyOrdering: ['n', 'title', 'nodeIds', 'details'] } },
    animation: STR_ARR,
    postfx: STR_ARR,
    tweakNotes: STR_ARR,
    uncertainties: STR_ARR,
    confidence: { type: 'NUMBER' },
  },
  required: ['observations', 'summary', 'isLikelyTouchDesigner', 'techniques', 'nodes', 'connections', 'steps', 'animation', 'postfx', 'tweakNotes', 'uncertainties', 'confidence'],
  propertyOrdering: ['observations', 'summary', 'isLikelyTouchDesigner', 'techniques', 'nodes', 'connections', 'steps', 'animation', 'postfx', 'tweakNotes', 'uncertainties', 'confidence'],
};

// Описание для промта (и для провайдеров без responseSchema).
export const SCHEMA_DESCRIPTION = `{
  "observations": [string],                // 5-10 concrete visual facts seen on the frames (write first)
  "summary": string,                       // 2–4 sentences: what is on the video and how it moves
  "isLikelyTouchDesigner": boolean,
  "techniques": [{ "name": string, "why": string }],   // techniques used and what each gives
  "nodes": [{
    "id": string,                          // e.g. "noise1"
    "type": string,                        // exact operator name with family, e.g. "Noise TOP"
    "family": "TOP"|"CHOP"|"SOP"|"DAT"|"COMP"|"MAT",
    "params": [{ "name": string, "value": string, "approximate": boolean }],  // key params only, value as text
    "purpose": string
  }],
  "connections": [{ "from": string, "to": string, "inputIndex": integer, "uncertain": boolean }],
  "steps": [{ "n": integer, "title": string, "nodeIds": [string], "details": string }],  // ordered build steps
  "animation": [string],                   // what moves it: CHOPs, expressions, looping
  "postfx": [string],                      // post-processing and color
  "tweakNotes": [string],                  // what to tune by eye to match the original
  "uncertainties": [string],               // what could not be determined from the frames
  "confidence": number                     // 0..1
}`;
