"use server";

// 1. Imports for Vertex AI and your Database
import { VertexAI, FunctionDeclaration, FunctionDeclarationSchemaType } from "@google-cloud/vertexai";
import { db } from "./lib/firebase"; 
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";

// ==========================================
// DATABASE FUNCTIONS
// ==========================================

export async function createBooking(roomId: string, professorName: string, startIso: string, endIso: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    
    // Quick double-check to prevent double booking
    const q = query(bookingsRef, where("roomId", "==", roomId), where("startIso", "==", startIso));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return { success: false, error: "This slot was just taken by someone else!" };
    }

    // Save to Firestore
    const docRef = await addDoc(bookingsRef, {
      roomId,
      professorName,
      startIso,
      endIso,
      createdAt: new Date().toISOString()
    });

    return { success: true, bookingId: docRef.id };
  } catch (error: any) {
    console.error("Database Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getBookings(roomId: string) {
  try {
    const bookingsRef = collection(db, "bookings");
    const q = query(bookingsRef, where("roomId", "==", roomId));
    const snapshot = await getDocs(q);

    // Map the Firestore documents into an array the frontend can read
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      startTime: doc.data().startIso 
    }));

    return { success: true, data };
  } catch (error: any) {
    console.error("Fetch Error:", error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// VERTEX AI AGENT FUNCTION
// ==========================================

export async function getAiResponse(userMessage: string, roomContext: string) {
  try {
    // 1. Initialize Vertex AI (Uses GOOGLE_APPLICATION_CREDENTIALS from .env.local)
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT as string,
      location: "us-central1", 
    });

    // 2. Declare the tool (the function) to Gemini using Vertex's specific Schema Type
    const bookingTool: FunctionDeclaration = {
      name: "createBooking",
      description: "Books a university room for a professor at a specific time.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          roomId: { type: FunctionDeclarationSchemaType.STRING, description: "The ID of the room (e.g., Room-101, Room-205)" },
          professorName: { type: FunctionDeclarationSchemaType.STRING, description: "The name of the professor making the booking" },
          startIso: { type: FunctionDeclarationSchemaType.STRING, description: "The start time in ISO format (YYYY-MM-DDTHH:MM:00.000Z)" },
          endIso: { type: FunctionDeclarationSchemaType.STRING, description: "The end time in ISO format (exactly one hour after start)" }
        },
        required: ["roomId", "professorName", "startIso", "endIso"]
      }
    };

    // 3. Configure the Model as an Agent
    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ functionDeclarations: [bookingTool] }],
      systemInstruction: {
        parts: [{ 
            text: `You are a helpful university room booking agent. 
                   The user is currently looking at ${roomContext}. 
                   If the user asks to book a room, you must collect their name and the time they want.
                   Once you have all the information, call the createBooking function.` 
        }]
      }
    });

    // 4. Generate the response
    const request = {
      contents: [{ role: "user", parts: [{ text: userMessage }] }]
    };
    
    const result = await model.generateContent(request);
    const response = result.response;
    
    // Extract function call (Vertex SDK strict structure)
    const call = response.candidates?.[0]?.content?.parts?.find(part => part.functionCall)?.functionCall;

    // 5. If the AI decided to call our function, run it!
    if (call && call.args) {
      const { roomId, professorName, startIso, endIso } = call.args as any;
      const dbResult = await createBooking(roomId, professorName, startIso, endIso);
      
      // Return the database result back to the chat UI
      if (dbResult.success) {
         return { success: true, text: `✅ Success! I have locked in ${roomId} for ${professorName}.` };
      } else {
         return { success: false, error: `❌ I couldn't book that: ${dbResult.error}` };
      }
    }

    // 6. Otherwise, if it's just normal conversation, return the AI's text
    const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text || "I am having trouble understanding that.";
    return { success: true, text: textResponse };
    
  } catch (error: any) {
    console.error("Vertex AI Error:", error);
    return { success: false, error: error.message };
  }
}