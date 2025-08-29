import React, { useState } from 'react';
import ResumeUpload from './ResumeUpload';

interface ResumeInterviewProps {
  onCreate: (data: any) => void;
  roleForm?: React.ReactNode;
}

const ResumeInterview: React.FC<ResumeInterviewProps> = ({ onCreate, roleForm }) => {
  const [tab, setTab] = useState<'role' | 'resume'>('role');

  return (
    <div>
      <div className="flex space-x-2 mb-4">
        <button className={`btn ${tab === 'role' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('role')}>Create via Role + Experience</button>
        <button className={`btn ${tab === 'resume' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('resume')}>Create via Resume</button>
      </div>
      {tab === 'role' ? (
        <div>{roleForm}</div>
      ) : (
        <ResumeUpload />
      )}
    </div>
  );
};

export default ResumeInterview; 