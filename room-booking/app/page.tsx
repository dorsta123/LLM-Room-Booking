"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [selectedRoom, setSelectedRoom] = useState("Room-101");
  // NEW: Track the name of the person making the booking
  const [professorName, setProfessorName] = useState("Dr. Smith");
  const [chatInput, setChatInput] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<{ date: number; time: string } | null>(null);

  const [messages, setMessages] = useState([
    { role: "system", text: "Hello! I am your booking assistant. Click an empty slot to block a time." }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mocking the current week
  const weekDays = [
    { name: "Sun", date: 24 }, { name: "Mon", date: 25 }, { name: "Tue", date: 26 },
    { name: "Wed", date: 27 }, { name: "Thu", date: 28 }, { name: "Fri", date: 29 }, { name: "Sat", date: 30 }
  ];

  const hours = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
  ];

  // NEW: Hard-coded existing bookings so we can see other professors on the grid
  const existingBookings = [
    { date: 26, time: "10:00 AM", professor: "Dr. Sharma" },
    { date: 26, time: "11:00 AM", professor: "Dr. Sharma" },
    { date: 27, time: "02:00 PM", professor: "Dr. Patel" },
    { date: 29, time: "09:00 AM", professor: "Dr. Lee" },
  ];

  const handleSlotClick = (date: number, dayName: string, time: string, isBooked: boolean) => {
    if (isBooked) {
      setMessages((prev) => [
        ...prev,
        { role: "system", text: `Sorry, that slot is already booked. Please choose an empty time slot.` }
      ]);
      return; // Stop them from clicking an already booked slot!
    }

    setSelectedSlot({ date, time });
    setMessages((prev) => [
      ...prev,
      { role: "system", text: `I see you (${professorName || 'User'}) blocked out ${time} on ${dayName}, May ${date}. Type 'confirm' to book it!` }
    ]);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setMessages([...messages, { role: "user", text: chatInput }]);
    setChatInput("");

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Processing your request now..." }
      ]);
    }, 1000);
  };

  return (
    <main className="h-screen flex flex-col bg-gray-50 font-sans">
      
      {/* ==========================================
          TOP SECTION: GOOGLE CALENDAR UI
          ========================================== */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        <div className="max-w-6xl mx-auto w-full h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200">
          
          {/* Header & Selectors */}
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <div>
              <h1 className="text-xl font-bold text-gray-900">May 2026</h1>
              <p className="text-sm text-gray-500">Weekly View</p>
            </div>
            
            {/* NEW: Added Professor Name Input alongside the Room Selector */}
            <div className="flex gap-3">
              <input
                type="text"
                value={professorName}
                onChange={(e) => setProfessorName(e.target.value)}
                placeholder="Your Name"
                className="border border-gray-300 rounded-md p-2 text-black bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium w-32 sm:w-48"
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

          {/* The Calendar Grid */}
          <div className="flex-1 overflow-y-auto relative">
            <div className="min-w-[700px]"> 
              
              {/* Day Headers */}
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

              {/* Time Slots Grid */}
              <div className="grid grid-cols-8 relative">
                
                {/* Time Axis */}
                <div className="col-span-1 border-r border-gray-200 bg-white">
                  {hours.map((hour) => (
                    <div key={hour} className="h-16 text-right pr-3 pt-2 text-xs text-gray-400 font-medium border-b border-gray-100">
                      {hour}
                    </div>
                  ))}
                </div>

                {/* The Clickable Grid */}
                <div className="col-span-7 grid grid-cols-7 relative">
                  {weekDays.map((day) => (
                    <div key={`col-${day.date}`} className="col-span-1 border-r border-gray-100">
                      {hours.map((hour) => {
                        // Check if this slot is already booked by someone else
                        const existingBooking = existingBookings.find(b => b.date === day.date && b.time === hour);
                        // Check if this is the slot the user just clicked
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
                            {/* RENDER EXISTING BOOKING CARD */}
                            {existingBooking && (
                              <div className="absolute inset-0.5 bg-red-100 border border-red-200 rounded text-red-800 p-1.5 overflow-hidden flex flex-col justify-start z-0">
                                <span className="font-bold text-xs truncate">{existingBooking.professor}</span>
                                <span className="text-[10px] font-medium opacity-75 truncate">Booked</span>
                              </div>
                            )}

                            {/* RENDER NEW DRAFT CARD */}
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
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Confirm booking, or ask for a different room..."
              className="flex-1 border border-gray-300 rounded-full px-4 sm:px-6 py-2 sm:py-3 text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm sm:text-base"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-sm text-sm sm:text-base"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}