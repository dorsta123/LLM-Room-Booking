"use client";

import { useState, useRef, useEffect } from "react";
// Importing your real backend Server Actions
import { createBooking, getBookings, getAiResponse } from "./actions";

export default function Home() {
  const [selectedRoom, setSelectedRoom] = useState("Room-101");
  const [professorName, setProfessorName] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ date: number; time: string; fullDate: string } | null>(null);
  
  // Real data state
  const [realBookings, setRealBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState([
    { role: "system", text: "Hello! I am your AI booking assistant. Please enter your name at the top right. You can click an empty slot, or just ask me to book a room for you in plain English!" }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to the bottom when new messages appear
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch real bookings whenever the selected room changes
  useEffect(() => {
    async function loadBookings() {
      const result = await getBookings(selectedRoom);
      if (result.success) {
        setRealBookings((result as any).data); // Added our TypeScript fix here
      }
    }
    loadBookings();
  }, [selectedRoom]);

  // Mocking the current week (May 2026)
  const weekDays = [
    { name: "Sun", date: 24 }, { name: "Mon", date: 25 }, { name: "Tue", date: 26 },
    { name: "Wed", date: 27 }, { name: "Thu", date: 28 }, { name: "Fri", date: 29 }, { name: "Sat", date: 30 }
  ];

  const hours = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
  ];

  // Helper to convert grid clicks to Database Time
  const formatIsoString = (date: number, timeStr: string) => {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");
    if (hours === "12") hours = "00";
    if (modifier === "PM") hours = (parseInt(hours, 10) + 12).toString();
    
    const dayPad = date < 10 ? `0${date}` : date;
    return `2026-05-${dayPad}T${hours}:${minutes}:00.000Z`;
  };

  const handleSlotClick = (date: number, dayName: string, time: string, isBooked: boolean) => {
    if (!professorName.trim()) {
      setMessages(prev => [...prev, { role: "system", text: "⚠️ Please enter your name at the top right before booking." }]);
      return;
    }

    if (isBooked) {
      setMessages(prev => [...prev, { role: "system", text: `Sorry, that slot is already taken. Please choose an empty one.` }]);
      return; 
    }

    const fullIsoDate = formatIsoString(date, time);
    setSelectedSlot({ date, time, fullDate: fullIsoDate });
    
    setMessages(prev => [
      ...prev,
      { role: "system", text: `I have penciled in ${time} on ${dayName}, May ${date} for ${selectedRoom}. Type 'confirm' to manually lock this room.` }
    ]);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = chatInput.trim();
    if (!input) return;

    // 1. Immediately show the user's message
    setMessages(prev => [...prev, { role: "user", text: input }]);
    setChatInput("");
    setIsLoading(true); // Disable input while processing

    // 2. Handle the manual "Confirm" command bypass
    if (input.toLowerCase() === "confirm" && selectedSlot) {
      setMessages(prev => [...prev, { role: "system", text: "Connecting to database to secure your room..." }]);
      
      const startDate = new Date(selectedSlot.fullDate);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); 

      // Call your backend Server Action manually
      const result = await createBooking(selectedRoom, professorName, startDate.toISOString(), endDate.toISOString());

      if (result.success) {
        setMessages(prev => [...prev, { role: "system", text: `✅ Success! Room locked. Your booking ID is ${result.bookingId}.` }]);
        // Refresh the grid to show the new red block
        const refresh = await getBookings(selectedRoom);
        if (refresh.success) setRealBookings((refresh as any).data);
        setSelectedSlot(null); 
      } else {
        setMessages(prev => [...prev, { role: "system", text: `❌ Blocked: ${result.error}` }]);
      }
      setIsLoading(false);
      return; 
    } else if (input.toLowerCase() === "confirm" && !selectedSlot) {
      setMessages(prev => [...prev, { role: "system", text: "You need to click an empty time slot on the calendar first before confirming manually!" }]);
      setIsLoading(false);
      return;
    }
    
    // 3. Handle standard chat using the Secure Server Action (Vertex AI Agent)
    try {
      setMessages(prev => [...prev, { role: "system", text: "Thinking..." }]); 
      
      // Pass the input AND the selected room context to the AI
      const aiResult = await getAiResponse(input, selectedRoom);
      
      setMessages(prev => {
        const sansLoading = prev.slice(0, -1);
        if (aiResult.success) {
           return [...sansLoading, { role: "system", text: aiResult.text as string }]; // Added TypeScript fix here
        } else {
           return [...sansLoading, { role: "system", text: `⚠️ AI Error: ${aiResult.error}` }];
        }
      });

      // ==========================================
      // THE AUTO-REFRESH TRIGGER
      // ==========================================
      // If the AI successfully booked a room, tell the UI to fetch the new data
      if (aiResult.success && (aiResult.text as string).includes("✅ Success")) {
        const refresh = await getBookings(selectedRoom);
        if (refresh.success) {
          setRealBookings((refresh as any).data);
        }
        setSelectedSlot(null); // Clear any blue highlight blocks
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

  return (
    <main className="h-screen flex flex-col bg-gray-50 font-sans">
      
      {/* ==========================================
          TOP SECTION: GOOGLE CALENDAR UI
          ========================================== */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        <div className="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200">
          
          <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white">
            <div>
              <h1 className="text-xl font-bold text-gray-900">May 2026</h1>
              <p className="text-sm text-gray-500">Live Database View</p>
            </div>
            
            <div className="flex gap-3">
              <input
                type="text"
                required
                value={professorName}
                onChange={(e) => setProfessorName(e.target.value)}
                placeholder="Enter Your Name"
                className="border border-red-300 rounded-md p-2 text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold w-40 sm:w-48 placeholder-red-400"
              />
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="border border-gray-300 rounded-md p-2 text-black bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              >
                <option value="Room-101">Room 101</option>
                <option value="Room-205">Room 205</option>
                <option value="Room-300">Room 300</option>
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
                    <div className={`text-xl mt-1 ${day.date === 24 ? "text-blue-600 font-bold" : "text-gray-900"}`}>
                      {day.date}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-8 relative">
                <div className="col-span-1 border-r border-gray-200 bg-white">
                  {hours.map((hour) => (
                    <div key={hour} className="h-16 text-right pr-3 pt-2 text-xs text-gray-400 font-medium border-b border-gray-100">
                      {hour}
                    </div>
                  ))}
                </div>

                <div className="col-span-7 grid grid-cols-7 relative">
                  {weekDays.map((day) => (
                    <div key={`col-${day.date}`} className="col-span-1 border-r border-gray-100">
                      {hours.map((hour) => {
                        const cellIso = formatIsoString(day.date, hour);
                        
                        // Check REAL database for existing bookings
                        const existingBooking = realBookings.find(b => b.startTime === cellIso);
                        const isSelected = selectedSlot?.date === day.date && selectedSlot?.time === hour;

                        return (
                          <div
                            key={`${day.date}-${hour}`}
                            onClick={() => handleSlotClick(day.date, day.name, hour, !!existingBooking)}
                            className={`h-16 border-b border-gray-100 relative transition-all
                              ${existingBooking ? "cursor-not-allowed bg-red-50/30" : "cursor-pointer hover:bg-gray-50"}
                              ${isSelected ? "bg-blue-50" : ""}
                            `}
                          >
                            {/* REAL EXISTING BOOKINGS (Red) */}
                            {existingBooking && (
                              <div className="absolute inset-0.5 bg-red-100 border border-red-200 rounded text-red-800 p-1.5 overflow-hidden flex flex-col justify-start z-0">
                                <span className="font-bold text-xs truncate">{existingBooking.professorName}</span>
                                <span className="text-[10px] font-medium opacity-75 truncate">Booked</span>
                              </div>
                            )}

                            {/* PENDING BOOKING (Blue) */}
                            {isSelected && !existingBooking && (
                              <div className="absolute inset-0.5 bg-blue-600 rounded text-white p-1.5 shadow-md animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col justify-start z-10">
                                <span className="font-bold text-xs truncate">{professorName || "You"}</span>
                                <span className="text-[10px] font-medium opacity-90 truncate">{hour}</span>
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

      {/* ==========================================
          BOTTOM SECTION: CHAT INTERFACE
          ========================================== */}
      <div className="h-1/3 min-h-[220px] bg-white border-t border-gray-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] flex flex-col z-20">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          <div className="max-w-6xl mx-auto w-full space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] sm:max-w-[70%] text-sm sm:text-base ${
                  msg.role === "user" 
                    ? "bg-blue-600 text-white rounded-br-none shadow-sm" 
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm font-medium"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
        <div className="p-4 bg-white border-t border-gray-100">
          <form onSubmit={handleSendMessage} className="max-w-6xl mx-auto w-full flex gap-2 sm:gap-3">
            <input
              type="text"
              disabled={isLoading}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask the AI to book a room, or type 'confirm' to lock a selected slot..."
              className="flex-1 border border-gray-300 rounded-full px-4 sm:px-6 py-2 sm:py-3 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm sm:text-base disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={isLoading}
              className={`text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full font-semibold transition-colors shadow-sm text-sm sm:text-base ${
                isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isLoading ? "..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}