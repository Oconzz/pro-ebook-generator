/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { motion } from 'motion/react';
import { BookOpen, Download, Loader2, Sparkles, Target, TrendingUp, Key, Image as ImageIcon, Settings, ChevronLeft, FileText, Trash2, Clock, Globe } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface EbookHistory {
  id: string;
  title: string;
  theme: string;
  audience: string;
  upsell: string;
  content: string;
  date: string;
}

export default function App() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [view, setView] = useState<'home' | 'settings'>('home');
  const [language, setLanguage] = useState(() => localStorage.getItem('ebook_language') || 'English');
  const [history, setHistory] = useState<EbookHistory[]>(() => {
    const saved = localStorage.getItem('ebook_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [theme, setTheme] = useState('');
  const [audience, setAudience] = useState('');
  const [upsell, setUpsell] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [ebookContent, setEbookContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem('ebook_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('ebook_language', language);
  }, [language]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasKey(has);
      } else {
        setHasKey(true); // Fallback if not in AI Studio
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const downloadMarkdown = (content: string, title: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadHistoryItem = (item: EbookHistory) => {
    setTheme(item.theme);
    setAudience(item.audience);
    setUpsell(item.upsell);
    setEbookContent(item.content);
    setView('home');
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const generateImages = async (text: string) => {
    const regex = /\[IMAGE:\s*(.*?)\]/g;
    let match;
    const matches: { full: string, prompt: string }[] = [];

    while ((match = regex.exec(text)) !== null) {
      matches.push({ full: match[0], prompt: match[1] });
    }

    if (matches.length === 0) return text;

    setIsGeneratingImages(true);
    let updatedText = text;

    try {
      for (const m of matches) {
        try {
          const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
          const ai = new GoogleGenAI({ apiKey });
          
          const isCover = m.prompt.toLowerCase().includes('cover');
          const aspectRatio = isCover ? "3:4" : "16:9";

          const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: {
              parts: [{ text: `High quality editorial ebook illustration, beautiful diagrammed art style. ${m.prompt}` }]
            },
            config: {
              imageConfig: {
                aspectRatio,
                imageSize: "1K"
              }
            }
          });
          
          let base64 = '';
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              base64 = part.inlineData.data;
              break;
            }
          }
          
          if (base64) {
            updatedText = updatedText.replace(m.full, `![${m.prompt}](data:image/jpeg;base64,${base64})`);
            setEbookContent(updatedText);
          }
        } catch (err: any) {
          console.error("Image generation failed:", err);
          if (err.message?.includes("Requested entity was not found")) {
            setHasKey(false);
            throw new Error("API Key invalid or not found. Please select your API key again.");
          }
          updatedText = updatedText.replace(m.full, `> *[Illustration placeholder: ${m.prompt}]*`);
          setEbookContent(updatedText);
        }
      }
    } finally {
      setIsGeneratingImages(false);
    }
    
    return updatedText;
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme || !audience || !upsell) {
      setError('Please fill in all fields.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setEbookContent('');

    try {
      const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `You are an expert copywriter, marketer, and author. Create a professional, highly engaging, and beautifully structured ebook about "${theme}".
      
Language: ${language}. (Write the ENTIRE ebook, including the title, chapters, and all text, in ${language}).
      
Target audience: ${audience}.
Upsell/Call to Action product/service: ${upsell}.

Requirements:
1. Use scientific and proven methods.
2. Apply advanced copywriting techniques (PAS, AIDA).
3. Weave in references to the upsell.
4. Structure the ebook with rich Markdown formatting for a "diagrammed" look:
  - Start with a Cover Page: Include a Title (H1), Subtitle, and exactly one cover image prompt: \`[IMAGE: A beautiful, minimalist ebook cover illustration representing <theme>, vertical orientation, editorial style]\`.
  - Introduction.
  - 3 to 5 Core Chapters. For EACH chapter, include exactly one header image prompt right after the chapter title (H2): \`[IMAGE: A conceptual, high-quality editorial illustration representing <chapter topic>, horizontal orientation]\`.
  - Use Blockquotes (\`>\`) for important callouts or quotes.
  - Use bolding and lists to make it scannable.
  - Conclusion.
  - A strong, dedicated Call to Action section for the upsell.
5. Format the output entirely in Markdown.

Write the full ebook content now.`;

      const response = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
      });

      let fullContent = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullContent += chunk.text;
          setEbookContent(fullContent);
        }
      }

      const finalContent = await generateImages(fullContent);
      
      const newEbook: EbookHistory = {
        id: Date.now().toString(),
        title: theme,
        theme,
        audience,
        upsell,
        content: finalContent,
        date: new Date().toISOString()
      };
      setHistory(prev => [newEbook, ...prev]);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating the ebook.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  if (hasKey === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">API Key Required</h2>
          <p className="text-slate-600 mb-6">
            To generate beautiful, high-quality illustrations for your ebook using Gemini 3.1 Flash Image, you need to select a paid Google Cloud API key.
            <br/><br/>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-medium">Learn more about billing</a>
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header - Hidden when printing */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <BookOpen className="w-6 h-6" />
            <span className="font-bold text-xl tracking-tight text-slate-900">ProEbook AI</span>
          </div>
          <div className="flex items-center gap-3">
            {ebookContent && !isGenerating && !isGeneratingImages && view === 'home' && (
              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            )}
            <button
              onClick={() => setView(view === 'home' ? 'settings' : 'home')}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              title={view === 'home' ? 'Settings & History' : 'Back to Home'}
            >
              {view === 'home' ? <Settings className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:m-0">
        {view === 'settings' ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto mt-4">
            <h2 className="text-3xl font-bold text-slate-900 mb-8 tracking-tight">Settings & History</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-indigo-600" />
                    Preferences
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ebook Language</label>
                      <select 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 focus:bg-white transition-colors"
                      >
                        <option value="English">English</option>
                        <option value="Portuguese">Portuguese</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Italian">Italian</option>
                      </select>
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <button onClick={handleSelectKey} className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors">
                        <Key className="w-4 h-4" />
                        Change API Key
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="md:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-600" />
                    Generation History
                  </h3>
                  
                  {history.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No ebooks generated yet.</p>
                      <p className="text-sm text-slate-400 mt-1">Your generated ebooks will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {history.map(item => (
                        <div key={item.id} className="border border-slate-100 rounded-xl p-5 hover:border-indigo-100 hover:shadow-md transition-all bg-white">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-slate-900 line-clamp-1 text-lg">{item.title}</h4>
                            <span className="text-xs font-medium text-slate-400 whitespace-nowrap ml-4 bg-slate-100 px-2 py-1 rounded-md">
                              {new Date(item.date).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mb-4 line-clamp-2">Target: {item.audience}</p>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => loadHistoryItem(item)} className="text-sm font-medium bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
                              View Ebook
                            </button>
                            <button onClick={() => {
                              loadHistoryItem(item);
                              setTimeout(() => window.print(), 500);
                            }} className="flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                              <Download className="w-4 h-4" />
                              Download PDF
                            </button>
                            <button onClick={() => downloadMarkdown(item.content, item.title)} className="flex items-center gap-1.5 text-sm font-medium bg-slate-50 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200">
                              <FileText className="w-4 h-4" />
                              Download Text
                            </button>
                            <button onClick={() => deleteHistoryItem(item.id)} className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors ml-auto">
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : !ebookContent && !isGenerating ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-12"
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
                Generate Diagrammed Ebooks
              </h1>
              <p className="text-lg text-slate-600">
                Turn any topic into a professional, beautifully illustrated ebook designed to convert readers into customers.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <form onSubmit={handleGenerate} className="space-y-6">
                <div>
                  <label htmlFor="theme" className="block text-sm font-medium text-slate-700 mb-1">
                    Ebook Theme / Topic
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Sparkles className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      id="theme"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      placeholder="e.g., The Ultimate Guide to Intermittent Fasting"
                      className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="audience" className="block text-sm font-medium text-slate-700 mb-1">
                    Target Audience
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Target className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      id="audience"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      placeholder="e.g., Busy professionals looking to lose weight"
                      className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="upsell" className="block text-sm font-medium text-slate-700 mb-1">
                    Upsell Product / Service
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <TrendingUp className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      id="upsell"
                      value={upsell}
                      onChange={(e) => setUpsell(e.target.value)}
                      placeholder="e.g., 1-on-1 Nutrition Coaching Program ($499)"
                      className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      Generating Ebook...
                    </>
                  ) : (
                    'Generate Ebook'
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 print:block">
            {/* Ebook Preview */}
            <div className="flex-1">
              <div 
                id="printable-ebook"
                className="ebook-container print:border-none print:shadow-none print:p-0"
              >
                <div className="prose max-w-none">
                  <ReactMarkdown>{ebookContent}</ReactMarkdown>
                </div>
              </div>
              
              {isGenerating && !isGeneratingImages && (
                <div className="flex items-center justify-center mt-8 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm font-medium">AI is writing the content...</span>
                </div>
              )}
              
              {isGeneratingImages && (
                <div className="flex items-center justify-center mt-8 text-indigo-600 bg-indigo-50 p-4 rounded-xl border border-indigo-100 shadow-sm">
                  <ImageIcon className="w-5 h-5 animate-pulse mr-3" />
                  <span className="text-sm font-medium">Generating beautiful illustrations with Gemini 3.1 Flash Image...</span>
                </div>
              )}
            </div>

            {/* Sidebar Controls - Hidden when printing */}
            <div className="hidden lg:block w-80 shrink-0 print:hidden">
              <div className="sticky top-24 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4">
                  Ebook Details
                </h3>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500 font-medium">Theme</dt>
                    <dd className="text-slate-900 mt-1">{theme}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 font-medium">Audience</dt>
                    <dd className="text-slate-900 mt-1">{audience}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 font-medium">Upsell</dt>
                    <dd className="text-slate-900 mt-1">{upsell}</dd>
                  </div>
                </dl>

                <div className="mt-8 pt-6 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setEbookContent('');
                      setIsGenerating(false);
                      setIsGeneratingImages(false);
                    }}
                    className="w-full text-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
