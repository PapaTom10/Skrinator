
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Package, ChevronRight, ArrowLeft, Camera as CameraIcon, Trash2, Loader2, Check, X, Save, RotateCw, Settings, Tag as TagIcon, Sparkles, Zap, Image as ImageIcon, Download, Upload, Box as BoxIcon, MoveHorizontal, CornerDownRight, SlidersHorizontal, Edit3, Moon, Sun, History, Home as HomeIcon, MapPin, MessageSquare, Bot, Mic, MicOff, Volume2, Printer, FileText, LayoutGrid, AlertCircle, Lightbulb, Maximize2, Archive, Home, Move, FileJson } from 'lucide-react';
import { Cabinet, Shelf, Item, ViewState, Room, Tag, AIAnalysisMode, Box } from './types';
import Camera from './components/Camera';
import { analyzeShelfItems, searchInventoryWithAI, askAssistantMultimodal, analyzeOrganization, searchInventoryByImage } from './services/geminiService';

const SHELF_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#14b8a6', '#f97316'];
const STORAGE_KEY = 'organize_it_data_v46';

interface SearchResult {
  itemId: string;
  itemName: string;
  reason: string;
  cabinetId: string;
  shelfId: string;
  boxId?: string;
  isAi: boolean;
}

interface CropRect { x: number; y: number; w: number; h: number; }

// Pomocná funkce pro odstranění diakritiky
const normalizeString = (str: string) => 
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const App: React.FC = () => {
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [globalTags, setGlobalTags] = useState<Tag[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [view, setView] = useState<ViewState>('home');
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<'cabinet' | 'shelf' | 'assistant' | 'search' | 'box'>('cabinet');
  const [isUpdatingExisting, setIsUpdatingExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAssistantMode, setIsAssistantMode] = useState(false);
  const [assistantResponse, setAssistantResponse] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [isOrganizing, setIsOrganizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'cabinet' | 'shelf' | 'room' | 'tag' | 'box' | 'item', id: string, name: string } | null>(null);

  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 5, y: 5, w: 90, h: 90 });
  const [isResizingCrop, setIsResizingCrop] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number, y: number, rect: CropRect } | null>(null);

  const [isMovingShelfId, setIsMovingShelfId] = useState<string | null>(null);
  const [isResizingShelfId, setIsResizingShelfId] = useState<{id: string, corner: string} | null>(null);
  const [shelfInteractionStart, setShelfInteractionStart] = useState<{ x: number, y: number, initialRect: { top: number, left: number, width: number, height: number } } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const [selectedForPrint, setSelectedForPrint] = useState<string[]>([]);
  const [advisorResults, setAdvisorResults] = useState<{findings: any[], summary: string} | null>(null);

  const [newItemName, setNewItemName] = useState('');
  const [newBoxName, setNewBoxName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [activeTab, setActiveTab] = useState<'items' | 'boxes'>('items');
  
  const editImgRef = useRef<HTMLImageElement>(null);
  const cabinetImgContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Načtení dat při startu
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.cabinets) setCabinets(parsed.cabinets);
        if (parsed.rooms) setRooms(parsed.rooms);
        if (parsed.globalTags) setGlobalTags(parsed.globalTags);
        if (parsed.selectedForPrint) setSelectedForPrint(parsed.selectedForPrint);
      } catch (e) { console.error("Chyba při parsování dat z LocalStorage", e); }
    } else {
        setRooms([
            { id: '1', name: 'Kuchyň' },
            { id: '2', name: 'Obývací pokoj' },
            { id: '3', name: 'Ložnice' },
            { id: '4', name: 'Garáž' }
        ]);
    }
    setIsDataLoaded(true);
  }, []);

  // Automatické ukládání při každé změně stavu
  useEffect(() => {
    if (isDataLoaded) {
      const dataToSave = JSON.stringify({ 
        cabinets, 
        rooms, 
        globalTags, 
        selectedForPrint 
      });
      localStorage.setItem(STORAGE_KEY, dataToSave);
    }
  }, [cabinets, rooms, globalTags, isDataLoaded, selectedForPrint]);

  // Real-time fulltext search effect s ignorováním diakritiky
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const q = normalizeString(searchQuery);
    const localResults: SearchResult[] = [];
    
    cabinets.forEach(cab => {
      cab.shelves.forEach(sh => {
        sh.items.forEach(it => {
          if (normalizeString(it.name).includes(q)) {
            localResults.push({
              itemId: it.id,
              itemName: it.name,
              reason: `Nalezeno v: ${cab.name} -> ${sh.name}${it.boxId ? ' (v boxu)' : ''}`,
              cabinetId: cab.id,
              shelfId: sh.id,
              boxId: it.boxId,
              isAi: false
            });
          }
        });
      });
    });

    setSearchResults(localResults);
  }, [searchQuery, cabinets]);

  const findItemLocation = (itemId: string): { cabinetId: string, shelfId: string, boxId?: string } | null => {
    for (const cab of cabinets) {
      for (const shelf of cab.shelves) {
        const item = shelf.items.find(i => i.id === itemId);
        if (item) {
          return { cabinetId: cab.id, shelfId: shelf.id, boxId: item.boxId };
        }
      }
    }
    return null;
  };

  const handleCapture = async (base64: string) => {
    setIsCapturing(false);
    const photoUrl = `data:image/jpeg;base64,${base64}`;
    if (captureMode === 'assistant') {
      setLoading(true);
      try {
        const result = await askAssistantMultimodal(searchQuery || "Co je na obrázku?", photoUrl, null, cabinets, rooms, globalTags);
        setAssistantResponse(result.answer);
        setView('search-results');
      } finally { setLoading(false); }
    } else if (captureMode === 'search') {
      setLoading(true);
      try {
        const result = await searchInventoryByImage(base64, cabinets);
        if (result && result.itemId) {
            const loc = findItemLocation(result.itemId);
            if (loc) {
                setSearchResults([{ 
                    itemId: result.itemId, 
                    itemName: result.itemName, 
                    reason: `Vizuální shoda: ${result.reason}`, 
                    cabinetId: loc.cabinetId, 
                    shelfId: loc.shelfId, 
                    boxId: loc.boxId,
                    isAi: true 
                }]);
                setSearchQuery(result.itemName);
            }
        } else {
            alert("V inventáři se nepodařilo najít nic podobného.");
        }
        setView('search-results');
      } finally { setLoading(false); }
    } else {
      setTempPhoto(photoUrl);
      setCropRect({ x: 5, y: 5, w: 90, h: 90 });
      setView('edit-photo');
    }
  };

  const processFinalPhoto = async (photoUrl: string, analysisMode: AIAnalysisMode | 'none' = 'none') => {
    if (captureMode === 'cabinet') {
      if (isUpdatingExisting && selectedCabinetId) {
        setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, photoUrl } : c));
        setView('cabinet-detail');
      } else {
        const initialShelf: Shelf = {
          id: Date.now().toString(),
          name: 'Police 1',
          items: [],
          boxes: [],
          color: SHELF_COLORS[0],
          visualPosition: { top: 10, left: 10, width: 80, height: 15 }
        };
        const newCabinet: Cabinet = { 
          id: (Date.now() + 1).toString(), 
          name: `Skříň ${cabinets.length + 1}`, 
          photoUrl, 
          shelves: [initialShelf], 
          roomId: undefined 
        };
        setCabinets(prev => [newCabinet, ...prev]);
        setSelectedCabinetId(newCabinet.id);
        setView('cabinet-detail');
        setIsOrganizing(true);
      }
    } else if ((captureMode === 'shelf' || captureMode === 'box') && selectedCabinetId && selectedShelfId) {
      if (analysisMode === 'none') {
        if (captureMode === 'shelf') {
          setCabinets(prev => prev.map(cab => cab.id === selectedCabinetId ? { ...cab, shelves: cab.shelves.map(sh => sh.id === selectedShelfId ? { ...sh, photoUrl } : sh) } : cab));
        }
      } else {
        setLoading(true);
        try {
          const base64 = photoUrl.split(',')[1];
          const analysis = await analyzeShelfItems(base64, analysisMode);
          const newItems: Item[] = analysis.items.map((it: any) => ({ 
            id: Math.random().toString(), 
            name: it.name, 
            color: 'transparent', 
            tagIds: [],
            boxId: captureMode === 'box' ? selectedBoxId || undefined : undefined
          }));
          setCabinets(prev => prev.map(cab => cab.id === selectedCabinetId ? { 
            ...cab, 
            shelves: cab.shelves.map(sh => {
              if (sh.id !== selectedShelfId) return sh;
              // If capturing in box, add to items and maintain box context
              return { 
                ...sh, 
                photoUrl: captureMode === 'shelf' ? photoUrl : sh.photoUrl, 
                items: [...sh.items, ...newItems] 
              };
            }) 
          } : cab));
        } catch (e) { 
          console.error(e); 
          alert("Analýza se nezdařila.");
        } finally { setLoading(false); }
      }
      setView(captureMode === 'box' ? 'box-detail' : 'shelf-detail');
    }
    setIsUpdatingExisting(false);
  };

  const rotateImage90 = async () => {
    if (!tempPhoto) return;
    setLoading(true);
    try {
      const img = new Image();
      img.src = tempPhoto;
      await new Promise((resolve) => { img.onload = resolve; });
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setTempPhoto(rotatedDataUrl);
    } catch (e) {
      console.error("Rotation failed", e);
    } finally {
      setLoading(false);
    }
  };

  const applyCrop = async (mode: AIAnalysisMode | 'none') => {
    if (!tempPhoto) return;
    setLoading(true);
    try {
      const img = new Image();
      img.src = tempPhoto;
      await new Promise(r => img.onload = r);
      const canvas = document.createElement('canvas');
      const sX = (cropRect.x / 100) * img.width;
      const sY = (cropRect.y / 100) * img.height;
      const sW = (cropRect.w / 100) * img.width;
      const sH = (cropRect.h / 100) * img.height;
      canvas.width = sW; canvas.height = sH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sX, sY, sW, sH, 0, 0, sW, sH);
      const finalImg = canvas.toDataURL('image/jpeg', 0.9);
      await processFinalPhoto(finalImg, mode);
      setTempPhoto(null);
    } finally { setLoading(false); }
  };

  const handleResizeMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isResizingCrop || !resizeStart || !editImgRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const rect = editImgRef.current.getBoundingClientRect();
    const dx = ((clientX - resizeStart.x) / rect.width) * 100;
    const dy = ((clientY - resizeStart.y) / rect.height) * 100;
    setCropRect(prev => {
      let { x, y, w, h } = resizeStart.rect;
      if (isResizingCrop.includes('l')) { x += dx; w -= dx; }
      if (isResizingCrop.includes('r')) { w += dx; }
      if (isResizingCrop.includes('t')) { y += dy; h -= dy; }
      if (isResizingCrop.includes('b')) { h += dy; }
      return { x: Math.max(0, Math.min(x, 95)), y: Math.max(0, Math.min(y, 95)), w: Math.max(5, Math.min(w, 100-x)), h: Math.max(5, Math.min(h, 100-y)) };
    });
  };

  const handleShelfGeometryMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ((!isMovingShelfId && !isResizingShelfId) || !shelfInteractionStart || !cabinetImgContainerRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const containerRect = cabinetImgContainerRef.current.getBoundingClientRect();
    
    const dx = ((clientX - shelfInteractionStart.x) / containerRect.width) * 100;
    const dy = ((clientY - shelfInteractionStart.y) / containerRect.height) * 100;

    setCabinets(prev => prev.map(cab => {
      if (cab.id !== selectedCabinetId) return cab;
      return {
        ...cab,
        shelves: cab.shelves.map(sh => {
          if (sh.id !== (isMovingShelfId || isResizingShelfId?.id)) return sh;
          const { top, left, width, height } = shelfInteractionStart.initialRect;
          if (isMovingShelfId) {
            return { ...sh, visualPosition: { 
              top: Math.max(0, Math.min(top + dy, 100 - height)), 
              left: Math.max(0, Math.min(left + dx, 100 - width)), 
              width, height 
            }};
          } else if (isResizingShelfId) {
            const corner = isResizingShelfId.corner;
            let newTop = top, newLeft = left, newWidth = width, newHeight = height;
            if (corner.includes('t')) { newTop = top + dy; newHeight = height - dy; }
            if (corner.includes('b')) { newHeight = height + dy; }
            if (corner.includes('l')) { newLeft = left + dx; newWidth = width - dx; }
            if (corner.includes('r')) { newWidth = width + dx; }
            return { ...sh, visualPosition: { 
              top: Math.max(0, Math.min(newTop, 100)), 
              left: Math.max(0, Math.min(newLeft, 100)), 
              width: Math.max(2, Math.min(newWidth, 100 - newLeft)), 
              height: Math.max(2, Math.min(newHeight, 100 - newTop)) 
            } };
          }
          return sh;
        })
      };
    }));
  };

  const handleShelfInteractionStart = (e: React.MouseEvent | React.TouchEvent, shId: string, type: 'move' | 'resize', corner?: string) => {
    if (e.cancelable) e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const cabinet = cabinets.find(c => c.id === selectedCabinetId);
    const shelf = cabinet?.shelves.find(s => s.id === shId);
    if (!shelf) return;

    const startAction = () => {
      setShelfInteractionStart({ x: clientX, y: clientY, initialRect: { ...shelf.visualPosition } });
      if (type === 'move') { setIsMovingShelfId(shId); setIsResizingShelfId(null); }
      else if (type === 'resize' && corner) { setIsResizingShelfId({ id: shId, corner }); setIsMovingShelfId(null); }
    };

    if (type === 'move') { longPressTimerRef.current = window.setTimeout(startAction, 150); }
    else { startAction(); }
  };

  const handleShelfInteractionEnd = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    setIsMovingShelfId(null); setIsResizingShelfId(null); setShelfInteractionStart(null);
  };

  const handleExport = () => {
    const data = { cabinets, rooms, globalTags };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `organize-it-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.cabinets) setCabinets(data.cabinets);
        if (data.rooms) setRooms(data.rooms);
        if (data.globalTags) setGlobalTags(data.globalTags);
        alert("Záloha byla úspěšně nahrána!");
      } catch (err) {
        alert("Chyba při nahrávání souboru. Ujistěte se, že jde o platný JSON zálohy.");
      }
    };
    reader.readAsText(file);
  };

  const triggerAiSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const aiRes = await searchInventoryWithAI(searchQuery, cabinets, globalTags);
      const mappedAi: SearchResult[] = aiRes.map((r: any) => {
        const loc = findItemLocation(r.itemId);
        if (!loc) return null;
        return {
          itemId: r.itemId,
          itemName: r.itemName,
          reason: `AI shoda: ${r.reason}`,
          cabinetId: loc.cabinetId,
          shelfId: loc.shelfId,
          boxId: loc.boxId,
          isAi: true
        };
      }).filter(Boolean);
      setSearchResults(prev => {
        const existingIds = new Set(prev.map(p => p.itemId));
        const newResults = mappedAi.filter(a => !existingIds.has(a.itemId));
        return [...prev, ...newResults];
      });
    } finally { setLoading(false); }
  };

  const navigateToItem = (result: SearchResult) => {
    setSelectedCabinetId(result.cabinetId);
    setSelectedShelfId(result.shelfId);
    if (result.boxId) {
      setSelectedBoxId(result.boxId);
      setView('box-detail');
    } else {
      setSelectedBoxId(null);
      setView('shelf-detail');
    }
  };

  const handlePrint = () => {
    const itemsToPrint: {name: string, sub: string[], color: string}[] = [];
    cabinets.forEach(cab => {
        if (selectedForPrint.includes(cab.id)) itemsToPrint.push({ name: cab.name, sub: cab.shelves.map(s => s.name), color: '#4f46e5' });
        cab.shelves.forEach(sh => {
            if (selectedForPrint.includes(sh.id)) itemsToPrint.push({ name: sh.name, sub: sh.items.slice(0, 5).map(i => i.name), color: sh.color });
            sh.boxes?.forEach(bx => {
               if (selectedForPrint.includes(bx.id)) itemsToPrint.push({ name: bx.name, sub: ["V polici: " + sh.name], color: sh.color });
            });
            sh.items.forEach(it => {
                if (selectedForPrint.includes(it.id)) itemsToPrint.push({ name: it.name, sub: it.boxId ? ["V boxu: " + (sh.boxes?.find(b => b.id === it.boxId)?.name || "Box")] : ["V polici: " + sh.name], color: sh.color });
            });
        });
    });

    const stickersHtml = itemsToPrint.map(it => `
        <div style="border: 1px solid #ddd; padding: 10px; height: 38mm; page-break-inside: avoid; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; font-family: sans-serif; background: white;">
            <div style="font-weight: bold; border-left: 4px solid ${it.color}; padding-left: 8px; margin-bottom: 5px; font-size: 14px; text-transform: uppercase;">${it.name}</div>
            <div style="font-size: 10px; color: #666; line-height: 1.2;">${it.sub.join(', ')}</div>
            <div style="font-size: 8px; color: #ccc; margin-top: auto; text-align: right;">Domácí Organizátor AI</div>
        </div>
    `).join('');

    const fullHtml = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Štítky k tisku</title><style>body{margin:0;padding:10mm;background:#f0f0f0;font-family:sans-serif;}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;width:190mm;margin:auto;background:white;padding:5mm;box-shadow:0 0 10px rgba(0,0,0,0.1);}</style></head><body><div class="grid">${stickersHtml}</div></body></html>`;
    
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stitky-${new Date().getTime()}.html`;
    link.click();
    URL.revokeObjectURL(url);
    alert("Soubor se štítky byl vygenerován a stažen.");
  };

  const togglePrintSelection = (id: string) => {
    setSelectedForPrint(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const addNewItem = (toBoxId?: string) => {
    if (!newItemName.trim() || !selectedCabinetId || !selectedShelfId) return;
    const newItem: Item = { id: Date.now().toString(), name: newItemName.trim(), boxId: toBoxId, color: 'transparent' };
    setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, shelves: c.shelves.map(s => s.id === selectedShelfId ? { ...s, items: [...s.items, newItem] } : s) } : c));
    setNewItemName('');
  };

  const moveItemToBox = (itemId: string, toBoxId: string | undefined) => {
    setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? {
      ...c,
      shelves: c.shelves.map(s => s.id === selectedShelfId ? {
        ...s,
        items: s.items.map(it => it.id === itemId ? { ...it, boxId: toBoxId } : it)
      } : s)
    } : c));
  };

  const addNewBox = () => {
    if (!newBoxName.trim() || !selectedCabinetId || !selectedShelfId) return;
    const newBox: Box = { id: Date.now().toString(), name: newBoxName.trim() };
    setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, shelves: c.shelves.map(s => s.id === selectedShelfId ? { ...s, boxes: [...(s.boxes || []), newBox] } : s) } : c));
    setNewBoxName('');
  };

  const addNewRoom = () => {
    if (!newRoomName.trim()) return;
    setRooms(prev => [...prev, { id: Date.now().toString(), name: newRoomName.trim() }]);
    setNewRoomName('');
  };

  const addNewTag = () => {
    if (!newTagName.trim()) return;
    setGlobalTags(prev => [...prev, { id: Date.now().toString(), name: newTagName.trim(), color: SHELF_COLORS[prev.length % SHELF_COLORS.length] }]);
    setNewTagName('');
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'cabinet') { setCabinets(prev => prev.filter(c => c.id !== confirmDelete.id)); setView('home'); }
    else if (confirmDelete.type === 'shelf') { setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, shelves: c.shelves.filter(s => s.id !== confirmDelete.id) } : c)); setView('cabinet-detail'); }
    else if (confirmDelete.type === 'item') { setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, shelves: c.shelves.map(s => s.id === selectedShelfId ? { ...s, items: s.items.filter(i => i.id !== confirmDelete.id) } : s) } : c)); }
    else if (confirmDelete.type === 'box') { 
        setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, shelves: c.shelves.map(s => s.id === selectedShelfId ? { ...s, boxes: (s.boxes || []).filter(b => b.id !== confirmDelete.id), items: s.items.map(it => it.boxId === confirmDelete.id ? { ...it, boxId: undefined } : it) } : s) } : c)); 
        if (selectedBoxId === confirmDelete.id) setView('shelf-detail');
    }
    else if (confirmDelete.type === 'room') { setRooms(prev => prev.filter(r => r.id !== confirmDelete.id)); }
    else if (confirmDelete.type === 'tag') { setGlobalTags(prev => prev.filter(t => t.id !== confirmDelete.id)); }
    setConfirmDelete(null);
  };

  const selectedCabinet = cabinets.find(c => c.id === selectedCabinetId);
  const selectedShelf = selectedCabinet?.shelves.find(s => s.id === selectedShelfId);
  const selectedBox = selectedShelf?.boxes?.find(b => b.id === selectedBoxId);
  const isEditingUI = view === 'edit-photo';

  return (
    <div className={`max-w-md mx-auto min-h-screen flex flex-col bg-zinc-50 text-zinc-900 ${isOrganizing ? 'overflow-hidden h-screen fixed inset-0' : ''}`} onMouseMove={handleShelfGeometryMove} onTouchMove={handleShelfGeometryMove} onMouseUp={handleShelfInteractionEnd} onTouchEnd={handleShelfInteractionEnd}>
      
      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-[200] flex flex-col items-center justify-center text-indigo-600">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <p className="font-bold text-sm text-zinc-600">AI pracuje...</p>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-6">
          <div className="rounded-3xl w-full max-w-xs p-8 shadow-2xl bg-white text-center">
            <h3 className="text-lg font-bold mb-2">Smazat {confirmDelete.name}?</h3>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button onClick={() => setConfirmDelete(null)} className="py-3 bg-zinc-100 rounded-xl font-bold text-xs text-zinc-600">Zrušit</button>
              <button onClick={executeDelete} className="py-3 bg-red-500 text-white rounded-xl font-bold text-xs">Smazat</button>
            </div>
          </div>
        </div>
      )}

      {view === 'edit-photo' && tempPhoto ? (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col no-print">
          <header className="p-4 flex justify-between items-center bg-zinc-900">
            <button onClick={() => { setTempPhoto(null); setView('home'); }} className="text-white"><X /></button>
            <button onClick={rotateImage90} className="p-2 text-white"><RotateCw className="w-5 h-5" /></button>
          </header>
          <main className="flex-1 relative overflow-hidden flex items-center justify-center" onMouseMove={handleResizeMove} onTouchMove={handleResizeMove} onMouseUp={() => setIsResizingCrop(null)} onTouchEnd={() => setIsResizingCrop(null)}>
            <div className="relative">
              <img ref={editImgRef} src={tempPhoto} alt="" className="max-w-full max-h-[70vh] object-contain select-none pointer-events-none" />
              <div className="absolute border-2 border-indigo-500 bg-indigo-500/10" style={{ left: `${cropRect.x}%`, top: `${cropRect.y}%`, width: `${cropRect.w}%`, height: `${cropRect.h}%` }}>
                {['tl', 'tr', 'bl', 'br'].map(h => (
                  <div key={h} className={`absolute w-12 h-12 flex items-center justify-center ${h === 'tl' ? '-left-6 -top-6' : h === 'tr' ? '-right-6 -top-6' : h === 'bl' ? '-left-6 -bottom-6' : '-right-6 -bottom-6'}`} onMouseDown={(e) => { e.stopPropagation(); setIsResizingCrop(h); setResizeStart({ x: e.clientX, y: e.clientY, rect: { ...cropRect } }); }} onTouchStart={(e) => { e.stopPropagation(); setIsResizingCrop(h); setResizeStart({ x: e.touches[0].clientX, y: e.touches[0].clientY, rect: { ...cropRect } }); }}>
                    <div className="w-6 h-6 bg-white border-2 border-indigo-600 rounded-full shadow-lg" />
                  </div>
                ))}
              </div>
            </div>
          </main>
          <footer className="p-6 bg-zinc-900 safe-bottom">
            {(captureMode === 'shelf' || captureMode === 'box') ? (
              <div className="space-y-3">
                <button onClick={() => applyCrop('none')} className="w-full py-4 bg-zinc-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2">Pouze uložit fotku</button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => applyCrop('general')} className="py-4 bg-indigo-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg"><Zap className="w-4 h-4" /> Rychlá AI</button>
                  <button onClick={() => applyCrop('detailed')} className="py-4 bg-amber-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg"><Sparkles className="w-4 h-4" /> Detailní AI</button>
                </div>
              </div>
            ) : (
              <button onClick={() => applyCrop('none')} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                <Check className="w-5 h-5" /> Potvrdit fotku skříně
              </button>
            )}
          </footer>
        </div>
      ) : (
        <>
          <header className={`px-4 pt-4 pb-3 sticky top-0 z-30 transition-colors bg-white border-b border-zinc-100 no-print ${isOrganizing ? 'bg-indigo-50 border-indigo-200' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-lg font-bold tracking-tight cursor-pointer" onClick={() => { setView('home'); setIsOrganizing(false); }}>Organizátor<span className="text-indigo-600">AI</span></h1>
              {isOrganizing ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded-full">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">Režim úprav</span>
                </div>
              ) : (
                <button onClick={() => setView('settings')} className={`p-2 rounded-full transition-colors ${view === 'settings' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}><Settings className="w-4 h-4" /></button>
              )}
            </div>
            {(view === 'search-results') && (
              <div className="flex gap-2">
                <div className="flex-1 flex items-center h-10 px-3 rounded-xl border bg-zinc-50 border-zinc-200">
                  <Search className="text-zinc-400 w-4 h-4 mr-2" />
                  <input type="text" placeholder="Hledej..." className="flex-1 bg-transparent border-none text-xs outline-none text-zinc-900 placeholder-zinc-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <button onClick={triggerAiSearch} className={`h-10 w-10 flex items-center justify-center rounded-xl shadow active:scale-95 transition-all ${searchQuery.trim() ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-300'}`} disabled={!searchQuery.trim()}>
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            )}
          </header>

          <main className={`flex-1 p-3 pb-24 no-print overflow-y-auto ${isOrganizing ? 'pt-0' : ''}`}>
            {view === 'home' && (
              <div className="space-y-3">
                 {cabinets.length === 0 && (
                    <div className="text-center py-20 text-zinc-400 px-10">
                      <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="text-sm italic">Vyfoťte svou první skříň pro začátek.</p>
                    </div>
                 )}
                 {cabinets.map(cab => (
                    <div key={cab.id} className="flex items-center gap-3 p-2.5 rounded-2xl border bg-white border-zinc-100 shadow-sm">
                      <div className="w-14 h-14 rounded-xl overflow-hidden cursor-pointer shrink-0" onClick={() => { setSelectedCabinetId(cab.id); setView('cabinet-detail'); }}><img src={cab.photoUrl} alt="" className="w-full h-full object-cover" /></div>
                      <div className="flex-1 cursor-pointer" onClick={() => { setSelectedCabinetId(cab.id); setView('cabinet-detail'); }}>
                        <h3 className="font-bold text-sm text-zinc-900 leading-tight">{cab.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-zinc-400 font-bold uppercase">{cab.shelves.length} polic</span>
                            {cab.roomId && <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-bold uppercase">{rooms.find(r => r.id === cab.roomId)?.name}</span>}
                        </div>
                      </div>
                      <button onClick={() => togglePrintSelection(cab.id)} className={`p-2 rounded-xl transition-all ${selectedForPrint.includes(cab.id) ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-400'}`}><Printer className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button onClick={() => { setCaptureMode('cabinet'); setIsCapturing(true); }} className="w-full py-6 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-100"><Plus className="mb-1 w-6 h-6" /> <span className="text-[10px] font-bold uppercase">Přidat skříň</span></button>
              </div>
            )}

            {view === 'cabinet-detail' && selectedCabinet && (
              <div className="flex flex-col animate-in fade-in">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => { setView('home'); setIsOrganizing(false); }} className="text-indigo-600 text-[10px] font-bold flex items-center"><ArrowLeft className="w-3 h-3 mr-1" /> DOMŮ</button>
                  <div className="flex gap-2">
                      <button onClick={() => setIsOrganizing(!isOrganizing)} className={`p-2 rounded-xl transition-all ${isOrganizing ? 'bg-indigo-600 text-white shadow' : 'bg-zinc-100'}`}><SlidersHorizontal className="w-4 h-4" /></button>
                      {!isOrganizing && <button onClick={() => setConfirmDelete({type: 'cabinet', id: selectedCabinet.id, name: selectedCabinet.name})} className="p-2 text-red-500 bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 bg-white p-2 rounded-xl border border-zinc-100">
                    <input className="flex-1 text-base font-bold bg-transparent text-zinc-900 outline-none focus:ring-1 ring-indigo-500 rounded px-1" value={selectedCabinet.name} onChange={e => setCabinets(prev => prev.map(c => c.id === selectedCabinet.id ? {...c, name: e.target.value} : c))} />
                    <div className="h-6 w-px bg-zinc-100" />
                    <select 
                        className="bg-transparent text-[9px] font-bold uppercase py-1 pl-1 pr-4 rounded-lg border-none outline-none text-zinc-500"
                        value={selectedCabinet.roomId || ''}
                        onChange={(e) => setCabinets(prev => prev.map(c => c.id === selectedCabinet.id ? { ...c, roomId: e.target.value || undefined } : c))}
                    >
                        <option value="">Bez místnosti</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>

                <div ref={cabinetImgContainerRef} className={`relative rounded-2xl overflow-hidden border shadow bg-white w-full max-h-[40vh] select-none touch-none ${isOrganizing ? 'border-indigo-400 ring-2 ring-indigo-100 overflow-y-auto' : 'border-zinc-200 flex justify-center items-center'}`}>
                  <div className="relative w-fit mx-auto">
                    <img src={selectedCabinet.photoUrl} alt="" className="w-full max-h-[40vh] block pointer-events-none select-none object-contain" />
                    
                    {selectedCabinet.shelves.map(sh => (
                      <div 
                        key={sh.id} 
                        className={`absolute border-2 transition-colors flex flex-col items-center justify-center ${isOrganizing ? 'z-10 cursor-move shadow' : 'border-white/50 bg-white/5 backdrop-blur-[1px] hover:bg-white/10 cursor-pointer'}`}
                        style={{ 
                          top: `${sh.visualPosition.top}%`, left: `${sh.visualPosition.left}%`, width: `${sh.visualPosition.width}%`, height: `${sh.visualPosition.height}%`,
                          borderColor: sh.color, backgroundColor: isOrganizing ? `${sh.color}33` : undefined
                        }}
                        onMouseDown={(e) => { if (!isOrganizing) { setSelectedShelfId(sh.id); setView('shelf-detail'); return; } handleShelfInteractionStart(e, sh.id, 'move'); }}
                        onTouchStart={(e) => { if (!isOrganizing) { setSelectedShelfId(sh.id); setView('shelf-detail'); return; } handleShelfInteractionStart(e, sh.id, 'move'); }}
                      >
                        <span className={`text-[8px] font-bold px-1 rounded shadow-sm transition-opacity whitespace-nowrap overflow-hidden max-w-full ${isOrganizing ? 'text-white' : 'bg-white/90 text-zinc-900 opacity-70'}`} style={{ backgroundColor: isOrganizing ? sh.color : undefined }}>{sh.name}</span>
                        {isOrganizing && (
                          <>
                            {['tl', 'tr', 'bl', 'br'].map(corner => (
                              <div key={corner} className={`absolute w-8 h-8 flex items-center justify-center z-20 ${corner === 'tl' ? '-left-4 -top-4' : corner === 'tr' ? '-right-4 -top-4' : corner === 'bl' ? '-left-4 -bottom-4' : '-right-4 -bottom-4'}`} onMouseDown={(e) => { e.stopPropagation(); handleShelfInteractionStart(e, sh.id, 'resize', corner); }} onTouchStart={(e) => { e.stopPropagation(); handleShelfInteractionStart(e, sh.id, 'resize', corner); }}>
                                <div className="w-3 h-3 bg-white border-2 rounded-full shadow" style={{ borderColor: sh.color }} />
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {!isOrganizing ? (
                  <div className="space-y-2 pt-4">
                    <div className="flex justify-between items-center px-1">
                      <h4 className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Poličky</h4>
                      <span className="text-[9px] text-zinc-300 font-bold uppercase">{selectedCabinet.shelves.length} položek</span>
                    </div>
                    {selectedCabinet.shelves.map(sh => (
                        <div key={sh.id} className="flex gap-2">
                            <button onClick={() => { setSelectedShelfId(sh.id); setView('shelf-detail'); }} className="flex-1 p-3 rounded-xl border-l-4 bg-white border-zinc-100 flex justify-between items-center shadow-sm active:scale-98 transition-all" style={{ borderLeftColor: sh.color }}>
                                <span className="font-bold text-xs text-zinc-900">{sh.name}</span>
                                <ChevronRight className="w-3 h-3 text-zinc-300" />
                            </button>
                            <button onClick={() => togglePrintSelection(sh.id)} className={`p-3 rounded-xl shadow-sm transition-all active:scale-95 ${selectedForPrint.includes(sh.id) ? 'bg-indigo-100 text-indigo-600' : 'bg-zinc-50 text-zinc-400'}`}><Printer className="w-4 h-4" /></button>
                        </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-4 pb-20">
                    <button onClick={() => { 
                        const nextIndex = selectedCabinet.shelves.length;
                        const newShId = Date.now().toString();
                        const newColor = SHELF_COLORS[nextIndex % SHELF_COLORS.length];
                        
                        let newTop = 10;
                        if (selectedCabinet.shelves.length > 0) {
                          const maxBottom = Math.max(...selectedCabinet.shelves.map(s => s.visualPosition.top + s.visualPosition.height));
                          newTop = Math.min(maxBottom + 2, 88);
                        }

                        setCabinets(prev => prev.map(c => c.id === selectedCabinet.id ? { ...c, shelves: [...c.shelves, { id: newShId, name: `Police ${nextIndex + 1}`, items: [], boxes: [], color: newColor, visualPosition: {top: newTop, left: 10, width: 80, height: 10} }] } : c));
                      }} className="py-3 bg-indigo-100 text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-2 border-2 border-indigo-200 active:scale-95 transition-all text-[10px] uppercase">
                      <Plus className="w-3.5 h-3.5" /> Přidat polici
                    </button>
                    
                    <button onClick={() => setIsOrganizing(false)} className="py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow active:scale-95 transition-all text-[10px] uppercase">
                      <Check className="w-3.5 h-3.5" /> Hotovo - Uložit
                    </button>
                  </div>
                )}
              </div>
            )}

            {view === 'shelf-detail' && selectedShelf && selectedCabinet && (
                <div className="space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setView('cabinet-detail')} className="text-indigo-600 text-[10px] font-bold flex items-center uppercase"><ArrowLeft className="w-3 h-3 mr-1" /> SKŘÍŇ {selectedCabinet.name}</button>
                      <button onClick={() => setConfirmDelete({type: 'shelf', id: selectedShelf.id, name: selectedShelf.name})} className="text-red-500 p-2"><Trash2 className="w-4 h-4" /></button>
                    </div>

                    <div className="flex gap-3 items-center bg-white p-2.5 rounded-2xl border border-zinc-100 shadow-sm">
                        <div className="flex-1 overflow-hidden">
                           <input className="text-lg font-bold bg-transparent text-zinc-900 outline-none focus:ring-1 ring-indigo-500 rounded px-1 w-full" value={selectedShelf.name} onChange={e => setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? {...c, shelves: c.shelves.map(s => s.id === selectedShelf.id ? {...s, name: e.target.value} : s)} : c))} />
                           <p className="text-[9px] text-zinc-300 font-bold uppercase truncate pl-1">Police v: {selectedCabinet.name}</p>
                        </div>
                        <button onClick={() => togglePrintSelection(selectedShelf.id)} className={`p-2.5 rounded-xl shadow-sm ${selectedForPrint.includes(selectedShelf.id) ? 'bg-indigo-600 text-white shadow' : 'bg-zinc-100'}`}><Printer className="w-4 h-4" /></button>
                    </div>

                    <div className="pt-1">
                        {selectedShelf.photoUrl ? (
                          <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow relative max-h-[30vh] bg-white flex justify-center items-center">
                            <img src={selectedShelf.photoUrl} alt="" className="max-w-full max-h-[30vh] block object-contain" />
                            <div className="absolute top-2 right-2">
                                <button onClick={() => { setCaptureMode('shelf'); setIsCapturing(true); }} className="p-2 bg-indigo-600 text-white rounded-xl shadow active:scale-95"><CameraIcon className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setCaptureMode('shelf'); setIsCapturing(true); }} className="w-full py-10 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center text-zinc-400 gap-2 hover:bg-zinc-100 transition-colors">
                            <CameraIcon className="w-8 h-8 opacity-20" />
                            <div className="text-center px-6">
                              <span className="text-[9px] font-bold block uppercase opacity-60">Klikněte pro AI foto police</span>
                            </div>
                          </button>
                        )}
                    </div>

                    <div className="flex gap-1 border-b border-zinc-100">
                        <button onClick={() => setActiveTab('items')} className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'items' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-400'}`}>Položky ({selectedShelf.items.filter(i => !i.boxId).length})</button>
                        <button onClick={() => setActiveTab('boxes')} className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'boxes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-400'}`}>Boxy ({(selectedShelf.boxes || []).length})</button>
                    </div>

                    <div className="space-y-1.5 min-h-[120px]">
                        {activeTab === 'items' && (
                          <>
                            {selectedShelf.items.filter(it => !it.boxId).length === 0 && <p className="text-center py-6 text-zinc-300 text-[10px] italic">Prázdné.</p>}
                            {selectedShelf.items.filter(it => !it.boxId).map(it => (
                                <div key={it.id} className="p-2.5 border rounded-xl flex items-center gap-3 bg-white border-zinc-100 shadow-xs group">
                                    <div className="flex-1 font-bold text-xs truncate text-zinc-900">{it.name}</div>
                                    <div className="flex gap-1">
                                        <select 
                                          className="text-[9px] bg-zinc-50 border-none outline-none focus:ring-1 ring-indigo-500 rounded p-1 opacity-40 group-hover:opacity-100 transition-opacity"
                                          onChange={(e) => moveItemToBox(it.id, e.target.value || undefined)}
                                          value=""
                                        >
                                          <option value="" disabled>Do boxu...</option>
                                          {(selectedShelf.boxes || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                        <button onClick={() => togglePrintSelection(it.id)} className={`p-1.5 rounded-lg ${selectedForPrint.includes(it.id) ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-300'}`}><Printer className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setConfirmDelete({type: 'item', id: it.id, name: it.name})} className="p-1.5 text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                          </>
                        )}

                        {activeTab === 'boxes' && (
                          <>
                            {(selectedShelf.boxes || []).length === 0 && <p className="text-center py-6 text-zinc-300 text-[10px] italic">Žádné boxy.</p>}
                            {(selectedShelf.boxes || []).map(bx => (
                                <div key={bx.id} className="p-2.5 border rounded-xl flex items-center gap-3 bg-white border-zinc-100 shadow-sm active:scale-98 transition-all cursor-pointer" onClick={() => { setSelectedBoxId(bx.id); setView('box-detail'); }}>
                                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0"><Archive className="w-4 h-4" /></div>
                                    <div className="flex-1">
                                        <div className="font-bold text-xs text-zinc-900">{bx.name}</div>
                                        <div className="text-[8px] text-zinc-400 uppercase font-bold">{selectedShelf.items.filter(i => i.boxId === bx.id).length} věcí</div>
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-zinc-300" />
                                </div>
                            ))}
                          </>
                        )}
                    </div>

                    <div className="flex gap-2 pt-2 bg-zinc-50">
                        {activeTab === 'items' ? (
                          <div className="flex w-full gap-2">
                             <input type="text" placeholder="Věc do police..." className="flex-1 p-3 rounded-xl border border-zinc-200 outline-none focus:ring-2 ring-indigo-500 bg-white shadow text-xs" value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewItem()} />
                             <button onClick={() => addNewItem()} className="p-3 bg-indigo-600 text-white rounded-xl shadow active:scale-95"><Plus /></button>
                          </div>
                        ) : (
                          <div className="flex w-full gap-2">
                             <input type="text" placeholder="Nový box..." className="flex-1 p-3 rounded-xl border border-zinc-200 outline-none focus:ring-2 ring-indigo-500 bg-white shadow text-xs" value={newBoxName} onChange={e => setNewBoxName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewBox()} />
                             <button onClick={addNewBox} className="p-3 bg-indigo-600 text-white rounded-xl shadow active:scale-95"><Archive className="w-5 h-5" /></button>
                          </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'box-detail' && selectedBox && (
                <div className="space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setView('shelf-detail'); setSelectedBoxId(null); }} className="text-indigo-600 text-[10px] font-bold flex items-center uppercase"><ArrowLeft className="w-3 h-3 mr-1" /> POLICE {selectedShelf?.name}</button>
                      <div className="flex gap-2">
                          <button onClick={() => { setCaptureMode('box'); setIsCapturing(true); }} title="Skenovat věci do boxu pomocí AI" className="p-2 bg-amber-500 text-white rounded-xl shadow active:scale-95"><Sparkles className="w-4 h-4" /></button>
                          <button onClick={() => setConfirmDelete({type: 'box', id: selectedBox.id, name: selectedBox.name})} className="text-red-500 p-2"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-white p-3.5 rounded-2xl border border-zinc-100 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm"><Archive className="w-5 h-5" /></div>
                            <input className="text-lg font-bold bg-transparent text-zinc-900 outline-none focus:ring-1 ring-indigo-500 rounded px-1 w-full" value={selectedBox.name} onChange={e => setCabinets(prev => prev.map(c => c.id === selectedCabinetId ? { ...c, shelves: c.shelves.map(s => s.id === selectedShelfId ? { ...s, boxes: (s.boxes || []).map(b => b.id === selectedBox.id ? { ...b, name: e.target.value } : b) } : s) } : c))} />
                        </div>
                        <button onClick={() => togglePrintSelection(selectedBox.id)} className={`p-2.5 rounded-xl shadow-sm ${selectedForPrint.includes(selectedBox.id) ? 'bg-indigo-600 text-white' : 'bg-zinc-100'}`}><Printer className="w-4 h-4" /></button>
                    </div>

                    <div className="space-y-1.5 pt-1">
                        <h3 className="text-[8px] font-bold uppercase tracking-widest text-zinc-400 px-1">Obsah boxu</h3>
                        {selectedShelf?.items.filter(i => i.boxId === selectedBox.id).length === 0 && (
                            <div className="text-center py-10 text-zinc-300 text-[10px] italic bg-white border border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                                <Bot className="w-6 h-6 opacity-20" />
                                <span className="uppercase text-[8px] font-bold">Prázdný box</span>
                            </div>
                        )}
                        {selectedShelf?.items.filter(i => i.boxId === selectedBox.id).map(it => (
                            <div key={it.id} className="p-2.5 border rounded-xl flex items-center gap-3 bg-white border-zinc-100 shadow-xs group">
                                <div className="flex-1 font-bold text-xs truncate text-zinc-900">{it.name}</div>
                                <div className="flex gap-1">
                                    <button onClick={() => moveItemToBox(it.id, undefined)} className="text-[8px] font-bold uppercase bg-zinc-50 rounded px-1.5 opacity-60 group-hover:opacity-100 transition-opacity">Ven</button>
                                    <button onClick={() => togglePrintSelection(it.id)} className={`p-1.5 rounded-lg ${selectedForPrint.includes(it.id) ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-300'}`}><Printer className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setConfirmDelete({type: 'item', id: it.id, name: it.name})} className="p-1.5 text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2 pt-2 bg-zinc-50">
                        <input type="text" placeholder="Nová věc do boxu..." className="flex-1 p-3 rounded-xl border border-zinc-200 outline-none focus:ring-2 ring-indigo-500 bg-white shadow text-xs" value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewItem(selectedBox.id)} />
                        <button onClick={() => addNewItem(selectedBox.id)} className="p-3 bg-indigo-600 text-white rounded-xl shadow active:scale-95"><Plus /></button>
                    </div>
                </div>
            )}

            {view === 'settings' && (
              <div className="space-y-6 animate-in fade-in">
                <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-600">Nastavení</h2>
                
                <div className="space-y-3">
                  <h3 className="text-[8px] font-bold uppercase tracking-widest text-zinc-400">Místnosti</h3>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Místnost..." className="flex-1 p-2.5 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-1 ring-indigo-500" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewRoom()} />
                    <button onClick={addNewRoom} className="p-2.5 bg-indigo-600 text-white rounded-xl"><Plus className="w-4 h-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rooms.map(r => (
                      <div key={r.id} className="flex items-center gap-2 bg-white border px-2.5 py-1 rounded-lg shadow-sm">
                        <span className="text-[10px] font-medium">{r.name}</span>
                        <button onClick={() => setConfirmDelete({type: 'room', id: r.id, name: r.name})} className="text-red-300"><X className="w-2.5 h-2.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[8px] font-bold uppercase tracking-widest text-zinc-400">Štítky</h3>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Štítek..." className="flex-1 p-2.5 rounded-xl border border-zinc-200 text-xs outline-none focus:ring-1 ring-indigo-500" value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewTag()} />
                    <button onClick={addNewTag} className="p-2.5 bg-indigo-600 text-white rounded-xl"><Plus className="w-4 h-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {globalTags.map(t => (
                      <div key={t.id} className="flex items-center gap-2 px-2.5 py-1 rounded-lg shadow-sm text-white" style={{ backgroundColor: t.color }}>
                        <span className="text-[10px] font-bold">{t.name}</span>
                        <button onClick={() => setConfirmDelete({type: 'tag', id: t.id, name: t.name})} className="text-white/60"><X className="w-2.5 h-2.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-4 border-t border-zinc-100">
                    <button onClick={handleExport} className="w-full py-3 bg-zinc-100 border border-zinc-200 rounded-xl text-[10px] font-bold text-zinc-700 uppercase flex items-center justify-center gap-2 shadow-sm"><Download className="w-3.5 h-3.5" /> Export (.json)</button>
                    <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 bg-white border border-indigo-200 rounded-xl text-[10px] font-bold text-indigo-600 uppercase flex items-center justify-center gap-2 shadow-sm"><Upload className="w-3.5 h-3.5" /> Import (.json)</button>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                </div>
              </div>
            )}

            {view === 'tools' && (
              <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-600">Nástroje</h2>
                  <div className="grid grid-cols-1 gap-3">
                      <button onClick={() => setView('stickers')} className="p-4 bg-white border border-zinc-100 rounded-2xl flex items-center gap-4 text-left shadow-sm active:scale-95 transition-transform">
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><Printer className="w-5 h-5" /></div>
                          <div><div className="font-bold text-sm">Tisk štítků</div><div className="text-[9px] text-zinc-400 font-bold uppercase">Vybráno {selectedForPrint.length} položek</div></div>
                      </button>
                      <button onClick={async () => { setLoading(true); try { const res = await analyzeOrganization(cabinets, rooms, globalTags); setAdvisorResults(res); setView('advisor'); } finally { setLoading(false); } }} className="p-4 bg-white border border-zinc-100 rounded-2xl flex items-center gap-4 text-left shadow-sm active:scale-95 transition-transform">
                          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><Bot className="w-5 h-5" /></div>
                          <div><div className="font-bold text-sm">AI Konzultant</div><div className="text-[9px] text-zinc-400 font-bold uppercase">Analýza pořádku</div></div>
                      </button>
                  </div>
              </div>
            )}

            {view === 'stickers' && (
              <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Fronta k tisku</h2><button onClick={() => setSelectedForPrint([])} className="text-[9px] font-bold text-red-500 uppercase">Vymazat</button></div>
                  <div className="space-y-1.5">
                      {selectedForPrint.length === 0 && <p className="text-center py-10 text-zinc-400 italic text-[10px]">Prázdné.</p>}
                      {selectedForPrint.map(id => {
                        const obj = cabinets.find(c => c.id === id) || 
                                    cabinets.flatMap(c => c.shelves).find(s => s.id === id) || 
                                    cabinets.flatMap(c => c.shelves).flatMap(s => (s.boxes || [])).find(b => b.id === id) ||
                                    cabinets.flatMap(c => c.shelves).flatMap(s => s.items).find(i => i.id === id);
                        return obj ? (
                          <div key={id} className="flex items-center justify-between p-2.5 bg-white border rounded-xl shadow-sm">
                            <span className="text-xs font-bold">{obj.name}</span>
                            <button onClick={() => togglePrintSelection(id)}><X className="w-3.5 h-3.5 text-zinc-300" /></button>
                          </div>
                        ) : null;
                      })}
                  </div>
                  <button onClick={handlePrint} disabled={selectedForPrint.length === 0} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:bg-zinc-200 shadow-lg active:scale-95 transition-all text-sm uppercase tracking-wide"><Download className="w-5 h-5" /> Generovat štítky (HTML)</button>
              </div>
            )}

            {view === 'advisor' && advisorResults && (
              <div className="space-y-4 animate-in fade-in">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Bot className="text-indigo-600" /> AI Doporučení</h2>
                  <p className="p-4 bg-white border border-indigo-100 rounded-xl italic text-[11px] text-zinc-600 leading-relaxed shadow-sm">"{advisorResults.summary}"</p>
                  <div className="space-y-3">
                      {advisorResults.findings.map((f: any, i: number) => (
                          <div key={i} className={`p-4 rounded-xl border-l-4 shadow-sm ${f.type === 'duplicate' ? 'bg-red-50 border-red-500' : 'bg-indigo-50 border-indigo-500'}`}>
                              <h4 className="font-bold text-[10px] uppercase mb-1 flex items-center gap-2 tracking-wide">{f.type === 'duplicate' ? <AlertCircle className="w-3 h-3 text-red-500" /> : <Lightbulb className="w-3 h-3 text-indigo-500" />} {f.title}</h4>
                              <p className="text-[10px] text-zinc-600">{f.description}</p>
                          </div>
                      ))}
                  </div>
              </div>
            )}

            {view === 'search-results' && (
              <div className="space-y-4 animate-in fade-in">
                {isAssistantMode && assistantResponse && (
                  <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg flex items-start gap-3">
                    <Sparkles className="shrink-0 w-4 h-4 mt-1" />
                    <p className="text-xs font-medium leading-relaxed">{assistantResponse}</p>
                  </div>
                )}
                
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 px-1">Výsledky</h3>
                    <div className="space-y-2">
                      {searchResults.map((res, idx) => (
                        <div 
                          key={`${res.itemId}-${idx}`} 
                          onClick={() => navigateToItem(res)}
                          className={`p-3 bg-white border rounded-xl shadow-sm flex flex-col gap-1 cursor-pointer active:scale-98 transition-all ${res.isAi ? 'border-amber-100 bg-amber-50/20' : 'border-zinc-100'}`}
                        >
                          <div className="flex justify-between items-start">
                            <div className={`font-bold text-xs ${res.isAi ? 'text-amber-600' : 'text-indigo-600'}`}>{res.itemName}</div>
                            {res.isAi ? <Sparkles className="w-3 h-3 text-amber-400" /> : <Package className="w-3 h-3 text-zinc-300" />}
                          </div>
                          <div className="text-[9px] text-zinc-500 leading-tight">{res.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : searchQuery ? (
                  <div className="text-center py-20 text-zinc-400">
                     <Bot className="w-10 h-10 mx-auto mb-4 opacity-20" />
                     <p className="text-xs italic">Nenalezeno.</p>
                   </div>
                ) : (
                  <div className="text-center py-20 text-zinc-300">
                    <Search className="w-10 h-10 mx-auto mb-4 opacity-10" />
                    <p className="text-xs font-medium">Zadejte co hledáte.</p>
                  </div>
                )}
              </div>
            )}
          </main>

          <nav className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto border-t transition-all duration-300 px-4 py-2 pb-6 flex justify-around items-center z-40 no-print ${isEditingUI || isOrganizing ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'} bg-white/95 border-zinc-100 backdrop-blur-md shadow-[0_-10px_30px_-5px_rgba(0,0,0,0.05)]`}>
            <button onClick={() => { setView('home'); setIsAssistantMode(false); setIsOrganizing(false); setSelectedBoxId(null); }} className={`relative flex flex-col items-center gap-1 p-2 ${view === 'home' || view === 'cabinet-detail' || view === 'shelf-detail' || view === 'box-detail' ? 'text-indigo-600' : 'text-zinc-400'}`}>
              <Package className={`w-5 h-5 transition-transform ${view === 'home' ? 'scale-110' : ''}`} />
              <span className="text-[8px] font-bold uppercase tracking-wider">SKŘÍNĚ</span>
            </button>

            <button onClick={() => { setView('tools'); setIsAssistantMode(false); setIsOrganizing(false); setSelectedBoxId(null); }} className={`relative flex flex-col items-center gap-1 p-2.5 -mt-6 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-100 transition-transform active:scale-95 ${view === 'tools' || view === 'advisor' || view === 'stickers' ? 'scale-105 ring-4 ring-indigo-50' : ''}`}>
              <LayoutGrid className="w-6 h-6" />
            </button>

            <button onClick={() => { setView('search-results'); setSearchResults([]); setAssistantResponse(null); setIsOrganizing(false); setSelectedBoxId(null); }} className={`relative flex flex-col items-center gap-1 p-2 ${view === 'search-results' ? 'text-indigo-600' : 'text-zinc-400'}`}>
              <Search className={`w-5 h-5 transition-transform ${view === 'search-results' ? 'scale-110' : ''}`} />
              <span className="text-[8px] font-bold uppercase tracking-wider">HLEDAT</span>
            </button>
          </nav>
        </>
      )}
      {isCapturing && <Camera onCapture={handleCapture} onClose={() => setIsCapturing(false)} />}
    </div>
  );
};

export default App;
