export interface CodeExecutionResult {
  status: string;
  stdout: string;
  stderr: string;
  compile_output: string;
  time: string;
  memory: number;
  passed: boolean;
  totalTests: number;
  passedTests: number;
}

export async function executeCode(
  code: string, 
  language: string, 
  testCases: Array<{ input: string; expectedOutput: string }>
): Promise<CodeExecutionResult> {
  try {
    const languageId = getLanguageId(language);
    let allPassed = 0;
    let results: any[] = [];

    // Execute code for each test case
    for (const testCase of testCases) {
      const submission = {
        source_code: btoa(code), // base64 encode
        language_id: languageId,
        stdin: btoa(testCase.input),
        expected_output: btoa(testCase.expectedOutput),
      };

      const response = await fetch(`${process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com'}/submissions?base64_encoded=true&wait=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': process.env.JUDGE0_API_KEY || '',
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
        },
        body: JSON.stringify(submission),
      });

      if (!response.ok) {
        throw new Error(`Judge0 API error: ${response.statusText}`);
      }

      const result = await response.json();
      results.push(result);

      // Check if test case passed
      if (result.status?.id === 3 && result.stdout) { // Status 3 = Accepted
        const actualOutput = atob(result.stdout).trim();
        const expected = testCase.expectedOutput.trim();
        if (actualOutput === expected) {
          allPassed++;
        }
      }
    }

    // Return aggregated results
    const firstResult = results[0] || {};
    return {
      status: firstResult.status?.description || 'Unknown',
      stdout: firstResult.stdout ? atob(firstResult.stdout) : '',
      stderr: firstResult.stderr ? atob(firstResult.stderr) : '',
      compile_output: firstResult.compile_output ? atob(firstResult.compile_output) : '',
      time: firstResult.time || '0',
      memory: firstResult.memory || 0,
      passed: allPassed === testCases.length,
      totalTests: testCases.length,
      passedTests: allPassed,
    };
  } catch (error) {
    console.error('Error executing code:', error);
    return {
      status: 'Error',
      stdout: '',
      stderr: 'Failed to execute code',
      compile_output: '',
      time: '0',
      memory: 0,
      passed: false,
      totalTests: testCases.length,
      passedTests: 0,
    };
  }
}

function getLanguageId(language: string): number {
  const languageMap: { [key: string]: number } = {
    'javascript': 63,
    'python': 71,
    'java': 62,
    'cpp': 54,
    'c': 50,
    'csharp': 51,
    'go': 60,
    'rust': 73,
    'typescript': 74,
  };

  return languageMap[language.toLowerCase()] || 71; // Default to Python
}
