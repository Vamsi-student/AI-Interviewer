import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Play, CheckCircle, XCircle, Clock, MemoryStick } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CodeEditorProps {
  question: any;
  onSubmit: (code: string, result: any) => void;
  disabled?: boolean;
}

const LANGUAGES = [
  { id: 'python', name: 'Python', defaultCode: '# Write your solution here\ndef solution():\n    pass' },
  { id: 'javascript', name: 'JavaScript', defaultCode: '// Write your solution here\nfunction solution() {\n    \n}' },
  { id: 'java', name: 'Java', defaultCode: 'public class Solution {\n    public void solution() {\n        \n    }\n}' },
  { id: 'cpp', name: 'C++', defaultCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}' },
  { id: 'c', name: 'C', defaultCode: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}' }
];

export default function CodeEditor({ question, onSubmit, disabled }: CodeEditorProps) {
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();

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
      const response = await fetch('/api/code/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          code,
          language: selectedLanguage,
          testCases: questionData.testCases || []
        }),
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

  const getAuthToken = async () => {
    // This should be implemented to get the current auth token
    return localStorage.getItem('authToken') || '';
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
              placeholder="Write your code here..."
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
