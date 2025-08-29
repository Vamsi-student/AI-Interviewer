import { exec } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Transcribes audio using the open-source Whisper CLI
 * @param audioPath Full file path to audio (WAV, MP3, etc.)
 * @returns The transcribed text
 */
export const transcribeWithWhisper = (audioPath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // ❗ Auto-detect language instead of hardcoding
    const command = `whisper "${audioPath}" --model base --output_format txt --output_dir "${path.dirname(audioPath)}"`;
    console.log('🔧 Executing Whisper command:', command);

    // Set environment variables to handle Unicode properly on Windows
    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONLEGACYWINDOWSSTDIO: 'utf-8'
    };

    exec(command, { 
      env,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    }, (err, stdout, stderr) => {
      console.log('📤 Whisper stdout:', stdout);
      console.log('📤 Whisper stderr:', stderr);
      
      // Check for Unicode encoding error specifically
      if (stderr && stderr.includes('UnicodeEncodeError') && stderr.includes('charmap')) {
        console.warn('⚠️ Unicode encoding error detected, trying alternative approach...');
        // Try with a different command approach
        const alternativeCommand = `python -c "import whisper; model = whisper.load_model('base'); result = model.transcribe('${audioPath.replace(/\\/g, '/')}'); print(result['text'])"`;
        
        exec(alternativeCommand, { 
          env,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024 * 10
        }, (altErr, altStdout, altStderr) => {
          if (altErr) {
            console.error("❌ Alternative Whisper approach failed:", altErr);
            return reject("Whisper transcription failed due to encoding issues.");
          }
          
          if (altStdout && altStdout.trim()) {
            console.log('✅ Alternative transcription successful');
            // Clean up temp files
            try {
              fs.unlinkSync(audioPath);
            } catch (cleanupErr) {
              console.warn('⚠️ Could not clean up audio file:', cleanupErr);
            }
            resolve(altStdout.trim());
          } else {
            reject("Alternative transcription produced no output.");
          }
        });
        return;
      }
      
      if (err) {
        console.error("❌ Whisper CLI error:", err);
        return reject("Whisper CLI execution failed.");
      }

      const transcriptPath = audioPath.replace(path.extname(audioPath), ".txt");
      console.log('📁 Looking for transcript file:', transcriptPath);
      
      // Check if file exists before trying to read it
      if (!fs.existsSync(transcriptPath)) {
        console.error('❌ Transcript file does not exist:', transcriptPath);
        console.log('📂 Files in directory:', fs.readdirSync(path.dirname(audioPath)));
        return reject("Transcript file was not created by Whisper.");
      }

      try {
        const transcript = fs.readFileSync(transcriptPath, "utf-8");
        console.log('✅ Transcript file read successfully, length:', transcript.length);

        // 🧹 Clean up temp files
        fs.unlinkSync(audioPath);
        fs.unlinkSync(transcriptPath);

        resolve(transcript);
      } catch (fileError) {
        console.error("❌ Transcript file read error:", fileError);
        reject("Failed to read transcription output.");
      }
    });
  });
};

/**
 * Transcribes audio blob using Whisper CLI
 * @param audioBlob Buffer containing audio data OR existing file path
 * @param existingFilePath Optional path to existing audio file (to avoid duplicate saves)
 * @returns The transcribed text
 */
export async function transcribeAudio(audioBlob: Buffer | string, existingFilePath?: string): Promise<string> {
  try {
    console.log('🎤 Starting audio transcription with Whisper CLI...');
    
    let audioPath: string;
    
    if (typeof audioBlob === 'string') {
      // If audioBlob is already a file path, use it directly
      audioPath = audioBlob;
      console.log('📁 Using existing audio file:', audioPath);
    } else if (existingFilePath && fs.existsSync(existingFilePath)) {
      // If we have an existing file path and it exists, use it
      audioPath = existingFilePath;
      console.log('📁 Using existing audio file:', audioPath);
    } else {
      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Generate unique filename with simple characters to avoid Unicode issues
      const timestamp = Date.now();
      const simpleName = `audio_${timestamp}.wav`;
      audioPath = path.join(uploadsDir, simpleName);
      
      // Write audio blob to file
      fs.writeFileSync(audioPath, audioBlob);
      console.log('📁 Audio file saved:', audioPath);
    }
    
    // Transcribe using Whisper CLI
    const transcript = await transcribeWithWhisper(audioPath);
    
    console.log('✅ Transcription successful:', transcript.substring(0, 100) + '...');
    return transcript.trim();
    
  } catch (error) {
    console.error("❌ Error transcribing audio:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to transcribe audio: ${errorMessage}`);
  }
}

// Helper: submit a single test case with retry logic
async function submitWithRetry(submission: any, JUDGE0_API_KEYS: string[], JUDGE0_API_URL: string, JUDGE0_API_HOST: string, exhaustedKeys: Set<string>) {
  for (let i = 0; i < JUDGE0_API_KEYS.length; i++) {
    const apiKey = JUDGE0_API_KEYS[i];
    if (!apiKey || exhaustedKeys.has(apiKey)) continue;
    const response = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': JUDGE0_API_HOST,
      } as Record<string, string>,
      body: JSON.stringify(submission),
    });
    if (response.ok) {
      return await response.json();
    } else {
      const errorText = await response.text();
      if (response.status === 429) {
        exhaustedKeys.add(apiKey);
        continue;
      }
      if (response.status === 403) {
        exhaustedKeys.add(apiKey);
        continue;
      }
      throw new Error(`Judge0 API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }
  throw new Error('All API keys exhausted for this test case');
}
