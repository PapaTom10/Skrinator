
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AIAnalysisMode, Cabinet, Tag, Room } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Analyzes items in a specific shelf image and suggests general tags.
 */
export const analyzeShelfItems = async (base64Image: string, mode: AIAnalysisMode = 'general') => {
  const promptText = mode === 'general' 
    ? "Analyze the items in this shelf detail. List them using SIMPLE, GENERAL terms in Czech (e.g., 'Mouka', 'Klávesnice'). For each item, suggest exactly one very general category/tag in Czech (e.g., 'Jídlo', 'Ingredience', 'Kancelářská technika', 'Elektronika', 'Léky', 'Nářadí', 'Oblečení'). Return a JSON object with an array called 'items' containing objects with 'name' and 'tag' properties."
    : "Analyze the items in this shelf detail. Provide a HIGHLY DETAILED and SPECIFIC list of items in Czech including brands if visible. For each item, suggest exactly one very general category/tag in Czech (e.g., 'Jídlo', 'Ingredience', 'Kancelářská technika', 'Elektronika', 'Léky', 'Nářadí'). Return a JSON object with an array called 'items' containing objects with 'name' and 'tag' properties.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: promptText,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: { 
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                tag: { type: Type.STRING }
              },
              required: ["name", "tag"]
            }
          }
        },
        required: ["items"]
      }
    },
  });

  try {
    const text = response.text || '{"items":[]}';
    return JSON.parse(text.trim());
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { items: [] };
  }
};

/**
 * Visual search: Find an item in the inventory by a photo.
 */
export const searchInventoryByImage = async (base64Image: string, cabinets: Cabinet[]) => {
  const inventoryFlattened = cabinets.flatMap(cab => 
    cab.shelves.flatMap(shelf => 
      shelf.items.map(item => ({
        id: item.id,
        name: item.name,
        location: `${cab.name} -> ${shelf.name}`
      }))
    )
  );

  const prompt = `Identifikuj hlavní předmět na této fotografii. Poté se podívej do tohoto seznamu inventáře: ${JSON.stringify(inventoryFlattened)}. Najdi nejlepší shodu.
  Vrať JSON objekt:
  {
    "itemId": "id nalezeného předmětu",
    "itemName": "přesný název z inventáře",
    "confidence": 0.0-1.0,
    "reason": "proč si myslíš, že je to ono"
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return null;
  }
};

/**
 * AI logic to analyze organization, find duplicates and suggest improvements.
 */
export const analyzeOrganization = async (cabinets: Cabinet[], rooms: Room[], tags: Tag[]) => {
  const data = cabinets.map(c => ({
    name: c.name,
    room: rooms.find(r => r.id === c.roomId)?.name || "Neznámý prostor",
    shelves: c.shelves.map(s => ({
      name: s.name,
      items: s.items.map(it => it.name)
    }))
  }));

  const prompt = `Jsi expert na domácí organizaci a metodu 5S. Analyzuj tento inventář domácnosti a najdi:
  1. Duplicity: Stejné položky v různých skříních/policích.
  2. Nelogické umístění: Věci, které k sobě nepatří (např. baterie u jídla).
  3. Návrhy na zlepšení: Jak věci lépe seskupit.

  Inventář: ${JSON.stringify(data)}.

  Vrať JSON objekt se strukturou:
  {
    "findings": [
      { "type": "duplicate" | "warning" | "suggestion", "title": "Krátký titulek", "description": "Podrobný popis v češtině", "items": ["seznam věcí"] }
    ],
    "summary": "Celkové shrnutí stavu domácnosti jednou větou."
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    return JSON.parse(response.text || '{"findings": []}');
  } catch (e) {
    return { findings: [], summary: "Chyba při analýze." };
  }
};

/**
 * Uses AI to find items in the inventory based on a natural language query.
 */
export const searchInventoryWithAI = async (query: string, cabinets: Cabinet[], globalTags: Tag[]) => {
  const inventoryData = cabinets.map(c => ({
    cabinetId: c.id,
    cabinetName: c.name,
    shelves: c.shelves.map(s => ({
      shelfId: s.id,
      shelfName: s.name,
      items: s.items.map(it => ({
        id: it.id,
        name: it.name,
        tags: (it.tagIds || []).map(tid => globalTags.find(t => t.id === tid)?.name).filter(Boolean)
      }))
    }))
  }));

  const prompt = `Jsi inteligentní vyhledávač v domácím inventáři. Tvým úkolem je najít věci, které uživatel hledá, i když nepoužije přesný název.
  Uživatel hledá: "${query}". 
  
  Zde je inventář: ${JSON.stringify(inventoryData)}. 
  
  Vrať JSON pole objektů:
  - 'itemId': ID předmětu z inventáře.
  - 'itemName': PŘESNÝ název předmětu z inventáře.
  - 'reason': Stručné vysvětlení v češtině.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            itemId: { type: Type.STRING },
            itemName: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ["itemId", "itemName", "reason"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    return [];
  }
};

/**
 * Assistant function with multimodal support (text, image, audio).
 */
export const askAssistantMultimodal = async (
  query: string | null, 
  imageUri: string | null, 
  audioUri: string | null,
  cabinets: Cabinet[], 
  rooms: Room[], 
  globalTags: Tag[]
) => {
  const inventoryFlattened = cabinets.flatMap(cab => 
    cab.shelves.flatMap(shelf => 
      shelf.items.map(item => ({
        item: item.name,
        box: shelf.boxes?.find(b => b.id === item.boxId)?.name || null,
        shelf: shelf.name,
        cabinet: cab.name,
        room: rooms.find(r => r.id === cab.roomId)?.name || "neuvedené místnosti"
      }))
    )
  );

  const parts: any[] = [];
  
  if (query) parts.push({ text: `Uživatel se ptá textem: "${query}"` });
  if (imageUri) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageUri.split(',')[1]
      }
    });
    parts.push({ text: "Uživatel posílá obrázek věci, kterou hledá nebo o které se chce dozvědět více." });
  }
  if (audioUri) {
    parts.push({
      inlineData: {
        mimeType: 'audio/wav',
        data: audioUri.split(',')[1]
      }
    });
    parts.push({ text: "Uživatel se ptá hlasem. Přepiš jeho hlasový dotaz a odpověz na něj." });
  }

  const systemInstruction = `Jsi asistent pro správu domácnosti. 
  Zde je seznam všech věcí v domě a jejich přesné polohy: ${JSON.stringify(inventoryFlattened)}.
  
  ÚKOL:
  1. Identifikuj, na co se uživatel ptá (pomocí textu, obrazu nebo hlasu).
  2. Pokud poslal obrázek, identifikuj předmět na něm a najdi ho v inventáři.
  3. Odpověz JEDNOU přirozenou, kompletní větou v češtině.
  4. Struktura věty: "[Věc] najdete v [místnost], konkrétně v [skříň], v části [police]" + případně "v [boxu]".
  5. Pokud věc nenajdeš, odpověz zdvořile.
  
  Vrať JSON objekt:
  {
    "answer": "Kompletní věta s odpovědí.",
    "foundItemId": "název věci v inventáři nebo null",
    "transcribedQuery": "Přepis hlasového dotazu (pokud byl audio vstup)"
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...parts, { text: systemInstruction }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          foundItemId: { type: Type.STRING, nullable: true },
          transcribedQuery: { type: Type.STRING, nullable: true }
        },
        required: ["answer"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{"answer": "Omlouvám se, nastala chyba."}');
  } catch (e) {
    return { answer: "Omlouvám se, nepodařilo se mi zpracovat odpověď." };
  }
};
