"use server";

import { VertexAI, FunctionDeclaration, FunctionDeclarationSchemaType } from "@google-cloud/vertexai";
import { db } from "./lib/firebase"; 
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, orderBy, limit } from "firebase/firestore";
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
    
    await addDoc(bookingsRef, { roomId, professorName, startIso, endIso, createdAt: new Date().toISOString() });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function getBookings(roomId: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("roomId", "==", roomId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), startTime: doc.data().startIso }));
    return { success: true, data };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function deleteBookingById(bookingId: string) {
  try {
    await deleteDoc(doc(db, "bookings", bookingId));
    revalidatePath("/");
    return { success: true };
  } catch (error: any) { return { success: false, error: error.message }; }
}

export async function deleteBookingByDetails(roomId: string | null, startIso: string | null, professorName: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    
    if (!roomId || !startIso) {
      const q = query(bookingsRef, where("professorName", "==", professorName), orderBy("createdAt", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return { success: false, error: "No active bookings registered to your name." };
      
      const data = snapshot.docs[0].data();
      await deleteDoc(snapshot.docs[0].ref);
      revalidatePath("/");
      return { success: true, targetRoom: data.roomId };
    }

    const q = query(bookingsRef, where("roomId", "==", roomId), where("startIso", "==", startIso), where("professorName", "==", professorName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "No matching booking found under your identity parameters." };
    
    await deleteDoc(snapshot.docs[0].ref);
    revalidatePath("/");
    return { success: true, targetRoom: roomId };
  } catch (error: any) { return { success: false, error: error.message }; }
}

// ==========================================
// VERTEX AI SMART AGENT
// ==========================================
export async function getAiResponse(chatHistory: { role: string, text: string }[], roomContext: string, currentUser: string) {
  try {
    const vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT as string, location: "us-central1" });

    const checkAvailabilityTool: FunctionDeclaration = {
      name: "checkAvailability",
      description: "Searches directory data filters.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          intent: { type: FunctionDeclarationSchemaType.STRING, description: "Must be: 'count', 'slots', 'info', or 'search'" },
          checkDate: { type: FunctionDeclarationSchemaType.STRING, description: "Date lookups (YYYY-MM-DD)" },
          startIso: { type: FunctionDeclarationSchemaType.STRING, description: "Target start time" },
          roomId: { type: FunctionDeclarationSchemaType.STRING, description: "Specific room ID" },
          minCapacity: { type: FunctionDeclarationSchemaType.INTEGER, description: "Minimum capacity" },
          needsAc: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "AC filter flag" },
          minProjectors: { type: FunctionDeclarationSchemaType.INTEGER, description: "Minimum projectors" },
          needsWhiteboard: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Whiteboard flag" },
          needsVideoConf: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Video infrastructure flag" },
          needsAccessible: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Accessibility flag" },
          roomType: { type: FunctionDeclarationSchemaType.STRING, description: "Room classification match" },
          floor: { type: FunctionDeclarationSchemaType.INTEGER, description: "Target floor number" } 
        },
        required: ["intent"] 
      }
    };

    const bookRoomTool: FunctionDeclaration = {
      name: "bookRoom",
      description: "Locks in multiple booking entries.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          bookings: {
            type: FunctionDeclarationSchemaType.ARRAY,
            description: "List of rooms to book.",
            items: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                roomId: { type: FunctionDeclarationSchemaType.STRING, description: "EXACT ID of room" },
                startIso: { type: FunctionDeclarationSchemaType.STRING, description: "Start time (YYYY-MM-DDTHH:MM:00.000Z)" },
                endIso: { type: FunctionDeclarationSchemaType.STRING, description: "End time" }
              },
              required: ["roomId", "startIso", "endIso"]
            }
          }
        },
        required: ["bookings"] 
      }
    };

    // UPGRADED: Changed schema parameters to support Arrays (Batch Cancellation)
    const cancelBookingTool: FunctionDeclaration = {
      name: "cancelBooking",
      description: "Cancels or deletes one or more active booking slots.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          cancellations: {
            type: FunctionDeclarationSchemaType.ARRAY,
            description: "List of room bookings to remove. Leave array empty if user asks to cancel 'last booking' contextually.",
            items: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                roomId: { type: FunctionDeclarationSchemaType.STRING, description: "The EXACT system ID of the room" },
                startIso: { type: FunctionDeclarationSchemaType.STRING, description: "The exact starting ISO string" }
              },
              required: ["roomId", "startIso"]
            }
          }
        },
        required: ["cancellations"] 
      }
    };

    const temporalAnchor = `
      Today is Monday, May 25, 2026. 
      Calendar Mapping: Mon=May 25, Tue=May 26, Wed=May 27, Thu=May 28, Fri=May 29, Sat=May 30.
      Hours: 09:00 AM to 05:00 PM.
    `;

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ functionDeclarations: [checkAvailabilityTool, bookRoomTool, cancelBookingTool] }], 
      systemInstruction: {
        parts: [{ 
            text: `You are an elite university room booking agent talking directly to ${currentUser}.
                   
                   CRITICAL RULES:
                   0. TIME MATH: ${temporalAnchor} Calculate exact ISO strings using this mapping.
                   1. BATCH PROCESSING: If the user requests multiple cancellations (e.g., "Cancel my 2pm and 3pm blocks"), load ALL of them simultaneously into the 'cancellations' array in the cancelBooking tool.
                   2. CONTEXTUAL CANCEL: If the user says "delete my last booking" without room context, supply a single object inside the 'cancellations' array with all properties left entirely blank.
                   
                   VALID SYSTEM DESIGNATIONS: ${VALID_ROOM_NAMES}` 
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

    if (call) {
      if (call.name === "checkAvailability") {
        const { intent, checkDate = null, startIso = null, roomId = null, minCapacity = 0, needsAc = false, minProjectors = 0, needsWhiteboard = false, needsVideoConf = false, needsAccessible = false, roomType = null, floor = null } = call.args as any;

        const filteredRooms = ROOM_DIRECTORY.filter(room => {
          if (roomId && room.id.toLowerCase() !== roomId.toLowerCase()) return false;
          if (floor !== null && floor !== undefined && room.floor !== floor) return false;
          if (needsAc && !room.hasAc) return false;
          if (needsVideoConf && !room.hasVideoConf) return false;
          if (needsWhiteboard && !room.hasWhiteboard) return false;
          if (needsAccessible && !room.isAccessible) return false;
          if (roomType && !room.roomType.toLowerCase().includes(roomType.toLowerCase())) return false;
          if (minProjectors > room.projectors) return false;
          if (minCapacity > 0 && room.capacity < minCapacity) return false;
          return true;
        });

        if (intent === "info") {
          if (filteredRooms.length === 0) return { success: true, text: "No matching configurations found." };
          const infoLines = filteredRooms.map(r => `• **${r.id}**: ${r.roomType} (Floor ${r.floor}, Capacity: ${r.capacity}, ${r.hasAc ? "AC" : "No AC"})`);
          return { success: true, text: `Here are the specifications:\n\n${infoLines.join("\n")}` };
        }

        if (intent === "count") return { success: true, text: `There are currently **${filteredRooms.length}** rooms matching that criteria.` };

        if (intent === "slots" && checkDate) {
           let slotReport = [];
           const bookingsRef = collection(db, "bookings");
           const standardHours = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"];

           for (const room of filteredRooms.slice(0, 5)) {
               const q = query(bookingsRef, where("roomId", "==", room.id));
               const snapshot = await getDocs(q);
               const bookedHours = snapshot.docs
                 .map(d => d.data().startIso)
                 .filter(iso => iso.includes(checkDate))
                 .map(iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }));

               const freeHours = standardHours.filter(h => !bookedHours.includes(h));
               if (freeHours.length === 0) slotReport.push(`• **${room.id}**: Fully booked. ❌`);
               else slotReport.push(`• **${room.id}** (${freeHours.length} slots free):\n  ↳ [ ${freeHours.join(" | ")} ]`);
           }
           return { success: true, text: `Here is the slot availability grid for **${checkDate}**:\n\n${slotReport.join("\n\n")}` };
        }

        const namesList = filteredRooms.map(r => r.id).join(", ");
        if (!startIso) return { success: true, text: `I found these configurations matching your query: **${namesList}**.` };

        const bookingsRef = collection(db, "bookings");
        let availableNames = [];
        for (const room of filteredRooms) {
           const q = query(bookingsRef, where("roomId", "==", room.id), where("startIso", "==", startIso));
           const snapshot = await getDocs(q);
           if (snapshot.empty) availableNames.push(room.id);
        }
        if (availableNames.length === 0) return { success: true, text: `Those matching specifications are completely occupied at that slot.` };
        return { success: true, text: `The following matches are open: **${availableNames.join(", ")}**.` };
      } 
      
      else if (call.name === "bookRoom") {
        const { bookings } = call.args as any;
        let responseMessages = [];
        let finalBookedRoom = null;

        for (const b of bookings) {
          const roomData = ROOM_DIRECTORY.find(r => r.id.toLowerCase() === b.roomId.toLowerCase());
          if (!roomData) { responseMessages.push(`❌ Room '${b.roomId}' does not exist.`); continue; }
          
          const dbResult = await createBooking(roomData.id, currentUser, b.startIso, b.endIso);
          if (dbResult.success) {
            const readableTime = new Date(b.startIso).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute:'2-digit' });
            responseMessages.push(`✅ Locked in **${roomData.id}** at ${readableTime}.`);
            finalBookedRoom = roomData.id; 
          } else { responseMessages.push(`❌ Action block on ${roomData.id}: ${dbResult.error}`); }
        }
        return { success: true, refreshRoom: finalBookedRoom, text: responseMessages.join("\n") };
      }

      // UPGRADED: Loops over the cancellation array variables sequentially
      else if (call.name === "cancelBooking") {
        const { cancellations } = call.args as any;
        let responseMessages = [];
        let lastTargetRoom = null;

        // Contextual execution fallback tracker
        if (cancellations.length === 1 && !cancellations[0].roomId) {
          const dbResult = await deleteBookingByDetails(null, null, currentUser);
          if (dbResult.success) {
            return { success: true, refreshRoom: dbResult.targetRoom, text: `✅ I have successfully wiped your most recent reservation booking container.` };
          } else { return { success: false, error: `❌ ${dbResult.error}` }; }
        }

        for (const c of cancellations) {
          const normalizedRoom = ROOM_DIRECTORY.find(r => r.id.toLowerCase() === c.roomId.toLowerCase());
          const targetId = normalizedRoom ? normalizedRoom.id : c.roomId;

          const dbResult = await deleteBookingByDetails(targetId, c.startIso, currentUser);
          if (dbResult.success) {
            const readableTime = new Date(c.startIso).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute:'2-digit' });
            responseMessages.push(`✅ Removed reservation block for **${targetId}** at ${readableTime}.`);
            lastTargetRoom = targetId;
          } else {
            responseMessages.push(`❌ Dropping slot lock failed for ${targetId}: ${dbResult.error}`);
          }
        }

        return { success: true, refreshRoom: lastTargetRoom, text: responseMessages.join("\n") };
      }
    }

    const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text || "I didn't quite catch that.";
    return { success: true, text: textResponse };
    
  } catch (error: any) {
    console.error("Vertex AI Error:", error);
    return { success: false, error: error.message };
  }
}