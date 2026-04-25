import React, { useState, useEffect, useRef } from 'react';
import { sendChat } from '../services/geminiClient';

type Message = { role: 'user' | 'assistant' | 'system'; text: string };

interface ChatbotProps {
  name?: string;
}

const Chatbot: React.FC<ChatbotProps> = ({ name }) => {
  // Default name set to the user's requested label
  const assistantName = name || ((import.meta as any).env?.VITE_CHATBOT_NAME as string) || 'Any help?';
  const avatarUrl = ((import.meta as any).env?.VITE_CHATBOT_AVATAR_URL as string) || '/chatbot.jpg';
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', text: `${assistantName} is helpful assistant for recipes, ingredients and cooking tips.` }
  ]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // auto-focus input when opening
    const el = boxRef.current?.querySelector('input') as HTMLInputElement | null;
    if (el) el.focus();
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const resp = await sendChat([...messages, userMsg]);
      const reply = (resp && resp.reply) ? resp.reply : 'Sorry, I could not get a response.';
      const assistantMsg: Message = { role: 'assistant', text: reply };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const errMsg: Message = { role: 'assistant', text: 'Error: failed to get reply.' };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="fixed bottom-6 right-6 z-50">
        {open && (
          <div ref={boxRef} className="w-80 md:w-[420px] rounded-xl shadow-2xl border border-stone-100 overflow-hidden flex flex-col" style={{ backgroundColor: '#FFEFD5' }}>
            <div className="px-3 py-2 bg-gradient-to-r from-green-600 to-teal-500 text-white font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <img src={avatarUrl} alt="assistant" className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="text-sm font-semibold">{assistantName}</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/90 hover:text-white">✕</button>
            </div>
            <div className="px-3 py-2 flex-1 overflow-y-auto max-h-72 space-y-2">
              {messages.filter(m => m.role !== 'system').map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-green-600 text-white' : 'bg-stone-100 text-stone-800'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && <div className="text-sm text-stone-500">Thinking...</div>}
            </div>
            <div className="p-3 border-t border-stone-100 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                  placeholder="Ask me about recipes..."
                  className="flex-1 px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <button onClick={send} disabled={loading} className="bg-green-600 text-white px-3 py-2 rounded-lg disabled:opacity-60">
                Send
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setOpen(v => !v)}
          className="w-14 h-14 rounded-full bg-green-600 text-white shadow-xl flex items-center justify-center hover:bg-green-700 transition"
          aria-label="Open chat"
        >
          💬
        </button>
      </div>
    </div>
  );
};

export default Chatbot;
