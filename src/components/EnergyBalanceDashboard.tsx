import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  Battery, 
  TrendingUp, 
  Download, 
  Plus, 
  ArrowRight,
  AlertTriangle,
  History,
  LayoutDashboard,
  Save,
  CheckCircle2,
  Package,
  Users,
  Brain,
  Dumbbell,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit, 
  serverTimestamp, 
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  ComposedChart
} from 'recharts';

interface EnergyBalanceDashboardProps {
  user: any;
}

interface EnergyTask {
  id: string;
  name: string;
  category: 'Sensory' | 'Social' | 'Cognitive' | 'Physical' | 'Uncategorized';
  impactType: 'Drain' | 'Deposit';
}

interface EnergyLog {
  id: string;
  taskId: string;
  taskName: string;
  rating: number;
  category: string;
  impactType: string;
  createdAt: any;
}

interface ReadinessLog {
  id: string;
  date: string;
  score: number;
  createdAt: any;
}

export default function EnergyBalanceDashboard({ user }: EnergyBalanceDashboardProps) {
  const [readiness, setReadiness] = useState<number>(5);
  const [todayReadiness, setTodayReadiness] = useState<ReadinessLog | null>(null);
  const [tasks, setTasks] = useState<EnergyTask[]>([]);
  const [logs, setLogs] = useState<EnergyLog[]>([]);
  const [readinessHistory, setReadinessHistory] = useState<ReadinessLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<EnergyTask['category']>('Uncategorized');
  const [newTaskImpact, setNewTaskImpact] = useState<EnergyTask['impactType']>('Drain');
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeChartView, setActiveChartView] = useState<'category' | 'task' | 'trend'>('category');

  useEffect(() => {
    if (!user) return;

    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

    // Fetch readiness
    const readinessQuery = query(
      collection(db, 'energy_readiness'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubReadiness = onSnapshot(readinessQuery, (snapshot) => {
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReadinessLog));
      setReadinessHistory(history);
      
      const today = history.find(r => r.date === todayStr);
      if (today) setTodayReadiness(today);
    });

    // Fetch tasks
    const tasksQuery = query(
      collection(db, 'energy_tasks'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EnergyTask)));
      setLoading(false);
    });

    // Fetch logs
    const logsQuery = query(
      collection(db, 'energy_logs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EnergyLog)));
    });

    return () => {
      unsubReadiness();
      unsubTasks();
      unsubLogs();
    };
  }, [user]);

  const handleSaveReadiness = async () => {
    if (!user) return;
    setIsSaving(true);
    const todayStr = new Date().toLocaleDateString('en-CA');
    try {
      await addDoc(collection(db, 'energy_readiness'), {
        userId: user.uid,
        userEmail: user.email,
        date: todayStr,
        score: readiness,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error saving readiness:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLog = async () => {
    if (!user || selectedRating === null) return;
    if (selectedTaskId === 'new' && !newTaskName) return;
    if (selectedTaskId === '') return;

    setIsSaving(true);
    try {
      let taskId = selectedTaskId;
      let taskName = '';
      let category = '';
      let impactType = '';

      if (selectedTaskId === 'new') {
        const taskDoc = await addDoc(collection(db, 'energy_tasks'), {
          userId: user.uid,
          userEmail: user.email,
          name: newTaskName,
          category: newTaskCategory,
          impactType: newTaskImpact,
          createdAt: serverTimestamp()
        });
        taskId = taskDoc.id;
        taskName = newTaskName;
        category = newTaskCategory;
        impactType = newTaskImpact;
      } else {
        const task = tasks.find(t => t.id === selectedTaskId);
        if (task) {
          taskName = task.name;
          category = task.category;
          impactType = task.impactType;
        }
      }

      await addDoc(collection(db, 'energy_logs'), {
        userId: user.uid,
        taskId,
        taskName,
        rating: selectedRating,
        category,
        impactType,
        createdAt: serverTimestamp()
      });

      // Reset form
      setSelectedTaskId('');
      setIsCreatingTask(false);
      setNewTaskName('');
      setSelectedRating(null);
    } catch (err) {
      console.error('Error saving log:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const getSortedTasks = useMemo(() => {
    let sorted = [...tasks];
    if (todayReadiness && todayReadiness.score <= 4) {
      sorted.sort((a, b) => {
        if (a.impactType === 'Deposit' && b.impactType !== 'Deposit') return -1;
        if (a.impactType !== 'Deposit' && b.impactType === 'Deposit') return 1;
        return 0;
      });
    }
    return sorted;
  }, [tasks, todayReadiness]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const currentImpactType = isCreatingTask ? newTaskImpact : selectedTask?.impactType || 'Drain';

  const chartData = useMemo(() => {
    // 1. Process Category View
    const categoryStats: Record<string, { drainSum: number; drainCount: number; depSum: number; depCount: number }> = {};
    const taskStats: Record<string, { drainSum: number; drainCount: number; depSum: number; depCount: number }> = {};
    const trendMap: Record<string, { date: string; readiness: number | null; drain: number; deposit: number }> = {};

    // Initialize trend for last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA');
      trendMap[dateStr] = { 
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 
        readiness: null, 
        drain: 0, 
        deposit: 0 
      };
    }

    // Fill trend readiness
    readinessHistory.forEach(r => {
      if (trendMap[r.date]) trendMap[r.date].readiness = r.score;
    });

    // Aggregate logs
    logs.forEach(log => {
      const cat = log.category || 'Uncategorized';
      const name = log.taskName;
      const type = log.impactType;
      const rating = log.rating;
      
      const dateStr = log.createdAt instanceof Timestamp 
        ? log.createdAt.toDate().toLocaleDateString('en-CA')
        : new Date().toLocaleDateString('en-CA');

      // Category
      if (!categoryStats[cat]) categoryStats[cat] = { drainSum: 0, drainCount: 0, depSum: 0, depCount: 0 };
      if (type === 'Deposit') {
        categoryStats[cat].depSum += rating;
        categoryStats[cat].depCount += 1;
      } else {
        categoryStats[cat].drainSum += rating;
        categoryStats[cat].drainCount += 1;
      }

      // Task
      if (!taskStats[name]) taskStats[name] = { drainSum: 0, drainCount: 0, depSum: 0, depCount: 0 };
      if (type === 'Deposit') {
        taskStats[name].depSum += rating;
        taskStats[name].depCount += 1;
      } else {
        taskStats[name].drainSum += rating;
        taskStats[name].drainCount += 1;
      }

      // Trend
      if (trendMap[dateStr]) {
        if (type === 'Deposit') trendMap[dateStr].deposit += rating;
        else trendMap[dateStr].drain += rating;
      }
    });

    const categoryView = Object.entries(categoryStats).map(([name, stats]) => ({
      name,
      drain: stats.drainCount > 0 ? Number((stats.drainSum / stats.drainCount).toFixed(1)) : 0,
      deposit: stats.depCount > 0 ? Number((stats.depSum / stats.depCount).toFixed(1)) : 0
    }));

    const taskView = Object.entries(taskStats).map(([name, stats]) => ({
      name,
      drain: stats.drainCount > 0 ? Number((stats.drainSum / stats.drainCount).toFixed(1)) : 0,
      deposit: stats.depCount > 0 ? Number((stats.depSum / stats.depCount).toFixed(1)) : 0
    })).sort((a,b) => (b.drain + b.deposit) - (a.drain + a.deposit)).slice(0, 10);

    const trendView = Object.values(trendMap);

    return { categoryView, taskView, trendView };
  }, [logs, readinessHistory]);

  const handleExport = () => {
    const today = new Date().toLocaleDateString();
    let text = "========================================\n";
    text += `MR. LEE TEACHES - ENERGY SUMMARY\nDate: ${today}\n`;
    text += "========================================\n\n";

    if (todayReadiness) {
      text += `Today's Readiness Score: ${todayReadiness.score}/10\n\n`;
    }

    const { taskView } = chartData;
    const topDrains = taskView.filter(t => t.drain > 0).sort((a,b) => b.drain - a.drain).slice(0, 3);
    const topDeposits = taskView.filter(t => t.deposit > 0).sort((a,b) => b.deposit - a.deposit).slice(0, 3);

    text += "--- Top Historical Drains ---\n";
    topDrains.forEach(d => text += `> ${d.name} (Avg Drain: ${d.drain})\n`);
    if (topDrains.length === 0) text += "No drain data logged yet.\n";

    text += "\n--- Top Restorative Activities ---\n";
    topDeposits.forEach(d => text += `> ${d.name} (Avg Restored: ${d.deposit})\n`);
    if (topDeposits.length === 0) text += "No restorative data logged yet.\n";

    text += "\n\n(Bring this summary to your next coaching session!)";

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Energy_Summary_${today.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case 'Sensory': return <Brain className="w-4 h-4" />;
      case 'Social': return <Users className="w-4 h-4" />;
      case 'Cognitive': return <LayoutDashboard className="w-4 h-4" />;
      case 'Physical': return <Dumbbell className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-brand-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <header className="bg-brand-surface p-4 rounded-xl shadow-xl border border-slate-800/50 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Energy Balance Dashboard</h1>
          <p className="text-xs text-slate-500">Mr. Lee Teaches Coaching</p>
        </div>
        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center overflow-hidden border border-slate-700">
          <img 
            src="https://mrleeteaches.com/wp-content/uploads/2025/08/Designer-2.webp" 
            alt="Mr. Lee Teaches Coaching Logo" 
            className="w-full h-full object-cover" 
          />
        </div>
      </header>

      {/* Morning Readiness */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-brand-surface p-6 rounded-2xl shadow-xl border border-slate-800/50"
      >
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white tracking-tight mb-1">Morning Readiness</h2>
          <p className="text-slate-400 text-sm">How much capacity do you have today?</p>
        </div>

        {!todayReadiness ? (
          <div className="space-y-6 text-center">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-left select-none">
                  <span className="block text-slate-400 text-xs font-medium">Empty</span>
                  <span className="block text-slate-500 text-xs font-bold">(1)</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={readiness} 
                  onChange={e => setReadiness(parseInt(e.target.value))}
                  aria-label="Daily capacity readiness from 1 (empty) to 10 (full)"
                  className="flex-1 accent-[#10b981] h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer focus:ring-2 focus:ring-[#10b981] outline-none transition-all"
                />
                <div className="text-right select-none">
                  <span className="block text-slate-400 text-xs font-medium">Full</span>
                  <span className="block text-slate-500 text-xs font-bold">(10)</span>
                </div>
              </div>
            </div>
            <div className="text-5xl font-bold text-[#10b981] tabular-nums">{readiness}</div>
            <button 
              onClick={handleSaveReadiness}
              disabled={isSaving}
              className="w-full py-3 bg-[#2d3748] hover:bg-[#3d4a5d] text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Log Readiness
            </button>
          </div>
        ) : (
          <div className="text-center py-4 space-y-4">
            <p className="text-slate-400 text-sm font-medium">Your Capacity Today</p>
            <div className="text-6xl font-bold text-[#10b981] tabular-nums">{todayReadiness.score}</div>
            <div className="flex items-center justify-center gap-2 text-[#10b981] font-bold text-xs bg-[#10b981]/5 py-2 px-4 rounded-full w-fit mx-auto">
              <CheckCircle2 className="w-4 h-4" />
              Logged for today
            </div>
          </div>
        )}
      </motion.section>

      {/* Log a Task */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-brand-surface p-6 rounded-2xl shadow-xl border border-slate-800/50"
      >
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white tracking-tight mb-1">Log a Task</h2>
          <p className="text-slate-400 text-sm">What did you do?</p>
        </div>

        <div className="space-y-6">
          <div>
            <select 
              value={selectedTaskId}
              onChange={e => {
                setSelectedTaskId(e.target.value);
                setIsCreatingTask(e.target.value === 'new');
              }}
              aria-label="Select or Create an activity"
              className="w-full bg-[#1e293b] border border-[#2d3748] rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#10b981] outline-none transition-all appearance-none text-sm cursor-pointer"
            >
              <option value="">Select or Create a task...</option>
              <option value="new" className="text-brand-accent font-bold">+ Create New Activity</option>
              {getSortedTasks.map(task => (
                <option key={task.id} value={task.id}>
                  {task.name} {task.impactType === 'Deposit' ? '(Deposit)' : ''}
                </option>
              ))}
            </select>
          </div>

          <AnimatePresence mode="wait">
            {todayReadiness && todayReadiness.score <= 4 && selectedTask?.impactType === 'Drain' && logs.filter(l => l.taskId === selectedTaskId).length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-tight">High Energy Demand</p>
                  <p className="text-xs text-slate-300 mt-1">Your readiness is low. This activity is typically a drain for you.</p>
                </div>
              </motion.div>
            )}

            {isCreatingTask && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800/50 space-y-4">
                  <input 
                    type="text"
                    value={newTaskName}
                    onChange={e => setNewTaskName(e.target.value)}
                    placeholder="Task Name"
                    aria-label="New task name"
                    className="w-full bg-[#1e293b] border border-[#2d3748] rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#10b981] outline-none transition-all"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select 
                      value={newTaskCategory}
                      onChange={e => setNewTaskCategory(e.target.value as any)}
                      aria-label="New task category"
                      className="bg-[#1e293b] border border-[#2d3748] rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#10b981] outline-none transition-all cursor-pointer"
                    >
                      <option value="Sensory">Sensory</option>
                      <option value="Social">Social</option>
                      <option value="Cognitive">Cognitive</option>
                      <option value="Physical">Physical</option>
                      <option value="Uncategorized">Uncategorized</option>
                    </select>
                    <select 
                      value={newTaskImpact}
                      onChange={e => setNewTaskImpact(e.target.value as any)}
                      aria-label="New task impact type"
                      className="bg-[#1e293b] border border-[#2d3748] rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-[#10b981] outline-none transition-all cursor-pointer"
                    >
                      <option value="Drain">Drain</option>
                      <option value="Deposit">Deposit</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <p className="text-slate-400 text-xs font-medium mb-3">How draining was it?</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map(rating => (
                <button
                  key={rating}
                  onClick={() => setSelectedRating(rating)}
                  aria-label={`Rating ${rating} out of 5`}
                  aria-pressed={selectedRating === rating}
                  className={`h-11 rounded-lg font-bold transition-all outline-none focus:ring-2 focus:ring-[#10b981] ${
                    selectedRating === rating 
                      ? 'bg-[#3b475a] text-white shadow-lg' 
                      : 'bg-[#2d3748] text-slate-400 hover:bg-[#3b475a]'
                  }`}
                >
                  {rating}
                </button>
              ))}
            </div>
            <div className="flex justify-between mt-2 px-1">
              <span className="text-[10px] font-medium text-slate-500">Easy</span>
              <span className="text-[10px] font-medium text-slate-500">Draining</span>
            </div>
          </div>

          <button 
            onClick={handleSaveLog}
            disabled={isSaving || !selectedRating || (selectedTaskId === 'new' && !newTaskName) || (selectedTaskId === '')}
            className="w-full py-4 bg-[#10b981] hover:bg-[#0da371] text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : null}
            Save Task Entry
          </button>
        </div>
      </motion.section>

      {/* Analytics Section */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-brand-surface p-6 rounded-3xl shadow-xl border border-slate-800/50"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="mb-2 md:mb-0">
            <h2 className="text-lg font-bold text-white tracking-tight">Energy Profile</h2>
          </div>

          <div className="flex bg-[#1e293b] p-1 rounded-lg border border-slate-700/50" role="tablist">
            {[
              { id: 'category', label: 'Categories' },
              { id: 'task', label: 'Tasks' },
              { id: 'trend', label: 'Burnout Trends' }
            ].map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeChartView === tab.id}
                aria-controls={`chart-panel-${tab.id}`}
                onClick={() => setActiveChartView(tab.id as any)}
                className={`px-4 py-1.5 text-xs font-bold rounded flex-1 transition-all outline-none focus:ring-2 focus:ring-[#10b981] ${
                  activeChartView === tab.id 
                    ? 'bg-[#3b475a] text-white shadow-lg' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {activeChartView === 'trend' ? (
              <ComposedChart data={chartData.trendView}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="readiness" domain={[0, 10]} hide />
                <YAxis yAxisId="logs" hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend iconType="rect" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                <Bar yAxisId="logs" dataKey="drain" name="Avg Drain (1-5)" fill="#f6ad55" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="logs" dataKey="deposit" name="Avg Deposit (1-5)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Line yAxisId="readiness" type="monotone" dataKey="readiness" name="Readiness" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} />
              </ComposedChart>
            ) : (
              <BarChart data={activeChartView === 'category' ? chartData.categoryView : chartData.taskView}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 5]} stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend iconType="rect" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Bar dataKey="drain" name="Avg Drain (1-5)" fill="#f6ad55" radius={[2, 2, 0, 0]} />
                <Bar dataKey="deposit" name="Avg Deposit (1-5)" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </motion.section>

      <div className="flex justify-center">
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 text-slate-500 hover:text-white text-sm font-bold transition-all"
        >
          <Download className="w-4 h-4" />
          Export Session Summary
        </button>
      </div>
    </div>
  );
}
