import { useEffect, useState, useRef } from 'react';
import { Play, Pause, RefreshCw } from 'lucide-react';

interface AnalystNoteProps {
  symbol: string;
  mode?: 'live' | 'simulation';
  simulationDate?: string;
  triggerFetch?: number;
  simulationTime?: string;
  intradayQuote?: any;
}

interface NoteData {
  id: string;
  timestamp: Date;
  narrative: string;
  isSimulation?: boolean;
  simDate?: string;
}

export default function AnalystNote({ symbol, mode = 'live', simulationDate, triggerFetch = 0, simulationTime, intradayQuote }: AnalystNoteProps) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const hasInitiallyFetched = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset notes when symbol or simulation date changes
  useEffect(() => {
    setNotes([]);
    hasInitiallyFetched.current = false;
  }, [symbol, simulationDate]);

  // Scroll to the newest note when the list updates
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, [notes]);

  const fetchNote = async () => {
    setLoading(true);
    try {
      // Build URL: for simulation, pass the date as a query param
      let url = `${import.meta.env.VITE_API_URL}/api/analysis/${symbol}?t=${Date.now()}`;
      if (mode === 'simulation' && simulationDate) {
        url += `&date=${simulationDate}`;
      }

      const bodyPayload: any = {};
      if (mode === 'simulation' && simulationDate) bodyPayload.date = simulationDate;
      if (intradayQuote) bodyPayload.intradayQuote = intradayQuote;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(bodyPayload).length > 0 ? JSON.stringify(bodyPayload) : undefined,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error("Failed to fetch analysis");
      const data = await res.json();
      
      setNotes(prev => {
        // Don't add a new card if the narrative hasn't changed
        if (prev.length > 0 && prev[0].narrative === data.narrative) {
          return prev;
        }
        
        const newNote: NoteData = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          narrative: data.narrative,
          isSimulation: mode === 'simulation',
          simDate: simulationTime ? new Date(simulationTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : simulationDate,
        };
        return [newNote, ...prev];
      });
    } catch (e) {
      console.error("Analyst note unavailable", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount or when key props change
    if (!hasInitiallyFetched.current) {
      hasInitiallyFetched.current = true;
      fetchNote();
    }
  }, [symbol, mode, simulationDate]);

  useEffect(() => {
    if (triggerFetch > 0) {
      fetchNote();
    }
  }, [triggerFetch]);

  const isSimMode = mode === 'simulation';

  return (
    <div className={`bg-panel border rounded-xl p-5 flex flex-col min-h-[250px] ${
      isSimMode ? 'border-brass/40 bg-brass/5' : 'border-brass/30 bg-brass/5'
    }`}>
      <div className="flex justify-between items-center mb-4">
        <div className="font-display font-extrabold text-xs tracking-[1px] text-brass">
          ANALYST NOTE
          {isSimMode && simulationDate && (
            <span className="ml-2 text-[10px] font-mono font-normal text-brass/70 border border-brass/30 px-1.5 py-0.5 rounded bg-brass/10">
              SIM: {simulationDate}
            </span>
          )}
          <span className="text-ink-muted/50 ml-2 font-mono font-normal">History</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchNote} 
            disabled={loading}
            className="flex items-center gap-1.5 font-mono text-[10px] bg-brass/20 text-brass px-2.5 py-1 rounded hover:bg-brass/30 transition-colors disabled:opacity-50 border border-brass/30"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
      
      <div ref={scrollContainerRef} className="flex gap-4 overflow-x-auto pb-2 snap-x flex-1 items-stretch" style={{ overflowAnchor: 'none' }}>
        {loading && (
          <div className="min-w-[320px] w-[320px] shrink-0 bg-panel-raised/50 border border-line rounded-lg p-4 snap-start flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div className="h-2 bg-line rounded w-16 animate-pulse"></div>
              <div className="h-2 bg-brass/20 rounded w-12 animate-pulse"></div>
            </div>
            <div className="h-3 bg-line rounded w-full animate-pulse mt-2"></div>
            <div className="h-3 bg-line rounded w-[90%] animate-pulse"></div>
            <div className="h-3 bg-line rounded w-[95%] animate-pulse"></div>
            <div className="h-3 bg-line rounded w-[80%] animate-pulse"></div>
            <div className="h-3 bg-line rounded w-[60%] animate-pulse"></div>
          </div>
        )}
        
        {notes.length === 0 && !loading ? (
          <div className="flex-1 flex items-center justify-center font-body text-[13px] text-ink-muted/50 italic py-6">
            No notes generated yet.{isSimMode ? ' Click Generate to analyse this simulation date.' : ''}
          </div>
        ) : (
          notes.map((note, idx) => (
            <div 
              key={note.id} 
              className={`min-w-[320px] w-[320px] shrink-0 bg-panel border rounded-lg p-4 snap-start flex flex-col ${
                idx === 0 && !loading ? 'border-brass/40 shadow-[0_0_15px_rgba(201,138,44,0.1)]' : 'border-line opacity-75'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono text-[9px] text-brass px-1.5 py-0.5 rounded bg-brass/10 border border-brass/20">
                  {idx === 0 && !loading ? 'LATEST' : 'HISTORY'}
                </span>
                <span className="text-ink-muted text-[10px] font-mono">
                  {note.isSimulation && note.simDate ? note.simDate : note.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="font-body text-[13px] leading-relaxed text-ink-muted overflow-y-auto pr-1 custom-scrollbar flex-1">
                {note.narrative}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-brass/20 font-body text-[10px] text-ink-muted/70 italic shrink-0">
        Generated by GPT-4o (via Azure) from computed signal data — not an independent prediction.
      </div>
    </div>
  );
}
