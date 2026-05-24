"use client";

import { useState } from "react";
import { collection, addDoc, getDocs } from "firebase/firestore";

// Using the relative path to guarantee it finds your file!
import { db } from "../lib/firebase";

export default function TestDatabasePage() {
  const [status, setStatus] = useState("Waiting to test...");
  const [data, setData] = useState<string | null>(null);

  const runTest = async () => {
    setStatus("Testing connection...");
    setData(null);
    
    try {
      if (!db) {
        throw new Error("Firestore 'db' object is undefined. Check your environment variables.");
      }

      // Step A: Attempt to write a dummy booking to the database
      const docRef = await addDoc(collection(db, "test_collection"), {
        message: "Hello from Next.js!",
        timestamp: new Date().toISOString()
      });

      // Step B: Attempt to read it right back
      const querySnapshot = await getDocs(collection(db, "test_collection"));
      const results: any[] = [];
      
      querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
      });

      setStatus(`Success! Wrote document with ID: ${docRef.id}`);
      setData(JSON.stringify(results, null, 2));
      
    } catch (error: any) {
      console.error("Firebase Connection Error:", error);
      setStatus(`Connection Failed: ${error.message}`);
    }
  };

  return (
    <div className="p-10 max-w-2xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-4">Firebase Connection Test</h1>
      
      <button
        onClick={runTest}
        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition-colors"
      >
        Test Firestore Connection
      </button>

      <div className="mt-6 space-y-4">
        <p className="text-lg font-medium">Status: <span className="text-gray-600">{status}</span></p>
        
        {data && (
          <div className="bg-gray-100 p-4 rounded-lg shadow-inner">
            <h2 className="text-sm font-bold text-gray-500 mb-2">Data Retrieved:</h2>
            <pre className="text-sm overflow-auto text-green-700">
              {data}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}