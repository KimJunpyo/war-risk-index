import { useFetch } from "@/shared/api";
import type { BlendWeights } from "../model/types";

export const useBlendWeights = () => useFetch<BlendWeights>("/api/blend");
