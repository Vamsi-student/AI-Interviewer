import { useState } from "react";

interface TestCaseResult {
  input: string;
  expectedOutput: string;
  expected_output?: string; // Add support for underscore version
  userOutput: string;
  passed: boolean;
  diff?: string;
  feedback?: string;
  error?: string | null;
  raw?: any;
  compile_output?: string;
}

// Base64 decoding function
function base64Decode(base64Str: string): string {
  if (!base64Str) return '';
  try {
    // Check if it looks like base64 (alphanumeric + / + =)
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(base64Str)) {
      return atob(base64Str);
    }
    return base64Str;
  } catch {
    return base64Str;
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ml-2 px-3 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 focus:outline-none transition"
      onClick={async (e) => {
        e.preventDefault();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="Copy"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function renderInputFields(input: string) {
  try {
    const obj = JSON.parse(input);
    if (typeof obj === 'object' && obj !== null) {
      return Object.entries(obj).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between mb-3 w-full">
          <span className="text-sm text-gray-300 font-medium">{key} =</span>
          <span className="flex-1 ml-2 bg-[#1a2233] text-gray-100 rounded px-4 py-2 text-base font-mono flex items-center justify-between">
            {typeof value === 'string' ? value : JSON.stringify(value)}
            <CopyButton value={typeof value === 'string' ? value : JSON.stringify(value)} />
          </span>
        </div>
      ));
    }
  } catch {}
  // fallback: show as string
  return (
    <div className="flex items-center justify-between mb-3 w-full">
      <span className="text-sm text-gray-300 font-medium">input =</span>
      <span className="flex-1 ml-2 bg-[#1a2233] text-gray-100 rounded px-4 py-2 text-base font-mono flex items-center justify-between">
        {input}
        <CopyButton value={input} />
      </span>
    </div>
  );
}

export default function TestCaseResultsPanel({ results = [], runtimeMs }: { results: TestCaseResult[], runtimeMs?: number }) {
  const [selected, setSelected] = useState(0);
  const testCases = results;

  if (!testCases || testCases.length === 0) {
    return <div className="text-center text-gray-500">No test case results available.</div>;
  }

  const selectedCase = results[selected] || {};
  // --- LOGGING: Rendering test case result in panel ---
  console.log('Rendering test case in results panel:', selectedCase);

  // Decode any base64 encoded outputs
  const decodedUserOutput = selectedCase.userOutput ? base64Decode(selectedCase.userOutput) : '';
  const decodedError = selectedCase.error ? base64Decode(selectedCase.error) : '';
  
  // Try to get compile_output from different possible locations
  const compileOutput = selectedCase.compile_output || 
                       (selectedCase.raw && selectedCase.raw.compile_output) || 
                       '';
  // In TestCaseResultsPanel.tsx, update the decodedCompileOutput line
  const decodedCompileOutput = selectedCase.compile_output ? base64Decode(selectedCase.compile_output) : '';

  // Handle both expectedOutput and expected_output property names
  const expectedOutput = selectedCase.expectedOutput || selectedCase.expected_output || '';

  return (
    <div className="w-full flex flex-col items-center">
      {/* Tabs */}
      <div className="flex items-center w-full max-w-2xl mt-2 mb-8">
        <span className="text-gray-500 text-sm font-medium mr-4">Testcase</span>
        <div className="flex space-x-2">
          {testCases.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSelected(idx)}
              className={`px-5 py-2 rounded-lg font-semibold focus:outline-none transition-all duration-150 border
                ${selected === idx ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}
              style={{ minWidth: 80 }}
            >
              Case {idx + 1}
            </button>
          ))}
        </div>
        {/* Runtime display at bottom right */}
        <div className="flex-1 flex justify-end items-center">
          {typeof runtimeMs === 'number' && (
            <span className="text-xs text-gray-500 font-mono ml-4">Runtime: {runtimeMs} ms</span>
          )}
        </div>
      </div>
      {/* Centered Card */}
      {/* Top row: Case label and status */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <span className="inline-block bg-white text-gray-900 font-semibold rounded px-4 py-1 text-base shadow">Case {selected + 1}</span>
        <span className={`inline-block px-3 py-1 text-xs font-bold rounded ${selectedCase.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{selectedCase.passed ? 'Passed' : 'Failed'}</span>
      </div>
      <div className="px-6 pb-6 pt-2">
        {/* Input fields */}
        <div className="font-mono bg-gray-100 rounded p-2 mb-2">
          <div><strong>Input:</strong></div>
          <pre>{selectedCase.input}</pre>
          <div><strong>Expected Output:</strong></div>
          <pre>{expectedOutput}</pre>
        </div>
        {/* User output */}
        <div className="flex items-center justify-between mb-3 w-full">
          <span className="text-sm text-gray-300 font-medium">your output =</span>
          <span className={`flex-1 ml-2 rounded px-4 py-2 text-base font-mono flex items-center justify-between ${selectedCase.passed ? 'bg-green-900 text-green-100' : 'bg-red-700 text-red-100'}`}>
            {decodedUserOutput || "No output"}
            <CopyButton value={decodedUserOutput || ""} />
          </span>
        </div>
        {/* Compile output if present */}
        {decodedCompileOutput && (
          <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded">
            <div className="font-semibold mb-1">Compile Output:</div>
            <pre className="whitespace-pre-wrap text-sm">{decodedCompileOutput}</pre>
          </div>
        )}
        {/* Error message if present */}
        {decodedError && (
          <div className="mt-2 p-2 bg-red-100 text-red-800 rounded">
            <div className="font-semibold mb-1">Error:</div>
            <pre className="whitespace-pre-wrap text-sm">{decodedError}</pre>
          </div>
        )}
      </div>
    </div>
  );
}