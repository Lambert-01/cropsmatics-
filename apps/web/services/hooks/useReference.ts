"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

const ONE_HOUR = 60 * 60 * 1000;

export function useDistricts() {
  return useQuery({ queryKey: ["districts"], queryFn: api.districts, staleTime: ONE_HOUR });
}

export function useCrops() {
  return useQuery({ queryKey: ["crops"], queryFn: api.crops, staleTime: ONE_HOUR });
}

export function useCoverage() {
  return useQuery({ queryKey: ["coverage"], queryFn: api.coverage, staleTime: ONE_HOUR });
}

export function useSources() {
  return useQuery({ queryKey: ["sources"], queryFn: api.sources, staleTime: ONE_HOUR });
}

export function useModels() {
  return useQuery({ queryKey: ["models"], queryFn: api.models, staleTime: ONE_HOUR });
}

/** Processed-data build identity (pipeline version, git SHA, row counts). */
export function useDataVersion() {
  return useQuery({ queryKey: ["data-version"], queryFn: api.dataVersion, staleTime: ONE_HOUR });
}

export function useAssistant() {
  return useMutation({
    mutationFn: (question: string) => api.assistant(question),
  });
}
