import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Save, RefreshCw } from 'lucide-react';
import { db, auth } from '../../firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

interface ABCWorksheetProps {
  initialData?: any;
  onSave?: (data: any) => void;
  isPrivate?: boolean;
  clientUid?: string;
  coachUid?: string;
}

export const ABCWorksheet: React.FC<ABCWorksheetProps> = ({ 
  initialData, 
  onSave, 
  isPrivate = false,
  clientUid,
  coachUid
}) => {
  const [formData, setFormData] = useState({
    situation: '',
    thoughts: '',
    consequences: '',
    realisticReflection: '',
    futureReflection: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (initialData) {
      setFormData({
        situation: initialData.situation || '',
        thoughts: initialData.thoughts || '',
        consequences: initialData.consequences || '',
        realisticReflection: initialData.realisticReflection || '',
        futureReflection: initialData.futureReflection || ''
      });
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!formData.situation || !formData.thoughts || !formData.consequences) return;
    setIsSaving(true);
    setSaveStatus('idle');

    if (isPrivate) {
      // For the tools site, we just trigger the onSave or store in localStorage if needed
      // But for now, we'll just simulate a successful save
      setTimeout(() => {
        setIsSaving(false);
        setSaveStatus('success');
        if (onSave) onSave(formData);
      }, 800);
      return;
    }

    // Advanced syncing logic (Coaching Portal)
    const data = {
      clientUid,
      coachUid,
      ...formData,
      updatedAt: serverTimestamp()
    };

    try {
      if (initialData?.id) {
        await updateDoc(doc(db, 'abc_reframing', initialData.id), data);
      } else {
        await addDoc(collection(db, 'abc_reframing'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setSaveStatus('success');
      if (onSave) onSave(data);
    } catch (error) {
      console.error("Save error:", error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent">
          <Activity className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-2xl font-bold text-white tracking-tight">ABC Cognitive Worksheet</h3>
          <p className="text-slate-400 text-sm">Identify and externalize stuck points</p>
        </div>
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column A */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest px-1">
              <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-white text-[10px]">A</span>
              Activating Event
            </label>
            <p className="text-[10px] text-slate-500 font-medium px-1 italic">"Something happens"</p>
            <textarea 
              value={formData.situation}
              onChange={e => setFormData({...formData, situation: e.target.value})}
              placeholder="Describe the facts of the event..."
              aria-label="Describe the activating event facts"
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm focus:ring-2 focus:ring-brand-accent transition-all min-h-[150px] resize-none outline-none"
            />
          </div>

          {/* Column B */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest px-1">
              <span className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 text-[10px]">B</span>
              Belief / Stuck Point
            </label>
            <p className="text-[10px] text-amber-500/60 font-medium px-1 italic">"I tell myself something"</p>
            <textarea 
              value={formData.thoughts}
              onChange={e => setFormData({...formData, thoughts: e.target.value})}
              placeholder="What did you tell yourself about the situation?"
              aria-label="Your belief or stuck point"
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm focus:ring-2 focus:ring-amber-500 transition-all min-h-[150px] resize-none outline-none"
            />
          </div>

          {/* Column C */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-black text-indigo-500 uppercase tracking-widest px-1">
              <span className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 text-[10px]">C</span>
              Consequence
            </label>
            <p className="text-[10px] text-indigo-500/60 font-medium px-1 italic">"I feel something"</p>
            <textarea 
              value={formData.consequences}
              onChange={e => setFormData({...formData, consequences: e.target.value})}
              placeholder="How did you feel or react?"
              aria-label="Consequences of the belief"
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-all min-h-[150px] resize-none outline-none"
            />
          </div>
        </div>

        <div className="space-y-6 pt-6 border-t border-slate-800">
          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest px-1">
              Are my thoughts above in column B realistic or helpful?
            </label>
            <textarea 
              value={formData.realisticReflection}
              onChange={e => setFormData({...formData, realisticReflection: e.target.value})}
              placeholder="Evaluate your beliefs..."
              className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm focus:ring-2 focus:ring-brand-accent transition-all min-h-[80px]"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest px-1">
              What can I tell myself on such occasions in the future?
            </label>
            <textarea 
              value={formData.futureReflection}
              onChange={e => setFormData({...formData, futureReflection: e.target.value})}
              placeholder="Write a more balanced perspective for next time..."
              className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 text-white text-sm focus:ring-2 focus:ring-brand-accent transition-all min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <button 
            onClick={handleSave}
            disabled={isSaving || !formData.situation || !formData.thoughts || !formData.consequences}
            className="w-full py-4 bg-brand-accent text-white rounded-2xl font-bold hover:bg-brand-secondary transition-all shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saveStatus === 'success' ? 'Saved Successfully!' : 'Save Entry'}
          </button>
          
          {isPrivate && (
            <p className="text-center text-[10px] text-slate-500 font-medium uppercase tracking-widest">
              Private Work: Data is only stored in your current browser session.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
