import React from "react";
import { FiCopy } from "react-icons/fi";
import clsx from "clsx";

// Utility function to decode base64 if needed
const decodeBase64IfNeeded = (text: string): string => {
  if (!text) return '';
  try {
    // Check if it looks like base64 (alphanumeric + / + =)
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      return atob(text);
    }
    return text;
  } catch {
    return text;
  }
};

type TabType = "Testcase" | "Test Result";

export default function TestPanel({
  cases = [],
  tab = "Testcase",
  activeCase = 0,
  onCaseSelect,
  onTabChange,
  testResults = [],
  isRunning,
  onRunTests,
  runtimeMs = 0
}: {
  cases: any[];
  tab: TabType;
  activeCase: number;
  onCaseSelect: (idx: number) => void;
  onTabChange: (tab: TabType) => void;
  testResults: any[];
  isRunning?: boolean;
  onRunTests: () => void;
  runtimeMs?: number;
}) {
  const safeCase = cases[activeCase] || cases[0];
  const safeResult = testResults[activeCase] || {};
  // Determine pass/fail for each case for tab icons
  const statusArr = testResults.map(r => r.passed ? "passed" : r.passed === false ? "failed" : undefined);
  const allPassed = testResults.length > 0 && testResults.every(r => r.passed);
  const anyFailed = testResults.length > 0 && testResults.some(r => r.passed === false);

  return (
    <div className={clsx(
      "w-full mt-0 mb-0 border-t border-b bg-white dark:bg-gray-900 transition-all duration-300",
      "shadow-none rounded-none px-0 py-0"
    )}>
      {/* Top Tabs */}
      <div className="flex items-center border-b px-6 pt-4 pb-0">
        <TabBar tab={tab} onTabChange={onTabChange} />
        <div className="flex-1" />
      </div>
      {/* Test Result Summary */}
      {tab === "Test Result" && (
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <div className="flex items-center space-x-3">
            {allPassed && (
              <span className="flex items-center text-green-700 dark:text-green-300 font-bold text-base bg-green-100 dark:bg-green-900 px-3 py-1 rounded">
                <span className="mr-2 text-lg">✅</span>Accepted
              </span>
            )}
            {anyFailed && (
              <span className="flex items-center text-red-700 dark:text-red-300 font-bold text-base bg-red-100 dark:bg-red-900 px-3 py-1 rounded">
                <span className="mr-2 text-lg">❌</span>Wrong Answer
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-300 font-mono">
            Runtime: {runtimeMs} ms
          </div>
        </div>
      )}
      {/* Sub-tabs (Cases) */}
      <div className="flex items-center space-x-2 px-6 pt-2 pb-0">
        {cases.map((c, idx) => (
          <button
            key={c.id || idx}
            onClick={() => onCaseSelect(idx)}
            className={clsx(
              "px-4 py-2 rounded-t-lg font-semibold focus:outline-none transition-all duration-150 border-b-2 flex items-center space-x-2",
              activeCase === idx
                ? (tab === "Test Result"
                    ? (statusArr[idx] === "passed"
                        ? "bg-green-100 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-200"
                        : statusArr[idx] === "failed"
                          ? "bg-red-100 dark:bg-red-900 border-red-500 text-red-700 dark:text-red-200"
                          : "bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-200"
                    )
                    : "bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-200"
                  )
                : "bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            )}
          >
            <span>Case {idx + 1}</span>
            {tab === "Test Result" && (
              <span className={clsx(
                "ml-2 w-3 h-3 rounded-full inline-block",
                statusArr[idx] === "passed" ? "bg-green-500" :
                statusArr[idx] === "failed" ? "bg-red-500" : "bg-gray-400 dark:bg-gray-600"
              )}>
                {statusArr[idx] === "passed" ? <span className="text-white text-xs">✓</span> : statusArr[idx] === "failed" ? <span className="text-white text-xs">✗</span> : null}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Main Content */}
      <div className="px-6 py-6">
        {tab === "Testcase" ? (
          <TestcaseView testCase={safeCase} />
        ) : (
          <TestResultView testCase={safeCase} result={safeResult} isRunning={isRunning} />
        )}
      </div>
    </div>
  );
}

function TabBar({ tab, onTabChange }: { tab: TabType; onTabChange: (t: TabType) => void }) {
  return (
    <div className="flex items-center space-x-2">
      {(["Testcase", "Test Result"] as TabType[]).map(t => (
        <button
          key={t}
          onClick={() => onTabChange(t)}
          className={clsx(
            "px-4 py-2 rounded-t-lg font-semibold focus:outline-none transition-all duration-150",
            tab === t ? "bg-blue-600 text-white shadow" : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function TestcaseView({ testCase }: { testCase: any }) {
  if (!testCase) return null;
  // Remove placeholder/empty fields
  const displayObj = Object.fromEntries(Object.entries(testCase).filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'id'));
  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 font-mono text-base overflow-x-auto border border-gray-200 dark:border-gray-700">
      {Object.entries(displayObj).map(([k, v]) => (
        <div key={k} className="mb-1 text-gray-800 dark:text-gray-100">
          <span className="font-bold">{k}</span> = {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </div>
      ))}
    </div>
  );
}

function TestResultView({ testCase, result, isRunning }: { testCase: any, result: any, isRunning?: boolean }) {
  // Use result if available, else fallback to testCase
  const input = testCase ? { ...testCase } : {};
  delete input.id;
  const expected = result?.expectedOutput ?? '';
  const actual = isRunning ? '...' : (result?.userOutput !== undefined && result?.userOutput !== null && result?.userOutput !== '' ? result.userOutput : 'No output');
  const passed = result?.passed;
  const diff = result?.diff;
  return (
    // --- LOGGING: Rendering test case in accordion ---
    console.log('Rendering test case in accordion:', testCase, 'Result:', result),
    <div className="space-y-4">
      <Section label="Input">
        {Object.entries(input).map(([k, v]) => (
          <div key={k} className="mb-1 text-gray-800 dark:text-gray-100 font-mono">
            <span className="font-bold">{k}</span> = {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </div>
        ))}
      </Section>
      <Section label="Expected">
        <CodeBlock value={String(expected)} status={passed ? 'passed' : passed === false ? 'failed' : undefined} />
      </Section>
      <Section label="Your Output">
        <div className="space-y-2">
          {/* Main output */}
          <div>
            <div className="text-xs text-gray-400 mb-1">Program Output:</div>
            <CodeBlock value={String(decodeBase64IfNeeded(actual))} status={passed ? 'passed' : passed === false ? 'failed' : undefined} />
          </div>
          
          {/* Compile output - always show if available */}
          {result?.compile_output && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Compile Output:</div>
              <CodeBlock value={decodeBase64IfNeeded(result.compile_output)} status="info" />
            </div>
          )}
          
          {/* Runtime errors - always show if available */}
          {result?.stderr && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Runtime Errors:</div>
              <CodeBlock value={decodeBase64IfNeeded(result.stderr)} status="error" />
            </div>
          )}
          
          {/* Execution details */}
          {result?.time !== undefined && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Execution Details:</div>
              <div className="bg-gray-800 text-gray-100 px-4 py-2 rounded-lg border border-gray-700 text-sm">
                <div>Time: {result.time}ms</div>
                {result.memory && <div>Memory: {result.memory}KB</div>}
                {result.status?.description && <div>Status: {result.status.description}</div>}
              </div>
            </div>
          )}
        </div>
      </Section>
      {passed === false && diff && (
        <Section label="Diff">
          <pre className="bg-red-900 text-red-100 rounded px-4 py-2 mt-2 text-xs font-mono whitespace-pre-wrap border border-red-400">
            {diff}
          </pre>
        </Section>
      )}
      <div className="flex items-center mt-2">
        {passed === true && (
          <span className="bg-green-700 text-green-100 px-3 py-1 rounded text-xs font-bold flex items-center mr-2">✅ Passed</span>
        )}
        {passed === false && (
          <span className="bg-red-700 text-red-100 px-3 py-1 rounded text-xs font-bold flex items-center mr-2">❌ Failed</span>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">{label}</div>
      {children}
    </div>
  );
}

function CodeBlock({ value, status }: { value: string; status?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="mb-2">
      <div className="flex items-center mb-1">
        <button
          className="px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 focus:outline-none"
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          title="Copy"
        >
          {copied ? "Copied!" : <FiCopy size={14} />}
        </button>
      </div>
      <pre className={clsx(
        "w-full px-4 py-2 rounded-lg font-mono text-base border",
        status === "passed" ? "bg-green-900 text-green-100 border-green-700" :
        status === "failed" ? "bg-red-900 text-red-100 border-red-700" :
        status === "error" ? "bg-red-900 text-red-100 border-red-700" :
        status === "info" ? "bg-blue-900 text-blue-100 border-blue-700" :
        "bg-gray-800 text-gray-100 border-gray-700"
      )}>{value}</pre>
    </div>
  );
} 