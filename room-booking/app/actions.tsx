"use server";

import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
// Updated path based on your screenshots!
import { db } from "./lib/firebase"; 

export async function createBooking(roomId: string, professorName: string, startIso: string, endIso: string) {
  try {
    const bookingsRef = collection(db, "bookings");

    // Step 1: Query Firestore for potential overlaps
    // Get bookings for THIS room that end AFTER our requested start time
    const q = query(
      bookingsRef,
      where("roomId", "==", roomId),
      where("endTime", ">", startIso)
    );

    const snapshot = await getDocs(q);
    let hasConflict = false;

    // Step 2: Use JavaScript to check the other half of the overlap equation
    snapshot.forEach((doc) => {
      const existingBooking = doc.data();
      
      // If the existing booking starts BEFORE our requested end time, it's a conflict!
      if (existingBooking.startTime < endIso) {
        hasConflict = true;
      }
    });

    // Step 3: Reject or Accept
    if (hasConflict) {
      return { success: false, error: "Double-booking detected! This room is already reserved for that time." };
    }

    // No conflict found, write the booking to the database
    const newDoc = await addDoc(bookingsRef, {
      roomId: roomId,
      professorName: professorName,
      startTime: startIso,
      endTime: endIso,
      createdAt: new Date().toISOString()
    });

    return { success: true, bookingId: newDoc.id };

  } catch (error: any) {
    console.error("Booking Error:", error);
    return { success: false, error: error.message };
  }
}