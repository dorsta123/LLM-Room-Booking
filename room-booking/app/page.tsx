"use client";

import { useState, useRef, useEffect } from "react";
import { createBooking, getBookings, deleteBookingById, getAiResponse } from "./actions";

const ALL_ROOMS = [
  "Study-1A", "Study-1B", "Study-2A", "Study-2B",
  "Conf-Alpha", "Conf-Beta", "Conf-Gamma", "Conf-Delta",
  "Class-101", "Class-102", "Class-201", "Class-202", "Class-301",
  "CompLab-1", "BioLab-A", "ChemLab-B",
  "Lecture-Hall-A", "Lecture-Hall-B", "Auditorium-Main", "Auditorium-North"
];

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginInput, setLoginInput] = useState("");
  const [professorName, setProfessorName] = useState("");

  const [selectedRoom, setSelectedRoom] = useState("Class-101");
  const [chatInput, setChatInput] = useState("");
  
  const [pendingAction, setPendingAction] = useState<{ type: 'book' | 'cancel', slotId?: string, fullDate?: string, time?: string, date?: number } | null>(null);
  
  const [realBookings, setRealBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isLoggedIn) return; 
    async function loadBookings() {
      const result = await getBookings(selectedRoom);
      if (result.success) setRealBookings((result as any).data);
    }
    loadBookings();
  }, [selectedRoom, isLoggedIn]);

  const weekDays = [
    { name: "Sun", date: 24 }, { name: "Mon", date: 25 }, { name: "Tue", date: 26 },
    { name: "Wed", date: 27 }, { name: "Thu", date: 28 }, { name: "Fri", date: 29 }, { name: "Sat", date: 30 }
  ];

  const hours = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"];

  const formatIsoString = (date: number, timeStr: string) => {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");
    if (hours === "12") hours = "00";
    if (modifier === "PM") hours = (parseInt(hours, 10) + 12).toString();
    const dayPad = date < 10 ? `0${date}` : date;
    return `2026-05-${dayPad}T${hours}:${minutes}:00.000Z`;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = loginInput.trim();
    if (!name) return;
    setProfessorName(name);
    setIsLoggedIn(true);
    setMessages([
      { role: "system", text: `Welcome to the faculty portal, **${name}**. I am your smart booking agent. You can ask me to book a room, check availability, or cancel an existing reservation.` }
    ]);
  };

  const handleSlotClick = (date: number, dayName: string, time: string, existingBooking: any) => {
    const fullIsoDate = formatIsoString(date, time);
    
    if (existingBooking) {
      if (existingBooking.professorName === professorName) {
        setPendingAction({ type: 'cancel', slotId: existingBooking.id, time, date, fullDate: fullIsoDate });
      } else {
        setMessages(prev => [...prev, { role: "system", text: `Sorry, that slot is already taken by ${existingBooking.professorName}.` }]);
      }
    } else {
      setPendingAction({ type: 'book', time, date, fullDate: fullIsoDate });
    }
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;
    setIsLoading(true);

    if (pendingAction.type === 'book') {
        const startDate = new Date(pendingAction.fullDate!);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        const result = await createBooking(selectedRoom, professorName, startDate.toISOString(), endDate.toISOString());
        if (result.success) setMessages(prev => [...prev, { role: "system", text: `✅ Success! You locked in ${selectedRoom} via the interface.` }]);
        else setMessages(prev => [...prev, { role: "system", text: `❌ Blocked: ${(result as any).error}` }]);
    } 
    else if (pendingAction.type === 'cancel') {
        const result = await deleteBookingById(pendingAction.slotId!);
        if (result.success) setMessages(prev => [...prev, { role: "system", text: `✅ Booking successfully canceled via the interface.` }]);
        else setMessages(prev => [...prev, { role: "system", text: `❌ Could not cancel: ${(result as any).error}` }]);
    }

    const refresh = await getBookings(selectedRoom);
    if (refresh.success) setRealBookings((refresh as any).data);
    setPendingAction(null);
    setIsLoading(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = chatInput.trim();
    if (!input) return;

    const newHistory = [...messages, { role: "user", text: input }];
    setMessages(newHistory);
    setChatInput("");
    setIsLoading(true);
    setPendingAction(null);

    try {
      setMessages(prev => [...prev, { role: "system", text: "Thinking..." }]); 
      
      const aiResult = await getAiResponse(newHistory, selectedRoom, professorName);
      
      setMessages(prev => {
        const sansLoading = prev.slice(0, -1);
        if (aiResult.success) return [...sansLoading, { role: "system", text: aiResult.text as string }];
        else return [...sansLoading, { role: "system", text: `⚠️ AI Error: ${aiResult.error}` }];
      });

      const refreshRoomId = (aiResult as any).refreshRoom;
      
      if (aiResult.success) {
        if (refreshRoomId) {
          if (refreshRoomId !== selectedRoom) {
            setSelectedRoom(refreshRoomId); 
          } else {
            const refresh = await getBookings(selectedRoom);
            if (refresh.success) setRealBookings((refresh as any).data);
          }
        } else {
          const refresh = await getBookings(selectedRoom);
          if (refresh.success) setRealBookings((refresh as any).data);
        }
      }
    } catch (error: any) {
      setMessages(prev => {
        const sansLoading = prev.slice(0, -1);
        return [...sansLoading, { role: "system", text: "⚠️ Network Error reaching the AI server." }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <main className="h-screen flex items-center justify-center bg-gray-50 font-sans p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto text-2xl mb-4">🎓</div>
            <h1 className="text-2xl font-bold text-gray-900">University Portal</h1>
            <p className="text-gray-500 text-sm">Please identify yourself to access the AI booking system.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name / Title</label>
              <input id="name" type="text" required autoFocus value={loginInput} onChange={(e) => setLoginInput(e.target.value)} placeholder="e.g., Dr. Jane Smith" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 transition-all"/>
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-md hover:shadow-lg">Secure Login</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-gray-50 font-sans">
      
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`max-w-md w-full rounded-2xl shadow-2xl border ${pendingAction.type === 'book' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'} p-8 space-y-6 animate-in zoom-in-95 duration-300`}>
            <div className="text-center space-y-3">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto text-4xl mb-6 shadow-md ${pendingAction.type === 'book' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                {pendingAction.type === 'book' ? "✅" : "🗑️"}
              </div>
              <h2 className={`text-3xl font-extrabold ${pendingAction.type === 'book' ? 'text-blue-950' : 'text-red-950'}`}>
                {pendingAction.type === 'book' ? "Confirm Booking" : "Confirm Deletion"}
              </h2>
              <p className={`text-base font-medium leading-relaxed ${pendingAction.type === 'book' ? 'text-blue-900' : 'text-red-900'}`}>
                You are about to {pendingAction.type === 'book' ? "reserve" : "delete the reservation for"} 
                <span className="block mt-1 font-extrabold text-xl"><strong>{selectedRoom}</strong></span>
                on <span className="font-extrabold">May {pendingAction.date}</span> at <span className="font-extrabold">{pendingAction.time}</span>.
              </p>
            </div>
            
            <div className="flex gap-4 pt-4">
              <button onClick={() => setPendingAction(null)} className="flex-1 px-6 py-4 text-base font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors shadow-sm">Cancel</button>
              <button onClick={executePendingAction} disabled={isLoading} className={`flex-1 px-6 py-4 text-base font-bold text-white rounded-xl transition-all shadow-md hover:shadow-lg ${isLoading ? 'bg-gray-400 cursor-not-allowed' : (pendingAction.type === 'book' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700')}`}>
                {isLoading ? "Processing..." : (pendingAction.type === 'book' ? 'Book Room' : 'Delete Booking')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        <div className="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
          
          <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white">
            <div>
              <h1 className="text-xl font-bold text-gray-900">May 2026</h1>
              <p className="text-sm text-gray-500">Live Database View</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-sm font-semibold text-gray-700">{professorName}</span>
              </div>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="border border-gray-300 rounded-lg p-2 text-black bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium shadow-sm hover:border-gray-400 cursor-pointer transition-all"
              >
                {ALL_ROOMS.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto relative bg-white">
            <div className="min-w-[700px]"> 
              <div className="sticky top-0 z-10 bg-white grid grid-cols-8 border-b border-gray-200 shadow-sm">
                <div className="col-span-1 p-3"></div>
                {weekDays.map((day) => (
                  <div key={day.date} className="col-span-1 p-3 text-center border-l border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 uppercase">{day.name}</div>
                    <div className={`text-xl mt-1 ${day.date === 24 ? "text-blue-600 font-bold" : "text-gray-900"}`}>{day.date}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-8 relative">
                <div className="col-span-1 border-r border-gray-200 bg-white">
                  {hours.map((hour) => (
                    <div key={hour} className="h-16 text-right pr-3 pt-2 text-xs text-gray-400 font-medium border-b border-gray-100">{hour}</div>
                  ))}
                </div>

                <div className="col-span-7 grid grid-cols-7 relative">
                  {weekDays.map((day) => (
                    <div key={`col-${day.date}`} className="col-span-1 border-r border-gray-100">
                      {hours.map((hour) => {
                        const cellIso = formatIsoString(day.date, hour);
                        
                        const existingBooking = realBookings.find(b => {
                           if (!b.startTime) return false;
                           return new Date(b.startTime).getTime() === new Date(cellIso).getTime();
                        });
                        
                        const isSelected = pendingAction?.date === day.date && pendingAction?.time === hour;

                        return (
                          <div
                            key={`${day.date}-${hour}`}
                            onClick={() => handleSlotClick(day.date, day.name, hour, existingBooking)}
                            className={`h-16 border-b border-gray-100 relative transition-all 
                              ${existingBooking ? (existingBooking.professorName === professorName ? "cursor-pointer bg-blue-50 hover:bg-blue-100" : "cursor-not-allowed bg-red-50/80") : "cursor-pointer hover:bg-blue-50"} 
                              ${isSelected ? "ring-2 ring-inset ring-blue-500" : ""}`}
                          >
                            {existingBooking && (
                              <div className={`absolute inset-0.5 rounded p-1.5 overflow-hidden flex flex-col justify-start z-0 ${existingBooking.professorName === professorName ? "bg-blue-100 border border-blue-200 text-blue-900" : "bg-red-100 border border-red-200 text-red-900"}`}>
                                <span className="font-bold text-xs truncate">{existingBooking.professorName}</span>
                                <span className="text-[10px] font-medium opacity-75 truncate">{existingBooking.professorName === professorName ? "Your Booking" : "Unavailable"}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-1/3 min-h-[220px] bg-white border-t border-gray-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col z-20 relative">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 relative">
          <div className="max-w-6xl mx-auto w-full space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-3 rounded-2xl max-w-[85%] sm:max-w-[70%] text-sm sm:text-base whitespace-pre-wrap ${
                  msg.role === "user" ? "bg-blue-600 text-white rounded-br-sm shadow-md" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm font-medium leading-relaxed"
                }`}>
                  <span dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
        
        <div className="p-4 bg-white border-t border-gray-100 z-10">
          <form onSubmit={handleSendMessage} className="max-w-6xl mx-auto w-full flex gap-2 sm:gap-3">
            <input type="text" disabled={isLoading} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message your AI assistant..." className="flex-1 border border-gray-300 rounded-full px-6 py-3.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm sm:text-base disabled:bg-gray-100 transition-all shadow-inner"/>
            <button type="submit" disabled={isLoading} className={`text-white px-8 py-3.5 rounded-full font-semibold transition-all text-sm sm:text-base shadow-md ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5"}`}>{isLoading ? "Sending..." : "Send"}</button>
          </form>
        </div>
      </div>
    </main>
  );
}