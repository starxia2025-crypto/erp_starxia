import { useEffect, useState, useRef } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AIAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchChatHistory = async () => {
    try {
      const response = await axios.get(`${API}/ai/chat-history`, { withCredentials: true });
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching chat history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Add user message optimistically
    setMessages(prev => [...prev, {
      message_id: `temp_${Date.now()}`,
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString()
    }]);

    setLoading(true);
    try {
      const response = await axios.post(`${API}/ai/chat`, { message: userMessage }, { withCredentials: true });
      
      // Add assistant response
      setMessages(prev => [...prev, {
        message_id: response.data.message_id || `resp_${Date.now()}`,
        role: "assistant",
        content: response.data.response,
        created_at: new Date().toISOString()
      }]);
    } catch (error) {
      toast.error("Error al comunicarse con el asistente");
      // Remove optimistic message on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm("¿Estás seguro de eliminar todo el historial de chat?")) {
      try {
        await axios.delete(`${API}/ai/chat-history`, { withCredentials: true });
        setMessages([]);
        toast.success("Historial eliminado");
      } catch (error) {
        toast.error("Error al eliminar historial");
      }
    }
  };

  const suggestedQuestions = [
    "¿Cuántos clientes tengo registrados?",
    "Muéstrame las facturas pendientes",
    "¿Cuáles son mis productos más vendidos?",
    "Busca al cliente con email ejemplo@mail.com"
  ];

  return (
    <Layout title="Asistente IA">
      <div className="h-[calc(100vh-180px)] flex flex-col" data-testid="ai-assistant-page">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="border-b flex-row items-center justify-between py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="w-5 h-5 text-primary" />
              Asistente CRM
            </CardTitle>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearHistory} data-testid="clear-chat-btn">
                <Trash2 className="w-4 h-4 mr-2" />
                Limpiar
              </Button>
            )}
          </CardHeader>
          
          <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-4">
              {historyLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">¡Hola! Soy tu asistente CRM</h3>
                  <p className="text-muted-foreground text-sm mb-6 max-w-md">
                    Puedo ayudarte a buscar clientes, facturas, productos y más. 
                    También puedo darte información sobre el estado de tu negocio.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {suggestedQuestions.map((question, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setInput(question)}
                        data-testid={`suggested-${index}`}
                      >
                        {question}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.message_id}
                      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {message.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "user" && (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                      <div className="bg-muted p-3 rounded-lg">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }}></div>
                          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  disabled={loading}
                  className="flex-1"
                  data-testid="chat-input"
                />
                <Button type="submit" disabled={loading || !input.trim()} data-testid="send-message-btn">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AIAssistant;
