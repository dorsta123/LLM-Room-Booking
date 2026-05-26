"use client";

import { useState, useRef, useEffect } from "react";
import { createBooking, getBookings, getAiResponse } from "./actions";

const ALL_ROOMS = [
  "Study-1A", "Study-1B", "Study-2A", "Study-2B",
  "Conf-Alpha", "Conf-Beta", "Conf-Gamma", "Conf-Delta",
  "Class-101", "Class-102", "Class-201", "Class-202", "Class-301",
  "CompLab-1", "BioLab-A", "ChemLab-B",
  "Lecture-Hall-A", "Lecture-Hall-B", "Auditorium-Main", "Auditorium-North"
];

export default function Home() {
  const [selectedRoom, setSelectedRoom] = useState("Class-101");
  const [professorName, setProfessorName] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ date: number; time: string; fullDate: string } | null>(null);
  const [realBookings, setRealBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState([
    { role: "system", text: "Hello! I am your smart booking agent. You can ask me things like 'Book a room for 15 people with Zoom for tomorrow at 2PM' or 'How many labs do we have?'" }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    async function loadBookings() {
      const result = await getBookings(selectedRoom);
      if (result.success) setRealBookings((result as any).data);
    }
    loadBookings();
  }, [selectedRoom]);

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

  const handleSlotClick = (date: number, dayName: string, time: string, isBooked: boolean) => {
    if (!professorName.trim()) {
      setMessages(prev => [...prev, { role: "system", text: "⚠️ Please enter your name at the top right before booking." }]);
      return;
    }
    if (isBooked) {
      setMessages(prev => [...prev, { role: "system", text: `Sorry, that slot is already taken.` }]);
      return; 
    }
    const fullIsoDate = formatIsoString(date, time);
    setSelectedSlot({ date, time, fullDate: fullIsoDate });
    setMessages(prev => [...prev, { role: "system", text: `Penciled in ${time} on May ${date} for ${selectedRoom}. Type 'confirm' to manually lock.` }]);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = chatInput.trim();
    if (!input) return;

    const newHistory = [...messages, { role: "user", text: input }];
    setMessages(newHistory);
    setChatInput("");
    setIsLoading(true);

    // Manual Confirm Override
    if (input.toLowerCase() === "confirm" && selectedSlot) {
      setMessages(prev => [...prev, { role: "system", text: "Connecting to database..." }]);
      const startDate = new Date(selectedSlot.fullDate);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); 
      const result = await createBooking(selectedRoom, professorName, startDate.toISOString(), endDate.toISOString());

      if (result.success) {
        setMessages(prev => [...prev, { role: "system", text: `✅ Success! Room locked. ID: ${result.bookingId}.` }]);
        const refresh = await getBookings(selectedRoom);
        if (refresh.success) setRealBookings((refresh as any).data);
        setSelectedSlot(null); 
      } else {
        setMessages(prev => [...prev, { role: "system", text: `❌ Blocked: ${result.error}` }]);
      }
      setIsLoading(false);
      return; 
    }
    
    // AI Agent Flow
    try {
      setMessages(prev => [...prev, { role: "system", text: "Thinking..." }]); 
      
      const aiResult = await getAiResponse(newHistory, selectedRoom);
      
      setMessages(prev => {
        const sansLoading = prev.slice(0, -1);
        if (aiResult.success) {
           return [...sansLoading, { role: "system", text: aiResult.text as string }];
        } else {
           return [...sansLoading, { role: "system", text: `⚠️ AI Error: ${aiResult.error}` }];
        }
      });

      // ==========================================
      // UI AUTO-SYNC LOGIC (Fixed for V3 Backend)
      // ==========================================
      const bookedRoomId = (aiResult as any).bookedRoom;
      
      if (aiResult.success && bookedRoomId) {
        if (bookedRoomId !== selectedRoom) {
          // Switching the dropdown automatically triggers the useEffect to fetch new data
          setSelectedRoom(bookedRoomId); 
        } else {
          // If we are already looking at the correct room, force a manual refresh
          const refresh = await getBookings(selectedRoom);
          if (refresh.success) setRealBookings((refresh as any).data);
        }
        setSelectedSlot(null); 
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
                value={professorName}
                onChange={(e) => setProfessorName(e.target.value)}
                placeholder="Enter Your Name"
                className="border border-red-300 rounded-md p-2 text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold w-40 placeholder-red-400"
              />
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="border border-gray-300 rounded-md p-2 text-black bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
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
                        
                        const isSelected = selectedSlot?.date === day.date && selectedSlot?.time === hour;

                        return (
                          <div
                            key={`${day.date}-${hour}`}
                            onClick={() => handleSlotClick(day.date, day.name, hour, !!existingBooking)}
                            className={`h-16 border-b border-gray-100 relative transition-all ${existingBooking ? "cursor-not-allowed bg-red-50/30" : "cursor-pointer hover:bg-gray-50"} ${isSelected ? "bg-blue-50" : ""}`}
                          >
                            {existingBooking && (
                              <div className="absolute inset-0.5 bg-red-100 border border-red-200 rounded text-red-800 p-1.5 overflow-hidden flex flex-col justify-start z-0">
                                <span className="font-bold text-xs truncate">{existingBooking.professorName}</span>
                                <span className="text-[10px] font-medium opacity-75 truncate">Booked</span>
                              </div>
                            )}
                            {isSelected && !existingBooking && (
                              <div className="absolute inset-0.5 bg-blue-600 rounded text-white p-1.5 shadow-md overflow-hidden flex flex-col justify-start z-10">
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

      <div className="h-1/3 min-h-[220px] bg-white border-t border-gray-200 shadow-sm flex flex-col z-20">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          <div className="max-w-6xl mx-auto w-full space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] sm:max-w-[70%] text-sm sm:text-base ${msg.role === "user" ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-gray-200 text-gray-800 rounded-bl-none font-medium"}`}>
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
              placeholder="Ask the AI to book a room..."
              className="flex-1 border border-gray-300 rounded-full px-4 sm:px-6 py-2 sm:py-3 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm sm:text-base disabled:bg-gray-100"
            />
            <button type="submit" disabled={isLoading} className={`text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full font-semibold transition-colors text-sm sm:text-base ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
              {isLoading ? "..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}