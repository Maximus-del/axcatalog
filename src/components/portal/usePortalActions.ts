import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { PortalActionKey } from "@/lib/portal-config";

/** Central router for portal CTA actions so cards/buttons stay declarative. */
export function usePortalActions() {
  const navigate = useNavigate();

  const run = useCallback(
    (action: PortalActionKey) => {
      const go = (to: string) => navigate({ pathname: to, search: window.location.search });
      switch (action) {
        case "shop":
          return go("/portal/products");
        case "order_gear":
        case "vip_order":
          // VIP = gear for family/friends/guests — same builder, personalization optional.
          return go("/portal/build/game-day");
        case "game_day_builder":
          return go("/portal/build/game-day");
        case "camp_builder":
        case "build_camp":
          return go("/portal/build/camp");
        case "start_design":
          return go("/portal/studio");
        case "get_code":
          // PHASE 5: Code Vault. Lives under Profile for now.
          return go("/portal/profile");
        case "view_credit":
          return go("/portal/profile");
      }
    },
    [navigate],
  );

  return run;
}
