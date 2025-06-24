import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./useAuth";
import type { Interview, Question, Response, InterviewFormData } from "@/types/interview";

export function useInterview() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [currentInterviewId, setCurrentInterviewId] = useState<number | null>(null);

  const createInterviewMutation = useMutation({
    mutationFn: async (data: InterviewFormData) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/interviews', data);
      return response.json();
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
      return response.json();
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
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/interviews'] });
      if (currentInterviewId) {
        queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId] });
      }
    },
  });

  const submitResponseMutation = useMutation({
    mutationFn: async (data: { questionId: number; answer: string; audioBlob?: string }) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/responses', data);
      return response.json();
    },
    onSuccess: () => {
      if (currentInterviewId) {
        queryClient.invalidateQueries({ queryKey: ['/api/interviews', currentInterviewId, 'responses'] });
      }
    },
  });

  const generateVoiceQuestionMutation = useMutation({
    mutationFn: async (interviewId: number) => {
      const token = await getToken();
      const response = await apiRequest('POST', `/api/interviews/${interviewId}/voice-question`, {});
      return response.json();
    },
  });

  const executeCodeMutation = useMutation({
    mutationFn: async (data: { code: string; language: string; testCases: any[] }) => {
      const token = await getToken();
      const response = await apiRequest('POST', '/api/code/execute', data);
      return response.json();
    },
  });

  // Queries
  const useInterviewsQuery = () => {
    return useQuery({
      queryKey: ['/api/interviews'],
      enabled: !!getToken,
    });
  };

  const useInterviewQuery = (id: number | null) => {
    return useQuery({
      queryKey: ['/api/interviews', id],
      enabled: !!id && !!getToken,
    });
  };

  const useQuestionsQuery = (interviewId: number | null) => {
    return useQuery({
      queryKey: ['/api/interviews', interviewId, 'questions'],
      enabled: !!interviewId && !!getToken,
    });
  };

  const useResponsesQuery = (interviewId: number | null) => {
    return useQuery({
      queryKey: ['/api/interviews', interviewId, 'responses'],
      enabled: !!interviewId && !!getToken,
    });
  };

  return {
    currentInterviewId,
    setCurrentInterviewId,
    createInterviewMutation,
    updateInterviewMutation,
    completeInterviewMutation,
    submitResponseMutation,
    generateVoiceQuestionMutation,
    executeCodeMutation,
    useInterviewsQuery,
    useInterviewQuery,
    useQuestionsQuery,
    useResponsesQuery,
  };
}
