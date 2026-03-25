import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  FileText, 
  Bell, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  ChevronRight, 
  Mail, 
  Upload, 
  Download, 
  Trash2, 
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Menu,
  X,
  UserPlus
} from 'lucide-react';
import logo from './assets/logo.png';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isAfter, isBefore, addHours, startOfDay, endOfDay, parseISO } from 'date-fns';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

// --- Types ---
type Role = 'coach' | 'client';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phone?: string;
  role: Role;
  createdAt: any;
  mustChangePassword?: boolean;
  reminderTemplate?: string;
}

interface Appointment {
  id: string;
  title: string;
  description?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  clientEmail: string;
  clientUid?: string;
  isExternal: boolean;
  status: 'scheduled' | 'completed' | 'cancelled';
  remindersSent: string[];
  notes?: string;
  meetLink?: string;
}

interface SharedDocument {
  id: string;
  name: string;
  url: string;
  ownerUid: string;
  sharedWithEmail: string;
  sharedWithUid?: string;
  createdAt: Timestamp;
}

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any; 
  label: string; 
  active: boolean; 
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-white" : "group-hover:text-emerald-400")} />
    <span className="font-medium">{label}</span>
  </button>
);

const Card = ({ children, title, subtitle, action, className }: any) => (
  <div className={cn("bg-slate-900 border border-slate-800 rounded-2xl p-6 overflow-hidden", className)}>
    <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' }) => {
  const variants = {
    default: "bg-slate-800 text-slate-300",
    success: "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50",
    warning: "bg-amber-900/30 text-amber-400 border border-amber-800/50",
    error: "bg-rose-900/30 text-rose-400 border border-rose-800/50"
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  
  // Auth UI states
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // Data states
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        unsubProfile = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            setProfile(profileData);
            if (profileData.mustChangePassword) {
              setShowPasswordChange(true);
            }
          } else {
            // New user - default to client unless it's the coach email
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email!,
              displayName: u.displayName || 'User',
              role: u.email === 'msustewart@gmail.com' ? 'coach' : 'client',
              createdAt: serverTimestamp()
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, 'users');
          setLoading(false);
        });
      } else {
        setProfile(null);
        if (unsubProfile) unsubProfile();
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Real-time listeners
  useEffect(() => {
    if (!user || !profile) return;

    const apptsQuery = profile.role === 'coach' 
      ? query(collection(db, 'appointments'), orderBy('startTime', 'asc'))
      : query(collection(db, 'appointments'), where('clientEmail', '==', user.email), orderBy('startTime', 'asc'));

    const unsubAppts = onSnapshot(apptsQuery, (snapshot) => {
      const apptList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
      console.log(`Fetched ${apptList.length} appointments for ${profile.role}`);
      setAppointments(apptList);
    }, (err) => {
      console.error("Appointments listener error:", err);
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    });

    const docsQuery = profile.role === 'coach'
      ? query(collection(db, 'documents'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'documents'), where('sharedWithEmail', '==', user.email), orderBy('createdAt', 'desc'));

    const unsubDocs = onSnapshot(docsQuery, (snapshot) => {
      setDocuments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SharedDocument)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'documents'));

    if (profile.role === 'coach') {
      // Listen to ALL users who are clients
      console.log("Coach detected, starting clients listener...");
      const unsubClients = onSnapshot(query(collection(db, 'users'), where('role', '==', 'client')), (snapshot) => {
        const clientList = snapshot.docs.map(d => d.data() as UserProfile);
        console.log(`Fetched ${clientList.length} clients from database:`, firebaseConfig.firestoreDatabaseId);
        setClients(clientList);
      }, (err) => {
        console.error("Clients listener error:", err);
        handleFirestoreError(err, OperationType.LIST, 'users');
      });
      return () => { unsubAppts(); unsubDocs(); unsubClients(); };
    }

    return () => { unsubAppts(); unsubDocs(); };
  }, [user, profile]);

  const handleGoogleLogin = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      console.error('Google Login Error:', error);
      setAuthError(error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    
    try {
      if (authMode === 'signup') {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName });
        // Profile creation is handled by onAuthStateChanged useEffect
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setAuthMessage('Password reset email sent! Check your inbox.');
      }
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setShowPasswordChange(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('Password must be at least 6 characters');
      return;
    }

    setPasswordChangeLoading(true);
    setPasswordChangeError('');
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          mustChangePassword: false
        });
        setShowPasswordChange(false);
        setProfile(prev => prev ? { ...prev, mustChangePassword: false } : null);
        alert('Password changed successfully!');
      }
    } catch (error: any) {
      setPasswordChangeError(error.message);
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 mb-6">
              <img 
                src={logo} 
                alt="MrLeeTeaches Logo" 
                className="w-full h-full object-contain rounded-2xl"
                onError={(e) => {
                  e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
                }}
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">MrLeeTeaches</h1>
            <p className="text-emerald-500 font-medium text-sm mb-4">Neurodiversity Coaching</p>
            <p className="text-slate-400 mb-8">
              {authMode === 'login' && 'Welcome back! Please sign in to your account.'}
              {authMode === 'signup' && 'Join the coaching portal to get started.'}
              {authMode === 'forgot' && 'Enter your email to reset your password.'}
            </p>
            
            {authError && (
              <div className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm p-3 rounded-xl mb-6">
                {authError}
              </div>
            )}

            {authMessage && (
              <div className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-3 rounded-xl mb-6">
                {authMessage}
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="w-full space-y-4 mb-6">
              {authMode === 'signup' && (
                <input
                  type="text"
                  placeholder="Full Name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              )}
              <input
                type="email"
                placeholder="Email Address"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {authMode !== 'forgot' && (
                <input
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              )}
              <button
                type="submit"
                className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
              >
                {authMode === 'login' && 'Sign In'}
                {authMode === 'signup' && 'Create Account'}
                {authMode === 'forgot' && 'Send Reset Link'}
              </button>
            </form>

            {authMode === 'login' && (
              <>
                <div className="w-full flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-xs text-slate-500 uppercase font-bold">Or</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 rounded-xl hover:bg-slate-100 transition-all duration-200 shadow-lg shadow-white/5"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Continue with Google
                </button>

                {/* Debug Button for Auth Troubleshooting */}
                <button
                  onClick={() => {
                    import('../firebase-applet-config.json').then(config => {
                      alert(`Current Hostname: ${window.location.hostname}\nFirebase Auth Domain: ${config.authDomain}\n\nPlease ensure ${window.location.hostname} is added to "Authorized Domains" in Firebase Console.`);
                    });
                  }}
                  className="mt-4 w-full text-[10px] text-slate-600 hover:text-slate-400 transition-colors uppercase tracking-widest font-bold"
                >
                  Troubleshoot Auth Domains
                </button>
              </>
            )}

            <div className="mt-8 flex flex-col gap-2">
              {authMode === 'login' ? (
                <>
                  <button onClick={() => setAuthMode('signup')} className="text-sm text-emerald-500 hover:underline">
                    Don't have an account? Sign up
                  </button>
                  <button onClick={() => setAuthMode('forgot')} className="text-sm text-slate-500 hover:underline">
                    Forgot password?
                  </button>
                </>
              ) : (
                <button onClick={() => setAuthMode('login')} className="text-sm text-emerald-500 hover:underline">
                  Back to login
                </button>
              )}
            </div>
            
            <p className="mt-8 text-[10px] text-slate-600 uppercase tracking-widest">
              MrLeeTeaches Coaching Portal
            </p>
            <a 
              href="https://mrleeteaches.com/privacypolicy/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-4 text-[10px] text-slate-500 hover:text-emerald-500 transition-colors"
            >
              Privacy Policy
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView appointments={appointments} clients={clients} documents={documents} profile={profile} setActiveTab={setActiveTab} />;
      case 'calendar': return <CalendarView appointments={appointments} role={profile?.role} />;
      case 'clients': return <ClientsView clients={clients} appointments={appointments} documents={documents} role={profile?.role} />;
      case 'documents': return <DocumentsView documents={documents} role={profile?.role} user={user} />;
      case 'reminders': return <RemindersView appointments={appointments} role={profile?.role} />;
      case 'settings': return <SettingsView profile={profile} role={profile?.role} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-slate-900 border-r border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
              }}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">MrLeeTeaches</h1>
            <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider -mt-1">Neurodiversity Coaching</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Calendar} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          {profile?.role === 'coach' && (
            <SidebarItem icon={Users} label="Clients" active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
          )}
          <SidebarItem icon={FileText} label="Documents" active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} />
          <SidebarItem icon={Bell} label="Reminders" active={activeTab === 'reminders'} onClick={() => setActiveTab('reminders')} />
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 font-bold overflow-hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                user.displayName?.[0] || user.email?.[0].toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.displayName || 'User'}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{profile?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 rounded-xl transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <img 
            src={logo} 
            alt="Logo" 
            className="w-8 h-8 object-contain rounded-lg"
            onError={(e) => {
              e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
            }}
          />
          <div>
            <span className="font-bold text-white block leading-none">MrLeeTeaches</span>
            <span className="text-emerald-500 text-[8px] font-bold uppercase tracking-wider">Neurodiversity Coaching</span>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-400 hover:text-white">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-900 z-50 p-6 lg:hidden"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <img 
                    src={logo} 
                    alt="Logo" 
                    className="w-10 h-10 object-contain rounded-xl"
                    onError={(e) => {
                      e.currentTarget.src = 'https://picsum.photos/seed/mrleeteaches/200';
                    }}
                  />
                  <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">MrLeeTeaches</h1>
                    <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider -mt-1">Neurodiversity Coaching</p>
                  </div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 text-slate-400">
                  <X />
                </button>
              </div>
              <nav className="space-y-2">
                <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
                <SidebarItem icon={Calendar} label="Calendar" active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setSidebarOpen(false); }} />
                {profile?.role === 'coach' && (
                  <SidebarItem icon={Users} label="Clients" active={activeTab === 'clients'} onClick={() => { setActiveTab('clients'); setSidebarOpen(false); }} />
                )}
                <SidebarItem icon={FileText} label="Documents" active={activeTab === 'documents'} onClick={() => { setActiveTab('documents'); setSidebarOpen(false); }} />
                <SidebarItem icon={Bell} label="Reminders" active={activeTab === 'reminders'} onClick={() => { setActiveTab('reminders'); setSidebarOpen(false); }} />
                <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }} />
              </nav>
              <div className="absolute bottom-6 left-6 right-6 pt-6 border-t border-slate-800">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-rose-400 bg-rose-400/5 rounded-xl">
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:p-8 p-4 pt-20 lg:pt-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {showPasswordChange && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
              >
                <h3 className="text-2xl font-bold text-white mb-2">Change Password</h3>
                <p className="text-slate-400 mb-6">Your coach has set a temporary password for you. Please choose a new one to continue.</p>
                
                {passwordChangeError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm p-3 rounded-xl mb-6">
                    {passwordChangeError}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">New Password</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={passwordChangeLoading}
                    className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50"
                  >
                    {passwordChangeLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// --- View Components ---

function DashboardView({ appointments, clients, documents, profile, setActiveTab }: any) {
  const nextAppointment = useMemo(() => {
    return appointments.find(a => isAfter(a.startTime.toDate(), new Date()) && a.status === 'scheduled');
  }, [appointments]);

  const stats = [
    { label: 'Total Clients', value: clients.length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Upcoming Sessions', value: appointments.filter(a => a.status === 'scheduled').length, icon: Calendar, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Shared Docs', value: documents.length, icon: FileText, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">Welcome back, {profile?.displayName?.split(' ')[0] || 'User'}</h2>
        <p className="text-slate-400 mt-1">Here's what's happening with your coaching portal today.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl"
          >
            <div className="flex items-center gap-4">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Next Appointment */}
        <Card 
          title="Next Appointment" 
          subtitle="Your upcoming session details"
          action={
            <button 
              onClick={() => setActiveTab('calendar')}
              className="text-emerald-500 text-sm font-medium hover:underline flex items-center gap-1"
            >
              View Calendar <ChevronRight className="w-4 h-4" />
            </button>
          }
        >
          {nextAppointment ? (
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-xl font-bold text-white">{nextAppointment.title}</h4>
                  <p className="text-slate-400 text-sm mt-1">{nextAppointment.clientEmail}</p>
                </div>
                <Badge variant="success">Scheduled</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="flex items-center gap-3 text-slate-300">
                  <Calendar className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm">{format(nextAppointment.startTime.toDate(), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm">{format(nextAppointment.startTime.toDate(), 'h:mm a')}</span>
                </div>
              </div>
              {nextAppointment.meetLink && (
                <a 
                  href={nextAppointment.meetLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-6 w-full flex items-center justify-center gap-2 bg-emerald-600/10 text-emerald-400 border border-emerald-600/20 py-3 rounded-xl hover:bg-emerald-600/20 transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> Join Google Meet
                </a>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700">
              <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No upcoming sessions scheduled.</p>
            </div>
          )}
        </Card>

        {/* Recent Activity / Quick Actions */}
        <Card 
          title={profile?.role === 'coach' ? "Client Overview" : "Recent Documents"} 
          subtitle={profile?.role === 'coach' ? "Manage your registered clients" : "Latest shared materials"}
          action={
            <button 
              onClick={() => setActiveTab(profile?.role === 'coach' ? 'clients' : 'documents')}
              className="text-emerald-500 text-sm font-medium hover:underline flex items-center gap-1"
            >
              {profile?.role === 'coach' ? 'Manage Clients' : 'View All'} <ChevronRight className="w-4 h-4" />
            </button>
          }
        >
          <div className="space-y-4">
            {profile?.role === 'coach' ? (
              clients.slice(0, 4).map((client: any) => (
                <div key={client.uid} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                      {client.displayName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{client.displayName}</p>
                      <p className="text-xs text-slate-500">{client.email}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              ))
            ) : (
              documents.slice(0, 4).map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-white truncate max-w-[150px]">{doc.name}</p>
                      <p className="text-xs text-slate-500">{format(doc.createdAt.toDate(), 'MMM d')}</p>
                    </div>
                  </div>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-white">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))
            )}
            {((profile?.role === 'coach' && clients.length === 0) || (profile?.role === 'client' && documents.length === 0)) && (
              <p className="text-center py-8 text-slate-600 text-sm italic">Nothing to show yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CalendarView({ appointments, role }: any) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const dayAppointments = useMemo(() => {
    return appointments.filter((a: any) => {
      const date = a.startTime.toDate();
      return date.getDate() === selectedDate.getDate() &&
             date.getMonth() === selectedDate.getMonth() &&
             date.getFullYear() === selectedDate.getFullYear();
    });
  }, [appointments, selectedDate]);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Coaching Calendar</h2>
          <p className="text-slate-400 mt-1">Manage and view your scheduled sessions.</p>
        </div>
        {role === 'coach' && (
          <button 
            onClick={async () => {
              try {
                await fetch('/api/sync-calendar', { method: 'POST' });
                alert('Sync initiated! Refreshing in a moment...');
              } catch (e) {
                console.error(e);
              }
            }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-500 transition-colors"
          >
            <Plus className="w-4 h-4" /> Sync Calendar
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Simple Calendar Picker Placeholder */}
        <Card title="Select Date" className="lg:col-span-1">
          <div className="space-y-4">
            <input 
              type="date" 
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                if (!e.target.value) return;
                const [year, month, day] = e.target.value.split('-').map(Number);
                setSelectedDate(new Date(year, month - 1, day));
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <p className="text-sm text-slate-400 mb-2">Selected Date</p>
              <p className="text-lg font-bold text-white">{format(selectedDate, 'EEEE, MMMM do')}</p>
            </div>
          </div>
        </Card>

        {/* Appointments List for Day */}
        <Card title={`Sessions for ${format(selectedDate, 'MMM d')}`} className="lg:col-span-2">
          <div className="space-y-4">
            {dayAppointments.length > 0 ? (
              dayAppointments.map((appt: any) => (
                <div key={appt.id} className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-2xl p-5 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center justify-center w-16 h-16 bg-slate-900 rounded-xl border border-slate-700">
                        <span className="text-xs font-bold text-emerald-500 uppercase">{format(appt.startTime.toDate(), 'h:mm')}</span>
                        <span className="text-xs text-slate-500">{format(appt.startTime.toDate(), 'a')}</span>
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">{appt.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span className="text-xs text-slate-400">{appt.clientEmail}</span>
                          {appt.isExternal && <Badge variant="warning">External</Badge>}
                          {appt.meetLink && (
                            <a 
                              href={appt.meetLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 ml-2"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="text-[10px] font-bold uppercase">Meet</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={appt.status === 'scheduled' ? 'success' : 'default'}>
                      {appt.status}
                    </Badge>
                  </div>
                  {appt.description && (
                    <p className="text-sm text-slate-500 mt-4 pl-20 border-l-2 border-slate-700 italic">
                      {appt.description}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-20 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                <Clock className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                <p className="text-slate-600">No sessions scheduled for this day.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ClientsView({ clients, appointments, documents, role }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredClients = clients.filter((c: any) => 
    c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, displayName: inviteName, phone: invitePhone })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create client');
      }

      setSuccessMessage(`Client ${inviteName} has been created and an invitation email with a temporary password has been sent to ${inviteEmail}.`);
      setInviteEmail('');
      setInviteName('');
      setInvitePhone('');
      setShowInviteModal(false);
    } catch (err: any) {
      console.error('Invitation error:', err);
      setError(err.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    try {
      const response = await fetch(`/api/admin/delete-client/${clientToDelete.uid}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete client');
      }

      setSuccessMessage('Client deleted successfully.');
      setClientToDelete(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete client');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Client Directory</h2>
          <p className="text-slate-400 mt-1">Manage your registered and external coaching clients.</p>
        </div>
        <button 
          onClick={() => {
            setError(null);
            setShowInviteModal(true);
          }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-500 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Add Client
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input 
          type="text" 
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredClients.map((client: any) => {
          const clientAppts = appointments.filter((a: any) => a.clientEmail === client.email);
          return (
            <motion.div
              key={client.uid}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl group hover:border-emerald-500/50 transition-all"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-xl">
                  {client.displayName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-white truncate">{client.displayName}</h4>
                  <p className="text-sm text-slate-500 truncate">{client.email}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Sessions</p>
                  <p className="text-lg font-bold text-white">{clientAppts.length}</p>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Joined</p>
                  <p className="text-sm font-bold text-white">{client.createdAt ? format(client.createdAt.toDate(), 'MMM yyyy') : 'N/A'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedClient(client)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  View Profile <ChevronRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setClientToDelete(client)}
                  className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500/20 transition-colors"
                  title="Delete Client"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {clientToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setClientToDelete(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Delete Client?</h3>
              <p className="text-slate-400 text-center mb-8">
                Are you sure you want to delete <span className="text-white font-bold">{clientToDelete.displayName}</span>? 
                This will remove their account and portal access. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setClientToDelete(null)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteClient}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {successMessage && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSuccessMessage(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Success</h3>
              <p className="text-slate-400 mb-8">{successMessage}</p>
              <button 
                onClick={() => setSuccessMessage(null)}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 transition-colors"
              >
                Continue
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {selectedClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedClient(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-3xl">
                  {selectedClient.displayName?.[0] || '?'}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{selectedClient.displayName}</h3>
                  <p className="text-slate-400">{selectedClient.email}</p>
                  {selectedClient.phone && <p className="text-slate-400 text-sm mt-1">{selectedClient.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Role</p>
                  <p className="text-white font-medium capitalize">{selectedClient.role}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Joined</p>
                  <p className="text-white font-medium">
                    {selectedClient.createdAt ? format(selectedClient.createdAt.toDate(), 'MMMM d, yyyy') : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="space-y-6 mb-8">
                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Upcoming Appointments</h4>
                  <div className="space-y-3">
                    {appointments
                      .filter((a: any) => a.clientEmail === selectedClient.email && isAfter(a.startTime.toDate(), new Date()))
                      .sort((a: any, b: any) => a.startTime.toDate().getTime() - b.startTime.toDate().getTime())
                      .map((appt: any) => (
                        <div key={appt.id} className="bg-slate-800/20 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{appt.title}</p>
                              <p className="text-xs text-slate-500">{format(appt.startTime.toDate(), 'MMM d, yyyy • h:mm a')}</p>
                            </div>
                          </div>
                          <Badge variant={appt.status === 'scheduled' ? 'success' : 'default'}>{appt.status}</Badge>
                        </div>
                      ))}
                    {appointments.filter((a: any) => a.clientEmail === selectedClient.email && isAfter(a.startTime.toDate(), new Date())).length === 0 && (
                      <div className="text-center py-6 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-slate-500 text-sm">No upcoming appointments.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Recent Sessions</h4>
                  <div className="space-y-3">
                    {appointments
                      .filter((a: any) => a.clientEmail === selectedClient.email && isBefore(a.startTime.toDate(), new Date()))
                      .sort((a: any, b: any) => b.startTime.toDate().getTime() - a.startTime.toDate().getTime())
                      .slice(0, 5)
                      .map((appt: any) => (
                        <div key={appt.id} className="bg-slate-800/20 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-500">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{appt.title}</p>
                              <p className="text-xs text-slate-500">{format(appt.startTime.toDate(), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <Badge variant="default">Completed</Badge>
                        </div>
                      ))}
                    {appointments.filter((a: any) => a.clientEmail === selectedClient.email && isBefore(a.startTime.toDate(), new Date())).length === 0 && (
                      <div className="text-center py-6 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-slate-500 text-sm">No past sessions found.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Shared Documents</h4>
                  <div className="space-y-3">
                    {documents
                      .filter((d: any) => d.sharedWithEmail === selectedClient.email)
                      .map((doc: any) => (
                        <div key={doc.id} className="bg-slate-800/20 rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{doc.name}</p>
                              <p className="text-xs text-slate-500">{format(doc.createdAt.toDate(), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <a 
                            href={doc.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    {documents.filter((d: any) => d.sharedWithEmail === selectedClient.email).length === 0 && (
                      <div className="text-center py-6 bg-slate-800/10 rounded-2xl border border-dashed border-slate-800">
                        <p className="text-slate-500 text-sm">No shared documents.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedClient(null)}
                className="w-full py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 transition-colors"
              >
                Close Profile
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isInviting && setShowInviteModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-2">Add New Client</h3>
              <p className="text-slate-400 mb-6">Create a client account and send login credentials.</p>
              
              {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm whitespace-pre-wrap">
                  {error}
                </div>
              )}

              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Phone Number (Optional)</label>
                  <input 
                    type="tel" 
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    disabled={isInviting}
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium hover:bg-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isInviting}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isInviting ? <Clock className="w-4 h-4 animate-spin" /> : null}
                    {isInviting ? 'Creating...' : 'Create Client'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DocumentsView({ documents, role, user }: any) {
  const [uploading, setUploading] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `documents/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        name: file.name,
        url,
        ownerUid: user.uid,
        sharedWithEmail: selectedClient,
        createdAt: serverTimestamp()
      });
      alert('Document uploaded and shared!');
    } catch (error) {
      console.error(error);
      alert('Upload failed');
    } finally {
      setUploading(false);
      setSelectedClient('');
    }
  };

  const handleDelete = async (docId: string, url: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await deleteDoc(doc(db, 'documents', docId));
      // Optionally delete from storage too
      // const storageRef = ref(storage, url);
      // await deleteObject(storageRef);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Document Library</h2>
          <p className="text-slate-400 mt-1">Share and manage coaching materials securely.</p>
        </div>
      </header>

      {role === 'coach' && (
        <Card title="Upload New Document" subtitle="Share a file with a specific client">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-slate-400 mb-2">Select Client Email</label>
              <input 
                type="email" 
                placeholder="client@example.com"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="w-full md:w-auto">
              <label className={cn(
                "flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all cursor-pointer",
                !selectedClient ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-500"
              )}>
                {uploading ? <Clock className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Choose File'}
                <input 
                  type="file" 
                  className="hidden" 
                  disabled={!selectedClient || uploading}
                  onChange={handleUpload}
                />
              </label>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documents.map((doc: any) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex gap-2">
                <a 
                  href={doc.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                </a>
                {role === 'coach' && (
                  <button 
                    onClick={() => handleDelete(doc.id, doc.url)}
                    className="p-2 bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <h4 className="text-lg font-bold text-white truncate mb-1">{doc.name}</h4>
            <p className="text-xs text-slate-500 mb-4">Shared with: {doc.sharedWithEmail}</p>
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-[10px] text-slate-600 uppercase font-bold tracking-widest">
                {format(doc.createdAt.toDate(), 'MMM d, yyyy')}
              </span>
              <Badge variant="default">PDF / Doc</Badge>
            </div>
          </motion.div>
        ))}
        {documents.length === 0 && (
          <div className="col-span-full text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <FileText className="w-16 h-16 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-600">No documents shared yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RemindersView({ appointments, role }: any) {
  const upcomingReminders = useMemo(() => {
    return appointments
      .filter((a: any) => a.status === 'scheduled' && isAfter(a.startTime.toDate(), new Date()))
      .slice(0, 10);
  }, [appointments]);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">Automated Reminders</h2>
        <p className="text-slate-400 mt-1">Track and manage automated email notifications for your sessions.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Upcoming Reminders" subtitle="Next 10 scheduled notifications">
            <div className="space-y-4">
              {upcomingReminders.map((appt: any) => (
                <div key={appt.id} className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-bold text-white">{appt.title}</h5>
                    <span className="text-xs text-slate-500">{format(appt.startTime.toDate(), 'MMM d, h:mm a')}</span>
                  </div>
                  <div className="flex gap-3">
                    <div className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border",
                      appt.remindersSent?.includes('48h') 
                        ? "bg-emerald-900/20 text-emerald-400 border-emerald-800/50" 
                        : "bg-slate-900/50 text-slate-500 border-slate-800"
                    )}>
                      {appt.remindersSent?.includes('48h') ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      48h Reminder
                    </div>
                    <div className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border",
                      appt.remindersSent?.includes('1h') 
                        ? "bg-emerald-900/20 text-emerald-400 border-emerald-800/50" 
                        : "bg-slate-900/50 text-slate-500 border-slate-800"
                    )}>
                      {appt.remindersSent?.includes('1h') ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      1h Reminder
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Reminder Status" className="bg-emerald-600/5 border-emerald-600/20">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-emerald-500 font-bold uppercase tracking-wider">System Active</p>
                <p className="text-xs text-slate-400">Reminders are sent automatically.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">48h Window</span>
                <span className="text-white font-medium">Enabled</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">1h Window</span>
                <span className="text-white font-medium">Enabled</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Last Check</span>
                <span className="text-white font-medium">Just now</span>
              </div>
            </div>
          </Card>

          <div className="bg-amber-900/10 border border-amber-900/30 p-6 rounded-2xl">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <h5 className="text-sm font-bold text-amber-500 mb-1">External Clients</h5>
                <p className="text-xs text-amber-500/70 leading-relaxed">
                  Reminders are sent to all emails found in synced calendar events, even if they haven't registered for the portal yet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ profile, role }: any) {
  const [emailTemplate, setEmailTemplate] = useState(profile?.reminderTemplate || 'Hi, your session "{title}" is in {time}.');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUpdateTemplate = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        reminderTemplate: emailTemplate
      });
      alert('Reminder template updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
      alert('Failed to update template.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${auth.currentUser.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        photoURL: url
      });
      await updateProfile(auth.currentUser, { photoURL: url });
      alert('Avatar updated successfully!');
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Failed to upload avatar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">Portal Settings</h2>
        <p className="text-slate-400 mt-1">Configure your profile and coaching preferences.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Profile Information" subtitle="Update your public profile details">
            <div className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-3xl font-bold overflow-hidden">
                  {profile?.photoURL ? (
                    <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    profile?.displayName[0]
                  )}
                </div>
                <div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleAvatarChange} 
                    className="hidden" 
                    accept="image/*"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Change Avatar'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2">JPG, PNG or GIF. Max size 2MB.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Full Name</label>
                  <input 
                    type="text" 
                    disabled
                    value={profile?.displayName || ''}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-600 mt-2 italic">Contact your coach to change your registered name.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
                  <input 
                    type="email" 
                    disabled
                    defaultValue={profile?.email}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>
              {/* Profile save button removed as fields are now read-only */}
            </div>
          </Card>

          {role === 'coach' && (
            <Card title="Reminder Templates" subtitle="Customize the emails sent to your clients">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Default Template</label>
                  <textarea 
                    rows={4}
                    value={emailTemplate}
                    onChange={(e) => setEmailTemplate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">Available variables: {'{title}'}, {'{time}'}, {'{date}'}</p>
                </div>
                <button 
                  onClick={handleUpdateTemplate}
                  disabled={saving}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Update Templates'}
                </button>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Account Security">
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <p className="text-sm font-bold text-white mb-1">Role</p>
                <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
              </div>
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <p className="text-sm font-bold text-white mb-1">Two-Factor Auth</p>
                <p className="text-xs text-slate-500">Not enabled</p>
              </div>
              <button className="w-full py-3 text-rose-400 hover:bg-rose-400/5 rounded-xl border border-rose-400/20 transition-all text-sm font-medium">
                Delete Account
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
