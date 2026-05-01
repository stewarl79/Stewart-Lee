import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Send, 
  History, 
  Trash2, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { db } from '../../firebase';
import { format, startOfDay, endOfDay } from 'date-fns';

interface BrainDumpProps {
  user: {
    uid: string;
    email: string;
    displayName: string;
  };
}

interface DumpEntry {
  id: string;
  text: string;
  createdAt: Timestamp;
}

export const BrainDump: React.FC<BrainDumpProps> = ({ user }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<DumpEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setText(prev => prev + (prev.length > 0 ? ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Fetch today's history
  useEffect(() => {
    const today = startOfDay(new Date());
    const tonight = endOfDay(new Date());
    
    const q = query(
      collection(db, 'brain_dumps'),
      where('userId', '==', user.uid),
      where('createdAt', '>=', Timestamp.fromDate(today)),
      where('createdAt', '<=', Timestamp.fromDate(tonight)),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DumpEntry[];
      setHistory(entries);
    });

    return unsubscribe;
  }, [user.uid]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleSave = async () => {
    if (!text.trim()) return;

    setIsSaving(true);
    setStatus(null);

    try {
      await addDoc(collection(db, 'brain_dumps'), {
        userId: user.uid,
        userEmail: user.email,
        text: text.trim(),
        isProcessed: false,
        createdAt: serverTimestamp()
      });

      setText('');
      setStatus({ type: 'success', message: 'Successfully saved to the vault!' });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error('Error saving dump:', error);
      setStatus({ type: 'error', message: 'Failed to save. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'brain_dumps', id));
    } catch (error) {
      console.error('Error deleting dump:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative group">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind? Just dump it here..."
          className="w-full h-64 bg-brand-surface border border-slate-700/50 rounded-2xl p-6 text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all resize-none shadow-inner group-hover:border-slate-600/50"
        />
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <button
            onClick={toggleRecording}
            className={cn(
              "p-3 rounded-full transition-all duration-300 shadow-lg",
              isRecording 
                ? "bg-rose-500 text-white animate-pulse" 
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
            )}
            title={isRecording ? "Stop Recording" : "Start Voice-to-Text"}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <button
          onClick={handleSave}
          disabled={!text.trim() || isSaving}
          className={cn(
            "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed",
            "bg-brand-accent hover:bg-brand-accent/90 text-white shadow-brand-accent/20"
          )}
        >
          {isSaving ? (
            <Sparkles className="w-5 h-5 animate-pulse" />
          ) : (
            <>
              <Send className="w-5 h-5" />
              Save Dump
            </>
          )}
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
        >
          <History className="w-4 h-4" />
          {showHistory ? "Hide Today's Dumps" : "View Today's Dumping Grounds"}
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={cn(
              "flex items-center gap-3 p-4 rounded-xl border",
              status.type === 'success' 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            )}
          >
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-medium">{status.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-brand-surface/50 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-brand-accent uppercase tracking-widest px-2 mb-2">Today's Dumping Grounds</h3>
              {history.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {history.map((entry) => (
                    <motion.div
                      layout
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group flex items-start gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-800/50 hover:border-slate-700 transition-all"
                    >
                      <div className="flex-1 space-y-1">
                        <p className="text-sm text-slate-200 leading-relaxed">{entry.text}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {format(entry.createdAt?.toDate() || new Date(), 'h:mm a')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500 italic">The vault is currently empty today.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
