import { LockerRoom } from "@/components/portal/mooney/LockerRoom";
import { usePortalLayoutKind } from "@/components/portal/PortalLayoutKind";
import PortalHomeClassic from "./PortalHomeClassic";

// The Locker Room is the world shell's home; classic clients keep their home page.
export default function PortalHome() {
  return usePortalLayoutKind() === "world" ? <LockerRoom /> : <PortalHomeClassic />;
}
