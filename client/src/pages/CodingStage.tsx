import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import TestCaseResultsPanel from '@/components/TestCaseResultsPanel';
import { apiRequest } from '@/lib/queryClient';
// @ts-ignore
import MonacoEditor from '@monaco-editor/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Sun, Moon, ChevronLeft, ChevronRight, Lightbulb, Clock, AlertTriangle } from 'lucide-react';
import TestPanel from '@/components/TestCaseAccordion';
import { useCodingTimer } from '@/hooks/useCodingTimer';

const LANGUAGES = [
  { id: 'c', name: 'C', monaco: 'c', defaultCode: '// Implement the function as described. Do NOT use scanf/printf. Return the result.\nint solution(char* s) {\n    // your code here\n    return ...;\n}' },
  { id: 'cpp', name: 'C++', monaco: 'cpp', defaultCode: '// Implement the function as described. Do NOT use cin/cout. Return the result.\nclass Solution {\npublic:\n    int solution(std::string s) {\n        // your code here\n        return ...;\n    }\n};' },
  { id: 'java', name: 'Java', monaco: 'java', defaultCode: '// Implement the function as described. Do NOT use Scanner or System.out.println(). Return the result.\npublic class Solution {\n    public static int solution(String s) {\n        // your code here\n        return ...;\n    }\n}' },
  { id: 'python', name: 'Python', monaco: 'python', defaultCode: '# Implement the function as described. Do NOT use input() or print(). Return the result.\ndef solution(s):\n    # your code here\n    return ...' },
  { id: 'python3', name: 'Python3', monaco: 'python', defaultCode: '# Implement the function as described. Do NOT use input() or print(). Return the result.\ndef solution(s):\n    # your code here\n    return ...' },
  { id: 'javascript', name: 'JavaScript', monaco: 'javascript', defaultCode: '// Implement the function as described. Do NOT use prompt() or console.log(). Return the result.\nfunction solution(s) {\n    // your code here\n    return ...;\n}' },
  { id: 'typescript', name: 'TypeScript', monaco: 'typescript', defaultCode: '// Implement the function as described. Do NOT use prompt() or console.log(). Return the result.\nfunction solution(s: string): any {\n    // your code here\n    return ...;\n}' },
  { id: 'php', name: 'PHP', monaco: 'php', defaultCode: '<?php\n// Implement the function as described. Do NOT use echo. Return the result.\nfunction solution($s) {\n    // your code here\n    return ...;\n}\n?>' },
  { id: 'swift', name: 'Swift', monaco: 'swift', defaultCode: '// Implement the function as described.\nfunc solution(_ s: String) -> Any {\n    // your code here\n    return ...\n}' },
  { id: 'kotlin', name: 'Kotlin', monaco: 'kotlin', defaultCode: '// Implement the function as described.\nfun solution(s: String): Any {\n    // your code here\n    return ...\n}' },
  { id: 'dart', name: 'Dart', monaco: 'dart', defaultCode: '// Implement the function as described.\ndynamic solution(String s) {\n    // your code here\n    return ...;\n}' },
  { id: 'go', name: 'Go', monaco: 'go', defaultCode: '// Implement the function as described.\nfunc solution(s string) interface{} {\n    // your code here\n    return nil\n}' },
  { id: 'ruby', name: 'Ruby', monaco: 'ruby', defaultCode: '# Implement the function as described.\ndef solution(s)\n  # your code here\n  ...\nend' },
  { id: 'scala', name: 'Scala', monaco: 'scala', defaultCode: '// Implement the function as described.\ndef solution(s: String): Any = {\n  // your code here\n  ...\n}' },
  { id: 'rust', name: 'Rust', monaco: 'rust', defaultCode: '// Implement the function as described.\nfn solution(s: &str) -> i32 {\n    // your code here\n    0\n}' },
  { id: 'racket', name: 'Racket', monaco: 'racket', defaultCode: "; Implement the function as described.\n(define (solution s)\n  ; your code here\n  0)" },
  { id: 'erlang', name: 'Erlang', monaco: 'erlang', defaultCode: '% Implement the function as described.\nsolution(S) ->\n    % your code here\n    ok.' },
  { id: 'elixir', name: 'Elixir', monaco: 'elixir', defaultCode: '# Implement the function as described.\ndef solution(s) do\n  # your code here\n  :ok\nend' },
];

interface CodingProblem {
  title: string;
  description: string;
  difficulty: string;
  constraints: string[];
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  testCases: Array<{
    input: string;
    expectedOutput: string;
  }>;
  hint?: string;
  problemId?: number;
  predefinedTemplates?: Record<string, string>;
  signaturePlaceholder?: Record<string, string>;
}

interface TestCaseResult {
  input: string;
  expectedOutput: string;
  userOutput: string;
  passed: boolean;
  diff?: string;
  error?: string;
  runtimeMs?: number;
}

type TestPanelCase = {
  id: number;
  nums: number[];
  target: number;
  expectedOutput: string;
  userOutput: string;
  status?: 'passed' | 'failed';
  diff?: string;
};

function Spinner() {
  return <div className="flex justify-center items-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
}

// Add a utility to preprocess input for 'input = ...' style
function preprocessInputString(input: string): string {
  // Remove 'input =' or 'input=' prefix if present
  return input.replace(/^input\s*=\s*/, '').trim();
}

// Add a utility to map frontend language IDs to Gemini/LLM-friendly names
const LANGUAGE_LABELS: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  python: 'Python',
  python3: 'Python3',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  go: 'Go',
  ruby: 'Ruby',
  scala: 'Scala',
  rust: 'Rust',
  racket: 'Racket',
  erlang: 'Erlang',
  elixir: 'Elixir',
};

export default function CodingStage() {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const interviewId = params?.interviewId;
  const [problem, setProblem] = useState<CodingProblem | null>(null);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [language, setLanguage] = useState(LANGUAGES[0].id);
  const [code, setCode] = useState(''); // Initialize empty, will be set by useEffect
  const [testResults, setTestResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTestCase, setSelectedTestCase] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLeft, setShowLeft] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [testPanelCases, setTestPanelCases] = useState<TestPanelCase[]>([
    { id: 1, nums: [], target: 0, expectedOutput: '', userOutput: '', status: undefined, diff: '' }
  ]);
  const [testPanelTab, setTestPanelTab] = useState<'Testcase' | 'Test Result'>('Testcase');
  const [testPanelActiveCase, setTestPanelActiveCase] = useState(0);
  const [runtimeMs, setRuntimeMs] = useState(0);
  // Add state for error output
  const [errorOutput, setErrorOutput] = useState<string>("");
  const [signatureLoading, setSignatureLoading] = useState(false);

  // Coding Timer - 30 minutes
  const handleCodingTimerExpire = useCallback(() => {
    if (problem && questionId) {
      // Show notification for auto-submission
      console.log('⏰ Coding timer expired - auto-submitting code');
      
      // Auto-submit current code when time runs out
      handleSubmit();
    }
  }, [problem, questionId]);

  const codingTimer = useCodingTimer({
    onExpire: handleCodingTimerExpire,
    autoStart: true
  });

  // Fetch coding question
  useEffect(() => {
    async function fetchCodingQuestion() {
      console.log('🔍 Fetching coding question for interview:', interviewId);
      setLoading(true);
      setError('');
      try {
        const questionsRes = await apiRequest('GET', `/api/interviews/${interviewId}/questions`);
        const questions: any[] = await questionsRes.json();
        console.log('📋 Fetched questions:', questions);
        const codingQ: any = questions.find((q: any) => q.stage === 2 && q.type === 'coding');
        console.log('🎯 Coding question found:', codingQ);
        if (codingQ) {
          let parsedQuestion;
          try {
            parsedQuestion = typeof codingQ.question === 'string'
              ? JSON.parse(codingQ.question)
              : codingQ.question;
          } catch {
            parsedQuestion = codingQ.question;
          }
          
          // Merge testCases if not present in parsedQuestion
          if (!parsedQuestion.testCases && Array.isArray(codingQ.testCases)) {
            parsedQuestion.testCases = codingQ.testCases;
          }
          
          // If this is a database problem (has problemId), fetch the full problem details
          if (parsedQuestion.problemId) {
            try {
              const problemRes = await apiRequest('GET', `/api/coding-problems/${parsedQuestion.problemId}`);
              const fullProblem = await problemRes.json();
              
              // Merge the full problem details with parsed question
              const combinedProblem = {
                title: fullProblem.problemTitle || parsedQuestion.title,
                description: fullProblem.problemDescription || parsedQuestion.description,
                difficulty: fullProblem.problemHardnessLevel || parsedQuestion.difficulty || 'medium',
                constraints: fullProblem.constraints || parsedQuestion.constraints || [],
                examples: fullProblem.examples || parsedQuestion.examples || [],
                testCases: fullProblem.testCases || parsedQuestion.testCases || [],
                predefinedTemplates: fullProblem.predefinedTemplates || {},
                signaturePlaceholder: fullProblem.signaturePlaceholder || {},
                problemId: fullProblem.id
              };
              
              console.log('✅ Using database problem with templates:', combinedProblem);
              setProblem(combinedProblem);
            } catch (dbError) {
              console.error('⚠️ Failed to fetch full problem details, using parsed question:', dbError);
              setProblem(parsedQuestion);
            }
          } else {
            // Legacy AI-generated problem
            console.log('🔄 Using legacy AI-generated problem:', parsedQuestion);
            setProblem(parsedQuestion);
          }
          
          setQuestionId(codingQ.id);
        } else {
          // More detailed error message
          const allQuestionTypes = questions.map(q => ({ id: q.id, stage: q.stage, type: q.type }));
          setError(`No coding question found for this interview. Available questions: ${JSON.stringify(allQuestionTypes)}`);
          console.error('❌ No coding question found for this interview. Available questions:', allQuestionTypes);
        }
      } catch (e) {
        setError(`Failed to load coding question: ${e instanceof Error ? e.message : String(e)}`);
        console.error('💥 Failed to load coding question:', e);
      } finally {
        setLoading(false);
      }
    }
    if (interviewId) {
      fetchCodingQuestion();
    }
  }, [interviewId]);

  // Set starter code on language or problem change (prioritize database templates as placeholders)
  useEffect(() => {
    function setStarterCode() {
      if (!problem) return;
      setSignatureLoading(true);
      setTestResults([]);
      
      try {
        // PRIORITY 1: Use predefined templates from database as primary placeholders
        if (problem.predefinedTemplates && problem.predefinedTemplates[language]) {
          console.log('Using database template as placeholder for language:', language);
          // Replace \n with actual newlines in the template
          const template = problem.predefinedTemplates[language].replace(/\\n/g, '\n');
          setCode(template);
        } else {
          // PRIORITY 2: Fallback to default language template if no database template exists
          console.log('Using fallback template for language:', language);
          const lang = LANGUAGES.find(l => l.id === language);
          setCode(lang ? lang.defaultCode : '');
        }
      } catch (e) {
        console.error('Error setting starter code:', e);
        // Final fallback to static defaultCode
        const lang = LANGUAGES.find(l => l.id === language);
        setCode(lang ? lang.defaultCode : '');
      } finally {
        setSignatureLoading(false);
      }
    }
    setStarterCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, problem]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleRun();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSubmit(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); handleReset(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // Get dynamic placeholder based on database templates or fallback
  const getPlaceholder = useCallback(() => {
    if (problem?.predefinedTemplates && problem.predefinedTemplates[language]) {
      // Use database template as placeholder
      return problem.predefinedTemplates[language].replace(/\\n/g, '\n');
    } else {
      // Fallback to default language placeholder
      const lang = LANGUAGES.find(l => l.id === language);
      return lang ? lang.defaultCode : '';
    }
  }, [language, problem]);

  // Use AI-generated test cases only
  const aiTestCases = (problem?.testCases || []).map((tc, i) => ({ ...tc, id: i + 1 }));

  // Run/submit logic uses AI test cases
  async function handleRun() {
    setIsRunning(true);
    setTestResults([]);
    try {
      console.log('Submitting user code (handleRun):', code);
      console.log('Frontend sending userCode:', code);
      const testCases = aiTestCases.map(tc => ({
        input: (() => {
          try {
            JSON.parse(tc.input);
            return tc.input;
          } catch {
            return JSON.stringify(tc.input);
          }
        })(),
        expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput : JSON.stringify(tc.expectedOutput)
      }));
      const response = await apiRequest('POST', '/api/code/execute', {
        userCode: code,
        interviewId,
        language
      });
      const result = await response.json();
      // --- LOGGING: Received test case results from backend ---
      console.log('Test case results from backend:', result.testCaseResults);
      const newResults = result.testCaseResults.map((r: any, i: number) => ({
        input: aiTestCases[i].input,
        expectedOutput: aiTestCases[i].expectedOutput, // Use the original expected output from test cases
        userOutput: r.userOutput ?? r.actualOutput ?? r.actual ?? '', // Prefer userOutput, fallback to actualOutput/actual
        passed: r.passed,
        diff: r.diff,
        error: r.error,
        runtimeMs: r.runtimeMs ?? 0,
      }));
      setTestResults(newResults);
      setTestPanelTab('Test Result');
      setRuntimeMs(result.time ? Math.round(parseFloat(result.time) * 1000) : 0);
    } catch (e) {
      setTestResults(aiTestCases.map(tc => ({ input: tc.input, expectedOutput: tc.expectedOutput, userOutput: '', passed: false, diff: '', error: String(e) })));
      setRuntimeMs(0);
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSubmit() {
    setIsRunning(true);
    setTestResults([]);
    try {
      console.log('Submitting user code (handleSubmit):', code);
      console.log('Frontend sending userCode:', code);
      const testCases = aiTestCases.map(tc => ({
        input: (() => {
          try {
            JSON.parse(tc.input);
            return tc.input;
          } catch {
            return JSON.stringify(tc.input);
          }
        })(),
        expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput : JSON.stringify(tc.expectedOutput)
      }));
      const response = await apiRequest('POST', '/api/code/execute', {
        userCode: code,
        interviewId,
        language
      });
      const result = await response.json();
      // --- LOGGING: Received test case results from backend ---
      console.log('Test case results from backend:', result.testCaseResults);
      const newResults = result.testCaseResults.map((r: any, i: number) => ({
        input: aiTestCases[i].input,
        expectedOutput: aiTestCases[i].expectedOutput, // Use the original expected output from test cases
        userOutput: r.userOutput ?? r.actualOutput ?? r.actual ?? '', // Prefer userOutput, fallback to actualOutput/actual
        passed: r.passed,
        diff: r.diff,
        error: r.error,
        runtimeMs: r.runtimeMs ?? 0,
      }));
      setTestResults(newResults);
      setTestPanelTab('Test Result');
      setRuntimeMs(result.time ? Math.round(parseFloat(result.time) * 1000) : 0);
      if (questionId) {
        try {
          console.log('📤 Submitting coding response to backend');
          console.log('🗺 Coding evaluation data:', {
            testCaseResults: result.testCaseResults?.length || 0,
            passedTests: result.testCaseResults?.filter((tc: any) => tc.passed).length || 0,
            totalTests: result.testCaseResults?.length || 0,
            resultKeys: Object.keys(result || {})
          });
          
          // Submit the coding response - backend will automatically handle stage progression
          await apiRequest('POST', '/api/responses', {
            questionId,
            interviewId,
            answer: code,
            codingEvaluation: result // Pass the evaluation results
          });
          
          console.log('✅ Coding response submitted successfully');
          
          // Invalidate React Query cache to ensure fresh interview data is fetched
          queryClient.invalidateQueries({ queryKey: ['/api/interviews', parseInt(interviewId!)] });
          queryClient.invalidateQueries({ queryKey: ['/api/interviews', parseInt(interviewId!), 'questions'] });
          
          // Longer delay to ensure backend processing is complete before navigation
          console.log('⏳ Waiting for backend stage progression to complete...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('🧿 Navigating back to interview page');
          // Navigate back to interview with a parameter to indicate we're coming from coding
          navigate(`/interview/${interviewId}?from=coding&stage=3`);
        } catch (err) {
          setErrorOutput('Failed to submit coding solution. Please try again.');
          console.error('Coding submission error:', err);
        }
      }
      if (result.status && result.status.description !== 'Accepted') {
        let errorMsg = '';
        if (result.status) errorMsg += `Status: ${result.status.description}\n`;
        if (result.compile_output) errorMsg += `\nCompiler Output:\n${result.compile_output}\n`;
        if (result.stderr) errorMsg += `\nRuntime Error:\n${result.stderr}\n`;
        if (result.stdout) errorMsg += `\nStdout (if any):\n${result.stdout}\n`;
        setErrorOutput(errorMsg.trim());
      } else {
        setErrorOutput("");
      }
    } catch (e) {
      setErrorOutput(String(e));
      setRuntimeMs(0);
    } finally {
      setIsRunning(false);
    }
  }

  const handleReset = useCallback(() => {
    // PRIORITY 1: Use database template as primary placeholder, otherwise fallback to default
    if (problem?.predefinedTemplates && problem.predefinedTemplates[language]) {
      console.log('Resetting to database template placeholder for language:', language);
      const template = problem.predefinedTemplates[language].replace(/\\n/g, '\n');
      setCode(template);
    } else {
      console.log('Resetting to fallback template for language:', language);
      const lang = LANGUAGES.find(l => l.id === language);
      setCode(lang ? lang.defaultCode : '');
    }
    setTestResults([]);
  }, [language, problem]);

  // Progress bar (always 100% for single coding question, but can be dynamic)
  const progress = 100;

  // Dark mode toggle
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    return () => {
      document.body.classList.remove('dark');
    };
  }, [darkMode]);

  // Handlers for test panel
  const handleTestPanelCaseSelect = (idx: number) => setTestPanelActiveCase(idx);
  const handleTestPanelTabChange = (tab: 'Testcase' | 'Test Result') => setTestPanelTab(tab);

  if (loading) return <Spinner />;
  if (error) return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!problem) return null;

  return (
    <div className={`flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300`}> 
      {/* Collapsible Left: Problem Description */}
      <div className={`transition-all duration-300 ${showLeft ? 'w-1/3' : 'w-0'} border-r bg-white dark:bg-gray-800 overflow-y-auto p-6 relative`}> 
        <button className="absolute top-4 right-2 z-10" onClick={() => setShowLeft(v => !v)}>
          {showLeft ? <ChevronLeft /> : <ChevronRight />}
        </button>
        {showLeft && (
          <>
            <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">{problem.title}</h1>
            <span className={`inline-block px-2 py-1 rounded text-xs font-bold mb-4 ${
              problem.difficulty?.toLowerCase() === 'easy' ? 'bg-green-100 text-green-700' : 
              problem.difficulty?.toLowerCase() === 'medium' ? 'bg-yellow-100 text-yellow-700' : 
              'bg-red-100 text-red-700'
            }`}>{problem.difficulty || 'Medium'}</span>
            <p className="mb-4 text-gray-800 dark:text-gray-200">{problem.description}</p>
            <h2 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">Constraints</h2>
            <ul className="list-disc list-inside mb-4 text-gray-700 dark:text-gray-300">
              {Array.isArray(problem.constraints) ? 
                problem.constraints.map((c: string, i: number) => <li key={i}>{c}</li>) :
                typeof problem.constraints === 'string' ? 
                  (problem.constraints as string).split('\n').map((c: string, i: number) => <li key={i}>{c}</li>) :
                  <li>No constraints specified</li>
              }
            </ul>
            <h2 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">Examples</h2>
            {problem.examples.map((ex: any, i: number) => (
              <div key={i} className="mb-3 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                <div><b>Input:</b> <span className="font-mono">{ex.input}</span></div>
                <div><b>Output:</b> <span className="font-mono">{ex.output}</span></div>
                {ex.explanation && <div className="text-xs text-gray-600 dark:text-gray-300">{ex.explanation}</div>}
              </div>
            ))}
            {problem.hint && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded flex items-center">
                <Lightbulb className="mr-2 text-blue-500" />
                <span className="text-blue-900 dark:text-blue-100">{problem.hint}</span>
              </div>
            )}
          </>
        )}
      </div>
      {/* Right: Code Editor and Buttons */}
      <div className="flex flex-col w-full">
        {/* --- CODE EDITOR AND BUTTONS --- */}
        <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-gray-800">
          <div className="flex items-center space-x-4">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.id} value={lang.id}>{lang.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRun} disabled={isRunning} variant="default">Run</Button>
            <Button onClick={handleSubmit} disabled={isRunning} variant="default">Submit</Button>
            <Button onClick={handleReset} disabled={isRunning} variant="secondary">Reset</Button>
            <span className="ml-4 text-xs text-gray-500 dark:text-gray-300">Ctrl+Enter: Run &nbsp; Ctrl+S: Submit &nbsp; Ctrl+R: Reset</span>
            {problem?.predefinedTemplates && problem.predefinedTemplates[language] && (
              <span className="ml-4 text-xs text-green-600 dark:text-green-400 font-medium">
                📝 Custom template loaded
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => setDarkMode(v => !v)}>{darkMode ? <Sun /> : <Moon />}</Button>
            {/* Stage indicator pill - keep only this, remove any extra pill */}
            <span className="px-4 py-1 rounded-full font-semibold text-sm ml-2"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                color: darkMode ? '#fff' : '#222',
                border: darkMode ? '1px solid #444' : '1px solid #ddd',
                letterSpacing: '0.03em',
                boxShadow: darkMode ? '0 1px 4px 0 #0002' : '0 1px 4px 0 #0001',
                transition: 'all 0.2s',
                minWidth: 90,
                textAlign: 'center',
                display: 'inline-block',
              }}
            >
              Stage 2 of 3
            </span>
            {/* Coding Timer */}
            <div className="flex items-center space-x-2 ml-4">
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-500">Time:</span>
              </div>
              <div className="relative">
                {/* Circular timer progress indicator */}
                <svg className="w-4 h-4 transform -rotate-90" viewBox="0 0 16 16">
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeDasharray={`${(codingTimer.timeRemaining / (30 * 60)) * 37.7} 37.7`}
                    className={`transition-all duration-1000 ${codingTimer.isWarning ? 'text-red-500' : 'text-blue-500'}`}
                  />
                </svg>
              </div>
              <span className={`font-mono text-lg transition-all duration-300 ${codingTimer.isWarning ? 'text-red-600 font-bold scale-110' : 'text-gray-700'}`}>
                {codingTimer.formatTime()}
              </span>
              {codingTimer.isWarning && (
                <div className="flex items-center space-x-1">
                  <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
                  <span className="text-xs text-red-600 font-medium animate-pulse">Time's running out!</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center space-y-1">
              <Progress value={codingTimer.progress} className="w-32" />
              <span className="text-xs text-gray-500">{Math.round(codingTimer.progress)}% complete</span>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6 flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300 relative">
          <MonacoEditor
            height="400px"
            language={LANGUAGES.find(l => l.id === language)?.monaco || 'python'}
            value={code}
            onChange={(v: string | undefined) => {
              console.log('Editor changed:', v);
              setCode(v || '');
            }}
            theme={darkMode ? 'vs-dark' : 'light'}
            options={{ 
              fontSize: 16, 
              minimap: { enabled: false }, 
              wordWrap: 'on', 
              scrollBeyondLastLine: false,
              showFoldingControls: 'always',
              folding: true,
              lineNumbers: 'on',
              autoIndent: 'advanced',
              formatOnType: true
            }}
          />
          {/* Show placeholder hint when editor is empty */}
          {!code.trim() && (
            <div className="absolute top-8 left-8 text-gray-400 dark:text-gray-500 pointer-events-none text-sm font-mono whitespace-pre-line z-10 bg-transparent">
              {getPlaceholder()}
            </div>
          )}
          {errorOutput && (
            <div className="bg-red-100 text-red-800 p-3 rounded mb-4 whitespace-pre-wrap">
              <strong>Error/Output:</strong>
              <br />
              {errorOutput}
            </div>
          )}
        </div>
        {/* --- TEST PANEL BELOW CODE EDITOR --- */}
        <TestPanel
          cases={aiTestCases}
          tab={testPanelTab}
          activeCase={testPanelActiveCase}
          onCaseSelect={handleTestPanelCaseSelect}
          onTabChange={handleTestPanelTabChange}
          testResults={testResults}
          isRunning={isRunning}
          onRunTests={handleRun}
          runtimeMs={testResults[testPanelActiveCase]?.runtimeMs ?? runtimeMs}
        />
        {/* If you use TestCaseResultsPanel elsewhere, pass runtimeMs and results as well */}
      </div>
    </div>
  );
} 