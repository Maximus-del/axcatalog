// Read a global system prompt. Falls back to the shipped default text, so a
// component mounting this never has an unusable empty state.
import { useEffect, useState } from "react";
import {
  SYSTEM_PROMPT_DEFAULTS,
  loadSystemPrompt,
  type SystemPrompt,
} from "@/lib/ecosystem/prompts";
import { getCurrentOrgId } from "@/hooks/useTasks";

export function useSystemPrompt(key: string, organizationId?: string | null): {
  prompt: SystemPrompt;
  loading: boolean;
  orgId: string | null;
} {
  const fallback: SystemPrompt = { ...SYSTEM_PROMPT_DEFAULTS[key], customized: false, updated_at: null };
  const [prompt, setPrompt] = useState<SystemPrompt>(fallback);
  const [orgId, setOrgId] = useState<string | null>(organizationId ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const org = organizationId ?? (await getCurrentOrgId());
      if (!alive) return;
      setOrgId(org);
      if (!org) { setLoading(false); return; }
      try {
        const p = await loadSystemPrompt(org, key);
        if (alive) setPrompt(p);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [key, organizationId]);

  return { prompt, loading, orgId };
}
