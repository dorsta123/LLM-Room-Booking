"use server";

import { VertexAI, FunctionDeclaration, FunctionDeclarationSchemaType } from "@google-cloud/vertexai";
import { db } from "./lib/firebase"; 
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { revalidatePath } from "next/cache"; 

// ==========================================
// THE SMART ROOM DIRECTORY (20 Rooms)
// ==========================================
const ROOM_DIRECTORY = [
  { id: "Study-1A", capacity: 4, hasAc: true, projectors: 0, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Study Room", floor: 1 },
  { id: "Study-1B", capacity: 6, hasAc: true, projectors: 0, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Study Room", floor: 1 },
  { id: "Study-2A", capacity: 8, hasAc: false, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: false, roomType: "Study Room", floor: 2 },
  { id: "Study-2B", capacity: 10, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: true, isAccessible: true, roomType: "Study Room", floor: 2 },
  { id: "Conf-Alpha", capacity: 12, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: true, isAccessible: true, roomType: "Conference Room", floor: 3 },
  { id: "Conf-Beta", capacity: 15, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: true, isAccessible: true, roomType: "Conference Room", floor: 3 },
  { id: "Conf-Gamma", capacity: 20, hasAc: true, projectors: 2, hasWhiteboard: true, hasVideoConf: true, isAccessible: false, roomType: "Conference Room", floor: 3 },
  { id: "Conf-Delta", capacity: 25, hasAc: true, projectors: 1, hasWhiteboard: false, hasVideoConf: false, isAccessible: true, roomType: "Conference Room", floor: 4 },
  { id: "Class-101", capacity: 30, hasAc: false, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Classroom", floor: 1 },
  { id: "Class-102", capacity: 30, hasAc: false, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Classroom", floor: 1 },
  { id: "Class-201", capacity: 40, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: false, roomType: "Classroom", floor: 2 },
  { id: "Class-202", capacity: 45, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Classroom", floor: 2 },
  { id: "Class-301", capacity: 60, hasAc: true, projectors: 2, hasWhiteboard: true, hasVideoConf: true, isAccessible: true, roomType: "Classroom", floor: 3 },
  { id: "CompLab-1", capacity: 30, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Computer Lab", floor: 1 },
  { id: "BioLab-A", capacity: 25, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: true, roomType: "Science Lab", floor: 2 },
  { id: "ChemLab-B", capacity: 25, hasAc: true, projectors: 1, hasWhiteboard: true, hasVideoConf: false, isAccessible: false, roomType: "Science Lab", floor: 2 },
  { id: "Lecture-Hall-A", capacity: 100, hasAc: true, projectors: 2, hasWhiteboard: true, hasVideoConf: true, isAccessible: true, roomType: "Lecture Hall", floor: 1 },
  { id: "Lecture-Hall-B", capacity: 150, hasAc: true, projectors: 3, hasWhiteboard: true, hasVideoConf: true, isAccessible: true, roomType: "Lecture Hall", floor: 1 },
  { id: "Auditorium-Main", capacity: 300, hasAc: true, projectors: 4, hasWhiteboard: false, hasVideoConf: true, isAccessible: true, roomType: "Auditorium", floor: 1 },
  { id: "Auditorium-North", capacity: 250, hasAc: true, projectors: 3, hasWhiteboard: false, hasVideoConf: true, isAccessible: true, roomType: "Auditorium", floor: 2 }
];
const VALID_ROOM_NAMES = ROOM_DIRECTORY.map(r => r.id).join(", ");

// ==========================================
// DATABASE FUNCTIONS 
// ==========================================
export async function createBooking(roomId: string, professorName: string, startIso: string, endIso: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("roomId", "==", roomId), where("startIso", "==", startIso));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) return { success: false, error: "Slot already taken." };

    const docRef = await addDoc(bookingsRef, { roomId, professorName, startIso, endIso, createdAt: new Date().toISOString() });
    revalidatePath("/");
    return { success: true, bookingId: docRef.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getBookings(roomId: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("roomId", "==", roomId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), startTime: doc.data().startIso }));
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==========================================
// VERTEX AI SMART AGENT (V3)
// ==========================================
export async function getAiResponse(chatHistory: { role: string, text: string }[], roomContext: string) {
  try {
    const vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT as string, location: "us-central1" });

    // EVAL 14 & FREE SLOTS: Upgrade Discovery Tool with Intention Tracking
    const checkAvailabilityTool: FunctionDeclaration = {
      name: "checkAvailability",
      description: "Searches directory to COUNT rooms, CHECK free slots, or LIST options. DOES NOT BOOK.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          intent: { type: FunctionDeclarationSchemaType.STRING, description: "Must be 'count' (how many total), 'slots' (how many free slots), or 'search' (finding a room to book)" },
          checkDate: { type: FunctionDeclarationSchemaType.STRING, description: "Specific date to check for free slots (YYYY-MM-DD) (optional)" },
          startIso: { type: FunctionDeclarationSchemaType.STRING, description: "Specific start time (optional)" },
          roomId: { type: FunctionDeclarationSchemaType.STRING, description: "Specific room ID (optional)" },
          minCapacity: { type: FunctionDeclarationSchemaType.INTEGER, description: "Minimum capacity needed (optional)" },
          needsAc: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must have AC? (optional)" },
          minProjectors: { type: FunctionDeclarationSchemaType.INTEGER, description: "Minimum projectors (optional)" },
          needsWhiteboard: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must have whiteboard? (optional)" },
          needsVideoConf: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must have video conferencing? (optional)" },
          needsAccessible: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must be wheelchair accessible? (optional)" },
          roomType: { type: FunctionDeclarationSchemaType.STRING, description: "Specific type (e.g., 'Science Lab') (optional)" },
          floor: { type: FunctionDeclarationSchemaType.INTEGER, description: "Specific floor number (optional)" } 
        },
        required: ["intent"] 
      }
    };

    // EVAL 18: Upgrade Book Tool to accept Arrays (Batch Processing)
    const bookRoomTool: FunctionDeclaration = {
      name: "bookRoom",
      description: "Finalizes the transaction and BOOKS ONE OR MULTIPLE rooms.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          bookings: {
            type: FunctionDeclarationSchemaType.ARRAY,
            description: "List of rooms to book. Pass multiple items if user asks for bulk booking.",
            items: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                roomId: { type: FunctionDeclarationSchemaType.STRING, description: "EXACT ID of room" },
                professorName: { type: FunctionDeclarationSchemaType.STRING, description: "Professor's name" },
                startIso: { type: FunctionDeclarationSchemaType.STRING, description: "Start time (YYYY-MM-DDTHH:MM:00.000Z)" },
                endIso: { type: FunctionDeclarationSchemaType.STRING, description: "End time (one hour after start)" }
              },
              required: ["roomId", "professorName", "startIso", "endIso"]
            }
          }
        },
        required: ["bookings"] 
      }
    };

    // EVAL 6: Complex Time Anchor (The Weekly Calendar Map)
    const temporalAnchor = `
      Today is Monday, May 25, 2026. 
      Calendar Mapping: Mon=May 25, Tue=May 26, Wed=May 27, Thu=May 28, Fri=May 29, Sat=May 30.
      All bookings happen on the hour between 09:00 AM and 05:00 PM (9 total slots per day).
    `;

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ functionDeclarations: [checkAvailabilityTool, bookRoomTool] }], 
      systemInstruction: {
        parts: [{ 
            text: `You are an elite university room booking agent. STRICT RULES:
                   0. TIME MATTERS: ${temporalAnchor} Calculate exact ISO strings using this mapping.
                   1. DISCOVERY: If asking "how many rooms", use checkAvailability with intent='count'. If asking "how many slots are free", use intent='slots' and pass the checkDate (YYYY-MM-DD). Otherwise use intent='search'.
                   2. BATCH BOOKING: If user wants multiple rooms (e.g. "Book Study-1A and 1B"), put BOTH in the 'bookings' array in the bookRoom tool.
                   3. AUTO-CORRECT: Fuzzy match to valid IDs: ${VALID_ROOM_NAMES}.` 
        }]
      }
    });

    const formattedHistory = chatHistory
      .filter(msg => msg.text !== "Thinking...") 
      .map(msg => ({ role: msg.role === "user" ? "user" : "model", parts: [{ text: msg.text }] }));
    
    const request = { contents: formattedHistory };
    const result = await model.generateContent(request);
    const response = result.response;
    const call = response.candidates?.[0]?.content?.parts?.find(part => part.functionCall)?.functionCall;

    // ==========================================
    // LOGIC SWITCHBOARD
    // ==========================================
    if (call) {
      if (call.name === "checkAvailability") {
        const { 
          intent, checkDate = null, startIso = null, roomId = null, minCapacity = 0, needsAc = false, 
          minProjectors = 0, needsWhiteboard = false, needsVideoConf = false, needsAccessible = false, 
          roomType = null, floor = null
        } = call.args as any;

        // Same Scoring Engine as before...
        const scoredRooms = ROOM_DIRECTORY.map(room => {
          let score = 100;
          if (roomId) {
            if (room.id.toLowerCase() === roomId.toLowerCase()) score += 200; else score -= 150; 
          }
          if (needsAc && !room.hasAc) score -= 40;
          if (needsVideoConf && !room.hasVideoConf) score -= 40;
          if (needsWhiteboard && !room.hasWhiteboard) score -= 40;
          if (needsAccessible && !room.isAccessible) score -= 80; 
          if (roomType && !room.roomType.toLowerCase().includes(roomType.toLowerCase())) score -= 40;
          if (floor && room.floor !== floor) score -= 40;
          if (minProjectors > room.projectors) score -= 20;
          if (minCapacity > 0) {
            if (room.capacity < minCapacity) score -= (minCapacity - room.capacity) * 2; 
            else score -= (room.capacity - minCapacity) * 0.1; 
          }
          return { ...room, score };
        });

        const topMatches = scoredRooms.sort((a, b) => b.score - a.score).filter(room => room.score > 0).slice(0, 3);

        if (topMatches.length === 0) return { success: true, text: "I couldn't find anything that matches that criteria." };

        // EVAL 14 FIX: Pure Aggregation
        if (intent === "count") {
          return { success: true, text: `We currently have ${topMatches.length} rooms in our facility that match your specific requirements.` };
        }

        // NEW FREE SLOTS FIX: Daily Math
        if (intent === "slots" && checkDate) {
           let slotReport = [];
           const bookingsRef = collection(db, "bookings");
           
           for (const room of topMatches) {
               const q = query(bookingsRef, where("roomId", "==", room.id));
               const snapshot = await getDocs(q);
               // Filter existing bookings by the target date to find how many slots are taken
               const bookedCount = snapshot.docs.filter(d => d.data().startIso.includes(checkDate)).length;
               // Standard day has 9 slots (9 AM to 5 PM)
               const freeSlots = 9 - bookedCount;
               slotReport.push(`**${room.id}**: ${freeSlots} free slots`);
           }
           return { success: true, text: `Here is the open slot availability for ${checkDate}:\n${slotReport.join("\n")}` };
        }

        // Default 'Search' Intent
        const namesList = topMatches.map(r => r.id).join(", ");
        if (!startIso) return { success: true, text: `I found these great options: **${namesList}**. Would you like to check availability for a specific time?` };

        // Real-time check
        const bookingsRef = collection(db, "bookings");
        let availableNames = [];
        for (const room of topMatches) {
           const q = query(bookingsRef, where("roomId", "==", room.id), where("startIso", "==", startIso));
           const snapshot = await getDocs(q);
           if (snapshot.empty) availableNames.push(room.id);
        }

        if (availableNames.length === 0) return { success: true, text: `The best matches (${namesList}) are all booked at that time.` };
        return { success: true, text: `Good news! These are completely free right now: **${availableNames.join(", ")}**. Shall I lock one in?` };
      } 
      
      // EVAL 18 FIX: Bulk Batch Processing Array
      else if (call.name === "bookRoom") {
        const { bookings } = call.args as any;
        let responseMessages = [];
        let finalBookedRoom = null;

        // Loop through the AI's array and execute them one by one safely!
        for (const b of bookings) {
          const roomData = ROOM_DIRECTORY.find(r => r.id === b.roomId);
          if (!roomData) {
            responseMessages.push(`❌ Room '${b.roomId}' does not exist.`);
            continue;
          }
          const dbResult = await createBooking(b.roomId, b.professorName, b.startIso, b.endIso);
          if (dbResult.success) {
            // Extract just the hour to make the success message readable
            const readableTime = new Date(b.startIso).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute:'2-digit' });            responseMessages.push(`✅ Locked in **${b.roomId}** for ${readableTime}.`);
            finalBookedRoom = b.roomId; 
          } else {
            responseMessages.push(`❌ Couldn't book ${b.roomId}: ${dbResult.error}`);
          }
        }

        return { 
          success: true, 
          bookedRoom: finalBookedRoom, // Pass the last successfully booked room to update the UI
          text: responseMessages.join("\n") 
        };
      }
    }

    const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text || "I didn't quite catch that.";
    return { success: true, text: textResponse };
    
  } catch (error: any) {
    console.error("Vertex AI Error:", error);
    return { success: false, error: error.message };
  }
}