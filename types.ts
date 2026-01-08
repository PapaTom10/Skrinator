
export interface Item {
  id: string;
  name: string;
  category?: string;
  tagIds?: string[];
  boxId?: string; // ID boxu, ve kterém se položka nachází
  color?: string; // Volitelná barva pozadí/zvýraznění položky
}

export interface Box {
  id: string;
  name: string;
}

export interface Shelf {
  id: string;
  name: string;
  items: Item[];
  boxes: Box[]; // Seznam boxů v této polici
  visualPosition: {
    top: number; // percentage
    left: number; // percentage
    width: number; // percentage
    height: number; // percentage
  };
  photoUrl?: string;
  color: string;
  tagIds?: string[];
}

export interface Cabinet {
  id: string;
  name: string;
  roomId?: string;
  photoUrl: string;
  shelves: Shelf[];
  tagIds?: string[];
}

export interface Room {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export type AIAnalysisMode = 'general' | 'detailed';

export type ViewState = 'home' | 'camera' | 'cabinet-detail' | 'shelf-detail' | 'box-detail' | 'search-results' | 'edit-photo' | 'settings' | 'tools' | 'advisor' | 'stickers';
