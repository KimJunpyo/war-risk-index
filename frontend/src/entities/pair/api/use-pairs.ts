import { useFetch } from "@/shared/api";
import type { Pair } from "../model/types";

export const usePairs = () => useFetch<Pair[]>("/api/pairs");
