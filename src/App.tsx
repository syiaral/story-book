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

// --- Main App ---
export default function App() {
  const [story, setStory] = useState<Story | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBuddyOpen, setIsBuddyOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [ageGroup, setAgeGroup] = useState('3-5');
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [loadingStep, setLoadingStep] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleCreateStory = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setLoadingStep('Writing your magical story...');
    try {
      const newStory = await generateStory(topic, ageGroup);
      setStory(newStory);
      setCurrentPage(0);
      
      // Pre-generate first page image and audio
      await loadPageData(newStory, 0);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
      setLoadingStep('');
    }
  };

  const loadPageData = async (currentStory: Story, pageIndex: number) => {
    const page = currentStory.pages[pageIndex];
    if (page.imageUrl && page.audioData) return;

    setLoadingStep(`Creating magic for page ${pageIndex + 1}...`);
    try {
      const updates: Partial<StoryPage> = {};
      if (!page.imageUrl) {
        updates.imageUrl = await generateIllustration(page.imagePrompt, imageSize);
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
    await loadPageData(story, nextIndex);
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
          <Button
            variant="outline"
            onClick={() => setIsBuddyOpen(true)}
            className="rounded-full border-2 border-purple-200 hover:bg-purple-50 text-purple-700 font-bold"
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Story Buddy
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
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
              <Button
                variant="ghost"
                onClick={() => setStory(null)}
                className="text-purple-400 hover:text-purple-600 font-bold"
              >
                Start New Adventure
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Illustration */}
              <Card className="border-4 border-white rounded-[40px] shadow-2xl overflow-hidden aspect-square bg-purple-50 flex items-center justify-center relative group">
                {story.pages[currentPage].imageUrl ? (
                  <motion.img
                    key={currentPage}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    src={story.pages[currentPage].imageUrl}
                    alt="Story illustration"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-purple-300">
                    <Loader2 className="w-12 h-12 animate-spin" />
                    <p className="font-bold">Painting the magic...</p>
                  </div>
                )}
                
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
