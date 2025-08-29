import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken } from '../../lib/auth';

interface ParsedResume {
  name?: string;
  email?: string;
  skills?: string[];
  education?: string;
  experience?: string;
  projects?: string;
  certifications?: string;
  role?: string;
  experienceLevel?: string;
  techAreas?: string[];
}

const defaultParsed: ParsedResume = {};

const ResumeUpload: React.FC = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
        setFile(null);
        setParsed(null);
        setFileWarning('Only PDF files are allowed.');
        setError(null);
        return;
      }
      setFile(selectedFile);
      setParsed(null);
      setError(null);
      setFileWarning(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setFileWarning(null);
    const formData = new FormData();
    formData.append('resume', file);
    try {
      const res = await fetch('/api/resume/analyze', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        if (errData.error === 'Please upload a resume. This does not appear to be a resume.') {
          setError(errData.error);
          setParsed(null);
          return;
        }
        throw new Error(errData.error || 'Failed to analyze resume');
      }
      const data = await res.json();
      console.log('📄 Resume parsed data:', data);
      console.log('📄 Education:', data.education);
      console.log('📄 Experience:', data.experience);
      console.log('📄 Projects:', data.projects);
      console.log('📄 Certifications:', data.certifications);
      setParsed(data);
    } catch (err: any) {
      setError(err.message || 'Error uploading resume');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: keyof ParsedResume, value: string | string[]) => {
    setParsed(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleConfirmAndCreate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('resume', file);
    try {
      // Get the auth token
      const token = await getAuthToken();
      console.log('🔑 Using auth token for resume upload:', token ? 'Token present' : 'No token');
      if (!token) {
        throw new Error('No authentication token available. Please log in again.');
      }
      
      // Use the correct endpoint that's defined in the server
      console.log('📤 Sending request with headers:', { 'Authorization': `Bearer ${token.substring(0, 20)}...` });
      const res = await fetch('/api/resume/from-resume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create interview from resume');
      }
      
      const interview = await res.json();
      console.log('✅ Interview created successfully:', interview);
      
      // Store the interview ID in localStorage for debugging
      localStorage.setItem('last-created-interview', JSON.stringify(interview));
      
      // Use React Router navigation instead of window.location.href
      // Add a longer delay to ensure backend processing is complete
      setTimeout(() => {
        console.log('🚀 Navigating to interview:', interview.id);
        navigate(`/interview/${interview.id}`);
      }, 1000);
      
    } catch (err: any) {
      console.error('❌ Error creating interview:', err);
      setError(err.message || 'Error creating interview');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[880px] w-full max-h-[80vh] overflow-auto space-y-6">
      {/* Upload Row */}
      <div className="flex items-start space-x-4">
        <div className="flex-1">
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        {file && (
            <div className="mt-1 text-xs text-gray-500">
            {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </div>
        )}
          <div className="mt-1 text-xs text-gray-500">PDF only. Max 5MB.</div>
        </div>
        <button 
          onClick={handleUpload} 
          disabled={!file || loading} 
          className="btn btn-primary whitespace-nowrap"
          aria-live="polite"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2 inline"></div>
              Analyzing resume…
            </>
          ) : (
            'Upload & Analyze'
          )}
        </button>
      </div>

      {/* Analysis State */}
      {fileWarning && <div className="text-red-600 text-xs">{fileWarning}</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="text-red-700 text-sm">{error}</div>
          <button 
            onClick={handleUpload} 
            className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}
      {parsed && !error && (
        <div className="bg-green-50 text-green-700 border border-green-200 rounded-md px-3 py-1 text-xs inline-block">
          Resume analyzed
        </div>
      )}

      {/* Preview & Edit */}
      {parsed && (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-sm">Preview & Edit Resume Data</h3>
            <div className="text-xs text-gray-500">
              {[
                parsed.education,
                parsed.experience,
                parsed.projects,
                parsed.certifications
              ].filter(Boolean).length}/4 detailed fields extracted
            </div>
          </div>
            {/* Basic Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Basic Information</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Name</span>
                <input 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" 
                  value={parsed.name || ''} 
                  onChange={e => handleFieldChange('name', e.target.value)} 
                />
              </label>
              
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Email</span>
                <input 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" 
                  value={parsed.email || ''} 
                  onChange={e => handleFieldChange('email', e.target.value)} 
                />
              </label>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Role</span>
                <input 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" 
                  value={parsed.role || ''} 
                  onChange={e => handleFieldChange('role', e.target.value)} 
                />
              </label>
              
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Experience Level</span>
                <select 
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={parsed.experienceLevel || ''}
                  onChange={e => handleFieldChange('experienceLevel', e.target.value)}
                >
                  <option value="">Select experience level</option>
                  <option value="Entry Level 0-2 years">Entry Level 0-2 years</option>
                  <option value="Mid Level 3-5 years">Mid Level 3-5 years</option>
                  <option value="Senior Level 6-10 years">Senior Level 6-10 years</option>
                  <option value="Lead Level 10+ years">Lead Level 10+ years</option>
                </select>
              </label>
            </div>
          </div>
          
          {/* Skills Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Skills</h4>
            </div>
            
            <div className="space-y-2">
              <div className="flex space-x-2">
                <input 
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" 
                  placeholder="Add a skill..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const input = e.target as HTMLInputElement;
                      const newSkill = input.value.trim();
                      if (newSkill && !parsed.skills?.includes(newSkill)) {
                        handleFieldChange('skills', [...(parsed.skills || []), newSkill]);
                        input.value = '';
                      }
                    }
                  }}
                />
                <button 
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                  onClick={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    const newSkill = input.value.trim();
                    if (newSkill && !parsed.skills?.includes(newSkill)) {
                      handleFieldChange('skills', [...(parsed.skills || []), newSkill]);
                      input.value = '';
                    }
                  }}
                >
                  Add
                </button>
              </div>
              
              {parsed.skills && parsed.skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {parsed.skills.map((skill, index) => (
                    <span 
                      key={index}
                      className="inline-flex items-center bg-gray-100 rounded-md px-2 py-1 text-xs"
                    >
                      {skill}
                      <button
                        type="button"
                        className="ml-1 text-gray-400 hover:text-gray-600"
                        onClick={() => handleFieldChange('skills', parsed.skills?.filter((_, i) => i !== index) || [])}
                        aria-label={`Remove ${skill}`}
                      >
                        ×
                      </button>
                </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Education Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Education</h4>
              <button 
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                onClick={() => {
                  const newEducation = prompt("Enter education details:");
                  if (newEducation) {
                    handleFieldChange('education', newEducation);
                  }
                }}
              >
                Add
              </button>
            </div>
            
            {parsed.education ? (
              <div className="rounded-md border p-3 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">Degree</div>
                    <div className="text-xs text-gray-600 mt-1 max-h-8 overflow-hidden">
                      {parsed.education}
                    </div>
                  </div>
                  <div className="flex space-x-1 ml-2">
                    <button 
                      className="text-gray-400 hover:text-gray-600" 
                      aria-label="Edit education"
                      onClick={() => {
                        const newEducation = prompt("Edit education details:", parsed.education);
                        if (newEducation !== null) {
                          handleFieldChange('education', newEducation);
                        }
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No education items yet. <button 
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={() => {
                    const newEducation = prompt("Enter education details:");
                    if (newEducation) {
                      handleFieldChange('education', newEducation);
                    }
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Work Experience Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Work Experience</h4>
              <button 
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                onClick={() => {
                  const newExperience = prompt("Enter work experience details:");
                  if (newExperience) {
                    handleFieldChange('experience', newExperience);
                  }
                }}
              >
                Add
              </button>
            </div>
            
            {parsed.experience ? (
              <div className="rounded-md border p-3 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                  
                    <div className="text-xs text-gray-600 mt-1 max-h-8 overflow-hidden">
                      {parsed.experience}
                    </div>
                  </div>
                  <div className="flex space-x-1 ml-2">
                    <button 
                      className="text-gray-400 hover:text-gray-600" 
                      aria-label="Edit experience"
                      onClick={() => {
                        const newExperience = prompt("Edit work experience details:", parsed.experience);
                        if (newExperience !== null) {
                          handleFieldChange('experience', newExperience);
                        }
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No work experience yet. <button 
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={() => {
                    const newExperience = prompt("Enter work experience details:");
                    if (newExperience) {
                      handleFieldChange('experience', newExperience);
                    }
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Projects Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Projects</h4>
              <button 
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                onClick={() => {
                  const newProject = prompt("Enter project details:");
                  if (newProject) {
                    handleFieldChange('projects', newProject);
                  }
                }}
              >
                Add
              </button>
            </div>
            
            {parsed.projects ? (
              <div className="rounded-md border p-3 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">Project Name</div>
                    <div className="text-xs text-gray-500">Description of the project</div>
                    <div className="text-xs text-gray-600 mt-1 max-h-8 overflow-hidden">
                      {parsed.projects}
                    </div>
                     
                  </div>
                  <div className="flex space-x-1 ml-2">
                    <button 
                      className="text-gray-400 hover:text-gray-600" 
                      aria-label="Edit project"
                      onClick={() => {
                        const newProject = prompt("Edit project details:", parsed.projects);
                        if (newProject !== null) {
                          handleFieldChange('projects', newProject);
                        }
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No projects yet. <button 
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={() => {
                    const newProject = prompt("Enter project details:");
                    if (newProject) {
                      handleFieldChange('projects', newProject);
                    }
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Certifications Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Certifications</h4>
              <button 
                className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                onClick={() => {
                  const newCertification = prompt("Enter certification details:");
                  if (newCertification) {
                    handleFieldChange('certifications', newCertification);
                  }
                }}
              >
                Add
              </button>
            </div>
            
            {parsed.certifications ? (
              <div className="rounded-md border p-3 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">Certification Name</div>
                    <div className="text-xs text-gray-500">Description of the certification</div>
                    <div className="text-xs text-gray-600 mt-1 max-h-8 overflow-hidden">
                      {parsed.certifications}
                    </div>
                  </div>
                  <div className="flex space-x-1 ml-2">
                    <button 
                      className="text-gray-400 hover:text-gray-600" 
                      aria-label="Edit certification"
                      onClick={() => {
                        const newCertification = prompt("Edit certification details:", parsed.certifications);
                        if (newCertification !== null) {
                          handleFieldChange('certifications', newCertification);
                        }
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No certifications yet. <button 
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={() => {
                    const newCertification = prompt("Enter certification details:");
                    if (newCertification) {
                      handleFieldChange('certifications', newCertification);
                    }
                  }}
                >
                  Add
          </button>
              </div>
            )}
          </div>
          

          
          {/* Validation and Confirm Button */}
          <div className="space-y-2">
            <button 
              className="w-full px-4 py-2 rounded text-white bg-green-600 hover:bg-green-700 font-medium text-sm shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed" 
              onClick={handleConfirmAndCreate} 
              disabled={loading || !parsed.role || !parsed.experienceLevel || !parsed.skills || parsed.skills.length === 0}
            >
              {loading ? 'Creating Interview...' : 'Confirm & Generate Interview'}
            </button>
            
            {(!parsed.role || !parsed.experienceLevel || !parsed.skills || parsed.skills.length === 0) && (
              <div className="text-xs text-gray-500 text-center">
                Add role, experience level, and at least one skill.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeUpload;