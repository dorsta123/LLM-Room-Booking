"use client";

import { useState } from "react";
import { createBooking } from "../actions"; 

export default function TestDatabasePage() {
  // These two lines are what you were missing! They define setStatus and setData.
  const [status, setStatus] = useState("Waiting to test...");
  const [data, setData] = useState<string | null>(null);

  const runTest = async () => {
    setStatus("Testing double-booking logic...");
    setData(null);
    
    // We will try to book Room 101 from 10:00 AM to 11:00 AM today
    const today = new Date().toISOString().split('T')[0]; // Gets YYYY-MM-DD
    const startTime = `${today}T10:00:00.000Z`;
    const endTime = `${today}T11:00:00.000Z`;

    try {
      const result = await createBooking("Room-101", "Dr. Sharma", startTime, endTime);

      if (result.success) {
        setStatus(`Success! Booking created with ID: ${result.bookingId}`);
      } else {
        setStatus(`Blocked: ${result.error}`);
      }
      
    } catch (error: any) {
      setStatus(`System Error: ${error.message}`);
    }
  };

  return (
    <div className="p-10 max-w-2xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-4">Firebase Double-Booking Test</h1>
      
      <button
        onClick={runTest}
        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors"
      >
        Test Double-Booking
      </button>

      <div className="mt-6 space-y-4">
        <p className="text-lg font-medium">Status: <span className="text-gray-600">{status}</span></p>
      </div>
    </div>
  );
}