import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./useAuth";
import type { Interview, Question, Response, InterviewFormData } from "@/types/interview";

// Query hooks at the top level
export function useInterviewsQuery() {
  const { getToken, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!authLoading) {
      getToken().then(token => setEnabled(!!token));
    }
  }, [getToken, authLoading]);
  return useQuery({
    queryKey: ['/api/interviews'],
    enabled,
    // Refetch every 30 seconds for real-time updates
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const token = await getToken();
      const response = await apiRequest('GET', `/api/interviews`);
      return await response.json();
    }
  });
}

export function useInterviewQuery(id: number | null) {
  const { getToken, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!authLoading) {
      getToken().then(token => setEnabled(!!id && !!token));
    }
  }, [id, getToken, authLoading]);
  return useQuery({
    queryKey: ['/api/interviews', id],
    enabled,
    retry: (failureCount, error: any) => {
      console.log(`🔄 Interview query retry attempt ${failureCount + 1}:`, error);
      // Retry up to 5 times for 404 errors (interview might still be processing)
      if (error?.status === 404 && failureCount < 5) {
        return true;
      }
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(500 + (attemptIndex * 300), 800), // 500-800ms backoff
    queryFn: async () => {
      const token = await getToken();
      console.log(`🔍 Fetching interview ${id} with token:`, !!token);
      const response = await apiRequest('GET', `/api/interviews/${id}`);
      const data = await response.json();
      console.log(`✅ Interview ${id} data:`, data);
      return data;
    }
  });
}

export function useQuestionsQuery(interviewId: number | null) {
  const { getToken, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!authLoading) {
      getToken().then(token => setEnabled(!!interviewId && !!token));
    }
  }, [interviewId, getToken, authLoading]);
  return useQuery({
    queryKey: ['/api/interviews', interviewId, 'questions'],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      const response = await apiRequest('GET', `/api/interviews/${interviewId}/questions`);
      return await response.json(); // ensure this is an array
    }
  });
}

export function useResponsesQuery(interviewId: number | null) {
  const { getToken, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!authLoading) {
      getToken().then(token => setEnabled(!!interviewId && !!token));
    }
  }, [interviewId, getToken, authLoading]);
  return useQuery({
    queryKey: ['/api/interviews', interviewId, 'responses'],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      const response = await apiRequest('GET', `/api/interviews/${interviewId}/responses`);
      return await response.json(); // ensure this is an array
    }
  });
}

// Only mutation hooks remain in useInterview
export function useInterview() {
  const { getToken, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [currentInterviewId, setCurrentInterviewId] = useState<number | null>(null);

  const createInterviewMutation = useMutation({
    mutationFn: async (data: InterviewFormData) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/interviews', data);
      return await response.json();
    },
    onSuccess: (interview: Interview) => {
      setCurrentInterviewId(interview.id);
      queryClient.invalidateQueries({ queryKey: ['/api/interviews'] });
    },
  });

  const updateInterviewMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Interview> }) => {
      const token = await getToken();
      const response = await apiRequest('PUT', `/api/interviews/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/interviews'] });
      if (currentInterviewId) {
        queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId] });
      }
    },
  });

  const completeInterviewMutation = useMutation({
    mutationFn: async (interviewId: number) => {
      const token = await getToken();
      const response = await apiRequest('POST', `/api/interviews/${interviewId}/complete`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/interviews'] });
      if (currentInterviewId) {
        queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId] });
      }
    },
  });

  const submitResponseMutation = useMutation({
    mutationFn: async (data: { questionId: number; answer: string; audioBlob?: string; codingEvaluation?: any }) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/responses', data);
      return await response.json();
    },
    onSuccess: (result, variables) => {
      if (currentInterviewId) {
        queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId, 'responses'] });
        
        // If this was a coding response that triggered stage progression, invalidate interview data
        if (variables.codingEvaluation && result.navigateToStage3) {
          console.log('🔄 Coding response triggered stage progression - invalidating interview cache');
          queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId] });
          queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId, 'questions'] });
        }
      }
    },
  });

  const generateVoiceQuestionMutation = useMutation({
    mutationFn: async (interviewId: number) => {
      console.log('🚨 MUTATION: generateVoiceQuestionMutation called for interview', interviewId);
      const token = await getToken();
      const response = await apiRequest('POST', `/api/interviews/${interviewId}/voice-question`, {});
      return await response.json();
    },
    onSuccess: (_, interviewId) => {
      console.log('✅ Voice question generated successfully for interview', interviewId);
      queryClient.invalidateQueries({ queryKey: ['/api/interviews', interviewId, 'questions'] });
    },
  });

  const executeCodeMutation = useMutation({
    mutationFn: async (data: { userCode: string; language: string; testCases: any[] }) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/code/execute', data);
      return await response.json();
    },
  });

  const regenerateQuestionsMutation = useMutation({
    mutationFn: async (interviewId: number) => {
      const token = await getToken();
      const response = await apiRequest('POST', `/api/interviews/${interviewId}/regenerate-questions`, {});
      return await response.json();
    },
    onSuccess: (_, interviewId) => {
      // Only invalidate the questions cache - more targeted approach
      queryClient.invalidateQueries({ queryKey: ['/api/interviews', interviewId, 'questions'] });
    },
  });

  return {
    currentInterviewId,
    setCurrentInterviewId,
    createInterviewMutation,
    updateInterviewMutation,
    completeInterviewMutation,
    submitResponseMutation,
    generateVoiceQuestionMutation,
    executeCodeMutation,
    regenerateQuestionsMutation,
  };
}