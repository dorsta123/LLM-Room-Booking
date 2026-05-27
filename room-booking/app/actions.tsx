"use server";

import { VertexAI, FunctionDeclaration, FunctionDeclarationSchemaType } from "@google-cloud/vertexai";
import { db } from "./lib/firebase";
import { collection, addDoc, getDocs, query, where, deleteDoc, doc } from "firebase/firestore";
import { revalidatePath } from "next/cache";

// ==========================================
// ROOM DIRECTORY (20 Rooms)
// ==========================================
const ROOM_DIRECTORY = [
  { id: "Study-1A",        capacity: 4,   hasAc: true,  projectors: 0, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Study Room",      floor: 1 },
  { id: "Study-1B",        capacity: 6,   hasAc: true,  projectors: 0, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Study Room",      floor: 1 },
  { id: "Study-2A",        capacity: 8,   hasAc: false, projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: false, roomType: "Study Room",      floor: 2 },
  { id: "Study-2B",        capacity: 10,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: true,  roomType: "Study Room",      floor: 2 },
  { id: "Conf-Alpha",      capacity: 12,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: true,  roomType: "Conference Room", floor: 3 },
  { id: "Conf-Beta",       capacity: 15,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: true,  roomType: "Conference Room", floor: 3 },
  { id: "Conf-Gamma",      capacity: 20,  hasAc: true,  projectors: 2, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: false, roomType: "Conference Room", floor: 3 },
  { id: "Conf-Delta",      capacity: 25,  hasAc: true,  projectors: 1, hasWhiteboard: false, hasVideoConf: false, isAccessible: true,  roomType: "Conference Room", floor: 4 },
  { id: "Class-101",       capacity: 30,  hasAc: false, projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Classroom",       floor: 1 },
  { id: "Class-102",       capacity: 30,  hasAc: false, projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Classroom",       floor: 1 },
  { id: "Class-201",       capacity: 40,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: false, roomType: "Classroom",       floor: 2 },
  { id: "Class-202",       capacity: 45,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Classroom",       floor: 2 },
  { id: "Class-301",       capacity: 60,  hasAc: true,  projectors: 2, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: true,  roomType: "Classroom",       floor: 3 },
  { id: "CompLab-1",       capacity: 30,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Computer Lab",    floor: 1 },
  { id: "BioLab-A",        capacity: 25,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: true,  roomType: "Science Lab",     floor: 2 },
  { id: "ChemLab-B",       capacity: 25,  hasAc: true,  projectors: 1, hasWhiteboard: true,  hasVideoConf: false, isAccessible: false, roomType: "Science Lab",     floor: 2 },
  { id: "Lecture-Hall-A",  capacity: 100, hasAc: true,  projectors: 2, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: true,  roomType: "Lecture Hall",    floor: 1 },
  { id: "Lecture-Hall-B",  capacity: 150, hasAc: true,  projectors: 3, hasWhiteboard: true,  hasVideoConf: true,  isAccessible: true,  roomType: "Lecture Hall",    floor: 1 },
  { id: "Auditorium-Main", capacity: 300, hasAc: true,  projectors: 4, hasWhiteboard: false, hasVideoConf: true,  isAccessible: true,  roomType: "Auditorium",      floor: 1 },
  { id: "Auditorium-North",capacity: 250, hasAc: true,  projectors: 3, hasWhiteboard: false, hasVideoConf: true,  isAccessible: true,  roomType: "Auditorium",      floor: 2 },
];

const VALID_ROOM_NAMES = ROOM_DIRECTORY.map(r => r.id).join(", ");
const VALID_FLOORS = [...new Set(ROOM_DIRECTORY.map(r => r.floor))]; // [1, 2, 3, 4]
const OPERATING_HOURS_START = 9;  // 09:00 UTC
const OPERATING_HOURS_END   = 17; // 17:00 UTC (last slot starts at 17:00, ends 18:00 is invalid — last bookable start = 17:00)

// ==========================================
// HELPERS
// ==========================================
function isWithinOperatingHours(isoString: string): boolean {
  const hour = new Date(isoString).getUTCHours();
  // Bookable start hours: 09–17 inclusive (last session 17:00–18:00 is the edge; anything >= 18 is out)
  return hour >= OPERATING_HOURS_START && hour <= OPERATING_HOURS_END;
}

function buildDynamicTemporalAnchor(): string {
  // Always relative to actual server date so tests don't rot
  const now = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDow = now.getUTCDay();
  const todayDate = now.getUTCDate();
  const todayMonth = now.getUTCMonth() + 1;
  const todayYear = now.getUTCFullYear();
  const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  // Build week mapping (Sun through Sat of the current week)
  const lines: string[] = [`Today is ${dayNames[todayDow]}, ${monthName} ${todayDate}, ${todayYear}.`, "Week mapping:"];
  for (let d = 0; d < 7; d++) {
    const delta = d - todayDow;
    const mapped = new Date(Date.UTC(todayYear, todayMonth - 1, todayDate + delta));
    lines.push(`  ${dayNames[d]} = ${monthName} ${mapped.getUTCDate()}`);
  }
  lines.push(`Operating hours: 09:00–17:00 UTC. Bookings outside this range are FORBIDDEN.`);
  return lines.join("\n");
}

// ==========================================
// DATABASE FUNCTIONS
// ==========================================

export async function createBooking(
  roomId: string,
  professorName: string,
  startIso: string,
  endIso: string
) {
  try {
    if (!isWithinOperatingHours(startIso)) {
      return { success: false, error: "That time is outside operating hours (09:00–17:00)." };
    }
    const bookingsRef = collection(db, "bookings");
    const q = query(
      bookingsRef,
      where("roomId", "==", roomId),
      where("startIso", "==", startIso)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return { success: false, error: "Slot already taken." };

    await addDoc(bookingsRef, {
      roomId,
      professorName,
      startIso,
      endIso,
      createdAt: new Date().toISOString(),
    });
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getBookings(roomId: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("roomId", "==", roomId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      startTime: d.data().startIso,
    }));
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Fetch ALL bookings across all rooms (for analytics + "who's in room X" queries). */
export async function getAllBookings() {
  try {
    const bookingsRef = collection(db, "bookings");
    const snapshot = await getDocs(bookingsRef);
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Fetch all bookings belonging to a specific professor (cross-room). */
export async function getAllBookingsByProfessor(professorName: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("professorName", "==", professorName));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteBookingById(bookingId: string) {
  try {
    await deleteDoc(doc(db, "bookings", bookingId));
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete by details. Supports three modes — all use a single-field where clause
 * then filter in memory to avoid composite index requirements.
 *
 *  1. roomId + startIso + professorName → fetch by roomId, match startIso + professorName in memory
 *  2. roomId=null + startIso + professorName → fetch all professor bookings, match startIso in memory
 *  3. roomId=null + startIso=null + professorName → fetch all professor bookings, pick most recent by createdAt
 */
export async function deleteBookingByDetails(
  roomId: string | null,
  startIso: string | null,
  professorName: string
) {
  try {
    const bookingsRef = collection(db, "bookings");

    if (roomId) {
      // Mode 1: fetch by roomId (single field), filter by startIso + professorName in memory
      const q = query(bookingsRef, where("roomId", "==", roomId));
      const snapshot = await getDocs(q);
      const match = snapshot.docs.find(d => {
        const data = d.data();
        return data.startIso === startIso && data.professorName === professorName;
      });
      if (!match) return { success: false, error: "No matching booking found under your identity." };
      await deleteDoc(match.ref);
      revalidatePath("/");
      return { success: true, targetRoom: roomId };
    }

    // Modes 2 & 3: fetch all professor bookings with single-field where, no composite index needed
    const q = query(bookingsRef, where("professorName", "==", professorName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "No active bookings registered to your name." };

    if (startIso) {
      // Mode 2: match by startIso in memory
      const match = snapshot.docs.find(d => d.data().startIso === startIso);
      if (!match) return { success: false, error: "You have no booking at that time slot." };
      const targetRoom = match.data().roomId;
      await deleteDoc(match.ref);
      revalidatePath("/");
      return { success: true, targetRoom };
    }

    // Mode 3: pick the most recent by createdAt, sorted in memory
    const sorted = snapshot.docs.sort(
      (a, b) => new Date(b.data().createdAt).getTime() - new Date(a.data().createdAt).getTime()
    );
    const latest = sorted[0];
    const targetRoom = latest.data().roomId;
    await deleteDoc(latest.ref);
    revalidatePath("/");
    return { success: true, targetRoom };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Delete ALL bookings for a professor across all rooms. Returns list of deleted room IDs. */
export async function deleteAllBookingsByProfessor(professorName: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("professorName", "==", professorName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "You have no active bookings to cancel." };

    const deletedRooms: string[] = [];
    for (const docSnap of snapshot.docs) {
      deletedRooms.push(docSnap.data().roomId);
      await deleteDoc(docSnap.ref);
    }
    revalidatePath("/");
    return { success: true, deletedRooms };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==========================================
// VERTEX AI AGENT
// ==========================================
export async function getAiResponse(
  chatHistory: { role: string; text: string }[],
  roomContext: string,
  currentUser: string
) {
  try {
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT as string,
      location: "us-central1",
    });

    // ---- Tool declarations ----

    const checkAvailabilityTool: FunctionDeclaration = {
      name: "checkAvailability",
      description: "Query room directory and live booking data. Use intent to control what is returned.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          intent: {
            type: FunctionDeclarationSchemaType.STRING,
            description:
              "Must be one of: 'count' | 'slots' | 'info' | 'search' | 'bookings_for_room' | 'professor_bookings' | 'all_day_free'",
          },
          checkDate:   { type: FunctionDeclarationSchemaType.STRING,  description: "Date for availability lookups (YYYY-MM-DD)" },
          startIso:    { type: FunctionDeclarationSchemaType.STRING,  description: "Specific slot ISO string to check" },
          roomId:      { type: FunctionDeclarationSchemaType.STRING,  description: "Exact room ID for targeted queries" },
          minCapacity: { type: FunctionDeclarationSchemaType.INTEGER, description: "Minimum required seating capacity" },
          needsAc:     { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must have air conditioning" },
          minProjectors:  { type: FunctionDeclarationSchemaType.INTEGER, description: "Minimum number of projectors" },
          needsWhiteboard:{ type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must have whiteboard" },
          needsVideoConf: { type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must have video conferencing" },
          needsAccessible:{ type: FunctionDeclarationSchemaType.BOOLEAN, description: "Must be wheelchair accessible" },
          roomType:    { type: FunctionDeclarationSchemaType.STRING,  description: "Room type filter (e.g. 'Classroom', 'Conference Room', 'Auditorium')" },
          floor:       { type: FunctionDeclarationSchemaType.INTEGER, description: "Specific floor number" },
        },
        required: ["intent"],
      },
    };

    const bookRoomTool: FunctionDeclaration = {
      name: "bookRoom",
      description: "Create one or more room bookings simultaneously. Always validate capacity and hours before calling.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          bookings: {
            type: FunctionDeclarationSchemaType.ARRAY,
            description: "List of booking objects.",
            items: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                roomId:   { type: FunctionDeclarationSchemaType.STRING, description: "EXACT room ID from directory" },
                startIso: { type: FunctionDeclarationSchemaType.STRING, description: "Start time ISO string (YYYY-MM-DDTHH:MM:00.000Z)" },
                endIso:   { type: FunctionDeclarationSchemaType.STRING, description: "End time ISO string (one hour after start)" },
              },
              required: ["roomId", "startIso", "endIso"],
            },
          },
        },
        required: ["bookings"],
      },
    };

    const cancelBookingTool: FunctionDeclaration = {
      name: "cancelBooking",
      description:
        "Cancel one or more of the CURRENT USER's bookings. Cannot cancel other professors' bookings. " +
        "For 'cancel all my bookings' set cancelAll=true. " +
        "For 'cancel last booking' send cancellations=[] (empty). " +
        "For specific slots, populate the cancellations array.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          cancelAll: {
            type: FunctionDeclarationSchemaType.BOOLEAN,
            description: "If true, wipe ALL bookings belonging to the current user across all rooms.",
          },
          cancellations: {
            type: FunctionDeclarationSchemaType.ARRAY,
            description: "Specific slots to cancel. Empty array = cancel most recent booking only.",
            items: {
              type: FunctionDeclarationSchemaType.OBJECT,
              properties: {
                roomId:   { type: FunctionDeclarationSchemaType.STRING, description: "EXACT room ID (optional if ambiguous)" },
                startIso: { type: FunctionDeclarationSchemaType.STRING, description: "Exact ISO start string of the booking to remove" },
              },
            },
          },
        },
        required: ["cancellations"],
      },
    };

    // ---- System prompt ----
    const temporalAnchor = buildDynamicTemporalAnchor();

    const systemPrompt = `You are an elite university room booking agent for ${currentUser}.

ABSOLUTE RULES:
1. IDENTITY LOCK: You can ONLY book or cancel bookings for ${currentUser}. If asked to cancel another professor's booking, refuse with a clear explanation.
2. OPERATING HOURS: Bookings are ONLY permitted from 09:00 to 17:00 UTC. Reject any request for 6pm, 7pm, 8am, etc.
3. CAPACITY CHECK: Before booking, verify the room can hold the requested number of people. If it cannot, warn the user and suggest appropriate alternatives.
4. FLOOR VALIDATION: Valid floors are ${VALID_FLOORS.join(", ")}. If asked for floor 5 or any non-existent floor, return a clean error.
5. TIME MATH: ${temporalAnchor}
6. BATCH BOOKING: Multiple bookings go in one bookRoom call with all entries in the 'bookings' array.
7. BATCH CANCEL: "Cancel all my bookings" → set cancelAll=true in cancelBooking. Specific multi-slot cancels → populate cancellations array fully.
8. CONTEXTUAL CANCEL: "Cancel my last booking" → call cancelBooking with empty cancellations array [].
9. AMBIGUOUS CANCEL: "Cancel my 3pm Friday" (no room specified) → call cancelBooking with startIso set but roomId omitted; the system will resolve which room.
10. MOVE BOOKING: A "move" is always cancel + rebook. If the new slot is taken, abort the rebook and tell the user—do NOT cancel without rebooking.
11. SMART SUGGESTIONS: For vague requests ("book something for 35 students tomorrow afternoon"), infer capacity, pick 'afternoon' as 1:00 PM or 2:00 PM, and choose the smallest room that fits.
12. ANALYTICAL QUERIES: For "who is in room X" use intent='bookings_for_room'. For "my booking history/pattern" use intent='professor_bookings'.
13. ALL DAY FREE: For "every room free all day Thursday" use intent='all_day_free' with checkDate set.
14. BACK-TO-BACK: Check both slots individually before confirming availability.
15. MASS BOOKING WARNING: If asked to book every available room at a single time, confirm the intent before executing.

VALID ROOM IDs: ${VALID_ROOM_NAMES}`;

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ functionDeclarations: [checkAvailabilityTool, bookRoomTool, cancelBookingTool] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const formattedHistory = chatHistory
      .filter(msg => msg.text !== "Thinking...")
      .map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
      }));

    const result = await model.generateContent({ contents: formattedHistory });
    const response = result.response;
    const call = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;

    // ---- Tool execution ----

    if (call?.name === "checkAvailability") {
      const {
        intent,
        checkDate = null,
        startIso = null,
        roomId = null,
        minCapacity = 0,
        needsAc = false,
        minProjectors = 0,
        needsWhiteboard = false,
        needsVideoConf = false,
        needsAccessible = false,
        roomType = null,
        floor = null,
      } = call.args as any;

      // Floor existence guard
      if (floor !== null && floor !== undefined && !VALID_FLOORS.includes(floor)) {
        return { success: true, text: `⚠️ Floor **${floor}** does not exist in this building. Valid floors are: ${VALID_FLOORS.join(", ")}.` };
      }

      const filteredRooms = ROOM_DIRECTORY.filter(room => {
        if (roomId && room.id.toLowerCase() !== roomId.toLowerCase()) return false;
        if (floor !== null && floor !== undefined && room.floor !== floor) return false;
        if (needsAc && !room.hasAc) return false;
        if (needsVideoConf && !room.hasVideoConf) return false;
        if (needsWhiteboard && !room.hasWhiteboard) return false;
        if (needsAccessible && !room.isAccessible) return false;
        if (roomType && !room.roomType.toLowerCase().includes(roomType.toLowerCase())) return false;
        if (minProjectors > 0 && room.projectors < minProjectors) return false;
        if (minCapacity > 0 && room.capacity < minCapacity) return false;
        return true;
      });

      // --- intent: info ---
      if (intent === "info") {
        if (filteredRooms.length === 0) return { success: true, text: "No rooms match those specifications." };
        const lines = filteredRooms.map(
          r => `• **${r.id}**: ${r.roomType}, Floor ${r.floor}, Capacity ${r.capacity}, ${r.hasAc ? "AC ✓" : "No AC"}, ${r.projectors} projector(s), ${r.hasVideoConf ? "Video Conf ✓" : ""} ${r.isAccessible ? "Accessible ✓" : ""}`
        );
        return { success: true, text: `Room specifications:\n\n${lines.join("\n")}` };
      }

      // --- intent: count ---
      if (intent === "count") {
        return { success: true, text: `There are **${filteredRooms.length}** rooms matching that criteria.` };
      }

      // --- intent: slots (free slots for up to 20 rooms on a date) ---
      if (intent === "slots" && checkDate) {
        const bookingsRef = collection(db, "bookings");
        const standardHours = ["09:00 AM","10:00 AM","11:00 AM","12:00 PM","01:00 PM","02:00 PM","03:00 PM","04:00 PM","05:00 PM"];
        const slotReport: string[] = [];

        for (const room of filteredRooms) {  // No artificial cap — all matching rooms
          const q = query(bookingsRef, where("roomId", "==", room.id));
          const snapshot = await getDocs(q);
          const bookedHours = snapshot.docs
            .map(d => d.data().startIso)
            .filter((iso: string) => iso.startsWith(checkDate))
            .map((iso: string) =>
              new Date(iso).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })
            );
          const freeHours = standardHours.filter(h => !bookedHours.includes(h));
          if (freeHours.length === 0)
            slotReport.push(`• **${room.id}**: Fully booked ❌`);
          else
            slotReport.push(`• **${room.id}** (${freeHours.length}/9 slots free):\n  ↳ [ ${freeHours.join(" | ")} ]`);
        }
        return { success: true, text: `Slot availability for **${checkDate}**:\n\n${slotReport.join("\n\n")}` };
      }

      // --- intent: all_day_free (rooms with ALL 9 slots open) ---
      if (intent === "all_day_free" && checkDate) {
        const bookingsRef = collection(db, "bookings");
        const freeAllDay: string[] = [];

        for (const room of filteredRooms) {
          const q = query(bookingsRef, where("roomId", "==", room.id));
          const snapshot = await getDocs(q);
          const hasAnyOnDate = snapshot.docs.some(d => d.data().startIso?.startsWith(checkDate));
          if (!hasAnyOnDate) freeAllDay.push(`**${room.id}** (${room.roomType}, Cap. ${room.capacity})`);
        }

        if (freeAllDay.length === 0)
          return { success: true, text: `No rooms are completely free all day on **${checkDate}**.` };
        return {
          success: true,
          text: `Rooms with zero bookings all day on **${checkDate}** (${freeAllDay.length} rooms):\n\n${freeAllDay.join("\n")}`,
        };
      }

      // --- intent: bookings_for_room (who is using a room on a date) ---
      if (intent === "bookings_for_room" && roomId) {
        const targetRoom = ROOM_DIRECTORY.find(r => r.id.toLowerCase() === roomId.toLowerCase());
        if (!targetRoom) return { success: true, text: `Room **${roomId}** not found in directory.` };

        const bookingsRef = collection(db, "bookings");
        const q = query(bookingsRef, where("roomId", "==", targetRoom.id));
        const snapshot = await getDocs(q);

        let docs = snapshot.docs.map(d => d.data());
        if (checkDate) docs = docs.filter(d => d.startIso?.startsWith(checkDate));

        if (docs.length === 0)
          return { success: true, text: `No bookings found for **${targetRoom.id}**${checkDate ? ` on ${checkDate}` : ""}.` };

        const lines = docs
          .sort((a, b) => a.startIso.localeCompare(b.startIso))
          .map(d => {
            const time = new Date(d.startIso).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
            return `• ${time} — **${d.professorName}**`;
          });
        return {
          success: true,
          text: `Bookings for **${targetRoom.id}**${checkDate ? ` on ${checkDate}` : ""}:\n\n${lines.join("\n")}`,
        };
      }

      // --- intent: professor_bookings (analytics for current user) ---
      if (intent === "professor_bookings") {
        const result = await getAllBookingsByProfessor(currentUser);
        if (!result.success || (result.data as any[]).length === 0)
          return { success: true, text: "You have no recorded bookings in the system." };

        const bookings = result.data as any[];
        const roomCounts: Record<string, number> = {};
        bookings.forEach(b => { roomCounts[b.roomId] = (roomCounts[b.roomId] || 0) + 1; });
        const sorted = Object.entries(roomCounts).sort((a, b) => b[1] - a[1]);
        const lines = sorted.map(([room, count]) => `• **${room}**: ${count} booking(s)`);
        return {
          success: true,
          text: `Your booking history (${bookings.length} total):\n\n${lines.join("\n")}\n\nMost frequent room: **${sorted[0][0]}**.`,
        };
      }

      // --- intent: search (find available rooms matching filters at a specific time) ---
      if (!startIso) {
        const names = filteredRooms.map(r => r.id).join(", ");
        if (!names) return { success: true, text: "No rooms match those specifications." };
        return { success: true, text: `Rooms matching your criteria: **${names}**.` };
      }

      // startIso provided — live availability check
      const bookingsRef = collection(db, "bookings");
      const available: string[] = [];
      for (const room of filteredRooms) {
        const q = query(bookingsRef, where("roomId", "==", room.id), where("startIso", "==", startIso));
        const snapshot = await getDocs(q);
        if (snapshot.empty) available.push(`**${room.id}** (Cap. ${room.capacity})`);
      }
      if (available.length === 0)
        return { success: true, text: "All rooms matching your specifications are occupied at that time." };
      return { success: true, text: `Available rooms:\n\n${available.join("\n")}` };
    }

    // ---- bookRoom ----
    else if (call?.name === "bookRoom") {
      const { bookings } = call.args as any;
      const messages: string[] = [];
      let lastBookedRoom: string | null = null;

      for (const b of bookings) {
        // Operating hours guard (belt-and-suspenders even though AI is instructed)
        if (!isWithinOperatingHours(b.startIso)) {
          messages.push(`❌ **${b.roomId}** at ${new Date(b.startIso).getUTCHours()}:00 — outside operating hours (09:00–17:00).`);
          continue;
        }

        const roomData = ROOM_DIRECTORY.find(r => r.id.toLowerCase() === b.roomId.toLowerCase());
        if (!roomData) {
          messages.push(`❌ Room '${b.roomId}' does not exist in the directory.`);
          continue;
        }

        const dbResult = await createBooking(roomData.id, currentUser, b.startIso, b.endIso);
        if (dbResult.success) {
          const time = new Date(b.startIso).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
          messages.push(`✅ **${roomData.id}** locked in at ${time}.`);
          lastBookedRoom = roomData.id;
        } else {
          messages.push(`❌ **${b.roomId}**: ${dbResult.error}`);
        }
      }

      return {
        success: true,
        refreshRoom: lastBookedRoom,
        refreshAll: bookings.length > 1,
        text: messages.join("\n"),
      };
    }

    // ---- cancelBooking ----
    else if (call?.name === "cancelBooking") {
      const { cancellations, cancelAll = false } = call.args as any;
      const messages: string[] = [];
      let lastTargetRoom: string | null = null;

      // Cancel ALL bookings for this professor
      if (cancelAll) {
        const result = await deleteAllBookingsByProfessor(currentUser);
        if (result.success) {
          const rooms = (result as any).deletedRooms as string[];
          return {
            success: true,
            refreshAll: true,
            text: `✅ Wiped all **${rooms.length}** booking(s) across: ${[...new Set(rooms)].join(", ")}.`,
          };
        } else {
          return { success: false, error: `❌ ${(result as any).error}` };
        }
      }

      // Empty array → cancel most recent
      if (!cancellations || cancellations.length === 0) {
        const result = await deleteBookingByDetails(null, null, currentUser);
        if (result.success) {
          return { success: true, refreshRoom: (result as any).targetRoom, text: `✅ Your most recent booking has been cancelled.` };
        } else {
          return { success: false, error: `❌ ${(result as any).error}` };
        }
      }

      // Specific cancellations
      for (const c of cancellations) {
        // Identity check: only current user's bookings (extra safety — deleteBookingByDetails enforces professorName)
        const normalizedRoom = c.roomId
          ? ROOM_DIRECTORY.find(r => r.id.toLowerCase() === c.roomId.toLowerCase())
          : null;
        const targetId = normalizedRoom ? normalizedRoom.id : (c.roomId || null);

        const result = await deleteBookingByDetails(targetId, c.startIso || null, currentUser);
        if (result.success) {
          const timeStr = c.startIso
            ? new Date(c.startIso).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })
            : "unspecified time";
          messages.push(`✅ Cancelled booking at **${(result as any).targetRoom || targetId}** — ${timeStr}.`);
          lastTargetRoom = (result as any).targetRoom || targetId;
        } else {
          messages.push(`❌ ${(result as any).error}`);
        }
      }

      return {
        success: true,
        refreshRoom: lastTargetRoom,
        refreshAll: cancellations.length > 1,
        text: messages.join("\n"),
      };
    }

    // ---- Plain text response ----
    const textResponse =
      response.candidates?.[0]?.content?.parts?.[0]?.text ?? "I didn't quite catch that.";
    return { success: true, text: textResponse };

  } catch (error: any) {
    console.error("Vertex AI Error:", error);
    return { success: false, error: error.message };
  }
}
