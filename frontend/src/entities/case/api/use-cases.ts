import { useFetch } from "@/shared/api";
import type { PastCase } from "../model/types";

export const usePastCases = () => useFetch<PastCase[]>("/api/cases");
