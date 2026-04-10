import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, Volume2, ChevronLeft, ChevronRight, BookOpen, MessageCircle, X, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { chatWithStoryBuddy, generateStory, generateIllustration, generateSpeech, type Story, type StoryPage } from '@/src/lib/gemini';
import { cn } from '@/lib/utils';
import { auth, db } from '@/src/lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, deleteDoc, doc, getDocFromServer } from 'firebase/firestore';

// --- Firestore Error Handler ---
enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Story Buddy (Chat) ---
const StoryBuddy = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: 'Hi there! I\'m Sparky! Want to talk about magic stories? ✨' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      const response = await chatWithStoryBuddy(userMsg, history);
      setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: 'Oops! My magic wand is a bit sleepy. Try again! 🪄' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          className="fixed right-4 bottom-4 w-80 h-[500px] bg-white rounded-3xl shadow-2xl border-4 border-purple-200 flex flex-col z-50 overflow-hidden"
        >
          <div className="bg-purple-500 p-4 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span className="font-bold">Sparky the Buddy</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-purple-600">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-2xl text-sm",
                    m.role === 'user' ? "bg-purple-500 text-white rounded-tr-none" : "bg-gray-100 text-gray-800 rounded-tl-none"
                  )}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none animate-pulse">
                    Sparky is thinking... 🪄
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="p-4 border-t flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Say hello to Sparky!"
              className="rounded-full border-purple-200 focus-visible:ring-purple-500"
            />
            <Button onClick={handleSend} size="icon" className="rounded-full bg-purple-500 hover:bg-purple-600">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Magic Skeleton ---
const MagicSkeleton = () => (
  <div className="w-full h-full relative overflow-hidden bg-purple-50 flex items-center justify-center">
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
      animate={{
        x: ['-100%', '100%'],
      }}
      transition={{
        repeat: Infinity,
        duration: 1.5,
        ease: "linear",
      }}
    />
    <div className="flex flex-col items-center gap-4 text-purple-300 z-10">
      <motion.div
        animate={{ 
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{ repeat: Infinity, duration: 3 }}
      >
        <Sparkles className="w-16 h-16 text-yellow-400" />
      </motion.div>
      <p className="font-bold text-purple-400">Painting the magic...</p>
    </div>
  </div>
);

// --- Main App Content ---
function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [story, setStory] = useState<Story | null>(null);
  const [savedStories, setSavedStories] = useState<(Story & { id: string })[]>([]);
  const [storySeed, setStorySeed] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuddyOpen, setIsBuddyOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [ageGroup, setAgeGroup] = useState('3-5');
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [loadingStep, setLoadingStep] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Saved Stories Listener
  useEffect(() => {
    if (!user) {
      setSavedStories([]);
      return;
    }
    const q = query(collection(db, 'stories'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story & { id: string }));
      setSavedStories(stories.sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stories');
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleSaveStory = async () => {
    if (!user || !story || isSaving) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'stories'), {
        ...story,
        userId: user.uid,
        seed: storySeed,
        topic,
        ageGroup,
        createdAt: serverTimestamp()
      });
      setIsSaving(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stories');
    }
  };

  const handleDeleteStory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'stories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stories');
    }
  };

  const handleCreateStory = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setLoadingStep('Writing your magical story...');
    try {
      const newSeed = Math.floor(Math.random() * 1000000);
      setStorySeed(newSeed);
      const newStory = await generateStory(topic, ageGroup);
      setStory(newStory);
      setCurrentPage(0);
      
      // Pre-generate first page image and audio
      await loadPageData(newStory, 0, newSeed);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
      setLoadingStep('');
    }
  };

  const loadPageData = async (currentStory: Story, pageIndex: number, seed: number) => {
    const page = currentStory.pages[pageIndex];
    if (page.imageUrl && page.audioData) return;

    setLoadingStep(`Creating magic for page ${pageIndex + 1}...`);
    try {
      const updates: Partial<StoryPage> = {};
      if (!page.imageUrl) {
        updates.imageUrl = await generateIllustration(page.imagePrompt, currentStory.visualStyle, seed, imageSize);
      }
      if (!page.audioData) {
        updates.audioData = await generateSpeech(page.text);
      }

      const updatedPages = [...currentStory.pages];
      updatedPages[pageIndex] = { ...page, ...updates };
      setStory({ ...currentStory, pages: updatedPages });
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingStep('');
    }
  };

  const handleNext = async () => {
    if (!story || currentPage >= story.pages.length - 1) return;
    const nextIndex = currentPage + 1;
    setCurrentPage(nextIndex);
    await loadPageData(story, nextIndex, storySeed);
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const playAudio = async () => {
    const audioData = story?.pages[currentPage].audioData;
    if (!audioData) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const binaryString = atob(audioData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // PCM is 16-bit little-endian
      const float32Data = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < float32Data.length; i++) {
        float32Data[i] = view.getInt16(i * 2, true) / 32768;
      }

      const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (error) {
      console.error("Error playing audio:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F0] font-sans selection:bg-yellow-200">
      {/* Header */}
      <header className="p-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-3">
            <BookOpen className="text-white w-7 h-7" />
          </div>
          <h1 className="text-3xl font-black text-purple-900 tracking-tight">Magic Storybook</h1>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                className="rounded-full border-2 border-yellow-200 hover:bg-yellow-50 text-yellow-700 font-bold"
              >
                <BookOpen className="w-5 h-5 mr-2" />
                My Library ({savedStories.length})
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsBuddyOpen(true)}
                className="rounded-full border-2 border-purple-200 hover:bg-purple-50 text-purple-700 font-bold"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Story Buddy
              </Button>
              <img src={user.photoURL || ''} alt="User" className="w-10 h-10 rounded-full border-2 border-purple-200" referrerPolicy="no-referrer" />
            </>
          ) : (
            <Button onClick={handleLogin} className="rounded-full bg-purple-600 hover:bg-purple-700 font-bold">
              Sign In to Save Stories
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLibraryOpen && user && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 space-y-6">
            <h2 className="text-3xl font-black text-purple-900">My Magical Collection</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedStories.map((s) => (
                <Card key={s.id} onClick={() => { setStory(s); setIsLibraryOpen(false); setCurrentPage(0); }} className="cursor-pointer hover:scale-105 transition-transform border-4 border-white rounded-3xl overflow-hidden shadow-xl group">
                  <div className="aspect-video bg-purple-100 relative">
                    {s.pages[0].imageUrl && <img src={s.pages[0].imageUrl} alt={s.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => handleDeleteStory(s.id, e)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full w-8 h-8"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-lg text-purple-900 line-clamp-1">{s.title}</h3>
                    <p className="text-sm text-purple-500">{s.pages.length} pages</p>
                  </CardContent>
                </Card>
              ))}
              {savedStories.length === 0 && (
                <div className="col-span-full py-12 text-center text-purple-400 font-medium">
                  Your library is empty! Create a story to start your collection. ✨
                </div>
              )}
            </div>
          </motion.div>
        )}

        {!story ? (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="max-w-xl mx-auto space-y-8"
          >
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black text-purple-900 leading-tight">
                What should our <span className="text-yellow-500">adventure</span> be about?
              </h2>
              <p className="text-xl text-purple-700/60 font-medium">
                Tell us a topic, and we'll weave a magical tale just for you!
              </p>
            </div>

            <Card className="border-4 border-yellow-200 rounded-[40px] shadow-2xl overflow-hidden">
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <Label className="text-lg font-bold text-purple-900">Story Topic</Label>
                  <Input
                    placeholder="e.g. A brave cat on the moon, A dragon who loves cookies..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="h-16 text-lg rounded-2xl border-2 border-purple-100 focus-visible:ring-yellow-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-lg font-bold text-purple-900">Age Group</Label>
                    <Select value={ageGroup} onValueChange={setAgeGroup}>
                      <SelectTrigger className="h-14 rounded-2xl border-2 border-purple-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3-5">3 - 5 years</SelectItem>
                        <SelectItem value="6-8">6 - 8 years</SelectItem>
                        <SelectItem value="9-12">9 - 12 years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-lg font-bold text-purple-900">Image Quality</Label>
                    <Select value={imageSize} onValueChange={(v: any) => setImageSize(v)}>
                      <SelectTrigger className="h-14 rounded-2xl border-2 border-purple-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">1K (Fast)</SelectItem>
                        <SelectItem value="2K">2K (Better)</SelectItem>
                        <SelectItem value="4K">4K (Magic!)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleCreateStory}
                  disabled={isGenerating || !topic.trim()}
                  className="w-full h-16 text-xl font-black rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-purple-900 shadow-xl shadow-yellow-200/50 transition-all active:scale-95"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                      {loadingStep}
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-3 h-6 w-6" />
                      Create My Story!
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-none px-4 py-1 rounded-full font-bold">
                  Page {currentPage + 1} of {story.pages.length}
                </Badge>
                <h2 className="text-4xl font-black text-purple-900">{story.title}</h2>
              </div>
              <div className="flex gap-3">
                {user && !('id' in story) && (
                  <Button
                    onClick={handleSaveStory}
                    disabled={isSaving}
                    className="bg-yellow-400 hover:bg-yellow-500 text-purple-900 font-bold rounded-full"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Save to Library
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setStory(null)}
                  className="text-purple-400 hover:text-purple-600 font-bold"
                >
                  Start New Adventure
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Illustration */}
              <Card className="border-4 border-white rounded-[40px] shadow-2xl overflow-hidden aspect-square bg-purple-50 flex items-center justify-center relative group">
                <AnimatePresence mode="wait">
                  {story.pages[currentPage].imageUrl ? (
                    <motion.img
                      key={`img-${currentPage}`}
                      initial={{ opacity: 0, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.5 }}
                      src={story.pages[currentPage].imageUrl}
                      alt="Story illustration"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <motion.div
                      key="skeleton"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full"
                    >
                      <MagicSkeleton />
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Audio Button Overlay */}
                {story.pages[currentPage].audioData && (
                  <Button
                    onClick={playAudio}
                    size="icon"
                    className="absolute bottom-6 right-6 w-16 h-16 rounded-full bg-white/90 hover:bg-white text-purple-600 shadow-xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-90"
                  >
                    <Volume2 className="w-8 h-8" />
                  </Button>
                )}
              </Card>

              {/* Text Content */}
              <div className="space-y-8 flex flex-col h-full justify-between py-4">
                <motion.div
                  key={currentPage}
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="bg-white p-10 rounded-[40px] shadow-xl border-2 border-purple-50 min-h-[300px] flex items-center"
                >
                  <p className="text-2xl md:text-3xl font-medium text-purple-800 leading-relaxed italic">
                    "{story.pages[currentPage].text}"
                  </p>
                </motion.div>

                <div className="flex gap-4">
                  <Button
                    onClick={handlePrev}
                    disabled={currentPage === 0 || !!loadingStep}
                    variant="outline"
                    className="flex-1 h-16 rounded-2xl border-4 border-purple-100 text-purple-700 font-black text-xl hover:bg-purple-50"
                  >
                    <ChevronLeft className="mr-2 w-6 h-6" />
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={currentPage === story.pages.length - 1 || !!loadingStep}
                    className="flex-[2] h-16 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xl shadow-xl shadow-purple-200 transition-all active:scale-95"
                  >
                    {loadingStep ? (
                      <>
                        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                        Magic...
                      </>
                    ) : (
                      <>
                        Next Page
                        <ChevronRight className="ml-2 w-6 h-6" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <StoryBuddy isOpen={isBuddyOpen} onClose={() => setIsBuddyOpen(false)} />

      {/* Background Decorations */}
      <div className="fixed top-20 left-10 -z-10 opacity-10 pointer-events-none">
        <Sparkles className="w-32 h-32 text-yellow-400" />
      </div>
      <div className="fixed bottom-20 right-10 -z-10 opacity-10 pointer-events-none">
        <Sparkles className="w-48 h-48 text-purple-400" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppContent />
  );
}
