/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { motion } from 'motion/react';
import OpenAI from 'openai';
import { BookOpen, Download, Loader2, Sparkles, Target, TrendingUp, Key, Image as ImageIcon, Settings, ChevronLeft, FileText, Trash2, Clock, Globe, Send, MessageSquare } from 'lucide-react';

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
  description: string;
  audience: string;
  upsell: string;
  content: string;
  htmlContent?: string;
  date: string;
}

export default function App() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [view, setView] = useState<'home' | 'settings'>('home');
  const [language, setLanguage] = useState(() => localStorage.getItem('ebook_language') || 'English');
  const [pageCount, setPageCount] = useState(() => localStorage.getItem('ebook_page_count') || 'Medium (10-15 pages)');
  const [history, setHistory] = useState<EbookHistory[]>(() => {
    const saved = localStorage.getItem('ebook_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [provider, setProvider] = useState(() => localStorage.getItem('ebook_provider') || 'gemini');
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('ebook_custom_api_key') || '');
  const [openRouterModel, setOpenRouterModel] = useState(() => localStorage.getItem('ebook_openrouter_model') || 'anthropic/claude-3.5-sonnet');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [upsell, setUpsell] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [ebookContent, setEbookContent] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [currentEbookId, setCurrentEbookId] = useState<string | null>(null);
  const [error, setError] = useState('');
  
  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  useEffect(() => {
    localStorage.setItem('ebook_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('ebook_language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('ebook_page_count', pageCount);
  }, [pageCount]);

  useEffect(() => {
    localStorage.setItem('ebook_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('ebook_custom_api_key', customApiKey);
  }, [customApiKey]);

  useEffect(() => {
    localStorage.setItem('ebook_openrouter_model', openRouterModel);
  }, [openRouterModel]);

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

  const downloadFile = (content: string, title: string, extension: string) => {
    const blob = new Blob([content], { type: extension === 'html' ? 'text/html' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadHistoryItem = (item: EbookHistory) => {
    setCurrentEbookId(item.id);
    setTheme(item.theme);
    setDescription(item.description || '');
    setAudience(item.audience);
    setUpsell(item.upsell);
    setEbookContent(item.content);
    setHtmlContent(item.htmlContent || '');
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
      setError('Please fill in all required fields.');
      return;
    }

    if (provider !== 'gemini' && !customApiKey) {
      setError(`Please enter your ${provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'} API key in Settings.`);
      return;
    }

    setIsGenerating(true);
    setError('');
    setEbookContent('');

    try {
      const prompt = `You are an expert copywriter, marketer, and author. Create a professional, highly engaging, and beautifully structured ebook about "${theme}".
      
Language: ${language}. (Write the ENTIRE ebook, including the title, chapters, and all text, in ${language}).
      
${description ? `Additional Context / Description: ${description}\n` : ''}
Target audience: ${audience}.
Upsell/Call to Action product/service: ${upsell}.
Length: ${pageCount}.

Requirements:
1. Use scientific and proven methods.
2. Apply advanced copywriting techniques (PAS, AIDA), BUT DO NOT use meta-language. NEVER write the words "PAS", "AIDA", "Problem", "Agitation", or "Solution" in the text. Do not use structural labels like "Callout:", "CTA:", or "Blockquote:". Write fluidly.
3. NEVER use trademarked drug names like "Ozempic". Use generic high-value terms like "Metabolic Formula" or "GLUT4 Activator".
4. Weave in references to the upsell.
5. Structure the ebook with rich Markdown formatting for a "diagrammed" look:
  - Start with a Cover Page: Include a Title (H1), Subtitle, and exactly one cover image prompt: \`[IMAGE: A beautiful, minimalist ebook cover illustration representing <theme>, vertical orientation, editorial style]\`.
  - Introduction.
  - Core Chapters (adjust the number of chapters and the depth of content to match the requested length of ${pageCount}). For EACH chapter, include exactly one header image prompt right after the chapter title (H2): \`[IMAGE: A conceptual, high-quality editorial illustration representing <chapter topic>, horizontal orientation]\`.
  - Use Blockquotes (\`>\`) for important callouts or quotes.
  - Use bolding and lists to make it scannable.
  - Conclusion.
  - A strong, dedicated Call to Action section for the upsell.
6. Format the output entirely in Markdown.
7. To achieve the requested length (${pageCount}), ensure each chapter is highly detailed, providing comprehensive explanations, examples, case studies, and actionable steps.

Write the full ebook content now.`;

      let fullContent = '';

      if (provider === 'gemini') {
        const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContentStream({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
        });

        for await (const chunk of response) {
          if (chunk.text) {
            fullContent += chunk.text;
            setEbookContent(fullContent);
          }
        }
      } else {
        const openai = new OpenAI({
          baseURL: provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://openrouter.ai/api/v1',
          apiKey: customApiKey,
          dangerouslyAllowBrowser: true
        });
        
        const stream = await openai.chat.completions.create({
          model: provider === 'deepseek' ? 'deepseek-chat' : openRouterModel,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content) {
            fullContent += chunk.choices[0].delta.content;
            setEbookContent(fullContent);
          }
        }
      }

      const newEbookId = Date.now().toString();
      setCurrentEbookId(newEbookId);
      
      const newEbook: EbookHistory = {
        id: newEbookId,
        title: theme,
        theme,
        description,
        audience,
        upsell,
        content: fullContent,
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

  const handleDesignInHtml = async () => {
    if (!ebookContent) return;
    
    if (provider !== 'gemini' && !customApiKey) {
      setError(`Please enter your ${provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'} API key in Settings.`);
      return;
    }

    setIsGeneratingHtml(true);
    setError('');

    try {
      const prompt = `You are an expert web designer and developer. I have an ebook written in Markdown.
I want you to convert this entire ebook into a single, beautiful, responsive HTML file with embedded CSS.

Theme: ${theme}

Requirements:
1. Create a stunning, professional design appropriate for the theme.
2. Use modern CSS (Flexbox/Grid, nice typography, shadows, colors).
3. Remove any placeholder instructions meant for a designer (e.g., "[IMAGE: ...]" or "> *[Illustration placeholder...]*").
4. Structure it like a real book: Cover page, Chapters, and Call to Action.
5. Return ONLY the raw HTML code. Do not wrap it in markdown. Start directly with <!DOCTYPE html>. 
CRITICAL: You MUST include these two tags in the <head> to ensure proper PDF pagination and typography:
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
6. CRITICAL: Ensure the design is responsive and uses standard font sizes (e.g., 16px base, 2rem for headings). DO NOT use gigantic font sizes (like 4vw, 10vw, or 100px) that would require the user to zoom out. Use a centered container with a maximum width (e.g., max-width: 800px) for readability. Include <meta name="viewport" content="width=device-width, initial-scale=1.0">.

Here is the ebook content:
${ebookContent}`;

      let generatedHtml = '';

      if (provider === 'gemini') {
        const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContentStream({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
        });

        for await (const chunk of response) {
          if (chunk.text) {
            generatedHtml += chunk.text;
            setHtmlContent(generatedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, ''));
          }
        }
      } else {
        const openai = new OpenAI({
          baseURL: provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://openrouter.ai/api/v1',
          apiKey: customApiKey,
          dangerouslyAllowBrowser: true
        });
        
        const stream = await openai.chat.completions.create({
          model: provider === 'deepseek' ? 'deepseek-chat' : openRouterModel,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content) {
            generatedHtml += chunk.choices[0].delta.content;
            setHtmlContent(generatedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, ''));
          }
        }
      }

      generatedHtml = generatedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
      setHtmlContent(generatedHtml);
      
      if (currentEbookId) {
        setHistory(prev => prev.map(h => h.id === currentEbookId ? { ...h, htmlContent: generatedHtml } : h));
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating the HTML design.');
    } finally {
      setIsGeneratingHtml(false);
    }
  };

  const triggerImageGeneration = async () => {
    if (!hasKey) {
      await handleSelectKey();
      if (window.aistudio?.hasSelectedApiKey) {
         const keyCheck = await window.aistudio.hasSelectedApiKey();
         if (!keyCheck) return;
      }
    }
    
    const finalContent = await generateImages(ebookContent);
    
    if (currentEbookId) {
      setHistory(prev => prev.map(h => h.id === currentEbookId ? { ...h, content: finalContent } : h));
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !htmlContent) return;

    if (provider !== 'gemini' && !customApiKey) {
      setError(`Please enter your ${provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'} API key in Settings to use the chat.`);
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');
    
    // Reset textarea height
    const textarea = document.getElementById('chat-input') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = 'auto';
    }

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatting(true);
    setError('');

    try {
      const prompt = `You are an expert web developer. I will provide you with an HTML document and a request for changes.
You must return ONLY the complete, updated HTML code. Do not include any explanations, markdown formatting (like \`\`\`html), or conversational text. Start directly with <!DOCTYPE html> or the first HTML tag.

Current HTML:
${htmlContent}

Requested Change:
${userMessage}`;

      let updatedHtml = '';

      if (provider === 'gemini') {
        const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContentStream({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
        });

        for await (const chunk of response) {
          if (chunk.text) {
            updatedHtml += chunk.text;
            setHtmlContent(updatedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, ''));
          }
        }
      } else {
        const openai = new OpenAI({
          baseURL: provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://openrouter.ai/api/v1',
          apiKey: customApiKey,
          dangerouslyAllowBrowser: true
        });
        
        const stream = await openai.chat.completions.create({
          model: provider === 'deepseek' ? 'deepseek-chat' : openRouterModel,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content) {
            updatedHtml += chunk.choices[0].delta.content;
            setHtmlContent(updatedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, ''));
          }
        }
      }

      updatedHtml = updatedHtml.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
      setHtmlContent(updatedHtml);
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'I have updated the HTML design as requested.' }]);
      
      if (currentEbookId) {
        setHistory(prev => prev.map(h => h.id === currentEbookId ? { ...h, htmlContent: updatedHtml } : h));
      }

    } catch (err: any) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, an error occurred: ${err.message}` }]);
    } finally {
      setIsChatting(false);
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

  if (!hasKey && provider === 'gemini') {
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
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm mb-4"
          >
            Select API Key
          </button>
          
          <div className="pt-4 border-t border-slate-100">
            <p className="text-sm text-slate-500 mb-3">Or use a different AI provider:</p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => { setProvider('deepseek'); setView('settings'); }}
                className="text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors"
              >
                DeepSeek
              </button>
              <button 
                onClick={() => { setProvider('openrouter'); setView('settings'); }}
                className="text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors"
              >
                OpenRouter
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header - Hidden when printing */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button 
            onClick={() => {
              setView('home');
              setEbookContent('');
              setHtmlContent('');
              setIsGenerating(false);
              setIsGeneratingImages(false);
              setIsGeneratingHtml(false);
              setCurrentEbookId(null);
            }}
            className="flex items-center gap-2 text-indigo-600 hover:opacity-80 transition-opacity focus:outline-none"
          >
            <BookOpen className="w-6 h-6" />
            <span className="font-bold text-xl tracking-tight text-slate-900">ProEbook AI</span>
          </button>
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
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ebook Length</label>
                      <select 
                        value={pageCount} 
                        onChange={(e) => setPageCount(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 focus:bg-white transition-colors"
                      >
                        <option value="Short (5-10 pages)">Short (5-10 pages)</option>
                        <option value="Medium (10-15 pages)">Medium (10-15 pages)</option>
                        <option value="Long (20-30 pages)">Long (20-30 pages)</option>
                      </select>
                    </div>
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">AI Provider</label>
                        <select 
                          value={provider} 
                          onChange={(e) => setProvider(e.target.value)}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 focus:bg-white transition-colors"
                        >
                          <option value="gemini">Google Gemini</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </div>
                      
                      {provider === 'gemini' ? (
                        <button onClick={handleSelectKey} className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors">
                          <Key className="w-4 h-4" />
                          Change Gemini API Key
                        </button>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">{provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'} API Key</label>
                          <input 
                            type="password"
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                            placeholder={`Enter ${provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'} API Key`}
                            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 focus:bg-white transition-colors"
                          />
                        </div>
                      )}

                      {provider === 'openrouter' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">OpenRouter Model</label>
                          <input 
                            type="text"
                            value={openRouterModel}
                            onChange={(e) => setOpenRouterModel(e.target.value)}
                            placeholder="e.g., anthropic/claude-3.5-sonnet"
                            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-600 outline-none bg-slate-50 focus:bg-white transition-colors"
                          />
                        </div>
                      )}
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
                            <button onClick={() => downloadFile(item.htmlContent || item.content, item.title, item.htmlContent ? 'html' : 'md')} className="flex items-center gap-1.5 text-sm font-medium bg-slate-50 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200">
                              <FileText className="w-4 h-4" />
                              Download {item.htmlContent ? 'HTML' : 'Text'}
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
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                    Description / Context (Optional)
                  </label>
                  <div className="relative">
                    <div className="absolute top-3 left-0 pl-3 flex items-start pointer-events-none">
                      <FileText className="h-5 w-5 text-slate-400" />
                    </div>
                    <textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide more context, specific points to cover, or the desired tone..."
                      rows={3}
                      className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow bg-slate-50 focus:bg-white resize-none"
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
                className="ebook-container print:border-none print:shadow-none print:p-0 w-full"
              >
                {htmlContent ? (
                  <iframe 
                    srcDoc={htmlContent} 
                    sandbox="allow-same-origin"
                    onLoad={(e) => {
                      const iframe = e.currentTarget;
                      try {
                        if (iframe.contentWindow?.document.documentElement) {
                          iframe.style.height = `${iframe.contentWindow.document.documentElement.scrollHeight}px`;
                        }
                      } catch (err) {
                        console.error('Failed to resize iframe:', err);
                      }
                    }}
                    className="w-full min-h-[800px] border-none rounded-xl bg-white shadow-sm"
                    title="Ebook HTML Design"
                  />
                ) : (
                  <div className="prose max-w-none bg-white p-8 rounded-xl shadow-sm">
                    <ReactMarkdown>{ebookContent}</ReactMarkdown>
                  </div>
                )}
              </div>
              
              {isGenerating && !isGeneratingImages && !isGeneratingHtml && (
                <div className="flex items-center justify-center mt-8 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm font-medium">AI is writing the content...</span>
                </div>
              )}

              {isGeneratingHtml && (
                <div className="flex items-center justify-center mt-8 text-indigo-600 bg-indigo-50 p-4 rounded-xl border border-indigo-100 shadow-sm">
                  <Loader2 className="w-5 h-5 animate-spin mr-3" />
                  <span className="text-sm font-medium">Designing HTML/CSS layout...</span>
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

                <div className="mt-8 pt-6 border-t border-slate-100 space-y-3">
                  {!htmlContent && (
                    <button
                      onClick={handleDesignInHtml}
                      disabled={isGenerating || isGeneratingHtml || isGeneratingImages}
                      className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      <FileText className="w-4 h-4" />
                      Design in HTML
                    </button>
                  )}

                  {htmlContent && (
                    <>
                      <button
                        onClick={() => downloadFile(htmlContent, theme || 'ebook', 'html')}
                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download HTML
                      </button>
                      <button
                        onClick={() => setHtmlContent('')}
                        className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Show Text
                      </button>
                    </>
                  )}
                  
                  <button
                    onClick={triggerImageGeneration}
                    disabled={isGenerating || isGeneratingHtml || isGeneratingImages}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Generate Images (Gemini)
                  </button>

                  <button
                    onClick={() => {
                      setEbookContent('');
                      setHtmlContent('');
                      setIsGenerating(false);
                      setIsGeneratingImages(false);
                      setIsGeneratingHtml(false);
                      setCurrentEbookId(null);
                      setChatMessages([]);
                    }}
                    className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors pt-2"
                  >
                    Start Over
                  </button>
                </div>

                {/* AI Chat for HTML Edits */}
                {htmlContent && (
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Edit Design with AI
                    </h3>
                    
                    <div className="bg-slate-50 rounded-xl border border-slate-200 flex flex-col h-64">
                      <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {chatMessages.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center mt-4">Ask the AI to change colors, fonts, layout, or anything else in the HTML design.</p>
                        ) : (
                          chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                                msg.role === 'user' 
                                  ? 'bg-indigo-600 text-white rounded-br-none' 
                                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
                              }`}>
                                {msg.content}
                              </div>
                            </div>
                          ))
                        )}
                        {isChatting && (
                          <div className="flex justify-start">
                            <div className="bg-white border border-slate-200 text-slate-700 rounded-lg rounded-bl-none px-3 py-2 text-sm flex items-center gap-2">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Updating...
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <form onSubmit={handleChatSubmit} className="p-2 border-t border-slate-200 bg-white rounded-b-xl flex gap-2 items-end">
                        <textarea
                          id="chat-input"
                          value={chatInput}
                          onChange={(e) => {
                            setChatInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleChatSubmit();
                            }
                          }}
                          rows={1}
                          placeholder="Make the title red..."
                          disabled={isChatting}
                          className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50 resize-none overflow-y-auto max-h-[120px] min-h-[38px]"
                        />
                        <button 
                          type="submit" 
                          disabled={isChatting || !chatInput.trim()}
                          className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors h-[38px] flex items-center justify-center shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
