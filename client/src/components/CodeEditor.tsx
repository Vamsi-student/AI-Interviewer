import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Play, CheckCircle, XCircle, Clock, MemoryStick } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

interface CodeEditorProps {
  question: any;
  onSubmit: (code: string, result: any) => void;
  disabled?: boolean;
}

const LANGUAGES = [
  { id: 'python', name: 'Python', defaultCode: '# Implement the function as described. Do NOT use input() or print(). Return the result.\ndef solution(s):\n    # your code here\n    return ...', placeholder: '# Implement the function as described. Do NOT use input() or print(). Return the result.\ndef solution(s):\n    # your code here\n    return ...' },
  { id: 'javascript', name: 'JavaScript', defaultCode: '// Implement the function as described. Do NOT use prompt() or console.log(). Return the result.\nfunction solution(s) {\n    // your code here\n    return ...;\n}', placeholder: '// Implement the function as described. Do NOT use prompt() or console.log(). Return the result.\nfunction solution(s) {\n    // your code here\n    return ...;\n}' },
  { id: 'java', name: 'Java', defaultCode: '// Implement the function as described. Do NOT use Scanner or System.out.println(). Return the result.\npublic class Solution {\n    public static int solution(String s) {\n        // your code here\n        return ...;\n    }\n}', placeholder: '// Implement the function as described. Do NOT use Scanner or System.out.println(). Return the result.\npublic class Solution {\n    public static int solution(String s) {\n        // your code here\n        return ...;\n    }\n}' },
  { id: 'cpp', name: 'C++', defaultCode: '// Implement the function as described. Do NOT use cin/cout. Return the result.\nclass Solution {\npublic:\n    int solution(std::string s) {\n        // your code here\n        return ...;\n    }\n};', placeholder: '// Implement the function as described. Do NOT use cin/cout. Return the result.\nclass Solution {\npublic:\n    int solution(std::string s) {\n        // your code here\n        return ...;\n    }\n};' },
  { id: 'c', name: 'C', defaultCode: '// Implement the function as described. Do NOT use scanf/printf. Return the result.\nint solution(char* s) {\n    // your code here\n    return ...;\n}', placeholder: '// Implement the function as described. Do NOT use scanf/printf. Return the result.\nint solution(char* s) {\n    // your code here\n    return ...;\n}' }
];

export default function CodeEditor({ question, onSubmit, disabled }: CodeEditorProps) {
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const questionData = typeof question.question === 'string' 
    ? JSON.parse(question.question) 
    : question.question;

  useEffect(() => {
    const language = LANGUAGES.find(lang => lang.id === selectedLanguage);
    if (language) {
      setCode(language.defaultCode);
    }
  }, [selectedLanguage]);

  const executeCode = async () => {
    if (!code.trim()) {
      toast({
        title: "Empty Code",
        description: "Please write some code before executing.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {
      const response = await apiRequest('POST', '/api/code/execute', {
        userCode: code,
        language: selectedLanguage,
        testCases: questionData.testCases || []
      });
      if (!response.ok) {
        throw new Error('Failed to execute code');
      }
      const result = await response.json();
      setExecutionResult(result);
      if (result.passed) {
        toast({
          title: "All Tests Passed!",
          description: `${result.passedTests}/${result.totalTests} test cases passed.`,
        });
      } else {
        toast({
          title: "Some Tests Failed",
          description: `${result.passedTests}/${result.totalTests} test cases passed.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Code execution error:', error);
      toast({
        title: "Execution Error",
        description: "Failed to execute code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSubmit = () => {
    if (!executionResult) {
      toast({
        title: "Run Code First",
        description: "Please run your code to see the results before submitting.",
        variant: "destructive",
      });
      return;
    }

    onSubmit(code, executionResult);
  };

  return (
    <div className="space-y-6">
      {/* Problem Statement */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{questionData.title}</CardTitle>
            <Badge variant="outline" className={
              questionData.difficulty === 'Easy' ? 'border-green-500 text-green-700' :
              questionData.difficulty === 'Medium' ? 'border-yellow-500 text-yellow-700' :
              'border-red-500 text-red-700'
            }>
              {questionData.difficulty}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Problem Description</h4>
            <p className="text-gray-700">{questionData.description}</p>
          </div>

          {questionData.constraints && questionData.constraints.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Constraints</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                {questionData.constraints.map((constraint: string, index: number) => (
                  <li key={index}>{constraint}</li>
                ))}
              </ul>
            </div>
          )}

          {questionData.examples && questionData.examples.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Examples</h4>
              <div className="space-y-3">
                {questionData.examples.map((example: any, index: number) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-600">Input:</div>
                        <div className="font-mono text-sm bg-white p-2 rounded border">
                          {example.input}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-600">Output:</div>
                        <div className="font-mono text-sm bg-white p-2 rounded border">
                          {example.output}
                        </div>
                      </div>
                    </div>
                    {example.explanation && (
                      <div className="mt-2">
                        <div className="text-sm font-medium text-gray-600">Explanation:</div>
                        <div className="text-sm text-gray-700">{example.explanation}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coding Challenge Instructions */}
      <Card className="mb-4 border-blue-500 border-2 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-lg text-blue-800">Coding Challenge Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside text-blue-900 space-y-1">
            <li>Implement the function as described in the problem statement.</li>
            <li><b>Do not use <code>input()</code> or <code>print()</code> in your code.</b></li>
            <li>Your function should accept the required arguments and <b>return</b> the result.</li>
            <li>The platform will call your function directly with test cases.</li>
            <li>Example (Python): <code>def solution(s):</code> <span className="text-gray-600"># return the answer</span></li>
          </ul>
        </CardContent>
      </Card>

      {/* Code Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Code Editor</CardTitle>
            <div className="flex items-center space-x-4">
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.id} value={lang.id}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={executeCode}
                disabled={isExecuting || disabled}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="h-4 w-4 mr-2" />
                {isExecuting ? 'Running...' : 'Run Code'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-96 p-4 font-mono text-sm border-0 resize-none focus:outline-none focus:ring-0"
              placeholder={LANGUAGES.find(lang => lang.id === selectedLanguage)?.placeholder}
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Execution Results */}
      {executionResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {executionResult.passed ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span>Execution Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Warning banner for fallback mode */}
            {executionResult.error && executionResult.error.includes('Judge0 API') && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Limited Code Validation
                    </h3>
                    <div className="mt-1 text-sm text-yellow-700">
                      {executionResult.error}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="output">Output</TabsTrigger>
                <TabsTrigger value="errors">Errors</TabsTrigger>
              </TabsList>
              
              <TabsContent value="summary" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">
                      {executionResult.passedTests}/{executionResult.totalTests}
                    </div>
                    <div className="text-sm text-gray-600">Tests Passed</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-center">
                      <Clock className="h-4 w-4 mr-1" />
                      <span className="text-lg font-bold text-gray-900">
                        {executionResult.time}s
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">Execution Time</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-center">
                      <MemoryStick className="h-4 w-4 mr-1" />
                      <span className="text-lg font-bold text-gray-900">
                        {executionResult.memory}KB
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">Memory Used</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">
                      {executionResult.status}
                    </div>
                    <div className="text-sm text-gray-600">Status</div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="output">
                <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
                  <pre className="whitespace-pre-wrap">
                    {executionResult.stdout || 'No output'}
                  </pre>
                </div>
              </TabsContent>
              
              <TabsContent value="errors">
                <div className="bg-gray-900 text-red-400 p-4 rounded-lg font-mono text-sm">
                  <pre className="whitespace-pre-wrap">
                    {executionResult.stderr || executionResult.compile_output || 'No errors'}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={disabled || !executionResult}
          className="btn-primary"
          size="lg"
        >
          Submit Solution
        </Button>
      </div>
    </div>
  );
}
